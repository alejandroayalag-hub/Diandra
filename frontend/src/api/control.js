import api from './client';

export const getControl = (periodo) => api.get('/control', { params: { periodo } }).then(r => r.data);
export const getControlCliente = (empresaId, periodo) => api.get(`/control/${empresaId}`, { params: { periodo } }).then(r => r.data);
export const registrarPago = (empresaId, datos) => api.post(`/control/${empresaId}/pagos`, datos).then(r => r.data);
export const borrarPago = (id) => api.delete(`/control/pagos/${id}`);
export const guardarRequeridos = (empresaId, nombres) => api.put(`/control/${empresaId}/documentos-requeridos`, { nombres }).then(r => r.data);
export const marcarRecibido = (empresaId, requeridoId, periodo, archivo) => {
  const fd = new FormData();
  fd.append('periodo', periodo);
  if (archivo) fd.append('archivo', archivo);
  return api.post(`/control/${empresaId}/documentos/${requeridoId}/recibido`, fd).then(r => r.data);
};
export const deshacerRecibido = (id) => api.delete(`/control/recibidos/${id}`);
export const agregarNota = (empresaId, periodo, texto) => api.post(`/control/${empresaId}/bitacora`, { periodo, texto }).then(r => r.data);
export const borrarNota = (id) => api.delete(`/control/bitacora/${id}`);

export const mesActual = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
export const pesos = (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
export const ESTADO_HONORARIO = {
  pagado: ['Pagado', 'bg-green-100 text-green-800'],
  parcial: ['Parcial', 'bg-amber-100 text-amber-800'],
  pendiente: ['Pendiente', 'bg-red-100 text-red-800'],
  sin_cargo: ['Sin cargo', 'bg-gray-100 text-gray-600'],
};
