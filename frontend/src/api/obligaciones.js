import api from './client';

export const getCalendario = (params) => api.get('/obligaciones/calendario', { params }).then(r => r.data);
export const getResumenObligaciones = () => api.get('/obligaciones/resumen').then(r => r.data);
export const registrarCumplimiento = (obligacionId, periodo, fecha, acuse) => {
  const fd = new FormData();
  fd.append('periodo', periodo);
  fd.append('fecha_presentacion', fecha);
  if (acuse) fd.append('acuse', acuse);
  return api.post(`/obligaciones/${obligacionId}/cumplimientos`, fd).then(r => r.data);
};
export const deshacerCumplimiento = (id) => api.delete(`/obligaciones/cumplimientos/${id}`);
