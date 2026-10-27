import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAgenda, crearEvento, actualizarEvento, borrarEvento } from '../api/agenda';
import { getEmpresas } from '../api/empresas';

const TIPOS = {
  cita: ['Cita con cliente', 'bg-blue-100 text-blue-800'],
  llamada: ['Llamada', 'bg-purple-100 text-purple-800'],
  entrega: ['Entrega de documentos', 'bg-teal-100 text-teal-800'],
  impuestos: ['Pago de impuestos', 'bg-orange-100 text-orange-800'],
  otro: ['Otro', 'bg-gray-100 text-gray-700'],
};
const VENCE = { vencida: 'bg-red-100 text-red-800', presentada: 'bg-green-50 text-green-700 line-through', proxima: 'bg-amber-100 text-amber-800', pendiente: 'bg-amber-50 text-amber-800' };
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const inputCls = 'mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm';

// Fechas como texto 'YYYY-MM-DD' en UTC, igual que el backend.
const iso = d => d.toISOString().slice(0, 10);
const dia = f => new Date(`${f}T00:00:00Z`);
const sumar = (f, n) => { const d = dia(f); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const hoy = () => new Date().toLocaleDateString('en-CA');
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const nombreMes = m => cap( new Date(`${m}-01T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }));
const fmtDia = f => cap(new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }));

function cuadricula(mes) {
  const primero = `${mes}-01`;
  const inicio = sumar(primero, -((dia(primero).getUTCDay() + 6) % 7));   // lunes anterior
  const fin = sumar(inicio, 41);
  return { inicio, fin, dias: Array.from({ length: 42 }, (_, i) => sumar(inicio, i)) };
}

function Chip({ cls, children, onClick, title }) {
  return <button type="button" title={title} onClick={onClick} className={`block w-full text-left truncate px-1 rounded text-[11px] leading-5 ${cls}`}>{children}</button>;
}

function FormEvento({ evento, empresas, onCerrar, onGuardado }) {
  const [f, setF] = useState({ titulo: '', tipo: 'cita', ...evento,
    hora: evento.hora || '', empresa_id: evento.empresa_id || '', notas: evento.notas || '' });
  const [error, setError] = useState('');
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));

  async function guardar(ev) {
    ev.preventDefault();
    try {
      if (f.id) await actualizarEvento(f.id, f); else await crearEvento(f);
      onGuardado();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar.'); }
  }
  async function borrar() {
    if (!confirm(`¿Borrar "${f.titulo}"?`)) return;
    try { await borrarEvento(f.id); onGuardado(); } catch { setError('No se pudo borrar.'); }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-10" onClick={onCerrar}>
      <form onSubmit={guardar} onClick={e => e.stopPropagation()} className="bg-white rounded shadow-lg p-5 w-full max-w-md space-y-3">
        <h2 className="font-semibold text-gray-800">{f.id ? 'Editar evento' : 'Nuevo evento'}</h2>
        <label className="block text-sm text-gray-700">Título
          <input autoFocus required value={f.titulo} onChange={set('titulo')} maxLength={200} className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-gray-700">Fecha<input type="date" required value={f.fecha} onChange={set('fecha')} className={inputCls} /></label>
          <label className="text-sm text-gray-700">Hora (opcional)<input type="time" value={f.hora} onChange={set('hora')} className={inputCls} /></label>
        </div>
        <label className="block text-sm text-gray-700">Tipo
          <select value={f.tipo} onChange={set('tipo')} className={inputCls}>
            {Object.entries(TIPOS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm text-gray-700">Cliente (opcional)
          <select value={f.empresa_id} onChange={set('empresa_id')} className={inputCls}>
            <option value="">— Ninguno —</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razon_social}</option>)}
          </select>
        </label>
        {f.id && f.empresa_id && <Link to={`/control/${f.empresa_id}?periodo=${f.fecha.slice(0, 7)}`} className="text-xs text-blue-700 hover:underline">Ver control del cliente →</Link>}
        <label className="block text-sm text-gray-700">Notas
          <textarea value={f.notas} onChange={set('notas')} rows={3} className={inputCls} />
        </label>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button className="bg-blue-700 text-white px-4 py-1.5 rounded text-sm">Guardar</button>
          <button type="button" onClick={onCerrar} className="text-gray-600 text-sm">Cancelar</button>
          {f.id && <button type="button" onClick={borrar} className="ml-auto text-red-600 text-sm hover:underline">Borrar</button>}
        </div>
      </form>
    </div>
  );
}

export default function AgendaPage() {
  const [mes, setMes] = useState(hoy().slice(0, 7));
  const [datos, setDatos] = useState(null);
  const [proximos, setProximos] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState('');
  const { dias } = cuadricula(mes);

  const cargar = useCallback(() => {
    const h = hoy();
    const { inicio, fin } = cuadricula(mes);
    Promise.all([getAgenda(inicio, fin), getAgenda(h, sumar(h, 7))])
      .then(([m, p]) => { setDatos(m); setProximos(p); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar la agenda.'));
  }, [mes]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { getEmpresas().then(e => setEmpresas(e.filter(x => x.activo))).catch(() => {}); }, []);

  const moverMes = n => { const d = dia(`${mes}-01`); d.setUTCMonth(d.getUTCMonth() + n); setMes(iso(d).slice(0, 7)); };
  const delDia = (fuente, f) => fuente ? [fuente.eventos.filter(e => e.fecha === f), fuente.vencimientos.filter(v => v.fecha_vence === f)] : [[], []];
  const guardado = () => { setEditando(null); cargar(); };
  const h = hoy();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-800">Agenda</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => moverMes(-1)} aria-label="Mes anterior" className="border rounded px-2 py-1 text-sm hover:bg-gray-100">‹</button>
          <span className="w-40 text-center font-medium">{nombreMes(mes)}</span>
          <button onClick={() => moverMes(1)} aria-label="Mes siguiente" className="border rounded px-2 py-1 text-sm hover:bg-gray-100">›</button>
          <button onClick={() => setMes(h.slice(0, 7))} className="text-sm text-blue-700 hover:underline ml-1">Hoy</button>
          <button onClick={() => setEditando({ fecha: h })} className="bg-blue-700 text-white px-3 py-1 rounded text-sm ml-2">+ Evento</button>
        </div>
      </div>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="bg-white border rounded overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 text-xs text-gray-600 text-center">
          {DIAS.map(d => <div key={d} className="py-1.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {dias.map(f => {
            const [evs, vens] = delDia(datos, f);
            const fuera = f.slice(0, 7) !== mes;
            return (
              <div key={f} onClick={() => setEditando({ fecha: f })}
                className={`border-t border-l min-h-24 p-1 cursor-pointer hover:bg-blue-50/40 min-w-0 ${fuera ? 'bg-gray-50/70 text-gray-400' : ''}`}>
                <div className={`text-xs mb-0.5 ${f === h ? 'inline-block bg-blue-700 text-white rounded-full px-1.5' : ''}`}>{Number(f.slice(8))}</div>
                <div className="space-y-0.5" onClick={e => e.stopPropagation()}>
                  {evs.map(e => (
                    <Chip key={`e${e.id}`} cls={TIPOS[e.tipo][1]} title={`${e.hora || ''} ${e.titulo}${e.razon_social ? ` · ${e.razon_social}` : ''}`} onClick={() => setEditando(e)}>
                      {e.hora && <strong>{e.hora} </strong>}{e.titulo}
                    </Chip>
                  ))}
                  {vens.map(v => (
                    <Link key={`v${v.obligacion_id}${v.periodo}`} to="/obligaciones" title={`${v.razon_social}: ${v.descripcion} (${v.periodo}) — ${v.estado}`}
                      className={`block truncate px-1 rounded text-[11px] leading-5 ${VENCE[v.estado]}`}>
                      ⚑ {v.razon_social}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2 text-xs">
        {Object.entries(TIPOS).map(([k, [label, cls]]) => <span key={k} className={`px-1.5 rounded ${cls}`}>{label}</span>)}
        <span className="px-1.5 rounded bg-amber-100 text-amber-800">⚑ Vencimiento fiscal</span>
      </div>

      <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mt-6 mb-2">Hoy y próximos 7 días</h2>
      {!proximos ? <p className="text-gray-500 text-sm">Cargando…</p> : (() => {
        const fechas = [...new Set([...proximos.eventos.map(e => e.fecha), ...proximos.vencimientos.map(v => v.fecha_vence)])].sort();
        if (!fechas.length) return <p className="text-gray-500 text-sm">Nada agendado.</p>;
        return (
          <div className="bg-white border rounded divide-y text-sm">
            {fechas.map(f => {
              const [evs, vens] = delDia(proximos, f);
              return (
                <div key={f} className="p-3">
                  <div className={`font-medium mb-1 ${f === h ? 'text-blue-700' : 'text-gray-800'}`}>{f === h ? 'Hoy · ' : ''}{fmtDia(f)}</div>
                  <ul className="space-y-1">
                    {evs.map(e => (
                      <li key={`e${e.id}`}>
                        <button onClick={() => setEditando(e)} className="text-left hover:underline">
                          <span className="text-gray-500 w-12 inline-block">{e.hora || '—'}</span>
                          <span className={`px-1.5 rounded text-xs mr-2 ${TIPOS[e.tipo][1]}`}>{TIPOS[e.tipo][0]}</span>
                          {e.titulo}{e.razon_social && <span className="text-gray-500"> · {e.razon_social}</span>}
                        </button>
                      </li>
                    ))}
                    {vens.map(v => (
                      <li key={`v${v.obligacion_id}${v.periodo}`}>
                        <Link to="/obligaciones" className="hover:underline">
                          <span className="text-gray-500 w-12 inline-block">⚑</span>
                          <span className={`px-1.5 rounded text-xs mr-2 ${VENCE[v.estado]}`}>{v.estado === 'presentada' ? 'Presentada' : 'Vence'}</span>
                          {v.descripcion} ({v.periodo}) <span className="text-gray-500">· {v.razon_social}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        );
      })()}

      {editando && <FormEvento evento={editando} empresas={empresas} onCerrar={() => setEditando(null)} onGuardado={guardado} />}
    </div>
  );
}
