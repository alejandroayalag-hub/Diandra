import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createEmpresa, getEmpresa, updateEmpresa } from '../api/empresas';
import { getEmpresaActiva, setEmpresaActiva } from '../empresaActiva';

const CAMPOS = [
  ['razon_social', 'Razón social *'], ['nombre_comercial', 'Nombre comercial'], ['rfc', 'RFC *'],
  ['registro_patronal', 'Registro patronal IMSS'], ['representante_legal', 'Representante legal'],
  ['domicilio', 'Calle y número'], ['colonia', 'Colonia'], ['cp', 'Código postal'], ['ciudad', 'Ciudad'], ['giro', 'Giro'],
];
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export default function EmpresaFormPage({ onCambio }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(Object.fromEntries(CAMPOS.map(([k]) => [k, ''])));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (id) getEmpresa(id).then(e => setForm(Object.fromEntries(CAMPOS.map(([k]) => [k, e[k] || '']))));
  }, [id]);

  async function guardar(ev) {
    ev.preventDefault();
    const rfc = form.rfc.trim().toUpperCase();
    if (!form.razon_social.trim()) return setError('La razón social es obligatoria.');
    if (!RFC_RE.test(rfc)) return setError('RFC inválido: 12 caracteres para persona moral, 13 para persona física.');
    setError(''); setGuardando(true);
    try {
      const empresa = id ? await updateEmpresa(id, { ...form, rfc }) : await createEmpresa({ ...form, rfc });
      if (!getEmpresaActiva()) setEmpresaActiva(empresa); // primer cliente queda seleccionado
      onCambio?.();
      navigate('/empresas');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="bg-white border rounded p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-800 mb-4">{id ? 'Editar empresa' : 'Nueva empresa cliente'}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CAMPOS.map(([k, label]) => (
          <label key={k} className="text-sm text-gray-700">
            {label}
            <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </label>
        ))}
      </div>
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button disabled={guardando} className="bg-blue-700 text-white px-4 py-2 rounded text-sm hover:bg-blue-800 disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => navigate('/empresas')} className="text-gray-600 text-sm">Cancelar</button>
      </div>
    </form>
  );
}
