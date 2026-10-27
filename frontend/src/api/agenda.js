import api from './client';

export const getAgenda = (desde, hasta) => api.get('/agenda', { params: { desde, hasta } }).then(r => r.data);
export const crearEvento = (datos) => api.post('/agenda', datos).then(r => r.data);
export const actualizarEvento = (id, datos) => api.put(`/agenda/${id}`, datos).then(r => r.data);
export const borrarEvento = (id) => api.delete(`/agenda/${id}`);
