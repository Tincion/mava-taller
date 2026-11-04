-- Ejecutar en Supabase > SQL Editor (reemplaza la versión anterior de la función)

-- 1) Tabla de control de intentos (una fila por vehículo)
create table if not exists intentos_consulta (
  vehiculo_id uuid primary key references vehiculos(id) on delete cascade,
  intentos_fallidos integer not null default 0,
  bloqueado boolean not null default false,
  bloqueado_at timestamptz,
  ultimo_intento_at timestamptz,
  actualizado_at timestamptz default now()
);

alter table intentos_consulta enable row level security;

create policy "usuarios logueados gestionan intentos"
on intentos_consulta
for all
to authenticated
using (true)
with check (true);

-- 2) Función de consulta con bloqueo a los 3 intentos fallidos
create or replace function public.consulta_proximo_service(p_patente text, p_dni text)
returns table (
  patente text,
  marca text,
  modelo text,
  km_actual numeric,
  km_proximo numeric,
  promedio_km_mensual numeric,
  fecha_ultimo_service timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehiculo record;
  v_intentos integer;
  v_bloqueado boolean;
begin
  -- Buscar el vehículo por patente
  select ve.id, ve.patente, c.dni as dni_cliente
    into v_vehiculo
  from vehiculos ve
  join clientes c on c.id = ve.cliente_id
  where upper(ve.patente) = upper(trim(p_patente))
  limit 1;

  -- Mismo mensaje que un DNI incorrecto, para no revelar si la patente existe
  if not found then
    raise exception 'DNI_INCORRECTO';
  end if;

  -- Crear el contador si no existe y bloquear la fila para evitar carreras
  insert into intentos_consulta (vehiculo_id) values (v_vehiculo.id)
  on conflict (vehiculo_id) do nothing;

  select ic.bloqueado, ic.intentos_fallidos
    into v_bloqueado, v_intentos
  from intentos_consulta ic
  where ic.vehiculo_id = v_vehiculo.id
  for update;

  -- Si ya está bloqueado, no se muestra nada, aunque el DNI sea correcto
  if v_bloqueado then
    raise exception 'BLOQUEADO';
  end if;

  -- DNI incorrecto: sumar un intento y bloquear al tercero
  if regexp_replace(v_vehiculo.dni_cliente, '\D', '', 'g')
     <> regexp_replace(p_dni, '\D', '', 'g') then
    v_intentos := v_intentos + 1;
    update intentos_consulta ic set
      intentos_fallidos = v_intentos,
      bloqueado = (v_intentos >= 3),
      bloqueado_at = case when v_intentos >= 3 then now() else null end,
      ultimo_intento_at = now(),
      actualizado_at = now()
    where ic.vehiculo_id = v_vehiculo.id;

    if v_intentos >= 3 then
      raise exception 'BLOQUEADO';
    end if;
    raise exception 'DNI_INCORRECTO';
  end if;

  -- DNI correcto: reiniciar contador y devolver solo el próximo service
  update intentos_consulta ic set
    intentos_fallidos = 0,
    ultimo_intento_at = now(),
    actualizado_at = now()
  where ic.vehiculo_id = v_vehiculo.id;

  return query
    select
      ve.patente,
      ve.marca,
      ve.modelo,
      (d.comentarios::jsonb ->> 'km_actual')::numeric,
      (d.comentarios::jsonb ->> 'km_proximo')::numeric,
      (d.comentarios::jsonb ->> 'promedio_km_mensual')::numeric,
      d.created_at
    from vehiculos ve
    join lateral (
      select x.comentarios, x.created_at
      from diagnosticos_checklist x
      where x.vehiculo_id = ve.id
      order by x.created_at desc
      limit 1
    ) d on true
    where ve.id = v_vehiculo.id;
end;
$$;

grant execute on function public.consulta_proximo_service(text, text) to anon, authenticated;
