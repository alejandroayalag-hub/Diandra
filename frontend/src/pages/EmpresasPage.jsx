import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEmpresas, setEmpresaActivo } from '../api/empresas';
import { getEmpresaActiva, clearEmpresaActiva } from '../empresaActiva';

export default function EmpresasPage({ onCambio }) {
  const [empresas, setEmpresas] = useState(null);
  const [error, setError] = useState('');

  const cargar = () => getEmpresas().then(setEmpresas).catch(() => setError('No se pudieron cargar las empresas.'));
  useEffect(() => { cargar(); }, []);

  async function toggle(e) {
    const accion = e.activo ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Seguro que deseas ${accion} ${e.razon_social}? Sus datos se conservan.`)) return;
    try {
      await setEmpresaActivo(e.id, !e.activo);
    } catch (err) {
      window.alert(err.response?.data?.error || 'No se pudo cambiar el estado.');
      return;
    }
    if (e.activo && getEmpresaActiva()?.id === e.id) clearEmpresaActiva();
    await cargar();
    onCambio?.();
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!empresas) return <p className="text-gray-500">Cargando…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Empresas cliente</h1>
        <Link to="/empresas/nueva" className="bg-blue-700 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-800">+ Nueva empresa</Link>
      </div>
      {empresas.length === 0 ? (
        <div className="bg-white border rounded p-8 text-center">
          <p className="text-gray-700 mb-3">Da de alta tu primer cliente para empezar.</p>
          <Link to="/empresas/nueva" className="text-blue-700 hover:underline">Dar de alta empresa</Link>
        </div>
      ) : (
        <table className="w-full bg-white border rounded text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="p-2">Razón social</th><th className="p-2">RFC</th><th className="p-2">Empleados activos</th><th className="p-2">Estado</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {empresas.map(e => (
              <tr key={e.id} className="border-t">
                <td className="p-2">{e.razon_social}</td>
                <td className="p-2 font-mono">{e.rfc}</td>
                <td className="p-2">{e.empleados_activos}</td>
                <td className="p-2">{e.activo ? 'Activa' : 'Inactiva'}</td>
                <td className="p-2 text-right space-x-3">
                  <Link to={`/empresas/${e.id}/editar`} className="text-blue-700 hover:underline">Editar</Link>
                  <button onClick={() => toggle(e)} className={e.activo ? 'text-red-600 hover:underline' : 'text-green-700 hover:underline'}>
                    {e.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
