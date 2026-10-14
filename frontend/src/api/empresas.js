import api from './client';

export const getEmpresas = () => api.get('/empresas').then(r => r.data);
export const getEmpresa = (id) => api.get(`/empresas/${id}`).then(r => r.data);
export const createEmpresa = (data) => api.post('/empresas', data).then(r => r.data);
export const updateEmpresa = (id, data) => api.put(`/empresas/${id}`, data).then(r => r.data);
export const setEmpresaActivo = (id, activo) => api.patch(`/empresas/${id}/activo`, { activo }).then(r => r.data);
export const getDocumentosCliente = (id) => api.get(`/empresas/${id}/documentos`).then(r => r.data);
export const subirDocumentoCliente = (id, tipo, archivo) => {
  const fd = new FormData();
  fd.append('tipo', tipo);
  fd.append('archivo', archivo);
  return api.post(`/empresas/${id}/documentos`, fd).then(r => r.data);
};
export const getObligacionesCliente = (id) => api.get(`/empresas/${id}/obligaciones`).then(r => r.data);
export const guardarObligacionesCliente = (id, obligaciones) =>
  api.put(`/empresas/${id}/obligaciones`, { obligaciones }).then(r => r.data);
