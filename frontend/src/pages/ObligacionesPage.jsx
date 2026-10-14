import { useCallback, useEffect, useState } from 'react';
import { getCalendario, registrarCumplimiento, deshacerCumplimiento } from '../api/obligaciones';
import { getEmpresas } from '../api/empresas';
import { abrirArchivo } from '../api/documentos';

const ESTADOS = {
  vencida: ['Vencida', 'bg-red-100 text-red-800'],
  proxima: ['Vence pronto', 'bg-amber-100 text-amber-800'],
  pendiente: ['Pendiente', 'bg-gray-100 text-gray-700'],
  presentada: ['Presentada', 'bg-green-100 text-green-800'],
};
const hoy = () => new Date().toLocaleDateString('en-CA');
const fmt = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm';

export default function ObligacionesPage() {
  const [empresas, setEmpresas] = useState([]);
  const [filtro, setFiltro] = useState({ empresa_id: '', desde: '', hasta: '' });
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [captura, setCaptura] = useState(null); // { key, fecha, acuse }
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filtro).filter(([, v]) => v));
    getCalendario(params).then(r => { setItems(r); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el calendario.'));
  }, [filtro]);

  useEffect(() => { getEmpresas().then(e => setEmpresas(e.filter(x => x.activo))).catch(() => {}); }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const key = (i) => `${i.obligacion_id}|${i.periodo}`;

  async function presentar(i) {
    setGuardando(true);
    try {
      await registrarCumplimiento(i.obligacion_id, i.periodo, captura.fecha, captura.acuse);
      setCaptura(null);
      cargar();
      window.dispatchEvent(new Event('obligaciones-cambio')); // refresca el aviso del Layout
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo registrar.');
    } finally {
      setGuardando(false);
    }
  }

  async function deshacer(i) {
    if (!confirm(`¿Deshacer la presentación de "${i.descripcion}" (${i.periodo})? Se borra el acuse.`)) return;
    try { await deshacerCumplimiento(i.cumplimiento_id); cargar(); window.dispatchEvent(new Event('obligaciones-cambio')); } catch { alert('No se pudo deshacer.'); }
  }

  const setF = (k) => (e) => setFiltro(f => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-4">Obligaciones fiscales</h1>
      <div className="flex flex-wrap gap-3 items-end mb-4 text-sm">
        <label>Cliente<br />
          <select value={filtro.empresa_id} onChange={setF('empresa_id')} className={inputCls}>
            <option value="">Todos</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razon_social}</option>)}
          </select>
        </label>
        <label>Desde<br /><input type="date" value={filtro.desde} onChange={setF('desde')} className={inputCls} /></label>
        <label>Hasta<br /><input type="date" value={filtro.hasta} onChange={setF('hasta')} className={inputCls} /></label>
        <span className="text-gray-500">Sin fechas: este mes y el siguiente. Lo vencido sin presentar siempre aparece.</span>
      </div>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {items === null ? <p className="text-gray-500">Cargando…</p> : items.length === 0 ? (
        <p className="text-gray-500">No hay obligaciones en este rango. Se dan de alta desde la ficha de cada cliente (CSF).</p>
      ) : (
        <div className="bg-white border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr><th className="p-2">Vence</th><th className="p-2">Cliente</th><th className="p-2">Obligación</th><th className="p-2">Periodo</th><th className="p-2">Estado</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {items.map(i => {
                const [label, cls] = ESTADOS[i.estado];
                const capturando = captura?.key === key(i);
                return (
                  <tr key={key(i)} className="border-t align-top">
                    <td className="p-2 whitespace-nowrap">{fmt(i.fecha_vence)}</td>
                    <td className="p-2">{i.razon_social}</td>
                    <td className="p-2">{i.descripcion}</td>
                    <td className="p-2 whitespace-nowrap">{i.periodo}</td>
                    <td className="p-2"><span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{label}</span>
                      {i.fecha_presentacion && <div className="text-xs text-gray-500 mt-1">el {fmt(i.fecha_presentacion)}</div>}</td>
                    <td className="p-2 whitespace-nowrap">
                      {i.estado === 'presentada' ? (
                        <div className="flex gap-3">
                          {i.tiene_acuse && <button onClick={() => abrirArchivo(`/obligaciones/cumplimientos/${i.cumplimiento_id}/acuse`, `acuse-${i.periodo}.pdf`)} className="text-blue-700 hover:underline">Acuse</button>}
                          <button onClick={() => deshacer(i)} className="text-gray-500 hover:text-red-600">Deshacer</button>
                        </div>
                      ) : capturando ? (
                        <div className="flex flex-col gap-1">
                          <input type="date" value={captura.fecha} onChange={e => setCaptura(c => ({ ...c, fecha: e.target.value }))} className={inputCls} aria-label="Fecha de presentación" />
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setCaptura(c => ({ ...c, acuse: e.target.files[0] }))} className="text-xs" aria-label="Acuse (opcional)" />
                          <div className="flex gap-2">
                            <button disabled={guardando || !captura.fecha} onClick={() => presentar(i)} className="bg-green-700 text-white px-2 py-1 rounded text-xs disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
                            <button onClick={() => setCaptura(null)} className="text-gray-600 text-xs">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setCaptura({ key: key(i), fecha: hoy(), acuse: null })} className="text-green-700 hover:underline">Marcar presentada</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
