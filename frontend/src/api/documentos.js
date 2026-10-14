import api from './client';

export const getTipos = () => api.get('/documentos/tipos').then(r => r.data);
export const getDocumentos = (empleadoId) => api.get(`/documentos/empleado/${empleadoId}`).then(r => r.data);
export const uploadDocumento = (formData) => api.post('/documentos/upload', formData).then(r => r.data);
export const deleteDocumento = (id) => api.delete(`/documentos/${id}`);

export const generarContrato = (empleadoId, datos) =>
  api.post(`/contratos/generar/${empleadoId}`, datos).then(r => r.data);

export const abrirArchivo = async (url, filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  const win = ['pdf', 'jpg', 'jpeg', 'png'].includes(ext) ? window.open('', '_blank') : null;
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(res.data);
    if (win) {
      win.location.href = blobUrl;
    } else {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (err) {
    if (win) win.close();
    // Leer el mensaje de error del blob
    if (err.response?.data instanceof Blob) {
      const text = await err.response.data.text();
      try { alert(JSON.parse(text).error); } catch { alert('No se pudo abrir el archivo.'); }
    } else {
      alert('No se pudo abrir el archivo.');
    }
  }
};

export const abrirDocumento = (id, filename) => abrirArchivo(`/documentos/${id}/download`, filename);
