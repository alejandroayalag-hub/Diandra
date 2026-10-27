import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getControl, mesActual, pesos } from '../api/control';
import { getAgenda } from '../api/agenda';
import { getCalendario, getResumenObligaciones } from '../api/obligaciones';
import { getEmpresas } from '../api/empresas';

const hoy = () => new Date().toLocaleDateString('en-CA');
const masDias = (f, n) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const fmtDia = f => cap(new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }));
const TIPO = { cita: 'Cita', llamada: 'Llamada', entrega: 'Entrega', impuestos: 'Impuestos', otro: 'Otro' };

// Íconos de trazo (estilo lucide) en línea: sin dependencia nueva.
const ICONOS = {
  agenda: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  control: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  obligaciones: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 15l2 2 4-4" /></>,
  clientes: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" /></>,
  personal: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  pagos: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></>,
  checador: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  formatos: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></>,
};

const MODULOS = [
  { key: 'agenda', label: 'Agenda', desc: 'Citas, llamadas, entregas y vencimientos fiscales', to: '/agenda', from: '#1d4ed8', hasta: '#60a5fa' },
  { key: 'control', label: 'Control de clientes', desc: 'Honorarios, documentos del mes y bitácora', to: '/control', from: '#047857', hasta: '#34d399' },
  { key: 'obligaciones', label: 'Obligaciones', desc: 'Calendario fiscal por cliente y acuses', to: '/obligaciones', from: '#b45309', hasta: '#fbbf24' },
  { key: 'clientes', label: 'Clientes', desc: 'Fichas, acta constitutiva y constancia fiscal', to: '/empresas', from: '#334155', hasta: '#94a3b8' },
  { key: 'personal', label: 'Personal', desc: 'Empleados del cliente: expedientes, contratos y salidas', to: '/empleados', from: '#4338ca', hasta: '#a5b4fc' },
  { key: 'pagos', label: 'Pagos', desc: 'Comprobantes bancarios y nómina semanal', to: '/pagos', from: '#0f766e', hasta: '#5eead4' },
  { key: 'checador', label: 'Checador', desc: 'Relojes biométricos y asistencia', to: '/checador/mapeo', from: '#6d28d9', hasta: '#c4b5fd' },
  { key: 'formatos', label: 'Formatos', desc: 'Plantillas de contratos y documentos', to: '/formatos', from: '#0369a1', hasta: '#7dd3fc' },
];

