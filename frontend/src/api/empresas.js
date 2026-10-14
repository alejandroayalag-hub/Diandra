import api from './client';

export const getEmpresas = () => api.get('/empresas').then(r => r.data);
export const getEmpresa = (id) => api.get(`/empresas/${id}`).then(r => r.data);
export const createEmpresa = (data) => api.post('/empresas', data).then(r => r.data);
export const updateEmpresa = (id, data) => api.put(`/empresas/${id}`, data).then(r => r.data);
export const setEmpresaActivo = (id, activo) => api.patch(`/empresas/${id}/activo`, { activo }).then(r => r.data);
