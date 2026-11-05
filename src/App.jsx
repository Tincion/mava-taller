import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { supabase } from './supabase';
import './App.css';

/* =========================================================
   CONFIG — colores de estado (fijos, no dependen del tema
   para que el certificado se vea igual siempre)
========================================================= */
const COLOR_ESTADO = {
  BIEN: '#16a34a',
  REGULAR: '#eab308',
  MAL: '#dc2626',
  'N/A': '#64748b',
};
const ORDEN_ESTADOS = ['BIEN', 'REGULAR', 'MAL', 'N/A'];
const siguienteEstado = (actual) => {
  const i = ORDEN_ESTADOS.indexOf(actual);
  return ORDEN_ESTADOS[(i + 1) % ORDEN_ESTADOS.length];
};

/* Clasifica cualquier valor de texto/select en BIEN / REGULAR / MAL / N-A,
   sirve tanto para "BIEN" simple como para "RELLENADO - BIEN" o "6 - BIEN" */
const clasificarEstado = (valor) => {
  const v = (valor || '').toUpperCase();
  if (!v || v.includes('NINGUNO')) return 'N/A';
  if (v.includes('MAL')) return 'MAL';
  if (v.includes('REGULAR')) return 'REGULAR';
  if (v.includes('BIEN')) return 'BIEN';
  if (v.includes('SUCCI') || v.includes('DECANT')) return 'BIEN'; // método de extracción, no es una falla
  return 'N/A';
};

/* Puntos del diagrama por tipo de vehículo (coordenadas sobre viewBox 0 0 300 460)
   Nomenclatura alineada a la ficha oficial: DI/DD/TI/TD */
const PUNTOS_AUTO = [
  { id: 'di', x: 55, y: 130, label: 'DI', nombre: 'Suspensión Delantera Izquierda' },
  { id: 'dd', x: 245, y: 130, label: 'DD', nombre: 'Suspensión Delantera Derecha' },
  { id: 'ti', x: 55, y: 340, label: 'TI', nombre: 'Suspensión Trasera Izquierda' },
  { id: 'td', x: 245, y: 340, label: 'TD', nombre: 'Suspensión Trasera Derecha' },
];
const BARRAS_AUTO = [
  { id: 'tren_delantero', x: 150, y: 155, w: 130, h: 24, nombre: 'Tren Delantero (Dirección)' },
  { id: 'tren_trasero', x: 150, y: 315, w: 130, h: 24, nombre: 'Tren Trasero' },
];
const PUNTOS_MOTO = [
  { id: 'horquilla', x: 150, y: 110, label: 'DEL', nombre: 'Horquilla Delantera' },
  { id: 'amortiguador', x: 150, y: 360, label: 'TRAS', nombre: 'Amortiguador Trasero' },
];

const puntosDiagrama = (tipo) => (tipo === 'Moto' ? PUNTOS_MOTO : PUNTOS_AUTO);
const barrasDiagrama = (tipo) => (tipo === 'Moto' ? [] : BARRAS_AUTO);

const diagramaInicial = () => ({
  di: 'BIEN', dd: 'BIEN', ti: 'BIEN', td: 'BIEN',
  tren_delantero: 'BIEN', tren_trasero: 'BIEN',
  horquilla: 'BIEN', amortiguador: 'BIEN',
});

/* =========================================================
   COMPONENTE: Diagrama de suspensión (elemento distintivo)
========================================================= */
/* Ícono decorativo de resorte/amortiguador visto en planta (no interactivo) */
function ResorteDecorativo({ x, y }) {
  return (
    <g opacity="0.55">
      <circle cx={x} cy={y} r="9" fill="none" stroke="#7fa0c4" strokeWidth="1.6" />
      <circle cx={x} cy={y} r="4.5" fill="none" stroke="#7fa0c4" strokeWidth="1.3" />
    </g>
  );
}

/* Cubo de rueda: llanta + cubo interactivo con el color de estado + etiqueta */
function CuboRueda({ p, estado, color, interactivo, onCambiar }) {
  return (
    <g className="diagrama-punto" onClick={() => interactivo && onCambiar(p.id)}>
      <circle cx={p.x} cy={p.y} r="25" fill="#22344a" stroke="#6f93b8" strokeWidth="2" />
      <circle cx={p.x} cy={p.y} r="25" fill="none" stroke="#0b1b2b" strokeWidth="6" strokeDasharray="2 6" opacity="0.5" />
      <circle cx={p.x} cy={p.y} r="14" fill={color} stroke="#0b1b2b" strokeWidth="2" className="punto-nucleo" />
      <circle cx={p.x} cy={p.y} r="14" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
      <rect x={p.x - 17} y={p.y - 40} width="34" height="15" rx="6" fill="#0b1b2b" stroke="#7fa0c4" strokeWidth="1" />
      <text x={p.x} y={p.y - 29.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#e9f1fb" fontFamily="'JetBrains Mono', monospace">
        {p.label}
      </text>
    </g>
  );
}

function DiagramaSuspension({ tipo, datos, onCambiar, interactivo, pdf }) {
  const puntos = puntosDiagrama(tipo);

  return (
    <div className={`diagrama-wrap ${pdf ? 'pdf-diagrama' : ''}`}>
      <p className="diagrama-titulo">Plano de Diagnóstico · Suspensión y Tren {tipo === 'Moto' ? '' : '(Vista Superior)'}</p>
      <p className="diagrama-subtitulo">{interactivo ? 'TOCÁ CADA PUNTO PARA CAMBIAR EL ESTADO' : 'MAPA DE ESTADO AL FINALIZAR EL SERVICE'}</p>

      <svg viewBox="0 0 300 460" width="100%" style={{ maxWidth: 260, display: 'block', margin: '0 auto' }}>
        {tipo === 'Moto' ? (
          <g>
            {/* Cuadro / chasis de la moto */}
            <line x1="150" y1="95" x2="150" y2="375" stroke="#3b6ea5" strokeWidth="4" />
            <rect x="128" y="160" width="44" height="140" rx="12" fill="rgba(255,255,255,0.04)" stroke="#3b6ea5" strokeWidth="1.5" />
            {/* Horquilla delantera (dos tubos) */}
            <line x1="140" y1="105" x2="140" y2="150" stroke="#5b7a9c" strokeWidth="3" />
            <line x1="160" y1="105" x2="160" y2="150" stroke="#5b7a9c" strokeWidth="3" />
            {/* Amortiguador trasero */}
            <line x1="150" y1="300" x2="150" y2="345" stroke="#5b7a9c" strokeWidth="4" />
            <ResorteDecorativo x={150} y={322} />
          </g>
        ) : (
          <g>
            {/* Carrocería */}
            <rect x="65" y="50" width="170" height="360" rx="54" fill="rgba(255,255,255,0.06)" stroke="#5b7a9c" strokeWidth="2" />
            {/* Eje trasero rígido (como en un chasis real) */}
            <line x1="60" y1="315" x2="240" y2="315" stroke="#33475e" strokeWidth="9" strokeLinecap="round" opacity="0.85" />
            {/* Brazos / bieletas delanteras hacia la caja de dirección */}
            <line x1="150" y1="150" x2="58" y2="140" stroke="#5b7a9c" strokeWidth="2.5" />
            <line x1="150" y1="150" x2="242" y2="140" stroke="#5b7a9c" strokeWidth="2.5" />
            {/* Brazos traseros hacia el diferencial */}
            <line x1="150" y1="315" x2="58" y2="320" stroke="#5b7a9c" strokeWidth="2.5" />
            <line x1="150" y1="315" x2="242" y2="320" stroke="#5b7a9c" strokeWidth="2.5" />
            {/* Resortes decorativos en las 4 esquinas */}
            <ResorteDecorativo x={92} y={128} />
            <ResorteDecorativo x={208} y={128} />
            <ResorteDecorativo x={92} y={300} />
            <ResorteDecorativo x={208} y={300} />
          </g>
        )}

        {/* Barra de dirección (Tren Delantero) — solo autos */}
        {tipo !== 'Moto' && (
          <g className="diagrama-punto" onClick={() => interactivo && onCambiar('tren_delantero')}>
            <rect x="120" y="141" width="60" height="18" rx="9" fill={COLOR_ESTADO[datos.tren_delantero || 'BIEN']} stroke="#0b1b2b" strokeWidth="1.5" />
            <text x="150" y="153.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#0b1b2b" fontFamily="'JetBrains Mono', monospace">DIRECCIÓN</text>
            <text x="150" y="128" textAnchor="middle" fontSize="8" fill="#9fc2eb" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.5">TREN DELANTERO</text>
          </g>
        )}

        {/* Diferencial (Tren Trasero) — solo autos */}
        {tipo !== 'Moto' && (
          <g className="diagrama-punto" onClick={() => interactivo && onCambiar('tren_trasero')}>
            <circle cx="150" cy="315" r="17" fill={COLOR_ESTADO[datos.tren_trasero || 'BIEN']} stroke="#0b1b2b" strokeWidth="1.5" />
            <text x="150" y="318" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#0b1b2b" fontFamily="'JetBrains Mono', monospace">DIF.</text>
            <text x="150" y="345" textAnchor="middle" fontSize="8" fill="#9fc2eb" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.5">TREN TRASERO</text>
          </g>
        )}

        {puntos.map((p) => (
          <CuboRueda key={p.id} p={p} estado={datos[p.id] || 'BIEN'} color={COLOR_ESTADO[datos[p.id] || 'BIEN']} interactivo={interactivo} onCambiar={onCambiar} />
        ))}
      </svg>

      <div className="diagrama-leyenda">
        {ORDEN_ESTADOS.map((e) => (
          <span key={e}><span className="dot" style={{ background: COLOR_ESTADO[e] }} />{e}</span>
        ))}
      </div>
      {interactivo && <p className="diagrama-hint">Cada toque avanza el semáforo: Bien → Regular → Mal → N/A</p>}
    </div>
  );
}

function resumenDiagrama(diagrama, tipo) {
  const claves = [...puntosDiagrama(tipo).map((p) => p.id), ...barrasDiagrama(tipo).map((b) => b.id)];
  const conteo = { BIEN: 0, REGULAR: 0, MAL: 0, 'N/A': 0 };
  claves.forEach((k) => { const v = (diagrama || {})[k] || 'BIEN'; if (conteo[v] !== undefined) conteo[v]++; });
  return conteo;
}

function ChipEstado({ valor }) {
  const clase = clasificarEstado(valor);
  const mapaClase = { BIEN: 'chip-bien', REGULAR: 'chip-regular', MAL: 'chip-mal', 'N/A': 'chip-na' };
  return <span className={`chip-estado ${mapaClase[clase]}`}><span className="chip-dot" />{valor || '-- Ninguno --'}</span>;
}

/* Nombres legibles para cada punto del diagrama, usados en la tabla del PDF */
const NOMBRES_PUNTOS_DIAGRAMA = {
  di: 'Suspensión Delantera Izquierda', dd: 'Suspensión Delantera Derecha',
  ti: 'Suspensión Trasera Izquierda', td: 'Suspensión Trasera Derecha',
  tren_delantero: 'Tren Delantero (Dirección)', tren_trasero: 'Tren Trasero (Diferencial)',
  horquilla: 'Horquilla Delantera', amortiguador: 'Amortiguador Trasero',
};

/* Ruedita/cubo con el color de estado, posicionada de forma absoluta
   dentro del contenedor del mini-gráfico. */
function Rueda({ pos, color, label }) {
  return (
    <div style={{
      position: 'absolute', width: 22, height: 22, borderRadius: '50%',
      background: color, border: '1px solid #0b1b2b', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 5.5, fontWeight: 700, color: '#0b1b2b', fontFamily: 'var(--font-mono)', lineHeight: 1,
      ...pos,
    }}>{label}</div>
  );
}

/* Mini-gráfico con silueta de auto o de moto (vista superior), hecho con
   divs simples posicionados de forma absoluta — nada de SVG ni flexbox,
   que es lo que el generador de PDF captura siempre bien. */
function MiniDiagrama({ tipo, datos }) {
  const color = (k) => COLOR_ESTADO[(datos || {})[k] || 'BIEN'];

  if (tipo === 'Moto') {
    return (
      <div style={{ position: 'relative', width: 56, height: 158, background: '#0b1b2b', borderRadius: 8, margin: '0 auto' }}>
        {/* cuadro de la moto */}
        <div style={{ position: 'absolute', left: '50%', top: 22, bottom: 22, width: 12, marginLeft: -6, border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: 6, background: 'rgba(255,255,255,0.06)' }} />
        <Rueda pos={{ left: '50%', top: 6, marginLeft: -11 }} color={color('horquilla')} label="D" />
        <Rueda pos={{ left: '50%', bottom: 6, marginLeft: -11 }} color={color('amortiguador')} label="T" />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: 84, height: 158, background: '#0b1b2b', borderRadius: 8, margin: '0 auto' }}>
      {/* carrocería del auto (vista superior) */}
      <div style={{ position: 'absolute', left: 16, right: 16, top: 10, bottom: 10, border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: 26, background: 'rgba(255,255,255,0.06)' }} />
      <Rueda pos={{ left: 2, top: 16 }} color={color('di')} label="DI" />
      <Rueda pos={{ right: 2, top: 16 }} color={color('dd')} label="DD" />
      <Rueda pos={{ left: 2, bottom: 16 }} color={color('ti')} label="TI" />
      <Rueda pos={{ right: 2, bottom: 16 }} color={color('td')} label="TD" />
      <div style={{
        position: 'absolute', left: 22, right: 22, top: 50, textAlign: 'center', borderRadius: 4, padding: '2px 0',
        background: color('tren_delantero'), fontSize: 5, fontWeight: 700, color: '#0b1b2b', fontFamily: 'var(--font-mono)',
      }}>DIR.</div>
      <div style={{
        position: 'absolute', left: 22, right: 22, bottom: 50, textAlign: 'center', borderRadius: 4, padding: '2px 0',
        background: color('tren_trasero'), fontSize: 5, fontWeight: 700, color: '#0b1b2b', fontFamily: 'var(--font-mono)',
      }}>DIF.</div>
    </div>
  );
}

