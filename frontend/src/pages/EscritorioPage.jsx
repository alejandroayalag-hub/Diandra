import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getControl, mesActual, pesos } from '../api/control';
import { getAgenda } from '../api/agenda';
import { getCalendario, getResumenObligaciones } from '../api/obligaciones';

const hoy = () => new Date().toLocaleDateString('en-CA');
const masDias = (f, n) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const fmtDia = f => cap(new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }));
const TIPO = { cita: 'Cita', llamada: 'Llamada', entrega: 'Entrega', impuestos: 'Impuestos', otro: 'Otro' };

function Indicador({ label, valor, to, alerta }) {
  return (
    <Link to={to} className="bg-white border rounded px-4 py-3 hover:border-blue-300 hover:shadow-sm">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold ${alerta ? 'text-red-700' : 'text-gray-800'}`}>{valor ?? '…'}</div>
    </Link>
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
  const [error, setError] = useState('');
  const h = hoy();
  const periodo = mesActual();

  useEffect(() => {
    const fallo = () => setError('No se pudo cargar parte del escritorio. Recarga la página.');
    const d = hoy();
    getControl(mesActual()).then(setControl).catch(fallo);
    getResumenObligaciones().then(setResumen).catch(fallo);
    getAgenda(d, masDias(d, 7)).then(r => setAgenda(r.eventos)).catch(fallo);
    // Trae todo lo vencido sin presentar más lo que vence en 7 días.
    getCalendario({ desde: d, hasta: masDias(d, 7) }).then(r => setObligaciones(r.filter(i => i.estado !== 'presentada'))).catch(fallo);
  }, []);

  const deudores = control ? control.clientes.filter(c => c.saldo > 0).sort((a, b) => b.saldo - a.saldo) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Escritorio</h1>
          <p className="text-sm text-gray-500">{cap(new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link to="/agenda" className="bg-blue-700 text-white px-3 py-1.5 rounded hover:bg-blue-800">+ Evento</Link>
          <Link to="/empresas/nueva" className="border border-blue-700 text-blue-700 px-3 py-1.5 rounded hover:bg-blue-50">+ Cliente</Link>
          <Link to={`/control?periodo=${periodo}`} className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-50">Control del mes</Link>
        </div>
      </div>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Indicador label="Por cobrar" valor={control && pesos(control.totales.por_cobrar)} to={`/control?periodo=${periodo}`} alerta={control?.totales.por_cobrar > 0} />
        <Indicador label="Obligaciones vencidas" valor={resumen?.vencidas} to="/obligaciones" alerta={resumen?.vencidas > 0} />
        <Indicador label="Vencen esta semana" valor={resumen?.esta_semana} to="/obligaciones" />
        <Indicador label="Clientes con docs. pendientes" valor={control?.totales.con_documentos_pendientes} to={`/control?periodo=${periodo}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
              {obligaciones.map(o => (
                <li key={`${o.obligacion_id}|${o.periodo}`} className="py-1.5 flex gap-3">
                  <span className={`w-24 shrink-0 ${o.estado === 'vencida' ? 'text-red-700 font-medium' : 'text-amber-700'}`}>{fmtDia(o.fecha_vence)}</span>
                  <span className="min-w-0">{o.descripcion} <span className="text-gray-500">({o.periodo}) · {o.razon_social}</span></span>
                </li>
              ))}
            </ul>
          )}
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
