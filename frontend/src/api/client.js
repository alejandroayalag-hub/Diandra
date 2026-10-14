import axios from 'axios';
import { getEmpresaActiva, clearEmpresaActiva } from '../empresaActiva';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const empresa = getEmpresaActiva();
  if (empresa) config.headers['X-Empresa-Id'] = empresa.id;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('nombre');
      window.location.href = '/login';
    }
    const code = err.response?.data?.code;
    if (code === 'EMPRESA_REQUERIDA' || code === 'EMPRESA_INVALIDA') {
      clearEmpresaActiva();
      window.location.href = '/empresas';
    }
    return Promise.reject(err);
  }
);

export default api;
