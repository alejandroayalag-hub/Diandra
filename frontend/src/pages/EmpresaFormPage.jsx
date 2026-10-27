import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createEmpresa, getEmpresa, updateEmpresa } from '../api/empresas';
import { getEmpresaActiva, setEmpresaActiva } from '../empresaActiva';
import DocumentoCliente from '../components/DocumentoCliente';
import ObligacionesCliente from '../components/ObligacionesCliente';

const CAMPOS = ['tipo_persona', 'razon_social', 'rfc', 'representante_legal', 'registro_patronal', 'giro',
  'contacto_nombre', 'contacto_telefono', 'contacto_whatsapp',
  'nombre_comercial', 'domicilio', 'colonia', 'cp', 'ciudad', 'monto_facturacion', 'cobro_desde', 'condiciones_pago'];
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const inputCls = 'mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm';

// Enter dentro de las secciones con carga/revisión no debe enviar la ficha (perdería la revisión de la CSF).
const sinEnter = e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); };

function Seccion({ titulo, children }) {
  return (
    <section className="border-t border-gray-200 pt-4 mt-5">
      <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3">{titulo}</h2>
      {children}
    </section>
  );
}

export default function EmpresaFormPage({ onCambio }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(Object.fromEntries(CAMPOS.map(k => [k, ''])));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [revisionCsf, setRevisionCsf] = useState(null);

  useEffect(() => {
    if (id) getEmpresa(id).then(e => setForm(Object.fromEntries(CAMPOS.map(k => [k, e[k] ?? '']))))
      .catch(() => setErrorCarga('No se pudo cargar el cliente.'));
  }, [id]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const campo = (k, label, props = {}) => (
    <label className="text-sm text-gray-700">{label}
      <input value={form[k]} onChange={set(k)} {...props} className={inputCls} />
    </label>
  );

  async function guardar(ev) {
    ev.preventDefault();
    const rfc = form.rfc.trim().toUpperCase();
    if (!form.tipo_persona) return setError('Elige persona física o moral.');
    if (!form.razon_social.trim()) return setError('El nombre de la empresa es obligatorio.');
    if (!RFC_RE.test(rfc)) return setError('RFC inválido.');
    if (form.tipo_persona === 'moral' && rfc.length !== 12) return setError('Persona moral: el RFC lleva 12 caracteres.');
    if (form.tipo_persona === 'fisica' && rfc.length !== 13) return setError('Persona física: el RFC lleva 13 caracteres.');
    setError(''); setGuardando(true);
    try {
      const datos = { ...form, rfc };
      const empresa = id ? await updateEmpresa(id, datos) : await createEmpresa(datos);
      if (!getEmpresaActiva()) setEmpresaActiva(empresa); // primer cliente queda seleccionado
      onCambio?.();
      navigate(id ? '/empresas' : `/empresas/${empresa.id}/editar`); // al crear, queda en la ficha para subir documentos
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  if (errorCarga) return <p className="text-red-600">{errorCarga}</p>;

  const wa = form.contacto_whatsapp.replace(/\D/g, '');
  const sinId = <p className="text-sm text-gray-500">Guarda el cliente para poder subir documentos.</p>;

  return (
    <form onSubmit={guardar} className="bg-white border rounded p-6 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-800">{id ? 'Ficha de cliente' : 'Nuevo cliente'}</h1>

      <Seccion titulo="Tipo de persona">
        <div className="flex gap-6 text-sm">
          {[['fisica', 'Persona física'], ['moral', 'Persona moral']].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="tipo_persona" value={v} checked={form.tipo_persona === v} onChange={set('tipo_persona')} />{l}
            </label>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Empresa">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campo('razon_social', 'Nombre o razón social *')}
          {campo('rfc', 'RFC *')}
          {campo('representante_legal', 'Representante legal')}
          {campo('registro_patronal', 'Registro patronal IMSS')}
          {campo('giro', 'Giro')}
        </div>
      </Seccion>

      <Seccion titulo="Contacto en la empresa">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {campo('contacto_nombre', 'Nombre')}
          {campo('contacto_telefono', 'Teléfono', { type: 'tel' })}
          <div>
            {campo('contacto_whatsapp', 'WhatsApp', { type: 'tel' })}
            {wa.length === 10 && <a href={`https://wa.me/52${wa}`} target="_blank" rel="noreferrer" className="text-xs text-green-700 hover:underline">Abrir WhatsApp</a>}
          </div>
        </div>
      </Seccion>

      {form.tipo_persona === 'moral' && (
        <Seccion titulo="Acta constitutiva">
          {id ? <div onKeyDown={sinEnter}><DocumentoCliente empresaId={id} tipo="acta" /></div> : sinId}
        </Seccion>
      )}

      <Seccion titulo="Nombre comercial y domicilio">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campo('nombre_comercial', 'Nombre comercial')}
          {campo('domicilio', 'Calle y número')}
          {campo('colonia', 'Colonia')}
          {campo('cp', 'Código postal')}
          {campo('ciudad', 'Ciudad')}
        </div>
      </Seccion>

      <Seccion titulo="Constancia de situación fiscal y obligaciones">
        {id ? (
          <div onKeyDown={sinEnter}>
            <DocumentoCliente empresaId={id} tipo="csf" accept=".pdf" onSubido={setRevisionCsf} />
            <ObligacionesCliente empresaId={id} revision={revisionCsf} onCerrar={() => setRevisionCsf(null)} />
          </div>
        ) : sinId}
      </Seccion>

      <Seccion titulo="Honorarios">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campo('monto_facturacion', 'Honorario mensual (MXN)', { type: 'number', min: '0', step: '0.01' })}
          {campo('cobro_desde', 'Se cobra desde (vacío = mes de alta)', { type: 'month' })}
          <label className="text-sm text-gray-700 sm:col-span-2">Condiciones de pago
            <textarea value={form.condiciones_pago} onChange={set('condiciones_pago')} rows={3} className={inputCls} />
          </label>
        </div>
      </Seccion>

      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button disabled={guardando} className="bg-blue-700 text-white px-4 py-2 rounded text-sm hover:bg-blue-800 disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => navigate('/empresas')} className="text-gray-600 text-sm">Cancelar</button>
      </div>
      {id && <p className="text-xs text-gray-500 mt-2">Los documentos y obligaciones se guardan por separado, al subirlos o confirmarlos.</p>}
    </form>
  );
}
