-- Ejecutar en Supabase > SQL Editor. Es seguro ejecutarlo más de una vez.

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

drop policy if exists "usuarios logueados gestionan intentos" on intentos_consulta;
create policy "usuarios logueados gestionan intentos"
on intentos_consulta for all to authenticated
using (true) with check (true);

-- 2) Función de consulta. Devuelve TEXTO (los km se guardan como texto libre).
create or replace function public.consulta_proximo_service(p_patente text, p_dni text)
returns table (
  patente text,
  marca text,
  modelo text,
  km_actual text,
  km_proximo text,
  promedio_km_mensual text,
  fecha_ultimo_service timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehiculo record;
  v_servicio record;
  v_intentos integer;
  v_bloqueado boolean;
  v_dni_cliente text;
  v_dni_ingresado text;
  v_datos jsonb;
begin
  select ve.id, ve.patente as pat, c.dni
    into v_vehiculo
  from vehiculos ve
  join clientes c on c.id = ve.cliente_id
  where upper(ve.patente) = upper(trim(p_patente))
  limit 1;

  -- Mismo mensaje que DNI incorrecto, para no revelar si la patente existe
  if not found then
    raise exception 'DNI_INCORRECTO';
  end if;

  insert into intentos_consulta (vehiculo_id) values (v_vehiculo.id)
  on conflict (vehiculo_id) do nothing;

  select ic.bloqueado, ic.intentos_fallidos
    into v_bloqueado, v_intentos
  from intentos_consulta ic
  where ic.vehiculo_id = v_vehiculo.id
  for update;

  if v_bloqueado then
    raise exception 'BLOQUEADO';
  end if;

  v_dni_cliente := regexp_replace(coalesce(v_vehiculo.dni, ''), '\D', '', 'g');
  v_dni_ingresado := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');

  -- DNI incorrecto (o vacío): suma un intento y bloquea al tercero
  if v_dni_cliente = '' or v_dni_cliente <> v_dni_ingresado then
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

  -- DNI correcto: reinicia el contador
  update intentos_consulta ic set
    intentos_fallidos = 0,
    ultimo_intento_at = now(),
    actualizado_at = now()
  where ic.vehiculo_id = v_vehiculo.id;

  -- Último service del vehículo
  select x.comentarios, x.created_at
    into v_servicio
  from diagnosticos_checklist x
  where x.vehiculo_id = v_vehiculo.id
  order by x.created_at desc
  limit 1;

  if not found then
    return;
  end if;

  -- Si el dato viejo no es JSON válido, no falla: devuelve vacío
  begin
    v_datos := v_servicio.comentarios::jsonb;
  exception when others then
    v_datos := '{}'::jsonb;
  end;

  return query
    select
      ve.patente,
      ve.marca,
      ve.modelo,
      coalesce(v_datos ->> 'km_actual', ''),
      coalesce(v_datos ->> 'km_proximo', ''),
      coalesce(v_datos ->> 'promedio_km_mensual', ''),
      v_servicio.created_at
    from vehiculos ve
    where ve.id = v_vehiculo.id;
end;
$$;

grant execute on function public.consulta_proximo_service(text, text) to anon, authenticated;