/* Versión en tabla del plano de suspensión para el PDF/certificado.
   El dibujo SVG interactivo se usa solo en pantalla (carga del service);
   los generadores de PDF no renderizan SVG ni flexbox de forma confiable,
   así que en el certificado el mini-gráfico va con divs posicionados y
   el detalle en una tabla HTML simple. */
function ResumenDiagramaPdf({ tipo, datos }) {
  const claves = [...puntosDiagrama(tipo).map((p) => p.id), ...barrasDiagrama(tipo).map((b) => b.id)];
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
      <tr>
        <td style={{ width: '96px', verticalAlign: 'top', padding: 0 }}>
          <MiniDiagrama tipo={tipo} datos={datos} />
        </td>
        <td style={{ verticalAlign: 'top', padding: '0 0 0 10px' }}>
          <table className="pdf-tabla-moderna">
            <thead><tr><th style={{ width: '65%' }}>Punto de Revisión</th><th className="col-estado">Estado</th></tr></thead>
            <tbody>
              {claves.map((k) => (
                <tr key={k}><td>{NOMBRES_PUNTOS_DIAGRAMA[k] || k}</td><td className="col-estado"><ChipEstado valor={(datos || {})[k] || 'BIEN'} /></td></tr>
              ))}
            </tbody>
          </table>
        </td>
      </tr>
    </tbody></table>
  );
}

