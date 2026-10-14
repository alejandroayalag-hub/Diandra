import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import EmpleadosPage from './pages/EmpleadosPage';
import EmpleadoDetallePage from './pages/EmpleadoDetallePage';
import EmpleadoFormPage from './pages/EmpleadoFormPage';
import MapeoChecadorPage from './pages/MapeoChecadorPage';
import PagosPage from './pages/PagosPage';
import FormatosPage from './pages/FormatosPage';
import SalidaDetailPage from './pages/SalidaDetailPage';
import CulturePage from './pages/CulturePage';
import CultureElementDetailPage from './pages/CultureElementDetailPage';
import EmpresasPage from './pages/EmpresasPage';
import EmpresaFormPage from './pages/EmpresaFormPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import { getEmpresas } from './api/empresas';
import { getEmpresaActiva, setEmpresaActiva, clearEmpresaActiva } from './empresaActiva';

const linkCls = ({ isActive }) => isActive ? 'text-blue-700 font-medium text-sm' : 'text-gray-600 hover:text-blue-700 text-sm';

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const nombre = localStorage.getItem('nombre');
  const [empresas, setEmpresas] = useState(null);
  const [activa, setActiva] = useState(getEmpresaActiva());

  const cargarEmpresas = useCallback(async () => {
    const lista = (await getEmpresas()).filter(e => e.activo);
    setEmpresas(lista);
    let actual = getEmpresaActiva();
    if (actual && !lista.some(e => e.id === actual.id)) { clearEmpresaActiva(); actual = null; }
    if (!actual && lista.length === 1) { setEmpresaActiva(lista[0]); actual = getEmpresaActiva(); }
    setActiva(actual);
    if (lista.length === 0 && !location.pathname.startsWith('/empresas')) navigate('/empresas/nueva');
  }, [location.pathname, navigate]);

  useEffect(() => { cargarEmpresas(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function cambiarEmpresa(id) {
    const e = empresas.find(x => x.id === Number(id));
    if (!e) return;
    setEmpresaActiva(e);
    setActiva(getEmpresaActiva());
    navigate('/');
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('nombre');
    navigate('/login');
  }

  const enEmpresas = location.pathname.startsWith('/empresas');
  const bloqueado = !activa && !enEmpresas;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-2 flex flex-wrap items-center gap-4 shadow-sm">
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-gray-800 text-base tracking-wide">DIANDRA</span>
          <span className="text-xs text-gray-500 uppercase tracking-widest">Recursos Humanos</span>
        </div>
        <div className={`ml-6 flex gap-4 flex-1 ${activa ? '' : 'pointer-events-none opacity-40'}`}>
          <NavLink to="/" end className={linkCls}>Empleados</NavLink>
          <NavLink to="/pagos" className={linkCls}>Pagos</NavLink>
          <NavLink to="/checador/mapeo" className={linkCls}>Checador</NavLink>
          <NavLink to="/formatos" className={linkCls}>Formatos</NavLink>
          <NavLink to="/cultura" className={linkCls}>Cultura</NavLink>
        </div>
        <div className="flex items-center gap-3">
          <NavLink to="/empresas" className={linkCls}>Empresas</NavLink>
          <select aria-label="Empresa activa" value={activa?.id || ''} onChange={e => cambiarEmpresa(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm max-w-56">
            <option value="" disabled>Elige empresa…</option>
            {(empresas || []).map(e => <option key={e.id} value={e.id}>{e.razon_social}</option>)}
          </select>
          <span className="text-sm text-gray-500">{nombre}</span>
          <button onClick={logout} className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1">
            Cerrar sesión
          </button>
        </div>
      </nav>
      {activa && !enEmpresas && (
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-1.5 text-sm text-blue-900">
          Empresa: <strong>{activa.razon_social}</strong>
        </div>
      )}
      <main className="max-w-6xl mx-auto p-6" key={activa?.id || 'sin-empresa'}>
        {bloqueado ? (
          <p className="text-gray-700">Elige una empresa en el selector de arriba para continuar.</p>
        ) : (
          <Routes>
            <Route path="/" element={<EmpleadosPage />} />
            <Route path="/empleados/nuevo" element={<EmpleadoFormPage />} />
            <Route path="/empleados/:id" element={<EmpleadoDetallePage />} />
            <Route path="/empleados/:id/editar" element={<EmpleadoFormPage />} />
            <Route path="/pagos" element={<PagosPage />} />
            <Route path="/checador/mapeo" element={<MapeoChecadorPage />} />
            <Route path="/formatos" element={<FormatosPage />} />
            <Route path="/salidas/:id" element={<SalidaDetailPage />} />
            <Route path="/cultura" element={<CulturePage />} />
            <Route path="/cultura/:culturaId" element={<CultureElementDetailPage />} />
            <Route path="/empresas" element={<EmpresasPage onCambio={cargarEmpresas} />} />
            <Route path="/empresas/nueva" element={<EmpresaFormPage onCambio={cargarEmpresas} />} />
            <Route path="/empresas/:id/editar" element={<EmpresaFormPage onCambio={cargarEmpresas} />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
