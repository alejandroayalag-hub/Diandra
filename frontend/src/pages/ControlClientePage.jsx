import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  getControlCliente, mesActual, pesos, ESTADO_HONORARIO, registrarPago, borrarPago, guardarRequeridos, marcarRecibido, deshacerRecibido, agregarNota, borrarNota,
} from '../api/control';
import { abrirArchivo } from '../api/documentos';

const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm';
const hoy = () => new Date().toLocaleDateString('en-CA');
const fmt = (f) => new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const nombreMes = (p) => new Date(`${p}-01T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
const OBLIGACION = { vencida: 'text-red-700', proxima: 'text-amber-700', pendiente: 'text-gray-600', presentada: 'text-green-700' };
const error = (err, msg) => alert(err.response?.data?.error || msg);

function Seccion({ titulo, extra, children }) {
  return (
    <section className="bg-white border rounded p-4 mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Honorarios({ d, recargar }) {
  const vacio = { monto: '', fecha_pago: hoy(), forma_pago: 'Transferencia', nota: '' };
  const [pago, setPago] = useState(null);
  const set = (k) => (e) => setPago(p => ({ ...p, [k]: e.target.value }));

  async function guardar(ev) {
    ev.preventDefault();
    try { await registrarPago(d.empresa_id, pago); setPago(null); recargar(); } catch (err) { error(err, 'No se pudo registrar el pago.'); }
  }
  async function quitar(p) {
    if (!confirm(`¿Borrar el pago de ${pesos(p.monto)} del ${fmt(p.fecha_pago)}?`)) return;
    try { await borrarPago(p.id); recargar(); } catch (err) { error(err, 'No se pudo borrar.'); }
  }

  if (!d.honorario) return (
    <Seccion titulo="Honorarios">
      <p className="text-sm text-gray-600">Sin honorario mensual capturado. <Link to={`/empresas/${d.empresa_id}/editar`} className="text-blue-700 hover:underline">Captúralo en la ficha</Link>.</p>
    </Seccion>
  );
  const c = d.cuenta;
  const [label, cls] = ESTADO_HONORARIO[c.estado_mes];
  return (
    <Seccion titulo="Honorarios" extra={!pago && <button onClick={() => setPago(vacio)} className="bg-green-700 text-white px-3 py-1 rounded text-sm">Registrar pago</button>}>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm mb-3">
        <span>Honorario: <strong>{pesos(d.honorario)}</strong>/mes desde {d.cobro_desde}</span>
        <span>{nombreMes(d.periodo)}: <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{label}</span></span>
        <span>Saldo al día: <strong className={c.saldo > 0 ? 'text-red-700' : 'text-green-700'}>{pesos(c.saldo)}</strong>
          {c.saldo < 0 && ' a favor'}</span>
      </div>
      {pago && (
        <form onSubmit={guardar} className="flex flex-wrap gap-2 items-end bg-gray-50 border rounded p-3 mb-3 text-sm">
          <label>Monto<br /><input type="number" min="0.01" step="0.01" required value={pago.monto} onChange={set('monto')} className={`${inputCls} w-32`} /></label>
          <label>Fecha<br /><input type="date" required value={pago.fecha_pago} onChange={set('fecha_pago')} className={inputCls} /></label>
          <label>Forma<br />
            <select value={pago.forma_pago} onChange={set('forma_pago')} className={inputCls}>
              {['Transferencia', 'Efectivo', 'Depósito', 'Cheque', 'Otro'].map(f => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex-1 min-w-40">Nota<br /><input value={pago.nota} onChange={set('nota')} className={`${inputCls} w-full`} /></label>
          <button className="bg-green-700 text-white px-3 py-1 rounded">Guardar</button>
          <button type="button" onClick={() => setPago(null)} className="text-gray-600">Cancelar</button>
        </form>
      )}
      <div className="flex flex-wrap gap-1 mb-3">
        {c.meses.map(m => {
          const [, mcls] = ESTADO_HONORARIO[m.estado];
          return <span key={m.periodo} title={`Abonado ${pesos(m.abonado)} de ${pesos(m.cargo)}`} className={`px-2 py-0.5 rounded text-xs ${mcls}`}>{m.periodo}</span>;
        })}
      </div>
      {d.pagos.length === 0 ? <p className="text-sm text-gray-500">Sin pagos registrados.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-600"><tr><th className="p-1">Fecha</th><th className="p-1">Monto</th><th className="p-1">Forma</th><th className="p-1">Nota</th><th className="p-1"></th></tr></thead>
            <tbody>
              {d.pagos.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="p-1 whitespace-nowrap">{fmt(p.fecha_pago)}</td>
                  <td className="p-1 whitespace-nowrap">{pesos(p.monto)}</td>
                  <td className="p-1">{p.forma_pago || '—'}</td>
                  <td className="p-1 text-gray-600">{p.nota}</td>
                  <td className="p-1 text-right"><button onClick={() => quitar(p)} className="text-gray-400 hover:text-red-600 text-xs">Borrar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}

function Documentos({ d, recargar }) {
  const [editando, setEditando] = useState(null);   // texto, un documento por línea
  const [archivos, setArchivos] = useState({});

  async function recibir(doc) {
    try { await marcarRecibido(d.empresa_id, doc.requerido_id, d.periodo, archivos[doc.requerido_id]); recargar(); } catch (err) { error(err, 'No se pudo marcar.'); }
  }
  async function deshacer(doc) {
    if (!confirm(`¿Desmarcar "${doc.nombre}"? Se borra el archivo si tiene.`)) return;
    try { await deshacerRecibido(doc.recibido_id); recargar(); } catch (err) { error(err, 'No se pudo deshacer.'); }
  }
  async function guardarLista() {
    try { await guardarRequeridos(d.empresa_id, editando.split('\n')); setEditando(null); recargar(); } catch (err) { error(err, 'No se pudo guardar la lista.'); }
  }

  return (
    <Seccion titulo={`Documentos de ${nombreMes(d.periodo)}`}
      extra={editando === null && <button onClick={() => setEditando(d.documentos.map(x => x.nombre).join('\n'))} className="text-blue-700 text-sm hover:underline">Editar lista</button>}>
      {editando !== null ? (
        <div className="text-sm">
          <p className="text-gray-600 mb-1">Un documento por línea. Lo que quites deja de pedirse (lo ya recibido se conserva).</p>
          <textarea value={editando} onChange={e => setEditando(e.target.value)} rows={6} className={`${inputCls} w-full`} />
          <div className="flex gap-3 mt-2">
            <button onClick={guardarLista} className="bg-blue-700 text-white px-3 py-1 rounded">Guardar lista</button>
            <button onClick={() => setEditando(null)} className="text-gray-600">Cancelar</button>
          </div>
        </div>
      ) : d.documentos.length === 0 ? <p className="text-sm text-gray-500">Sin documentos en la lista.</p> : (
        <ul className="divide-y text-sm">
          {d.documentos.map(doc => (
            <li key={doc.requerido_id} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className={`flex-1 min-w-40 ${doc.recibido_id ? 'text-green-700' : ''}`}>{doc.recibido_id ? '✓' : '○'} {doc.nombre}</span>
              {doc.recibido_id ? (
                <>
                  <span className="text-xs text-gray-500">recibido {fmt(doc.fecha_recibido)}</span>
                  {doc.tiene_archivo && <button onClick={() => abrirArchivo(`/control/recibidos/${doc.recibido_id}/archivo`, doc.nombre_original || 'documento.pdf')} className="text-blue-700 hover:underline">Ver archivo</button>}
                  <button onClick={() => deshacer(doc)} className="text-gray-400 hover:text-red-600 text-xs">Desmarcar</button>
                </>
              ) : (
                <>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" aria-label={`Archivo de ${doc.nombre} (opcional)`} className="text-xs max-w-52"
                    onChange={e => setArchivos(a => ({ ...a, [doc.requerido_id]: e.target.files[0] }))} />
                  <button onClick={() => recibir(doc)} className="text-green-700 hover:underline">Marcar recibido</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}

function Bitacora({ d, recargar }) {
  const [texto, setTexto] = useState('');
  async function agregar(ev) {
    ev.preventDefault();
    try { await agregarNota(d.empresa_id, d.periodo, texto); setTexto(''); recargar(); } catch (err) { error(err, 'No se pudo guardar la nota.'); }
  }
  async function quitar(n) {
    if (!confirm('¿Borrar esta nota?')) return;
    try { await borrarNota(n.id); recargar(); } catch (err) { error(err, 'No se pudo borrar.'); }
  }
  return (
    <Seccion titulo={`Bitácora de ${nombreMes(d.periodo)}`}>
      <form onSubmit={agregar} className="flex gap-2 mb-3">
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Qué se hizo, qué falta, acuerdos con el cliente…" className={`${inputCls} flex-1`} />
        <button disabled={!texto.trim()} className="bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50">Agregar</button>
      </form>
      {d.bitacora.length === 0 ? <p className="text-sm text-gray-500">Sin notas este mes.</p> : (
        <ul className="divide-y text-sm">
          {d.bitacora.map(n => (
            <li key={n.id} className="py-2 flex gap-3">
              <div className="flex-1 whitespace-pre-wrap">{n.texto}</div>
              <span className="text-xs text-gray-500 whitespace-nowrap">{fmt(n.created_at)}{n.autor && ` · ${n.autor}`}</span>
              <button onClick={() => quitar(n)} className="text-gray-400 hover:text-red-600 text-xs">Borrar</button>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}

export default function ControlClientePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const periodo = params.get('periodo') || mesActual();
  const [d, setD] = useState(null);
  const [errorCarga, setErrorCarga] = useState('');

  const recargar = useCallback(() => {
    getControlCliente(id, periodo).then(r => { setD(r); setErrorCarga(''); })
      .catch(err => setErrorCarga(err.response?.data?.error || 'No se pudo cargar el cliente.'));
  }, [id, periodo]);
  useEffect(() => { recargar(); }, [recargar]);

  return (
    <div>
      <Link to={`/control?periodo=${periodo}`} className="text-sm text-blue-700 hover:underline">← Control de clientes</Link>
      <div className="flex flex-wrap items-end justify-between gap-3 mt-2 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{d?.razon_social || 'Cliente'}</h1>
          {d && <Link to={`/empresas/${d.empresa_id}/editar`} className="text-xs text-gray-500 hover:underline">Ver ficha</Link>}
        </div>
        <label className="text-sm">Mes<br />
          <input type="month" value={periodo} onChange={e => e.target.value && setParams({ periodo: e.target.value })} className={inputCls} />
        </label>
      </div>
      {errorCarga && <p className="text-red-600 text-sm mb-3">{errorCarga}</p>}
      {d && (
        <>
          {!d.activo && <p className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded p-2 mb-4">Cliente inactivo: no aparece en el control mensual.</p>}
          <Honorarios d={d} recargar={recargar} />
          <Documentos d={d} recargar={recargar} />
          <Seccion titulo={`Obligaciones que vencen en ${nombreMes(d.periodo)}`}
            extra={<Link to="/obligaciones" className="text-blue-700 text-sm hover:underline">Ir a obligaciones</Link>}>
            {d.obligaciones.length === 0 ? <p className="text-sm text-gray-500">Nada vence este mes.</p> : (
              <ul className="divide-y text-sm">
                {d.obligaciones.map(o => (
                  <li key={`${o.obligacion_id}|${o.periodo}`} className="py-2 flex flex-wrap gap-x-4">
                    <span className="flex-1 min-w-40">{o.descripcion} <span className="text-gray-500">({o.periodo})</span></span>
                    <span className="text-gray-600">vence {fmt(o.fecha_vence)}</span>
                    <span className={OBLIGACION[o.estado]}>{o.estado === 'presentada' ? `presentada ${fmt(o.fecha_presentacion)}` : o.estado === 'proxima' ? 'vence pronto' : o.estado}</span>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
          <Bitacora d={d} recargar={recargar} />
        </>
      )}
    </div>
  );
}
