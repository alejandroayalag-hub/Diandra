import { useEffect, useState } from 'react';
import { getDocumentosCliente, subirDocumentoCliente } from '../api/empresas';
import { abrirArchivo } from '../api/documentos';

const fecha = (f) => new Date(f).toLocaleDateString('es-MX');

// Archivo vigente (el más reciente) de un tipo + historial; subir uno nuevo no borra los anteriores.
export default function DocumentoCliente({ empresaId, tipo, accept = '.pdf,.jpg,.jpeg,.png', onSubido }) {
  const [docs, setDocs] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const cargar = () => getDocumentosCliente(empresaId)
    .then(d => setDocs(d.filter(x => x.tipo === tipo)))
    .catch(() => setError('No se pudieron cargar los documentos.'));
  useEffect(() => { cargar(); }, [empresaId, tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function subir(ev) {
    const archivo = ev.target.files[0];
    ev.target.value = '';
    if (!archivo) return;
    setSubiendo(true); setError('');
    try {
      const r = await subirDocumentoCliente(empresaId, tipo, archivo);
      await cargar();
      onSubido?.(r);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  }

  const abrir = (d) => abrirArchivo(`/empresas/${empresaId}/documentos/${d.id}/download`, d.nombre_original || 'documento.pdf');
  const [vigente, ...anteriores] = docs;

  return (
    <div className="text-sm">
      {vigente ? (
        <p>Vigente: <button type="button" onClick={() => abrir(vigente)} className="text-blue-700 underline">{vigente.nombre_original}</button>
          <span className="text-gray-500"> · {fecha(vigente.created_at)}</span></p>
      ) : <p className="text-gray-500">Sin archivo.</p>}
      {anteriores.length > 0 && (
        <details className="mt-1 text-gray-600">
          <summary className="cursor-pointer">Anteriores ({anteriores.length})</summary>
          <ul className="ml-4 list-disc">
            {anteriores.map(d => (
              <li key={d.id}><button type="button" onClick={() => abrir(d)} className="underline">{d.nombre_original}</button> · {fecha(d.created_at)}</li>
            ))}
          </ul>
        </details>
      )}
      <label className={`inline-block mt-2 text-blue-700 hover:underline ${subiendo ? 'opacity-50' : 'cursor-pointer'}`}>
        {subiendo ? 'Subiendo…' : vigente ? 'Subir versión nueva' : 'Subir archivo'}
        <input type="file" accept={accept} onChange={subir} disabled={subiendo} className="hidden" />
      </label>
      {error && <p className="text-red-600 mt-1">{error}</p>}
    </div>
  );
}
