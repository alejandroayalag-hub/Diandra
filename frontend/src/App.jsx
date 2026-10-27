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
import ObligacionesPage from './pages/ObligacionesPage';
import ControlPage from './pages/ControlPage';
import ControlClientePage from './pages/ControlClientePage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import { getEmpresas } from './api/empresas';
import { getResumenObligaciones } from './api/obligaciones';
import { getEmpresaActiva, setEmpresaActiva, clearEmpresaActiva } from './empresaActiva';

const linkCls = ({ isActive }) => isActive ? 'text-blue-700 font-medium text-sm' : 'text-gray-600 hover:text-blue-700 text-sm';

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const nombre = localStorage.getItem('nombre');
  const [empresas, setEmpresas] = useState(null);
  const [activa, setActiva] = useState(getEmpresaActiva());
  const [errorEmpresas, setErrorEmpresas] = useState('');
  const [resumen, setResumen] = useState(null);
  useEffect(() => {
    const cargar = () => getResumenObligaciones().then(setResumen).catch(() => setResumen(null));
    cargar();
    window.addEventListener('obligaciones-cambio', cargar);
    return () => window.removeEventListener('obligaciones-cambio', cargar);
  }, [location.pathname]);

  const cargarEmpresas = useCallback(async () => {
    let lista;
    try {
      lista = (await getEmpresas()).filter(e => e.activo);
    } catch {
      setErrorEmpresas('No se pudieron cargar las empresas. Recarga la página.');
      return;
    }
    setErrorEmpresas('');
    setEmpresas(lista);
    let actual = getEmpresaActiva();
    const match = actual && lista.find(e => e.id === actual.id);
    if (actual && !match) { clearEmpresaActiva(); actual = null; }
    else if (match) { setEmpresaActiva(match); actual = getEmpresaActiva(); }
    if (!actual && lista.length === 1) { setEmpresaActiva(lista[0]); actual = getEmpresaActiva(); }
    setActiva(actual);
    if (lista.length === 0 && !location.pathname.startsWith('/empresas')) navigate('/empresas/nueva');
  }, [location.pathname, navigate]);

  useEffect(() => { cargarEmpresas(); }, []); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  useEffect(() => {
    const handler = (ev) => { if (ev.key === 'empresaActiva' || ev.key === null) setActiva(getEmpresaActiva()); };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

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
    clearEmpresaActiva();
    navigate('/login');
  }

  // Clientes, control y obligaciones son del despacho: no requieren empresa activa.
  const enEmpresas = /^\/(empresas|obligaciones|control)/.test(location.pathname);
  const bloqueado = !activa && !enEmpresas;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 sm:px-6 py-2 flex flex-wrap items-center gap-4 shadow-sm">
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-gray-800 text-base tracking-wide">DIANDRA</span>
          <span className="text-xs text-gray-500 uppercase tracking-widest">Asesoría Contable</span>
        </div>
        <div className={`sm:ml-6 flex flex-wrap gap-x-4 gap-y-1 flex-1 ${activa ? '' : 'pointer-events-none opacity-40'}`}>
          <NavLink to="/" end className={linkCls}>Empleados</NavLink>
          <NavLink to="/pagos" className={linkCls}>Pagos</NavLink>
          <NavLink to="/checador/mapeo" className={linkCls}>Checador</NavLink>
          <NavLink to="/formatos" className={linkCls}>Formatos</NavLink>
          <NavLink to="/cultura" className={linkCls}>Cultura</NavLink>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NavLink to="/control" className={linkCls}>Control</NavLink>
          <NavLink to="/obligaciones" className={linkCls}>Obligaciones</NavLink>
          <NavLink to="/empresas" className={linkCls}>Clientes</NavLink>
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
      {errorEmpresas && <div className="bg-red-50 border-b border-red-100 px-6 py-1.5 text-sm text-red-700">{errorEmpresas}</div>}
      {resumen && (resumen.vencidas > 0 || resumen.esta_semana > 0) && (
        <NavLink to="/obligaciones" className="block bg-amber-50 border-b border-amber-100 px-6 py-1.5 text-sm text-amber-900 hover:bg-amber-100">
          Obligaciones:{' '}
          {resumen.vencidas > 0 && <strong className="text-red-700">{resumen.vencidas} vencida{resumen.vencidas > 1 ? 's' : ''}</strong>}
          {resumen.vencidas > 0 && resumen.esta_semana > 0 && ' · '}
          {resumen.esta_semana > 0 && <strong>{resumen.esta_semana} vence{resumen.esta_semana > 1 ? 'n' : ''} esta semana</strong>}
        </NavLink>
      )}
      {activa && !enEmpresas && (
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-1.5 text-sm text-blue-900">
          Empresa: <strong>{activa.razon_social}</strong>
        </div>
      )}
      <main className="max-w-6xl mx-auto p-4 sm:p-6" key={activa?.id || 'sin-empresa'}>
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
            <Route path="/obligaciones" element={<ObligacionesPage />} />
            <Route path="/control" element={<ControlPage />} />
            <Route path="/control/:id" element={<ControlClientePage />} />
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
