import { useEffect, useState } from 'react';
import { getObligacionesCliente, guardarObligacionesCliente } from '../api/empresas';

const PERIODICIDADES = ['mensual', 'bimestral', 'trimestral', 'anual', 'manual'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function describir(o) {
  if (o.periodicidad === 'manual') return 'Sin fecha automática';
  if (o.periodicidad === 'anual') return `Anual · ${o.dia === 31 ? 'último día' : `día ${o.dia}`} de ${MESES[o.mes - 1]} del año siguiente`;
  return `${o.periodicidad[0].toUpperCase()}${o.periodicidad.slice(1)} · ${o.dia === 31 ? 'último día' : `día ${o.dia}`} del mes siguiente`;
}

const input = 'border border-gray-300 rounded px-2 py-1 text-sm';

// Lista de obligaciones activas; `revision` (respuesta de subir CSF) abre la tabla para confirmar.
export default function ObligacionesCliente({ empresaId, revision, onCerrar }) {
  const [actuales, setActuales] = useState([]);
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getObligacionesCliente(empresaId).then(setActuales).catch(() => setError('No se pudieron cargar las obligaciones.'));
  }, [empresaId]);

  useEffect(() => {
    if (!revision) return;
    // CSF sin nada legible: no abrir la tabla (un clic desactivaría todo); solo se muestra el aviso.
    if (!revision.nuevas.length && !revision.existentes.length) { setFilas(null); return; } // eslint-disable-line react-hooks/set-state-in-effect
    // Con aviso (CSF dudosa) se conserva lo existente y no se agrega nada sin que Diana lo marque.
    const dudosa = !!revision.aviso;
    setFilas([
      ...revision.nuevas.map(o => ({ ...o, incluir: !dudosa, nota: 'nueva' })),
      ...revision.existentes.map(o => ({ ...o, incluir: true })),
      // Sin vencimiento_texto = agregada a mano: nunca estuvo en una CSF, no se desactiva por defecto.
      ...revision.desaparecidas.map(o => (o.vencimiento_texto
        ? { ...o, incluir: dudosa, nota: 'ya no aparece en la CSF' }
        : { ...o, incluir: true, nota: 'agregada a mano' })),
    ]);
  }, [revision]);

  const cambiar = (i, k, v) => setFilas(fs => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const cerrar = () => { setFilas(null); setError(''); onCerrar?.(); };
  const cancelar = () => {
    if (revision && !confirm('¿Descartar la revisión de la CSF?')) return;
    cerrar();
  };

  async function guardar() {
    const lista = filas.filter(f => f.incluir).map(f => ({
      descripcion: f.descripcion, vencimiento_texto: f.vencimiento_texto, periodicidad: f.periodicidad,
      dia: f.dia === '' ? null : f.dia, mes: f.mes === '' ? null : f.mes, fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin,
    }));
    setGuardando(true); setError('');
    try {
      setActuales(await guardarObligacionesCliente(empresaId, lista));
      cerrar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron guardar las obligaciones.');
    } finally {
      setGuardando(false);
    }
  }

  if (!filas) {
    return (
      <div className="text-sm mt-3">
        {revision?.aviso && <p className="mb-2 bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2">{revision.aviso}</p>}
        {actuales.length === 0 ? <p className="text-gray-500">Sin obligaciones. Sube la CSF o agrégalas a mano.</p> : (
          <ul className="divide-y border rounded">
            {actuales.map(o => (
              <li key={o.id} className="px-3 py-2"><span className="font-medium">{o.descripcion}</span>
                <span className="text-gray-500"> · {describir(o)}</span></li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setFilas(actuales.map(o => ({ ...o, incluir: true })))} className="mt-2 text-blue-700 hover:underline">
          {actuales.length ? 'Editar obligaciones' : 'Agregar a mano'}
        </button>
        {error && <p className="text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="text-sm mt-3 border rounded p-3 bg-gray-50">
      {revision?.aviso && <p className="mb-2 bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2">{revision.aviso}</p>}
      <p className="mb-2 text-gray-700">Revisa lo leído y confirma. Solo se guardan las marcadas.</p>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="text-left text-gray-600"><th className="p-1">Incluir</th><th className="p-1">Obligación</th><th className="p-1">Periodicidad</th><th className="p-1">Día</th><th className="p-1">Mes</th></tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id ?? `n${i}`} className="align-top border-t">
                <td className="p-1"><input type="checkbox" checked={f.incluir} onChange={e => cambiar(i, 'incluir', e.target.checked)} aria-label="Incluir" /></td>
                <td className="p-1">
                  {f.id
                    ? <span className="font-medium">{f.descripcion}</span>
                    : <input value={f.descripcion} onChange={e => cambiar(i, 'descripcion', e.target.value)} placeholder="Descripción" className={`${input} w-full`} />}
                  {f.nota && <span className="ml-2 text-xs text-amber-700">({f.nota})</span>}
                  {f.vencimiento_texto && <div className="text-xs text-gray-500">{f.vencimiento_texto}</div>}
                </td>
                <td className="p-1">
                  <select value={f.periodicidad} onChange={e => cambiar(i, 'periodicidad', e.target.value)} className={input}>
                    {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td className="p-1">
                  <input type="number" min="1" max="31" value={f.dia ?? ''} disabled={f.periodicidad === 'manual'}
                    onChange={e => cambiar(i, 'dia', e.target.value === '' ? '' : Number(e.target.value))} className={`${input} w-16`} />
                </td>
                <td className="p-1">
                  {f.periodicidad === 'anual' && (
                    <select value={f.mes ?? ''} onChange={e => cambiar(i, 'mes', e.target.value === '' ? '' : Number(e.target.value))} className={input}>
                      <option value="">—</option>
                      {MESES.map((m, k) => <option key={m} value={k + 1}>{m}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-1">Día 31 = último día del mes.</p>
      {error && <p className="text-red-600 mt-2">{error}</p>}
      <div className="mt-3 flex gap-3">
        <button type="button" onClick={() => setFilas(fs => [...fs, { descripcion: '', periodicidad: 'mensual', dia: 17, mes: '', incluir: true }])}
          className="text-blue-700 hover:underline">+ Agregar obligación</button>
        <button type="button" disabled={guardando} onClick={guardar}
          className="bg-blue-700 text-white px-3 py-1.5 rounded hover:bg-blue-800 disabled:opacity-50">{guardando ? 'Guardando…' : 'Confirmar obligaciones'}</button>
        <button type="button" onClick={cancelar} className="text-gray-600">Cancelar</button>
      </div>
    </div>
  );
}