/* =========================================================
   ESTRUCTURA DE PUNTOS DE REVISIÓN — alineada 1 a 1 con la
   ficha oficial YPF BOXES. Cada sección junta sus campos e
   incluye un comentario libre al final, igual que el original.
   No hay campos repetidos entre secciones.
========================================================= */
const SECCIONES_CHECKLIST = [
  {
    id: 'seguridad',
    titulo: '🛡️ Elementos de Seguridad',
    comentario: 'comentarios_seguridad',
    campos: [
      { campo: 'neumatico_dd', label: 'Profundidad dibujo neumático — DD (mm)', tipo: 'select', opciones: ['-- Ninguno --', '6 - BIEN', '5 - BIEN', '4 - BIEN', '3 - REGULAR', '2 - MAL', 'NO ACCESIBLE'] },
      { campo: 'neumatico_di', label: 'Profundidad dibujo neumático — DI (mm)', tipo: 'select', opciones: ['-- Ninguno --', '6 - BIEN', '5 - BIEN', '4 - BIEN', '3 - REGULAR', '2 - MAL', 'NO ACCESIBLE'] },
      { campo: 'neumatico_td', label: 'Profundidad dibujo neumático — TD (mm)', tipo: 'select', opciones: ['-- Ninguno --', '6 - BIEN', '5 - BIEN', '4 - BIEN', '3 - REGULAR', '2 - MAL', 'NO ACCESIBLE'] },
      { campo: 'neumatico_ti', label: 'Profundidad dibujo neumático — TI (mm)', tipo: 'select', opciones: ['-- Ninguno --', '6 - BIEN', '5 - BIEN', '4 - BIEN', '3 - REGULAR', '2 - MAL', 'NO ACCESIBLE'] },
      { campo: 'presion_delanteros', label: 'Ajuste presión neumáticos DELANTEROS (PSI)', tipo: 'texto', default: '32 - BIEN' },
      { campo: 'presion_traseros', label: 'Ajuste presión neumáticos TRASEROS (PSI)', tipo: 'texto', default: '32 - BIEN' },
      { campo: 'pastillas_freno', label: 'Pastillas de freno', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN = ESPESOR > 3MM', 'NECESITA CAMBIO = ESPESOR < 3MM', 'NO ACCESIBLE'] },
      { campo: 'discos_frenos', label: 'Discos de frenos', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'NECESITA CAMBIO - MAL', 'NO ACCESIBLE'] },
      { campo: 'flexibles_frenos', label: 'Flexibles de frenos', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'NECESITA CAMBIO - MAL'] },
      { campo: 'escobillas', label: 'Rev. y reem. escobillas limpiaparabrisas', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'CAMBIADO - BIEN', 'NECESITA CAMBIO - MAL'] },
      { campo: 'luces_exteriores', label: 'Rev. y rep. luces exteriores y baúl', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'CAMBIADO - BIEN', 'NECESITA CAMBIO - MAL'] },
      { campo: 'tuerca_neumaticos', label: 'Revisión tuerca neumáticos', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL'] },
      { campo: 'amortiguadores', label: 'Amortiguadores', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'CON PERDIDAS DE FLUIDO - MAL', 'NECESITA CAMBIO - MAL'] },
    ],
  },
  {
    id: 'fluidos',
    titulo: '💧 Fluidos del Vehículo',
    comentario: 'comentarios_fluidos',
    campos: [
      { campo: 'liquido_refrigerante', label: 'Revisión líq. refrigerante / anticongelante', tipo: 'texto', default: 'RELLENADO - BIEN' },
      { campo: 'punto_congelamiento', label: 'Punto de congelamiento', tipo: 'texto', default: '-35°C = 50% PRODUCTO - BIEN' },
      { campo: 'liquido_direccion_hidraulica', label: 'Líquido dirección hidráulica', tipo: 'texto', default: 'NO CORRESPONDE - BIEN', aplica: ['Auto'] },
      { campo: 'liquido_frenos', label: 'Revisión líquido de frenos', tipo: 'texto', default: 'BIEN' },
      { campo: 'liquido_limpiaparabrisas', label: 'Líquido limpiaparabrisas', tipo: 'texto', default: 'BIEN', aplica: ['Auto'] },
      { campo: 'bateria', label: 'Batería', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'NO ACCESIBLE', 'RELLENADA - BIEN', 'SELLADA - BIEN'] },
    ],
  },
  {
    id: 'lubricantes',
    titulo: '🛢️ Lubricantes y Filtros',
    comentario: 'comentarios_lubricantes',
    campos: [
      { campo: 'aceite_caja_transferencia', label: 'Revisión aceite caja transferencia', tipo: 'texto', default: 'NO CORRESPONDE - BIEN' },
      { campo: 'cambio_aceite_filtro', label: 'Cambio de aceite y filtro', tipo: 'select', opciones: ['-- Ninguno --', 'CAMBIO ACEITE Y FILTRO - BIEN', 'CAMBIO DE ACEITE - BIEN', 'CAMBIO DE FILTRO - BIEN', 'FILTRO NO CAMBIADO - NA'] },
      { campo: 'tipo_extraccion_aceite', label: 'Tipo de extracción de aceite de motor', tipo: 'select', opciones: ['-- Ninguno --', 'POR SUCCIÓN', 'POR DECANTACIÓN'], omitirResumen: true },
      { campo: 'filtro_aire', label: 'Reemplazo de filtro de aire', tipo: 'select', opciones: ['-- Ninguno --', 'CAMBIO DE FILTRO - BIEN', 'FILTRO NO CAMBIADO - NA', 'NECESITA CAMBIO - MAL'] },
      { campo: 'aceite_caja_cambios', label: 'Revisión aceite caja de cambios', tipo: 'texto', default: 'BIEN' },
      { campo: 'filtro_combustible', label: 'Revisión filtro de combustible', tipo: 'select', opciones: ['-- Ninguno --', 'CAMBIO DE FILTRO - BIEN', 'FILTRO NO CAMBIADO - NA'] },
    ],
  },
  {
    id: 'mecanicas',
    titulo: '⚙️ Partes Mecánicas',
    comentario: 'comentarios_partes_mecanicas',
    campos: [
      { campo: 'arandela_carter', label: 'Arandela tapón de cárter', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'CAMBIADA - BIEN', 'NECESITA CAMBIO - MAL', 'NO CORRESPONDE - BIEN'] },
      { campo: 'bisagras_puertas', label: 'Bisagras y engrase retenedor de puertas', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'ENGRASADO - BIEN', 'NECESITA REPARAR - MAL'], aplica: ['Auto'] },
      { campo: 'escape', label: 'Caño de escape', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL'] },
      { campo: 'correa_alternador', label: 'Correa alternador', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'NECESITA CAMBIO - MAL', 'NO ACCESIBLE'], aplica: ['Auto'] },
      { campo: 'correa_direccion_asistida', label: 'Correa dirección asistida', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'NECESITA CAMBIO - MAL', 'NO ACCESIBLE', 'NO CORRESPONDE - BIEN'], aplica: ['Auto'] },
      { campo: 'correa_aire_acondicionado', label: 'Correa aire acondicionado', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'NECESITA CAMBIO - MAL', 'NO ACCESIBLE', 'NO CORRESPONDE - BIEN'], aplica: ['Auto'] },
      { campo: 'guardapolvos_transmision', label: 'Guardapolvos y holguras de transmisión', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'NECESITA CAMBIO - MAL', 'NO ACCESIBLE'], aplica: ['Auto'] },
      { campo: 'revision_mangueras', label: 'Revisión de mangueras', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'NECESITA CAMBIO - MAL', 'NO ACCESIBLE'] },
    ],
  },
  {
    id: 'dinamica',
    titulo: '🚗 Prueba Dinámica',
    comentario: 'comentarios_prueba_dinamica',
    campos: [
      { campo: 'cinturones_seguridad', label: 'Cinturones de seguridad (func. inercial)', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL'], aplica: ['Auto'] },
    ],
  },
  {
    id: 'escaneo',
    titulo: '🖥️ Servicio de Escaneo',
    comentario: 'comentarios_escaneo',
    aplica: ['Auto'],
    campos: [
      { campo: 'abs', label: 'ABS', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL', 'NO CORRESPONDE'] },
      { campo: 'airbag', label: 'Airbag', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL', 'NO CORRESPONDE'] },
      { campo: 'inyeccion', label: 'Inyección', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL'] },
      { campo: 'sonda_lambda', label: 'Sonda lambda', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL'] },
      { campo: 'historial_fallas', label: 'Historial de fallas', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL'] },
      { campo: 'reseteo_service', label: 'Reseteo service', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL', 'NO CORRESPONDE'] },
      { campo: 'instrumental', label: 'Instrumental', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL'] },
      { campo: 'climatizacion', label: 'Climatización', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL', 'NO CORRESPONDE'] },
      { campo: 'sensores_actuadores', label: 'Sensores y actuadores', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL', 'NO CORRESPONDE'] },
    ],
  },
];

/* =========================================================
   CHECKLIST DEDICADO PARA MOTOS — "lo básico indispensable"
   Basado en la ficha de revisión preventiva de motos (Laudo Técnico):
   nada de fluidos de dirección hidráulica, escaneo, airbag, etc.
   Solo lo que realmente se revisa en una moto.
========================================================= */
const SECCIONES_MOTO = [
  {
    id: 'moto_motor',
    titulo: '🔧 Motor y Transmisión',
    comentario: 'moto_comentarios_motor',
    campos: [
      { campo: 'moto_nivel_aceite', label: 'Nivel de aceite del motor', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'BAJO - RELLENADO - BIEN', 'NECESITA CAMBIO - MAL'] },
      { campo: 'moto_tipo_extraccion_aceite', label: 'Tipo de extracción de aceite de motor', tipo: 'select', opciones: ['-- Ninguno --', 'POR SUCCIÓN', 'POR DECANTACIÓN'], omitirResumen: true },
      { campo: 'moto_cadena_transmision', label: 'Condición de cadena / transmisión', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'NECESITA AJUSTE - REGULAR', 'NECESITA CAMBIO - MAL'] },
    ],
  },
  {
    id: 'moto_frenos',
    titulo: '🛞 Frenos, Neumáticos y Suspensión',
    comentario: 'moto_comentarios_frenos',
    campos: [
      { campo: 'moto_estado_neumaticos', label: 'Estado de los neumáticos', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'REGULAR', 'NECESITA CAMBIO - MAL'] },
      { campo: 'moto_frenos', label: 'Prueba de frenos (visual / manual)', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'REGULAR', 'NECESITA CAMBIO - MAL'] },
      { campo: 'moto_holgura_suspension', label: 'Holgura en suspensión delantera y trasera', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'REGULAR', 'NECESITA REPARAR - MAL'] },
      { campo: 'moto_alineacion_rueda', label: 'Alineación de rueda delantera y trasera', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL'] },
      { campo: 'moto_cables', label: 'Condición de cables (embrague / acelerador)', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'REGULAR', 'NECESITA CAMBIO - MAL'] },
    ],
  },
  {
    id: 'moto_electrico',
    titulo: '💡 Eléctrico, Fugas y Prueba Final',
    comentario: 'moto_comentarios_electrico',
    campos: [
      { campo: 'moto_iluminacion', label: 'Iluminación (farol, linterna, guiños)', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'NECESITA REPARAR - MAL'] },
      { campo: 'moto_fugas', label: 'Fugas visibles (aceite, líquido de freno)', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL'] },
      { campo: 'moto_prueba_arranque', label: 'Prueba de arranque (batería / marcha lenta)', tipo: 'select', opciones: ['-- Ninguno --', 'BIEN', 'MAL'] },
    ],
  },
];

/* Filtra los campos de una sección según el tipo de vehículo (Auto/Moto).
   Si la sección entera está marcada para un solo tipo, o si no le queda
   ningún campo aplicable, no debe renderizarse. */
const camposAplicables = (sec, tipo) => {
  if (sec.aplica && !sec.aplica.includes(tipo)) return [];
  return sec.campos.filter((c) => (c.aplica || ['Auto', 'Moto']).includes(tipo));
};

const valoresIniciales = () => {
  const base = {
    tipo_servicio: 'Auto',
    km_actual: '', promedio_km_mensual: '', km_proximo: '', motivo_visita: 'CLIENTE HABITUAL',
    productos_texto: 'Aceite 10W40 - 1,3 Litros\nFiltro de Aceite - 1 Unidad',
    diagrama: diagramaInicial(),
    trabajos_adicionales: [],
    fotos: [],
  };
  SECCIONES_CHECKLIST.forEach((sec) => {
    sec.campos.forEach((c) => { base[c.campo] = c.tipo === 'select' ? c.opciones[1] : (c.default || 'BIEN'); });
    base[sec.comentario] = '';
  });
  SECCIONES_MOTO.forEach((sec) => {
    sec.campos.forEach((c) => { base[c.campo] = c.opciones[1]; });
    base[sec.comentario] = '';
  });
  return base;
};

/* =========================================================
   Componentes de fila de formulario — DEBEN vivir afuera de App().
   Si se definen adentro de App(), React los redefine en cada
   render (cada tecla que se escribe) y eso hace que el input
   pierda el foco después de cada carácter. Por eso reciben el
   valor y el onChange por props en vez de leer el estado directo.
========================================================= */
function FilaCheck({ label, valor, opciones, onChange }) {
  return (
    <div className="fila-check">
      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>{label}</label>
      <select value={valor ?? opciones[0]} onChange={(e) => onChange(e.target.value)}>
        {opciones.map((op, i) => <option key={i} value={op}>{op}</option>)}
      </select>
    </div>
  );
}

function FilaTexto({ label, valor, onChange }) {
  return (
    <div className="fila-check">
      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>{label}</label>
      <input type="text" value={valor ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function CampoDinamico({ c, checklist, onChange }) {
  return c.tipo === 'texto'
    ? <FilaTexto label={c.label} valor={checklist[c.campo]} onChange={(v) => onChange(c.campo, v)} />
    : <FilaCheck label={c.label} valor={checklist[c.campo]} opciones={c.opciones} onChange={(v) => onChange(c.campo, v)} />;
}

function FilaTrabajoAdicional({ trabajo, onCambiar, onQuitar }) {
  return (
    <div className="fila-check" style={{ borderLeft: '4px solid var(--amber)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <label style={{ fontWeight: 'bold' }}>Trabajo realizado</label>
        <button onClick={onQuitar} style={{ background: 'var(--mal)', color: '#fff', padding: '2px 10px', fontSize: 12 }}>✕ Quitar</button>
      </div>
      <input
        type="text"
        placeholder="Ej: Cambio de bobinas de encendido"
        value={trabajo.descripcion}
        onChange={(e) => onCambiar('descripcion', e.target.value)}
      />
      <textarea
        placeholder="Detalle / observación (opcional). Ej: se cambiaron las 4 bobinas + bujías, motor sin fallas al reiniciar."
        value={trabajo.detalle}
        onChange={(e) => onCambiar('detalle', e.target.value)}
        style={{ minHeight: 60 }}
      />
    </div>
  );
}

/* =========================================================
   CONSULTA PÚBLICA — la ve el cliente desde el QR (?consulta=1).
   No pide login. Solo muestra el próximo service después de
   verificar patente + DNI en la función de Supabase.
========================================================= */
// WhatsApp del taller para el botón de la consulta pública.
// Formato: 549 + código de área + número, sin 0 ni 15. Ej: 5491112345678
const WHATSAPP_TALLER = '5491122547742';

function ConsultaPublica() {
  const [patente, setPatente] = useState('');
  const [dni, setDni] = useState('');
  const [estado, setEstado] = useState('inicio'); // inicio | cargando | ok | error
  const [mensaje, setMensaje] = useState('');
  const [res, setRes] = useState(null);

  const calcular = (r) => {
    const km = parseFloat(r.km_actual) || 0;
    const kmProx = parseFloat(r.km_proximo) || 0;
    const prom = parseFloat(r.promedio_km_mensual) || 0;
    const faltanKm = kmProx - km;
    let fecha = null;
    let dias = null;
    if (prom > 0 && faltanKm > 0) {
      fecha = new Date(r.fecha_ultimo_service);
      fecha.setDate(fecha.getDate() + Math.round((faltanKm / prom) * 30));
      dias = Math.ceil((fecha - new Date()) / 86400000);
    }
    return { ...r, faltanKm, fecha, dias };
  };

  const consultar = async (e) => {
    e.preventDefault();
    setEstado('cargando'); setMensaje(''); setRes(null);
    const { data, error } = await supabase.rpc('consulta_proximo_service', {
      p_patente: patente.trim(),
      p_dni: dni.replace(/\D/g, ''),
    });
    if (error) {
      const m = error.message || '';
      setEstado('error');
      if (m.includes('BLOQUEADO')) setMensaje('Por seguridad, los datos de este vehículo quedaron bloqueados. Comunicate con el taller.');
      else if (m.includes('DNI_INCORRECTO')) setMensaje('Patente o DNI incorrectos.');
      else setMensaje('No pudimos consultar. Probá de nuevo en un momento.');
      return;
    }
    if (!data || data.length === 0) {
      setEstado('error');
      setMensaje('Todavía no hay services cargados para este vehículo. Comunicate con el taller.');
      return;
    }
    setRes(calcular(data[0]));
    setEstado('ok');
  };

  const necesitaTurno = res && ((res.fecha && res.dias <= 15) || (!res.fecha && res.faltanKm <= 1000));
  const linkWhatsApp = WHATSAPP_TALLER && res
    ? `https://wa.me/${WHATSAPP_TALLER}?text=${encodeURIComponent(`Hola, soy el titular del ${res.marca} ${res.modelo} (${res.patente}). Quiero coordinar el cambio de aceite.`)}`
    : null;

  const nuevaConsulta = () => { setEstado('inicio'); setRes(null); setMensaje(''); setPatente(''); setDni(''); };

  const colorEstado = !res ? '#2f855a'
    : res.fecha ? (res.dias <= 0 ? '#c53030' : res.dias <= 15 ? '#b7791f' : '#2f855a')
    : (res.faltanKm <= 0 ? '#c53030' : res.faltanKm <= 1000 ? '#b7791f' : '#2f855a');

  let textoEstado = '';
  if (res) {
    if (res.fecha && res.dias > 0) textoEstado = `Te toca aprox. el ${res.fecha.toLocaleDateString()} (en ${res.dias} días)`;
    else if (res.fecha) textoEstado = `Service vencido hace ${Math.abs(res.dias)} días. Coordiná un turno.`;
    else if (res.faltanKm > 0) textoEstado = `Faltan ${res.faltanKm} km para el próximo service.`;
    else textoEstado = 'Service vencido por kilometraje. Coordiná un turno.';
  }

  const pagina = { minHeight: '100vh', background: '#eef2f7', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 14px', boxSizing: 'border-box', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: '#1a2433' };
  const tarjeta = { width: '100%', maxWidth: 400, background: '#fff', borderRadius: 16, boxShadow: '0 4px 18px rgba(11,27,43,0.12)', overflow: 'hidden' };
  const cabecera = { background: '#0b1b2b', color: '#fff', padding: '18px 20px' };
  const campo = { width: '100%', height: 46, border: '1px solid #cfd7e3', borderRadius: 10, padding: '0 12px', fontSize: 16, boxSizing: 'border-box', marginBottom: 14 };
  const etiqueta = { display: 'block', fontSize: 13, fontWeight: 600, color: '#4a5568', marginBottom: 6 };
  const boton = { width: '100%', height: 48, border: 'none', borderRadius: 10, background: '#0b1b2b', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' };
  const fila = { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eef1f5', fontSize: 15 };

  return (
    <div style={pagina}>
      <div style={tarjeta}>
        <div style={cabecera}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>MAVA Taller</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>Próximo cambio de aceite</div>
        </div>

        <div style={{ padding: 20 }}>
          {estado !== 'ok' && (
            <form onSubmit={consultar}>
              <label style={etiqueta}>Patente</label>
              <input value={patente} onChange={(e) => setPatente(e.target.value)} required style={{ ...campo, textTransform: 'uppercase' }} />
              <label style={etiqueta}>DNI del titular</label>
              <input value={dni} onChange={(e) => setDni(e.target.value)} required inputMode="numeric" style={campo} />
              <button type="submit" disabled={estado === 'cargando'} style={{ ...boton, opacity: estado === 'cargando' ? 0.6 : 1 }}>
                {estado === 'cargando' ? 'Consultando…' : 'Consultar'}
              </button>
            </form>
          )}

          {estado === 'error' && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#fdecec', color: '#9b2c2c', fontSize: 15 }}>{mensaje}</div>
          )}

          {estado === 'ok' && res && (
            <>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{res.marca} {res.modelo}</div>
              <div style={{ fontSize: 14, color: '#4a5568', marginBottom: 12 }}>Patente {res.patente}</div>
              <div style={fila}><span>Kilometraje actual</span><strong>{res.km_actual || '-'} km</strong></div>
              <div style={{ ...fila, borderBottom: 'none' }}><span>Próximo service</span><strong>a los {res.km_proximo || '-'} km</strong></div>

              <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: colorEstado + '1A', color: colorEstado, fontWeight: 600, fontSize: 15 }}>
                {textoEstado}
              </div>
              <div style={{ fontSize: 12, color: '#718096', marginTop: 8 }}>La fecha es una estimación según tu uso promedio.</div>

              {necesitaTurno && linkWhatsApp && (
                <a href={linkWhatsApp} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', background: '#25D366', color: '#fff', padding: 14, borderRadius: 10, textDecoration: 'none', fontWeight: 600, marginTop: 16 }}>
                  📱 Coordinar turno por WhatsApp
                </a>
              )}

              <button onClick={nuevaConsulta} style={{ ...boton, background: '#fff', color: '#0b1b2b', border: '1px solid #cfd7e3', marginTop: 12 }}>Nueva consulta</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [pantalla, setPantalla] = useState('buscador');
  const [temaClaro, setTemaClaro] = useState(false);

  // --- Sesión (login) ---
  const [sesion, setSesion] = useState(undefined); // undefined = cargando, null = sin sesión
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nuevaSesion) => setSesion(nuevaSesion));
    return () => listener.subscription.unsubscribe();
  }, []);

  const iniciarSesion = async (e) => {
    e.preventDefault();
    setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
    if (error) setLoginError('Email o contraseña incorrectos.');
  };
  const cerrarSesion = async () => { await supabase.auth.signOut(); };

  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [vehiculoActivo, setVehiculoActivo] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [reporteSeleccionado, setReporteSeleccionado] = useState(null);
  const [otrosVehiculos, setOtrosVehiculos] = useState([]);

  const [estadisticas, setEstadisticas] = useState({ autos: 0, motos: 0, serviciosMes: 0 });
  const [vencidos, setVencidos] = useState([]);
  const [cargandoVencidos, setCargandoVencidos] = useState(false);
  const [recordatorios, setRecordatorios] = useState({});
  const [mostrarAvisados, setMostrarAvisados] = useState(false);
  const [mostrarQR, setMostrarQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [bloqueados, setBloqueados] = useState([]);

  const [cotizacion, setCotizacion] = useState({
    nombre_cliente: '', telefono: '', direccion: '', tipo_problema: 'Batería descargada', descripcion: '', precio_estimado: '',
  });

  const [nuevoCliente, setNuevoCliente] = useState({ dni: '', nombre: '', telefono: '', email: '' });
  const [nuevoAuto, setNuevoAuto] = useState({ patente: '', marca: '', modelo: '', motor: '', motorizacion: '', vin: '', tipo_vehiculo: 'Auto' });

  // --- Ficha de filtros por motor (base propia, se completa sola con el tiempo) ---
  const [motorVin, setMotorVin] = useState({ motorizacion: '', vin: '' });
  const [filtrosMotor, setFiltrosMotor] = useState(null); // null = no encontrado / no cargado
  const [editandoFiltros, setEditandoFiltros] = useState(false);
  const [formFiltros, setFormFiltros] = useState({ filtro_aceite: '', filtro_aire: '', filtro_combustible: '', filtro_habitaculo: '', notas: '' });

  const [checklist, setChecklist] = useState(valoresIniciales());
  const certificadoRef = useRef(null);
  const [fotosNuevas, setFotosNuevas] = useState([]); // File[] pendientes de subir
  const [editandoId, setEditandoId] = useState(null); // id del service que se está corrigiendo (null = nuevo)

  const manejarSeleccionFotos = (e) => {
    const archivos = Array.from(e.target.files || []);
    setFotosNuevas((prev) => [...prev, ...archivos]);
  };
  const quitarFotoNueva = (idx) => setFotosNuevas((prev) => prev.filter((_, i) => i !== idx));
  const quitarFotoGuardada = (url) => setChecklist((prev) => ({ ...prev, fotos: (prev.fotos || []).filter((f) => f !== url) }));

  const manejarCambioChecklist = (campo, valor) => setChecklist((prev) => ({ ...prev, [campo]: valor }));
  const manejarCambioDiagrama = (idPunto) => {
    setChecklist((prev) => ({
      ...prev,
      diagrama: { ...prev.diagrama, [idPunto]: siguienteEstado(prev.diagrama[idPunto] || 'BIEN') },
    }));
  };

  const agregarTrabajoAdicional = () => {
    setChecklist((prev) => ({ ...prev, trabajos_adicionales: [...(prev.trabajos_adicionales || []), { descripcion: '', detalle: '' }] }));
  };
  const cambiarTrabajoAdicional = (idx, campo, valor) => {
    setChecklist((prev) => {
      const lista = [...(prev.trabajos_adicionales || [])];
      lista[idx] = { ...lista[idx], [campo]: valor };
      return { ...prev, trabajos_adicionales: lista };
    });
  };
  const quitarTrabajoAdicional = (idx) => {
    setChecklist((prev) => ({ ...prev, trabajos_adicionales: (prev.trabajos_adicionales || []).filter((_, i) => i !== idx) }));
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', temaClaro ? 'claro' : 'oscuro');
  }, [temaClaro]);

  // Autocompletado del buscador: sugiere patentes a medida que se escribe
  useEffect(() => {
    if (!sesion) return;
    const termino = textoBusqueda.trim();
    if (termino.length < 2) { setSugerencias([]); return; }
    const timeoutId = setTimeout(async () => {
      const { data } = await supabase
        .from('vehiculos').select('id, patente, marca, modelo, clientes(nombre)')
        .ilike('patente', `%${termino.toUpperCase()}%`).limit(6);
      setSugerencias(data || []);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [textoBusqueda, sesion]);

  const cargarEstadisticas = async () => {
    setPantalla('panel');
    setVehiculoActivo(null);
    const { data: vehiculos } = await supabase.from('vehiculos').select('tipo_vehiculo');
    let autos = 0; let motos = 0;
    if (vehiculos) vehiculos.forEach((v) => { if (v.tipo_vehiculo === 'Auto') autos++; if (v.tipo_vehiculo === 'Moto') motos++; });
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const { data: servicios } = await supabase.from('diagnosticos_checklist').select('id').gte('created_at', inicioMes.toISOString());
    setEstadisticas({ autos, motos, serviciosMes: servicios ? servicios.length : 0 });
    cargarVencidos();
  };

  /* Calcula qué vehículos están vencidos (o próximos a vencer) de service,
     usando el último diagnóstico de cada uno: km próximo, km actual y el
     promedio de km mensual que se carga en "Información del Turno". */
  const cargarVencidos = async () => {
    setCargandoVencidos(true);
    const { data: servicios } = await supabase
      .from('diagnosticos_checklist')
      .select('*, vehiculos(*, clientes(*))')
      .order('created_at', { ascending: false });

    const vistos = new Set();
    const ultimoPorVehiculo = [];
    (servicios || []).forEach((s) => {
      if (s.vehiculo_id && !vistos.has(s.vehiculo_id)) { vistos.add(s.vehiculo_id); ultimoPorVehiculo.push(s); }
    });

    const hoy = new Date();
    const calculados = ultimoPorVehiculo
      .map((s) => {
        const datos = parsearDatos(s.comentarios);
        const kmActual = parseFloat(datos.km_actual) || 0;
        const kmProximo = parseFloat(datos.km_proximo) || 0;
        const promedioMensual = parseFloat(datos.promedio_km_mensual) || 0;
        if (!promedioMensual || kmProximo <= kmActual || !s.vehiculos) return null;

        const kmFaltantes = kmProximo - kmActual;
        const mesesFaltantes = kmFaltantes / promedioMensual;
        const fechaEstimada = new Date(s.created_at);
        fechaEstimada.setDate(fechaEstimada.getDate() + Math.round(mesesFaltantes * 30));
        const diasRestantes = Math.ceil((fechaEstimada - hoy) / (1000 * 60 * 60 * 24));

        return { servicio: s, datos, vehiculo: s.vehiculos, fechaEstimada, diasRestantes };
      })
      .filter((c) => c && c.diasRestantes <= 15) // vencidos o a menos de 15 días
      .sort((a, b) => a.diasRestantes - b.diasRestantes);

    const { data: marcas } = await supabase.from('recordatorios_service').select('*');
    const mapa = {};
    (marcas || []).forEach((m) => { mapa[m.servicio_id] = m; });
    setRecordatorios(mapa);

    const { data: bloq } = await supabase
      .from('intentos_consulta')
      .select('*, vehiculos(*, clientes(*))')
      .eq('bloqueado', true)
      .order('bloqueado_at', { ascending: false });
    setBloqueados(bloq || []);

    setVencidos(calculados);
    setCargandoVencidos(false);
  };

  const estaAvisado = (item) => {
    const r = recordatorios[item.servicio.id];
    return !!(r && (r.avisado || r.email_enviado));
  };

  const marcarRecordatorio = async (servicioId, campo, valor) => {
    const anterior = recordatorios[servicioId] || {};
    const nuevo = { ...anterior, servicio_id: servicioId, [campo]: valor };
    setRecordatorios((prev) => ({ ...prev, [servicioId]: nuevo }));
    const { error } = await supabase.from('recordatorios_service').upsert(
      {
        servicio_id: servicioId,
        avisado: !!nuevo.avisado,
        email_enviado: !!nuevo.email_enviado,
        actualizado_at: new Date().toISOString(),
      },
      { onConflict: 'servicio_id' }
    );
    if (error) {
      alert('No se pudo guardar la marca: ' + error.message);
      setRecordatorios((prev) => ({ ...prev, [servicioId]: anterior }));
    }
  };

  const desbloquearConsulta = async (vehiculoId) => {
    const { error } = await supabase
      .from('intentos_consulta')
      .update({ bloqueado: false, bloqueado_at: null, intentos_fallidos: 0, actualizado_at: new Date().toISOString() })
      .eq('vehiculo_id', vehiculoId);
    if (error) return alert('No se pudo desbloquear: ' + error.message);
    setBloqueados((prev) => prev.filter((b) => b.vehiculo_id !== vehiculoId));
  };

  const contactarBloqueo = (b) => {
    const tel = (b.vehiculos?.clientes?.telefono || '').replace(/\D/g, '');
    if (!tel) return alert('Este cliente no tiene teléfono registrado.');
    const nombre = b.vehiculos?.clientes?.nombre || '';
    const patente = b.vehiculos?.patente || '';
    const mensaje = `Hola ${nombre}, somos *MAVA Taller*. Vimos que intentaron consultar el próximo service de tu vehículo (${patente}) y los datos quedaron bloqueados por seguridad. ¿Fuiste vos quien intentó consultar? Si querés, te lo desbloqueamos y te decimos cuándo te toca el cambio de aceite.`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
  };

  const abrirQR = async () => {
    const url = `${window.location.origin}/?consulta=1`;
    const dataUrl = await QRCode.toDataURL(url, { width: 500, margin: 2 });
    setQrDataUrl(dataUrl);
    setMostrarQR(true);
  };

  const recordarPorWhatsApp = (item) => {
    const tel = item.vehiculo.clientes?.telefono || '';
    const numLimpio = tel.replace(/\D/g, '');
    const vencido = item.diasRestantes <= 0;
    const mensaje = vencido
      ? `Hola ${item.vehiculo.clientes?.nombre || ''}, somos *MAVA Taller*. Te escribimos porque el service de tu ${item.vehiculo.marca} ${item.vehiculo.modelo} (${item.vehiculo.patente}) ya está vencido (recomendado a los ${item.datos.km_proximo} km). ¿Coordinamos un turno?`
      : `Hola ${item.vehiculo.clientes?.nombre || ''}, somos *MAVA Taller*. Te recordamos que el service de tu ${item.vehiculo.marca} ${item.vehiculo.modelo} (${item.vehiculo.patente}) se acerca (recomendado a los ${item.datos.km_proximo} km, en aprox. ${item.diasRestantes} días). ¿Coordinamos un turno?`;
    if (!numLimpio) return alert('Este cliente no tiene teléfono registrado.');
    window.open(`https://wa.me/${numLimpio}?text=${encodeURIComponent(mensaje)}`, '_blank');
  };

  const cargarEntornoDeVehiculo = async (auto) => {
    setVehiculoActivo(auto);
    const { data: servicios } = await supabase.from('diagnosticos_checklist').select('*').eq('vehiculo_id', auto.id).order('created_at', { ascending: false });
    setHistorial(servicios || []);
    setReporteSeleccionado(null);
    const { data: garaje } = await supabase.from('vehiculos').select('*').eq('cliente_id', auto.cliente_id).neq('id', auto.id);
    setOtrosVehiculos(garaje || []);
    manejarCambioChecklist('tipo_servicio', auto.tipo_vehiculo || 'Auto');

    setMotorVin({ motorizacion: auto.motorizacion || '', vin: auto.vin || '' });
    setEditandoFiltros(false);
    if (auto.motorizacion) {
      buscarFiltrosMotor(auto.motorizacion);
    } else {
      setFiltrosMotor(null);
      setFormFiltros({ filtro_aceite: '', filtro_aire: '', filtro_combustible: '', filtro_habitaculo: '', notas: '' });
    }
  };

  /* Busca en TU base propia (filtros_motor) los filtros guardados para ese
     código de motor. Si dos autos distintos comparten motor, comparten filtros. */
  const buscarFiltrosMotor = async (motorizacion) => {
    const motor = motorizacion.trim().toUpperCase();
    const { data } = await supabase.from('filtros_motor').select('*').eq('motorizacion', motor).maybeSingle();
    setFiltrosMotor(data || null);
    setFormFiltros({
      filtro_aceite: data?.filtro_aceite || '',
      filtro_aire: data?.filtro_aire || '',
      filtro_combustible: data?.filtro_combustible || '',
      filtro_habitaculo: data?.filtro_habitaculo || '',
      notas: data?.notas || '',
    });
  };

  /* Guarda el código de motor / VIN en el vehículo activo (para vehículos
     que ya estaban registrados y no lo tenían cargado). */
  const guardarMotorVin = async () => {
    if (!vehiculoActivo) return;
    if (!motorVin.motorizacion.trim()) return alert('Ingresá el código de motor / motorización.');
    const motor = motorVin.motorizacion.trim().toUpperCase();
    const vin = motorVin.vin.trim().toUpperCase();
    const { error } = await supabase.from('vehiculos').update({ motorizacion: motor, vin }).eq('id', vehiculoActivo.id);
    if (error) return alert('Error al guardar: ' + error.message);
    setVehiculoActivo((prev) => ({ ...prev, motorizacion: motor, vin }));
    buscarFiltrosMotor(motor);
  };

  /* Guarda (o actualiza) los filtros de este código de motor en tu base
     propia. A partir de ahora, cualquier vehículo con el mismo motor va a
     autocompletarse solo. */
  const guardarFiltrosMotor = async () => {
    if (!vehiculoActivo?.motorizacion) return alert('Primero cargá el código de motor del vehículo.');
    const motor = vehiculoActivo.motorizacion.trim().toUpperCase();
    const { error } = await supabase.from('filtros_motor').upsert(
      { motorizacion: motor, ...formFiltros, updated_at: new Date().toISOString() },
      { onConflict: 'motorizacion' }
    );
    if (error) return alert('Error al guardar los filtros: ' + error.message);
    alert('¡Filtros guardados para el motor ' + motor + '! Se van a autocompletar solos en cualquier otro vehículo con este mismo motor.');
    setEditandoFiltros(false);
    buscarFiltrosMotor(motor);
  };

  const buscarInteligente = async () => {
    const termino = textoBusqueda.trim().toUpperCase();
    if (!termino) return;
    const { data: autoPorPatente } = await supabase.from('vehiculos').select('*, clientes(*)').eq('patente', termino).single();
    if (autoPorPatente) {
      cargarEntornoDeVehiculo(autoPorPatente);
      alert(`Vehículo encontrado: ${autoPorPatente.marca} ${autoPorPatente.modelo}.`);
      return;
    }
    const { data: cliente } = await supabase.from('clientes').select('*').eq('dni', termino).single();
    if (cliente) {
      const { data: vehiculosCliente } = await supabase.from('vehiculos').select('*, clientes(*)').eq('cliente_id', cliente.id);
      if (vehiculosCliente && vehiculosCliente.length > 0) {
        cargarEntornoDeVehiculo(vehiculosCliente[0]);
        alert(`Cliente encontrado: ${cliente.nombre}. Se cargó su ${vehiculosCliente[0].marca}. Puedes cambiar de vehículo en su garaje.`);
        return;
      }
    }
    alert('No se encontró ningún vehículo o cliente con ese dato. Puedes registrarlo ahora.');
    setVehiculoActivo(null);
    setOtrosVehiculos([]);
    setPantalla('registro');
  };

  const registrarTodo = async () => {
    if (!nuevoCliente.dni || !nuevoAuto.patente) return alert('El DNI y la Patente son obligatorios.');
    let clienteId;
    const { data: clienteExistente } = await supabase.from('clientes').select('id').eq('dni', nuevoCliente.dni).single();
    if (clienteExistente) { clienteId = clienteExistente.id; }
    else {
      const { data: clienteCreado, error: errCliente } = await supabase.from('clientes').insert([nuevoCliente]).select().single();
      if (errCliente) return alert('Error al guardar cliente: ' + errCliente.message);
      clienteId = clienteCreado.id;
    }
    const autoConCliente = {
      ...nuevoAuto,
      patente: nuevoAuto.patente.toUpperCase(),
      motorizacion: nuevoAuto.motorizacion.trim().toUpperCase(),
      vin: nuevoAuto.vin.trim().toUpperCase(),
      cliente_id: clienteId,
    };
    const { data: autoCreado, error: errAuto } = await supabase.from('vehiculos').insert([autoConCliente]).select('*, clientes(*)').single();
    if (errAuto) return alert('Error al guardar auto: ' + errAuto.message);
    alert('¡Vehículo registrado y vinculado al cliente con éxito!');
    cargarEntornoDeVehiculo(autoCreado);
    setPantalla('carga');
  };

  const manejarCambioCotizacion = (campo, valor) => setCotizacion((prev) => ({ ...prev, [campo]: valor }));

  const generarCotizacion = async () => {
    if (!cotizacion.nombre_cliente || !cotizacion.telefono) return alert('Ingresá al menos el nombre y el teléfono del cliente.');

    const { error } = await supabase.from('cotizaciones').insert([cotizacion]);
    if (error) { alert('No se pudo guardar la cotización: ' + error.message); }

    const numLimpio = cotizacion.telefono.replace(/\D/g, '');
    const mensaje = `Hola ${cotizacion.nombre_cliente}, somos *MAVA Taller — Auxilio Mecánico 24 HS*.\n\n🔧 *Problema:* ${cotizacion.tipo_problema}\n${cotizacion.descripcion ? `📝 *Detalle:* ${cotizacion.descripcion}\n` : ''}${cotizacion.direccion ? `📍 *Dirección:* ${cotizacion.direccion}\n` : ''}${cotizacion.precio_estimado ? `💰 *Presupuesto estimado:* $${cotizacion.precio_estimado}\n` : ''}\n¿Confirmamos el auxilio?`;
    if (numLimpio) window.open(`https://wa.me/${numLimpio}?text=${encodeURIComponent(mensaje)}`, '_blank');

    setCotizacion({ nombre_cliente: '', telefono: '', direccion: '', tipo_problema: 'Batería descargada', descripcion: '', precio_estimado: '' });
    alert('¡Cotización lista! Se abrió WhatsApp para enviarla.');
  };

  const subirFotosPendientes = async () => {
    if (fotosNuevas.length === 0) return [];
    const urls = [];
    for (let i = 0; i < fotosNuevas.length; i++) {
      const archivo = fotosNuevas[i];
      const ruta = `${vehiculoActivo.patente}/${Date.now()}_${i}_${archivo.name}`;
      const { error: errSubida } = await supabase.storage.from('fotos-service').upload(ruta, archivo);
      if (errSubida) { alert('No se pudo subir una foto: ' + errSubida.message); continue; }
      const { data: pub } = supabase.storage.from('fotos-service').getPublicUrl(ruta);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    }
    return urls;
  };

  const finalizarService = async () => {
    if (!vehiculoActivo) return alert('Primero debes buscar o registrar un auto.');
    if (!checklist.km_actual || !checklist.km_proximo) return alert('Por favor, ingresa el kilometraje actual y el próximo.');

    const urlsNuevas = await subirFotosPendientes();
    const checklistFinal = { ...checklist, fotos: [...(checklist.fotos || []), ...urlsNuevas] };

    const payload = {
      vehiculo_id: vehiculoActivo.id, categoria: 'Service Premium', item: checklistFinal.tipo_servicio,
      comentarios: JSON.stringify(checklistFinal), estado_evaluacion: 'COMPLETADO',
    };

    const { error } = editandoId
      ? await supabase.from('diagnosticos_checklist').update(payload).eq('id', editandoId)
      : await supabase.from('diagnosticos_checklist').insert([payload]);

    if (error) { alert('Error al guardar el service: ' + error.message); }
    else {
      alert(editandoId ? '¡Certificado corregido!' : '¡Service guardado!');
      if (!editandoId) {
        const telGuardado = vehiculoActivo.clientes?.telefono || '';
        const numConfirmado = window.prompt('Confirma el número de WhatsApp:', telGuardado);
        if (numConfirmado) {
          const numLimpio = numConfirmado.replace(/\D/g, '');
          const mensaje = `Hola ${vehiculoActivo.clientes.nombre}, somos *MAVA Taller*.\nHemos finalizado el Service Premium de tu ${vehiculoActivo.marca} ${vehiculoActivo.modelo}.\n\n📊 *Kilometraje actual:* ${checklist.km_actual} km\n⏳ *Próximo service:* a los ${checklist.km_proximo} km.\n\n¡Tu vehículo ya está listo! Te comparto el certificado completo con el detalle del diagnóstico.`;
          window.open(`https://wa.me/${numLimpio}?text=${encodeURIComponent(mensaje)}`, '_blank');
        }
      }
      setFotosNuevas([]);
      setEditandoId(null);
      cargarEntornoDeVehiculo(vehiculoActivo);
      setPantalla('buscador');
    }
  };

  const editarCertificado = (srv, datos) => {
    if (historial[0]?.id !== srv.id) {
      return alert('Este certificado ya está confirmado y no se puede modificar. Solo se puede corregir el último service cargado.');
    }
    setChecklist({ ...valoresIniciales(), ...datos, fotos: datos.fotos || [], trabajos_adicionales: datos.trabajos_adicionales || [] });
    setFotosNuevas([]);
    setEditandoId(srv.id);
    setPantalla('carga');
  };

  const enviarPorEmail = () => {
    const email = vehiculoActivo.clientes?.email;
    if (!email) return alert('El cliente no tiene un correo electrónico registrado.');
    const asunto = encodeURIComponent(`MAVA Taller - Certificado Premium (${vehiculoActivo.patente})`);
    const cuerpo = encodeURIComponent(`Hola ${vehiculoActivo.clientes.nombre},\n\nAdjunto el certificado de tu service.\nSaludos,\nMAVA Taller`);
    window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`);
  };

  /* Carga html2pdf.js desde un CDN la primera vez que se necesita
     (no requiere instalar nada con npm). */
  const cargarHtml2Pdf = () => new Promise((resolve, reject) => {
    if (window.html2pdf) return resolve(window.html2pdf);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.onload = () => resolve(window.html2pdf);
    script.onerror = () => reject(new Error('No se pudo cargar el generador de PDF. Revisá tu conexión a internet.'));
    document.body.appendChild(script);
  });

  /* Genera el PDF real del certificado (no depende del "Imprimir" del navegador) */
  const generarPdfBlob = async (nombreArchivo) => {
    const html2pdf = await cargarHtml2Pdf();
    const nodoOriginal = certificadoRef.current;

    // Clonamos el certificado a una posición fija arriba de todo (fuera de
    // pantalla, invisible para el usuario) para que el resultado NUNCA
    // dependa de cuánto estaba scrolleada la pantalla ni de qué hay arriba
    // en el DOM. Esto elimina el espacio en blanco al principio del PDF.
    const clon = nodoOriginal.cloneNode(true);
    const contenedorTemporal = document.createElement('div');
    contenedorTemporal.style.position = 'fixed';
    contenedorTemporal.style.top = '0';
    contenedorTemporal.style.left = '0';
    contenedorTemporal.style.width = `${nodoOriginal.offsetWidth}px`;
    contenedorTemporal.style.background = '#ffffff';
    contenedorTemporal.style.zIndex = '999999';
    contenedorTemporal.style.margin = '0';
    contenedorTemporal.appendChild(clon);
    document.body.appendChild(contenedorTemporal);
    document.body.style.overflow = 'hidden'; // evita que el body se scrollee mientras se genera

    try {
      await new Promise((r) => setTimeout(r, 100)); // deja que el clon termine de pintarse
      return await html2pdf().from(clon).set({
        filename: nombreArchivo,
        margin: 4,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      }).outputPdf('blob');
    } finally {
      document.body.removeChild(contenedorTemporal);
      document.body.style.overflow = '';
    }
  };

  const descargarBlob = (blob, nombreArchivo) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombreArchivo; a.click();
    URL.revokeObjectURL(url);
  };

  const descargarCertificadoPdf = async () => {
    if (!vehiculoActivo) return;
    try {
      const blob = await generarPdfBlob(`Certificado_${vehiculoActivo.patente}.pdf`);
      descargarBlob(blob, `Certificado_${vehiculoActivo.patente}.pdf`);
    } catch (e) {
      alert('No se pudo generar el PDF: ' + e.message);
    }
  };

  /* Comparte el CERTIFICADO REAL (el archivo, no solo texto) por WhatsApp.
     wa.me solo permite mandar texto — para adjuntar el PDF directo se usa
     el selector nativo para compartir del celular (Web Share API). Si el
     navegador no lo soporta (típico en PC), se descarga el PDF y se abre
     WhatsApp con el texto para que lo adjuntes vos a mano. */
  const compartirCertificadoWhatsApp = async () => {
    if (!vehiculoActivo) return;
    const nombreArchivo = `Certificado_${vehiculoActivo.patente}.pdf`;
    let blob;
    try {
      blob = await generarPdfBlob(nombreArchivo);
    } catch (e) {
      return alert('No se pudo generar el PDF: ' + e.message);
    }
    const mensaje = `Hola ${vehiculoActivo.clientes?.nombre || ''}, somos *MAVA Taller*. Te compartimos el certificado de tu ${vehiculoActivo.marca} ${vehiculoActivo.modelo} (${vehiculoActivo.patente}).`;
    const archivo = new File([blob], nombreArchivo, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: 'Certificado MAVA Taller', text: mensaje });
      } catch (e) {
        if (e.name !== 'AbortError') alert('No se pudo compartir el certificado: ' + e.message);
      }
    } else {
      descargarBlob(blob, nombreArchivo);
      alert('Tu navegador no permite adjuntar el PDF directo en WhatsApp. Se descargó el archivo — abrí WhatsApp, elegí el chat del cliente y adjuntalo a mano desde "Descargas".');
      const telGuardado = vehiculoActivo.clientes?.telefono || '';
      const numConfirmado = window.prompt('Confirmá el número de WhatsApp para abrir el chat:', telGuardado);
      if (numConfirmado) {
        const numLimpio = numConfirmado.replace(/\D/g, '');
        window.open(`https://wa.me/${numLimpio}?text=${encodeURIComponent(mensaje)}`, '_blank');
      }
    }
  };

  const parsearDatos = (jsonString) => { try { return JSON.parse(jsonString); } catch (e) { return {}; } };

  // --- Pantalla de carga inicial de sesión ---
  if (sesion === undefined) {
    return <div className="app-container"><p style={{ textAlign: 'center', marginTop: 60, color: 'var(--text-muted)' }}>Cargando…</p></div>;
  }

  // --- Pantalla de login (sin sesión) ---
  if (!sesion) {
    return (
      <div className="app-container">
        <div className="pantalla" style={{ maxWidth: 380, margin: '60px auto' }}>
          <h1>MAVA Taller</h1>
          <form onSubmit={iniciarSesion}>
            <input type="email" placeholder="Email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
            <input type="password" placeholder="Contraseña" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} required />
            {loginError && <p style={{ color: 'var(--mal)', fontSize: 13, marginTop: -8 }}>{loginError}</p>}
            <button type="submit" style={{ width: '100%', padding: '14px', background: 'var(--primary)', color: 'white' }}>Ingresar</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <nav className="navbar dont-print">
        <h2>MAVA <span>TALLER</span></h2>
        <div className="nav-links">
          <button onClick={() => setTemaClaro(!temaClaro)} style={{ background: 'transparent' }}>
            {temaClaro ? '🌙 Oscuro' : '☀️ Claro'}
          </button>
          <button onClick={cargarEstadisticas} style={{ background: 'var(--amber)', color: '#0b1b2b', border: 'none' }}>📊 Panel</button>
          <button onClick={() => { setPantalla('buscador'); setReporteSeleccionado(null); }} style={{ background: 'transparent' }}>🔍 Historial</button>
          <button onClick={() => { setPantalla('registro'); setVehiculoActivo(null); }} style={{ background: 'transparent' }}>➕ Nuevo</button>
          <button onClick={() => setPantalla('carga')} disabled={!vehiculoActivo} style={{ background: 'transparent' }}>{vehiculoActivo ? '🔧 Cargar Service' : '🔒 Service'}</button>
          <button onClick={() => setPantalla('cotizador')} style={{ background: 'transparent' }}>🚨 Cotizar Auxilio</button>
          <button onClick={cerrarSesion} style={{ background: 'transparent', opacity: 0.7 }}>🚪 Salir</button>
        </div>
      </nav>

      {vehiculoActivo && pantalla !== 'panel' && (
        <div className="resumen-activo dont-print">
          <strong>{vehiculoActivo.marca} {vehiculoActivo.modelo}</strong>
          <span className="placa">{vehiculoActivo.patente}</span>
          <p style={{ margin: '8px 0 0 0', fontSize: 13, opacity: 0.9 }}>Cliente: {vehiculoActivo.clientes?.nombre} (DNI: {vehiculoActivo.clientes?.dni})</p>

          {otrosVehiculos.length > 0 && (
            <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.25)' }}>
              <p style={{ fontSize: '13px', margin: '0 0 10px 0', fontWeight: 'bold' }}>🚘 Cambiar a otro vehículo de este cliente:</p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {otrosVehiculos.map((v) => (
                  <button key={v.id} onClick={() => cargarEntornoDeVehiculo({ ...v, clientes: vehiculoActivo.clientes })}
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', color: 'white', padding: '8px 12px', fontSize: '13px' }}>
                    {v.tipo_vehiculo === 'Moto' ? '🏍️' : '🚗'} {v.patente}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="content">

        {pantalla === 'panel' && (
          <div className="pantalla dont-print">
            <h1>Panel de Control</h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '30px' }}>Resumen de actividad de tu taller</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px' }}>
              <div className="stat-card" style={{ background: 'linear-gradient(135deg, #1e3a5f, #0b1b2b)' }}><h3>🚗 Autos Registrados</h3><p>{estadisticas.autos}</p></div>
              <div className="stat-card" style={{ background: 'linear-gradient(135deg, #7c3aed, #4c1d95)' }}><h3>🏍️ Motos Registradas</h3><p>{estadisticas.motos}</p></div>
              <div className="stat-card" style={{ background: 'linear-gradient(135deg, #16a34a, #065f46)' }}><h3>🔧 Services (Este Mes)</h3><p>{estadisticas.serviciosMes}</p></div>
            </div>

            <h3 className="seccion-titulo" style={{ marginTop: 30 }}>🔔 Services Vencidos o Próximos a Vencer</h3>
            {vencidos.some(estaAvisado) && (
              <button onClick={() => setMostrarAvisados((v) => !v)} style={{ background: 'transparent', border: '1px solid currentColor', color: 'inherit', padding: '4px 10px', fontSize: 12, marginBottom: 6 }}>
                {mostrarAvisados ? 'Ocultar los ya avisados' : `Mostrar ya avisados (${vencidos.filter(estaAvisado).length})`}
              </button>
            )}
            {cargandoVencidos ? (
              <p style={{ color: 'var(--text-muted)' }}>Calculando…</p>
            ) : vencidos.filter((item) => mostrarAvisados || !estaAvisado(item)).length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No hay vehículos con service vencido o próximo por ahora. 🎉</p>
            ) : (
              vencidos.filter((item) => mostrarAvisados || !estaAvisado(item)).map((item) => {
                const venc = item.diasRestantes <= 0;
                const marca = recordatorios[item.servicio.id] || {};
                return (
                  <div key={item.servicio.id} style={{
                    background: 'var(--bg-body)', padding: '14px', margin: '10px 0', borderRadius: 10,
                    border: '1px solid var(--border-color)', borderLeft: `4px solid ${venc ? 'var(--mal)' : 'var(--regular)'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                  }}>
                    <div>
                      <strong>{item.vehiculo.marca} {item.vehiculo.modelo}</strong> <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>({item.vehiculo.patente})</span>
                      <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                        {item.vehiculo.clientes?.nombre} · Recomendado a los {item.datos.km_proximo} km
                      </p>
                      <p style={{ margin: '2px 0 0 0', fontSize: 13, fontWeight: 'bold', color: venc ? 'var(--mal)' : 'var(--regular)' }}>
                        {venc ? `Vencido hace ${Math.abs(item.diasRestantes)} días` : `Vence en ${item.diasRestantes} días`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button onClick={() => recordarPorWhatsApp(item)} style={{ background: '#25D366', color: 'white' }}>📤 Recordar por WhatsApp</button>
                      <div style={{ display: 'flex', gap: 12, fontSize: 13, justifyContent: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!marca.avisado} onChange={(e) => marcarRecordatorio(item.servicio.id, 'avisado', e.target.checked)} />
                          Ya avisé
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!marca.email_enviado} onChange={(e) => marcarRecordatorio(item.servicio.id, 'email_enviado', e.target.checked)} />
                          Email enviado
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {bloqueados.length > 0 && (
              <>
                <h3 className="seccion-titulo" style={{ marginTop: 30 }}>🔒 Consultas Bloqueadas</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Estos vehículos superaron 3 intentos fallidos de verificación. Ningún dato se muestra hasta que lo desbloquees.</p>
                {bloqueados.map((b) => (
                  <div key={b.vehiculo_id} style={{
                    background: 'var(--bg-body)', padding: '14px', margin: '10px 0', borderRadius: 10,
                    border: '1px solid var(--border-color)', borderLeft: '4px solid var(--mal)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                  }}>
                    <div>
                      <strong>{b.vehiculos?.marca} {b.vehiculos?.modelo}</strong> <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>({b.vehiculos?.patente})</span>
                      <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                        {b.vehiculos?.clientes?.nombre} · Bloqueado el {b.bloqueado_at ? new Date(b.bloqueado_at).toLocaleString() : '-'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => contactarBloqueo(b)} style={{ background: '#25D366', color: 'white' }}>📤 Preguntar por WhatsApp</button>
                      <button onClick={() => desbloquearConsulta(b.vehiculo_id)} style={{ background: 'var(--success)', color: 'white' }}>🔓 Desbloquear</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {pantalla === 'buscador' && (
          <div className="pantalla">
            <h1 className="dont-print">Buscador de Vehículos</h1>
            <div className="dont-print" style={{ display: 'flex', gap: '10px', marginBottom: '6px' }}>
              <input value={textoBusqueda} onChange={(e) => setTextoBusqueda(e.target.value)} placeholder="Ingrese Patente o DNI del Cliente" autoComplete="off" />
              <button onClick={buscarInteligente} style={{ background: 'var(--primary)', color: '#fff', whiteSpace: 'nowrap' }}>Buscar</button>
            </div>
            {sugerencias.length > 0 && (
              <div className="dont-print" style={{ marginBottom: '20px', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
                {sugerencias.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => { setTextoBusqueda(s.patente); setSugerencias([]); cargarEntornoDeVehiculo({ ...s, clientes: s.clientes }); }}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: 14 }}
                  >
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{s.patente}</strong> — {s.marca} {s.modelo} <span style={{ color: 'var(--text-muted)' }}>({s.clientes?.nombre || 'sin cliente'})</span>
                  </div>
                ))}
              </div>
            )}

            {vehiculoActivo && !reporteSeleccionado && (
              <div className="dont-print">
                <h3 className="seccion-titulo">🧰 Ficha de Filtros del Vehículo</h3>
                <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border-color)', borderRadius: 10, padding: 16, marginBottom: 24 }}>
                  {!vehiculoActivo.motorizacion ? (
                    <>
                      <p style={{ marginTop: 0, fontSize: 14, color: 'var(--text-muted)' }}>Este vehículo todavía no tiene el código de motor cargado. Ingresalo para poder buscar y guardar sus filtros:</p>
                      <div className="grid-2">
                        <FilaTexto label="Código de Motor / Motorización" valor={motorVin.motorizacion} onChange={(v) => setMotorVin((p) => ({ ...p, motorizacion: v }))} />
                        <FilaTexto label="VIN / Número de Chasis" valor={motorVin.vin} onChange={(v) => setMotorVin((p) => ({ ...p, vin: v }))} />
                      </div>
                      <button onClick={guardarMotorVin} style={{ background: 'var(--primary)', color: 'white' }}>💾 Guardar Motor / VIN</button>
                    </>
                  ) : (
                    <>
                      <p style={{ marginTop: 0, fontSize: 14 }}>
                        <strong>Motor:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{vehiculoActivo.motorizacion}</span>
                        {vehiculoActivo.vin && <> &nbsp;·&nbsp; <strong>VIN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{vehiculoActivo.vin}</span></>}
                        {' '}<button onClick={() => setMotorVin({ motorizacion: vehiculoActivo.motorizacion, vin: vehiculoActivo.vin || '' })} style={{ background: 'transparent', fontSize: 12, padding: '2px 8px' }}>✏️</button>
                      </p>

                      {filtrosMotor && !editandoFiltros ? (
                        <>
                          <table className="pdf-tabla-moderna" style={{ margin: '10px 0' }}>
                            <tbody>
                              <tr><td>Filtro de Aceite</td><td className="col-estado"><strong>{filtrosMotor.filtro_aceite || '—'}</strong></td></tr>
                              <tr><td>Filtro de Aire</td><td className="col-estado"><strong>{filtrosMotor.filtro_aire || '—'}</strong></td></tr>
                              <tr><td>Filtro de Combustible</td><td className="col-estado"><strong>{filtrosMotor.filtro_combustible || '—'}</strong></td></tr>
                              <tr><td>Filtro de Habitáculo</td><td className="col-estado"><strong>{filtrosMotor.filtro_habitaculo || '—'}</strong></td></tr>
                            </tbody>
                          </table>
                          {filtrosMotor.notas && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}><em>Notas: {filtrosMotor.notas}</em></p>}
                          <button onClick={() => setEditandoFiltros(true)} style={{ background: 'var(--amber)', color: '#0b1b2b' }}>✏️ Editar Filtros de este Motor</button>
                        </>
                      ) : (
                        <>
                          {!filtrosMotor && (
                            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Este motor todavía no está en tu base de filtros. Cargalo una vez y va a autocompletarse solo en cualquier otro vehículo que use este mismo motor.</p>
                          )}
                          <div className="grid-2">
                            <FilaTexto label="Filtro de Aceite" valor={formFiltros.filtro_aceite} onChange={(v) => setFormFiltros((p) => ({ ...p, filtro_aceite: v }))} />
                            <FilaTexto label="Filtro de Aire" valor={formFiltros.filtro_aire} onChange={(v) => setFormFiltros((p) => ({ ...p, filtro_aire: v }))} />
                          </div>
                          <div className="grid-2">
                            <FilaTexto label="Filtro de Combustible" valor={formFiltros.filtro_combustible} onChange={(v) => setFormFiltros((p) => ({ ...p, filtro_combustible: v }))} />
                            <FilaTexto label="Filtro de Habitáculo" valor={formFiltros.filtro_habitaculo} onChange={(v) => setFormFiltros((p) => ({ ...p, filtro_habitaculo: v }))} />
                          </div>
                          <div className="fila-check">
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Notas (opcional)</label>
                            <textarea value={formFiltros.notas} onChange={(e) => setFormFiltros((p) => ({ ...p, notas: e.target.value }))} placeholder="Ej: cuidado, hay 2 versiones de este motor, este es el de 16 válvulas." />
                          </div>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={guardarFiltrosMotor} style={{ background: 'var(--success)', color: 'white' }}>💾 Guardar Filtros de este Motor</button>
                            {filtrosMotor && <button onClick={() => setEditandoFiltros(false)} style={{ background: 'transparent' }}>Cancelar</button>}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                  <button onClick={abrirQR} style={{ background: 'var(--primary)', color: '#fff' }}>📱 QR para el cliente</button>
                </div>
                {mostrarQR && (
                  <div onClick={() => setMostrarQR(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
                    <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-body)', padding: 20, borderRadius: 12, textAlign: 'center', maxWidth: 360 }}>
                      <h3 style={{ marginTop: 0 }}>Escaneá para ver el próximo service</h3>
                      <img src={qrDataUrl} alt="QR de consulta" style={{ width: 260, height: 260 }} />
                      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>El cliente ingresa su patente y DNI. Ningún dato se muestra sin verificarlos.</p>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <a href={qrDataUrl} download={`QR-${vehiculoActivo.patente}.png`} style={{ background: 'var(--success)', color: '#fff', padding: '8px 14px', borderRadius: 8, textDecoration: 'none', fontWeight: 'bold' }}>⬇️ Descargar</a>
                        <button onClick={() => setMostrarQR(false)} style={{ background: 'transparent' }}>Cerrar</button>
                      </div>
                    </div>
                  </div>
                )}
                <h3 className="seccion-titulo">Historial de Servicios de {vehiculoActivo.patente}</h3>
                {historial.length === 0 ? <p>No hay servicios previos registrados para este vehículo.</p> : (
                  historial.map((srv, idx) => {
                    const datos = parsearDatos(srv.comentarios);
                    const esElUltimo = idx === 0;
                    return (
                      <div key={srv.id} style={{ background: 'var(--bg-body)', padding: '15px', margin: '10px 0', borderRadius: '10px', borderLeft: '4px solid var(--primary)', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                          <div>
                            <p style={{ margin: '0 0 5px 0' }}><strong>Fecha:</strong> {new Date(srv.created_at).toLocaleDateString()}</p>
                            <p style={{ margin: '0 0 5px 0' }}><strong>Tipo:</strong> {srv.item}</p>
                            <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-muted)' }}>KM: {datos.km_actual || '-'} | Próximo: {datos.km_proximo || '-'}</p>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <button onClick={() => setReporteSeleccionado({ srv, datos })} style={{ background: 'var(--success)', color: 'white' }}>📄 Ver Certificado</button>
                            {esElUltimo ? (
                              <button onClick={() => editarCertificado(srv, datos)} style={{ background: 'var(--amber)', color: '#0b1b2b' }}>✏️ Editar</button>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>🔒 Confirmado</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {reporteSeleccionado && (() => {
              const d = reporteSeleccionado.datos;
              const tipo = d.tipo_servicio || 'Auto';
              const conteoDiagrama = resumenDiagrama(d.diagrama, tipo);

              // Resumen general: recorre todos los campos de las secciones oficiales + diagrama
              const seccionesDelTipo = tipo === 'Moto' ? SECCIONES_MOTO : SECCIONES_CHECKLIST;
              const conteoGeneral = { BIEN: 0, REGULAR: 0, MAL: 0, 'N/A': 0 };
              seccionesDelTipo.forEach((sec) => camposAplicables(sec, tipo).forEach((c) => {
                if (c.omitirResumen) return;
                conteoGeneral[clasificarEstado(d[c.campo])]++;
              }));
              Object.keys(conteoDiagrama).forEach((k) => { conteoGeneral[k] += conteoDiagrama[k]; });

              return (
                <>
                <div className="pdf-container" ref={certificadoRef}>
                  <div className="pdf-header-modern">
                    <div className="pdf-header-modern-izq">
                      <h1>MAVA</h1>
                      <h3>Diagnósticos Mecánicos &amp; Cambios de Aceite</h3>
                      <p>Capital Federal · Auxilio Mecánico Rápido 24 HS</p>
                      <p>Atención Inmediata: 11 2254-7742</p>
                    </div>
                    <div>
                      <div className="pdf-badge-premium">Certificado Premium</div>
                      <p className="pdf-folio">FOLIO #{String(reporteSeleccionado.srv.id).padStart(5, '0')}</p>
                    </div>
                  </div>

                  <div className="pdf-body">
                    <div className="pdf-grid-datos">
                      <div className="pdf-item-dato"><label>Cliente</label><span>{vehiculoActivo.clientes?.nombre}</span></div>
                      <div className="pdf-item-dato"><label>Fecha de Service</label><span>{new Date(reporteSeleccionado.srv.created_at).toLocaleDateString()}</span></div>
                      <div className="pdf-item-dato"><label>Vehículo</label><span>{vehiculoActivo.marca} {vehiculoActivo.modelo}</span></div>
                      <div className="pdf-item-dato"><label>Patente</label><span>{vehiculoActivo.patente}</span></div>
                      <div className="pdf-item-dato"><label>Kilometraje Actual</label><span>{d.km_actual} km</span></div>
                      <div className="pdf-item-dato"><label>Próximo Service</label><span>{d.km_proximo} km</span></div>
                      <div className="pdf-item-dato"><label>Promedio Km. Mensual</label><span>{d.promedio_km_mensual || '-'} km</span></div>
                      <div className="pdf-item-dato"><label>Motivo de Visita</label><span>{d.motivo_visita || '-'}</span></div>
                    </div>

                    <h3 className="pdf-section-title">📋 Resumen General del Diagnóstico</h3>
                    <div className="pdf-resumen-semaforo">
                      <div className="pdf-resumen-item" style={{ background: '#e8f8ef' }}><span className="num" style={{ color: COLOR_ESTADO.BIEN }}>{conteoGeneral.BIEN}</span><span className="lbl" style={{ color: COLOR_ESTADO.BIEN }}>En Buen Estado</span></div>
                      <div className="pdf-resumen-item" style={{ background: '#fdeaea' }}><span className="num" style={{ color: COLOR_ESTADO.MAL }}>{conteoGeneral.MAL}</span><span className="lbl" style={{ color: COLOR_ESTADO.MAL }}>Atención Urgente</span></div>
                      <div className="pdf-resumen-item" style={{ background: '#f1f4f7' }}><span className="num" style={{ color: COLOR_ESTADO['N/A'] }}>{conteoGeneral['N/A']}</span><span className="lbl" style={{ color: COLOR_ESTADO['N/A'] }}>No Accesible / N-A</span></div>
                    </div>

                    <h3 className="pdf-section-title">🎯 Suspensión y Tren</h3>
                    <ResumenDiagramaPdf tipo={tipo} datos={d.diagrama || diagramaInicial()} />

                    <div className="pdf-secciones-grid">
                      {seccionesDelTipo.map((sec) => {
                        const campos = camposAplicables(sec, tipo);
                        if (campos.length === 0) return null;
                        return (
                          <div key={sec.id} className="pdf-seccion-item">
                            <h3 className="pdf-section-title">{sec.titulo}</h3>
                            <table className="pdf-tabla-moderna">
                              <thead><tr><th style={{ width: '65%' }}>Punto de Revisión</th><th className="col-estado">Estado</th></tr></thead>
                              <tbody>
                                {campos.map((c) => (
                                  <tr key={c.campo}><td>{c.label}</td><td className="col-estado"><ChipEstado valor={d[c.campo]} /></td></tr>
                                ))}
                              </tbody>
                            </table>
                            {d[sec.comentario] ? <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-8px 0 10px 4px' }}><em>Obs.: {d[sec.comentario]}</em></p> : null}
                          </div>
                        );
                      })}
                    </div>

                    {d.trabajos_adicionales && d.trabajos_adicionales.filter((t) => t.descripcion?.trim()).length > 0 && (
                      <div>
                        <h3 className="pdf-section-title">🔩 Trabajos Adicionales / Reparaciones</h3>
                        <table className="pdf-tabla-moderna">
                          <thead><tr><th>Trabajo Realizado</th></tr></thead>
                          <tbody>
                            {d.trabajos_adicionales.filter((t) => t.descripcion?.trim()).map((t, i) => (
                              <tr key={i}>
                                <td>
                                  <strong>{t.descripcion}</strong>
                                  {t.detalle ? <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{t.detalle}</div> : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {d.fotos && d.fotos.length > 0 && (
                      <div>
                        <h3 className="pdf-section-title">📷 Fotos del Vehículo</h3>
                        <div className="pdf-fotos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
                          {d.fotos.map((url) => (
                            <img key={url} src={url} alt="foto del service" style={{ width: '100%', height: 'auto', objectFit: 'contain', borderRadius: 8, border: '1px solid #dbe3ec' }} />
                          ))}
                        </div>
                      </div>
                    )}

                    <h3 className="pdf-section-title">🧾 Certificado de Producto</h3>
                    <div className="pdf-productos-box">{d.productos_texto}</div>

                    <div className="pdf-leyenda">
                      {ORDEN_ESTADOS.map((e) => (
                        <span key={e} className="item"><span className="dot" style={{ background: COLOR_ESTADO[e] }} /><strong>{e}</strong>{
                          e === 'BIEN' ? ': no requiere atención inmediata' :
                          e === 'REGULAR' ? ': podría requerir atención futura' :
                          e === 'MAL' ? ': requiere atención inmediata' : ': no accesible / no corresponde'
                        }</span>
                      ))}
                    </div>

                    <div className="pdf-condiciones">
                      <strong>CONDICIONES DEL DIAGNÓSTICO:</strong><br />
                      El servicio de Lubricación + Diagnóstico comprende únicamente los puntos enumerados en este documento. El diagnóstico se limita a una inspección meramente externa de los puntos de control enumerados, y refleja el estado de los mismos exclusivamente al momento de la inspección, sin que implique garantía explícita o implícita alguna respecto de dicho estado una vez finalizado el diagnóstico. La empresa no se responsabiliza por deficiencias o defectos detectados o detectables con posterioridad al diagnóstico, y excluye expresamente cualquier responsabilidad que pudiera derivarse de deficiencias y/o defectos en los puntos de control que no fueran detectables a simple vista al momento del diagnóstico.
                    </div>

                    <div className="pdf-footer">MAVA — Auxilio Mecánico Rápido 24 HS · Tel: 11 2254-7742</div>
                  </div>
                </div>

                <div className="dont-print" style={{ marginTop: '25px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={compartirCertificadoWhatsApp} style={{ background: '#25D366', color: 'white' }}>📤 Enviar por WhatsApp</button>
                  <button onClick={descargarCertificadoPdf} style={{ background: 'var(--primary)', color: 'white' }}>📥 Descargar PDF</button>
                  <button onClick={enviarPorEmail} style={{ background: 'var(--amber)', color: '#0b1b2b' }}>✉️ Enviar por Email</button>
                  <button onClick={() => window.print()} style={{ background: 'transparent' }}>🖨️ Imprimir</button>
                  <button onClick={() => setReporteSeleccionado(null)} style={{ background: 'var(--mal)', color: 'white' }}>Volver</button>
                </div>
                </>
              );
            })()}
          </div>
        )}

        {pantalla === 'registro' && (
          <div className="pantalla dont-print">
            <h1>Registro Completo</h1>
            <div className="grid-2">
              <div>
                <h3 className="seccion-titulo">Cliente</h3>
                <input placeholder="DNI (Sin puntos)" value={nuevoCliente.dni} onChange={(e) => setNuevoCliente({ ...nuevoCliente, dni: e.target.value })} />
                <input placeholder="Nombre Completo" value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} />
                <input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} />
                <input placeholder="Email" type="email" value={nuevoCliente.email} onChange={(e) => setNuevoCliente({ ...nuevoCliente, email: e.target.value })} />
              </div>
              <div>
                <h3 className="seccion-titulo">Vehículo</h3>
                <select value={nuevoAuto.tipo_vehiculo} onChange={(e) => setNuevoAuto({ ...nuevoAuto, tipo_vehiculo: e.target.value })}>
                  <option value="Auto">Vehículo: AUTO</option>
                  <option value="Moto">Vehículo: MOTO</option>
                </select>
                <input placeholder="Patente" value={nuevoAuto.patente} onChange={(e) => setNuevoAuto({ ...nuevoAuto, patente: e.target.value })} />
                <input placeholder="Marca (Ej: Chevrolet)" value={nuevoAuto.marca} onChange={(e) => setNuevoAuto({ ...nuevoAuto, marca: e.target.value })} />
                <input placeholder="Modelo (Ej: Onix)" value={nuevoAuto.modelo} onChange={(e) => setNuevoAuto({ ...nuevoAuto, modelo: e.target.value })} />
                <input placeholder="Código de Motor / Motorización (Ej: 1.4 8V EVO)" value={nuevoAuto.motorizacion} onChange={(e) => setNuevoAuto({ ...nuevoAuto, motorizacion: e.target.value })} />
                <input placeholder="VIN / Número de Chasis (opcional)" value={nuevoAuto.vin} onChange={(e) => setNuevoAuto({ ...nuevoAuto, vin: e.target.value })} />
              </div>
            </div>
            <button onClick={registrarTodo} style={{ width: '100%', marginTop: '10px', padding: '15px', background: 'var(--primary)', color: 'white' }}>Registrar y Cargar Service</button>
          </div>
        )}

        {pantalla === 'cotizador' && (
          <div className="pantalla dont-print">
            <h1>🚨 Cotizador de Auxilio a Domicilio</h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: 20 }}>Para asistencias rápidas — no requiere que el vehículo esté registrado en el sistema.</p>

            <div className="grid-2">
              <FilaTexto label="Nombre del cliente" valor={cotizacion.nombre_cliente} onChange={(v) => manejarCambioCotizacion('nombre_cliente', v)} />
              <FilaTexto label="Teléfono (WhatsApp)" valor={cotizacion.telefono} onChange={(v) => manejarCambioCotizacion('telefono', v)} />
            </div>

            <FilaTexto label="Dirección / ubicación" valor={cotizacion.direccion} onChange={(v) => manejarCambioCotizacion('direccion', v)} />

            <FilaCheck
              label="Tipo de problema"
              valor={cotizacion.tipo_problema}
              opciones={['Batería descargada', 'Pinchadura / neumático', 'Falla de arranque', 'Remolque / grúa', 'Falta de combustible', 'Otro']}
              onChange={(v) => manejarCambioCotizacion('tipo_problema', v)}
            />

            <div className="fila-check">
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Descripción breve</label>
              <textarea
                value={cotizacion.descripcion}
                onChange={(e) => manejarCambioCotizacion('descripcion', e.target.value)}
                placeholder="Ej: Auto no arranca, quedó en el estacionamiento del shopping."
              />
            </div>

            <FilaTexto label="Presupuesto estimado ($)" valor={cotizacion.precio_estimado} onChange={(v) => manejarCambioCotizacion('precio_estimado', v)} />

            <button onClick={generarCotizacion} style={{ width: '100%', marginTop: '10px', padding: '15px', background: '#25D366', color: 'white', fontSize: '18px' }}>
              📤 Generar y Enviar por WhatsApp
            </button>
          </div>
        )}

        {pantalla === 'carga' && vehiculoActivo && (
          <div className="pantalla dont-print">
            <h1>{editandoId ? '✏️ Corrigiendo Service' : 'Cargar Service Premium'}</h1>
            {editandoId && (
              <div style={{ background: 'var(--regular-bg)', color: 'var(--regular-dark, #8a6d0b)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span>Estás corrigiendo un certificado ya guardado. Al guardar se pisa el original.</span>
                <button onClick={() => { setEditandoId(null); setChecklist(valoresIniciales()); setFotosNuevas([]); }} style={{ background: 'transparent', border: '1px solid currentColor', color: 'inherit', padding: '4px 10px', fontSize: 12 }}>Cancelar</button>
              </div>
            )}

            <div style={{ background: 'var(--bg-body)', padding: '15px', borderRadius: '10px', marginBottom: '20px', border: '2px dashed var(--border-color)' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px' }}>Tipo de Vehículo a Revisar:</label>
              <select value={checklist.tipo_servicio} onChange={(e) => manejarCambioChecklist('tipo_servicio', e.target.value)} style={{ marginBottom: 0 }}>
                <option value="Auto">🚗 Formulario para AUTO</option>
                <option value="Moto">🏍️ Formulario para MOTO</option>
              </select>
            </div>

            <h3 className="seccion-titulo">📅 Información del Turno</h3>
            <div className="grid-2">
              <FilaTexto label="Kilometraje actual" valor={checklist.km_actual} onChange={(v) => manejarCambioChecklist('km_actual', v)} />
              <FilaTexto label="Promedio kilómetro mensual" valor={checklist.promedio_km_mensual} onChange={(v) => manejarCambioChecklist('promedio_km_mensual', v)} />
            </div>
            <div className="grid-2">
              <FilaTexto label="Kilómetro próximo servicio" valor={checklist.km_proximo} onChange={(v) => manejarCambioChecklist('km_proximo', v)} />
              <FilaTexto label="Motivo de visita" valor={checklist.motivo_visita} onChange={(v) => manejarCambioChecklist('motivo_visita', v)} />
            </div>

            <h3 className="seccion-titulo">🎯 Diagrama Rápido de Suspensión y Tren</h3>
            <DiagramaSuspension tipo={checklist.tipo_servicio} datos={checklist.diagrama} onCambiar={manejarCambioDiagrama} interactivo />

            {(checklist.tipo_servicio === 'Moto' ? SECCIONES_MOTO : SECCIONES_CHECKLIST).map((sec) => {
              const campos = camposAplicables(sec, checklist.tipo_servicio);
              if (campos.length === 0) return null;
              return (
                <div key={sec.id}>
                  <h3 className="seccion-titulo">{sec.titulo}</h3>
                  <div className="grid-2">
                    {campos.map((c) => <CampoDinamico key={c.campo} c={c} checklist={checklist} onChange={manejarCambioChecklist} />)}
                  </div>
                  <div className="fila-check" style={{ borderLeft: '4px solid var(--na)' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Comentarios sobre {sec.titulo.replace(/^\S+\s/, '').toLowerCase()}</label>
                    <textarea value={checklist[sec.comentario] ?? ''} onChange={(e) => manejarCambioChecklist(sec.comentario, e.target.value)} placeholder="Opcional..." />
                  </div>
                </div>
              );
            })}

            <h3 className="seccion-titulo">🔩 Trabajos Adicionales / Reparaciones</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: -8, marginBottom: 12 }}>
              Solo para lo que no es parte del service de rutina: bobinas, bujías, batería, limpieza de sensores/cuerpo de mariposa, etc. Si no hiciste nada extra, dejalo vacío y no aparece en el certificado.
            </p>
            {(checklist.trabajos_adicionales || []).map((trabajo, idx) => (
              <FilaTrabajoAdicional
                key={idx}
                trabajo={trabajo}
                onCambiar={(campo, valor) => cambiarTrabajoAdicional(idx, campo, valor)}
                onQuitar={() => quitarTrabajoAdicional(idx)}
              />
            ))}
            <button onClick={agregarTrabajoAdicional} style={{ background: 'var(--amber)', color: '#0b1b2b', marginBottom: 20 }}>+ Agregar Trabajo Adicional</button>

            <h3 className="seccion-titulo">📷 Fotos del Vehículo</h3>
            <div style={{ background: 'var(--bg-body)', padding: '14px', borderRadius: 10, border: '2px dashed var(--border-color)', marginBottom: 14 }}>
              <label style={{ display: 'inline-block', padding: '10px 16px', background: 'var(--primary)', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}>
                📸 Sacar / Elegir Fotos
                <input type="file" accept="image/*" capture="environment" multiple onChange={manejarSeleccionFotos} style={{ display: 'none' }} />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                {(checklist.fotos || []).map((url) => (
                  <div key={url} style={{ position: 'relative' }}>
                    <img src={url} alt="foto guardada" style={{ maxWidth: 220, width: 'auto', height: 'auto', display: 'block', borderRadius: 8, border: '1px solid var(--border-color)' }} />
                    <button onClick={() => quitarFotoGuardada(url)} style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: 'var(--mal)', color: '#fff', padding: 0, fontSize: 12, lineHeight: '20px' }}>✕</button>
                  </div>
                ))}
                {fotosNuevas.map((archivo, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={URL.createObjectURL(archivo)} alt="foto nueva" style={{ maxWidth: 220, width: 'auto', height: 'auto', display: 'block', borderRadius: 8, border: '2px solid var(--amber)' }} />
                    <button onClick={() => quitarFotoNueva(i)} style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: 'var(--mal)', color: '#fff', padding: 0, fontSize: 12, lineHeight: '20px' }}>✕</button>
                  </div>
                ))}
                {(checklist.fotos || []).length === 0 && fotosNuevas.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Sin fotos todavía. Van a quedar guardadas junto al certificado.</p>
                )}
              </div>
            </div>

            <h3 className="seccion-titulo">🧾 Certificado de Producto</h3>
            <textarea
              value={checklist.productos_texto}
              onChange={(e) => manejarCambioChecklist('productos_texto', e.target.value)}
              placeholder={'Ej: Aceite 10W40 - 1,3 L\nFiltro de Aceite - 1 Unidad'}
            />

            <button onClick={finalizarService} style={{ width: '100%', marginTop: '10px', padding: '15px', background: editandoId ? 'var(--amber)' : 'var(--success)', color: editandoId ? '#0b1b2b' : 'white', fontSize: '18px' }}>
              {editandoId ? '✏️ Guardar Corrección' : '💾 Guardar Reporte Final'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Root() {
  const esConsulta = new URLSearchParams(window.location.search).has('consulta');
  return esConsulta ? <ConsultaPublica /> : <App />;
}