function Modulo({ m, aviso, alerta, onClick }) {
  return (
    <button onClick={onClick}
      className="relative bg-white rounded-2xl px-6 pb-6 pt-10 text-center border border-gray-200 shadow-sm transition-all duration-200 hover:-translate-y-1.5 hover:shadow-xl active:scale-95">
      {aviso != null && (
        <span className={`absolute top-3 right-3 text-[11px] font-semibold px-2 py-0.5 rounded-full ${alerta ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{aviso}</span>
      )}
      <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-md"
        style={{ background: `linear-gradient(135deg, ${m.from}, ${m.hasta})` }}>
        <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {ICONOS[m.key]}
        </svg>
      </div>
      <h2 className="text-base font-semibold text-gray-800 mb-1">{m.label}</h2>
      <p className="text-xs leading-relaxed text-gray-500">{m.desc}</p>
    </button>
  );
}

function Bloque({ titulo, to, liga, children }) {
  return (
    <section className="bg-white border rounded p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{titulo}</h2>
        <Link to={to} className="text-sm text-blue-700 hover:underline">{liga} →</Link>
      </div>
      {children}
    </section>
  );
}

const Vacio = ({ children }) => <p className="text-sm text-gray-500">{children}</p>;

export default function EscritorioPage() {
  const [control, setControl] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [agenda, setAgenda] = useState(null);
  const [obligaciones, setObligaciones] = useState(null);
  const [clientes, setClientes] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const h = hoy();
  const periodo = mesActual();

  useEffect(() => {
    const fallo = () => setError('No se pudo cargar parte del escritorio. Recarga la página.');
    const d = hoy();
    getControl(mesActual()).then(setControl).catch(fallo);
    getEmpresas().then(e => setClientes(e.filter(x => x.activo).length)).catch(fallo);
    getResumenObligaciones().then(setResumen).catch(fallo);
    getAgenda(d, masDias(d, 7)).then(r => setAgenda(r.eventos)).catch(fallo);
    // Trae todo lo vencido sin presentar más lo que vence en 7 días.
    getCalendario({ desde: d, hasta: masDias(d, 7) }).then(r => setObligaciones(r.filter(i => i.estado !== 'presentada'))).catch(fallo);
  }, []);

  const deudores = control ? control.clientes.filter(c => c.saldo > 0).sort((a, b) => b.saldo - a.saldo) : null;

  return (
    <div>
      <div className="text-center pt-4 mb-8">
        <div className="text-3xl font-bold tracking-[0.2em] text-gray-800">DIANDRA</div>
        <div className="text-xs uppercase tracking-[0.3em] text-gray-500 mt-1">Asesoría Contable</div>
        <p className="text-sm text-gray-500 mt-4">{cap(new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · Selecciona un módulo para continuar</p>
      </div>
      {error && <p className="text-red-600 text-sm mb-3 text-center">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto mb-10">
        {MODULOS.map(m => {
          const avisos = {
            agenda: agenda && [`${agenda.filter(e => e.fecha === h).length} hoy`, false],
            control: control && control.totales.por_cobrar > 0 && [`${pesos(control.totales.por_cobrar).replace(/\.00$/, '')} x cobrar`, true],
            obligaciones: resumen && (resumen.vencidas > 0 ? [`${resumen.vencidas} vencidas`, true] : [`${resumen.esta_semana} esta semana`, false]),
            clientes: clientes != null && [`${clientes} activos`, false],
          };
          const [aviso, alerta] = avisos[m.key] || [];
          return <Modulo key={m.key} m={m} aviso={aviso} alerta={alerta} onClick={() => navigate(m.key === 'control' ? `/control?periodo=${periodo}` : m.to)} />;
        })}
      </div>
      <p className="text-xs text-gray-400 text-center -mt-7 mb-8">Personal, Pagos, Checador y Formatos trabajan sobre el cliente elegido en el selector de arriba.</p>

      <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3 max-w-5xl mx-auto">Pendientes</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
        <Bloque titulo="Agenda · hoy y 7 días" to="/agenda" liga="Agenda">
          {!agenda ? <Vacio>Cargando…</Vacio> : agenda.length === 0 ? <Vacio>Nada agendado.</Vacio> : (
            <ul className="divide-y text-sm">
              {agenda.map(e => (
                <li key={e.id} className="py-1.5 flex gap-3">
                  <span className={`w-24 shrink-0 ${e.fecha === h ? 'text-blue-700 font-medium' : 'text-gray-500'}`}>{e.fecha === h ? 'Hoy' : fmtDia(e.fecha)}{e.hora && ` ${e.hora}`}</span>
                  <span className="min-w-0">{e.titulo}<span className="text-gray-500"> · {TIPO[e.tipo]}{e.razon_social && ` · ${e.razon_social}`}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque titulo="Obligaciones urgentes" to="/obligaciones" liga="Obligaciones">
          {!obligaciones ? <Vacio>Cargando…</Vacio> : obligaciones.length === 0 ? <Vacio>Nada vencido ni por vencer esta semana.</Vacio> : (
            <ul className="divide-y text-sm">
              {obligaciones.slice(0, 5).map(o => (
                <li key={`${o.obligacion_id}|${o.periodo}`} className="py-1.5 flex gap-3">
                  <span className={`w-24 shrink-0 ${o.estado === 'vencida' ? 'text-red-700 font-medium' : 'text-amber-700'}`}>{fmtDia(o.fecha_vence)}</span>
                  <span className="min-w-0">{o.descripcion} <span className="text-gray-500">({o.periodo}) · {o.razon_social}</span></span>
                </li>
              ))}
            </ul>
          )}
          {obligaciones?.length > 5 && <Link to="/obligaciones" className="block text-sm text-blue-700 hover:underline mt-2">y {obligaciones.length - 5} más →</Link>}
        </Bloque>

        <Bloque titulo="Clientes con adeudo" to={`/control?periodo=${periodo}`} liga="Control">
          {!deudores ? <Vacio>Cargando…</Vacio> : deudores.length === 0 ? <Vacio>Nadie debe honorarios.</Vacio> : (
            <ul className="divide-y text-sm">
              {deudores.map(c => (
                <li key={c.empresa_id} className="py-1.5 flex justify-between gap-3">
                  <Link to={`/control/${c.empresa_id}?periodo=${periodo}`} className="text-blue-700 hover:underline min-w-0 truncate">{c.razon_social}</Link>
                  <span className="text-red-700 font-medium whitespace-nowrap">{pesos(c.saldo)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
      </div>
    </div>
  );
}
