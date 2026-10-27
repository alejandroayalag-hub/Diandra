import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getControl, mesActual, pesos, ESTADO_HONORARIO } from '../api/control';

const fraccion = (a, b, cls) => b === 0 ? <span className="text-gray-400">—</span>
  : <span className={a < b ? cls : 'text-green-700'}>{a}/{b}</span>;

function Total({ label, valor, alerta }) {
  return (
    <div className="bg-white border rounded px-4 py-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-semibold ${alerta ? 'text-red-700' : 'text-gray-800'}`}>{valor}</div>
    </div>
  );
}

export default function ControlPage() {
  const [params, setParams] = useSearchParams();
  const periodo = params.get('periodo') || mesActual();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getControl(periodo).then(r => { setData(r); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el control.'));
  }, [periodo]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-800">Control de clientes</h1>
        <label className="text-sm">Mes<br />
          <input type="month" value={periodo} onChange={e => e.target.value && setParams({ periodo: e.target.value })}
            className="border border-gray-300 rounded px-2 py-1 text-sm" />
        </label>
      </div>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {!data ? !error && <p className="text-gray-500">Cargando…</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Total label="Por cobrar (al día de hoy)" valor={pesos(data.totales.por_cobrar)} alerta={data.totales.por_cobrar > 0} />
            <Total label="Clientes con documentos pendientes" valor={data.totales.con_documentos_pendientes} />
            <Total label="Obligaciones vencidas" valor={data.totales.obligaciones_vencidas} alerta={data.totales.obligaciones_vencidas > 0} />
          </div>
          {data.clientes.length === 0 ? <p className="text-gray-500">No hay clientes activos.</p> : (
            <div className="bg-white border rounded overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr><th className="p-2">Cliente</th><th className="p-2">Honorario del mes</th><th className="p-2">Saldo</th>
                    <th className="p-2">Documentos</th><th className="p-2">Obligaciones</th><th className="p-2">Bitácora</th></tr>
                </thead>
                <tbody>
                  {data.clientes.map(c => {
                    const [label, cls] = ESTADO_HONORARIO[c.estado_mes];
                    return (
                      <tr key={c.empresa_id} className="border-t hover:bg-gray-50">
                        <td className="p-2"><Link to={`/control/${c.empresa_id}?periodo=${periodo}`} className="text-blue-700 hover:underline">{c.razon_social}</Link></td>
                        <td className="p-2"><span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{label}</span></td>
                        <td className={`p-2 whitespace-nowrap ${c.saldo > 0 ? 'text-red-700 font-medium' : 'text-gray-700'}`}>{pesos(c.saldo)}</td>
                        <td className="p-2">{fraccion(c.docs_recibidos, c.docs_total, 'text-amber-700')}</td>
                        <td className="p-2">{fraccion(c.obligaciones_presentadas, c.obligaciones_total, c.obligaciones_vencidas ? 'text-red-700 font-medium' : 'text-amber-700')}</td>
                        <td className="p-2 text-gray-600">{c.notas ? `${c.notas} nota${c.notas > 1 ? 's' : ''}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">Sin honorario capturado en la ficha no se generan cargos. Los pagos se aplican al mes más antiguo pendiente.</p>
        </>
      )}
    </div>
  );
}
