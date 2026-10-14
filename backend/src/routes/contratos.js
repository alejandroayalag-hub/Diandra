const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const pool = require('../db/pool');
const DocumentoModel = require('../models/documento');
const EmpleadoModel = require('../models/empleado');
const { EmpresaModel } = require('../models/empresa');
const { UPLOADS_DIR, relativa } = require('../lib/archivos');

const CAMPOS = [
  'nombre_trabajador', 'estado_civil', 'sabe_leer_escribir', 'edad', 'lugar_origen', 'curp', 'profesion',
  'domicilio_trabajador', 'colonia', 'codigo_postal', 'telefono', 'email', 'nss',
  'nombre_patron', 'razon_social', 'direccion_empresa', 'colonia_empresa', 'cp_empresa', 'ciudad', 'giro_empresa',
  'puesto', 'dir_trabajo', 'colonia_trabajo', 'cp_trabajo', 'hora_entrada', 'hora_salida',
  'descanso_inicio', 'descanso_fin', 'salario_diario', 'lugar_pago', 'nombre_capacitador',
  'descripcion_obra', 'habilidades_desarrollar', 'metodo_evaluacion', 'duracion_prueba',
  'nombre_beneficiario', 'fecha_inicio_dia', 'fecha_inicio_mes', 'fecha_inicio_anio',
  'lugar_firma', 'fecha_firma_dia', 'fecha_firma_mes', 'fecha_firma_anio',
];

// Lo que el usuario no capture se toma de la empresa activa.
function defaultsDeEmpresa(empresa) {
  return {
    nombre_patron: empresa.representante_legal,
    razon_social: empresa.razon_social,
    direccion_empresa: empresa.domicilio,
    colonia_empresa: empresa.colonia,
    cp_empresa: empresa.cp,
    ciudad: empresa.ciudad,
    giro_empresa: empresa.giro,
  };
}

router.post('/generar/:empleadoId', async (req, res) => {
  const empleado = await EmpleadoModel.findById(req.empresaId, req.params.empleadoId);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  const empresa = await EmpresaModel.findById(req.empresaId);
  const defaults = defaultsDeEmpresa(empresa);
  const datos = req.body;

  const render = Object.fromEntries(CAMPOS.map(c => [c, datos[c] || defaults[c] || '']));
  render.obligaciones = (datos.obligaciones || []).map(o => ({ texto: o }));
  render.prohibiciones = (datos.prohibiciones || []).map(p => ({ texto: p }));

  const templatePath = path.join(__dirname, '..', 'templates', 'contrato_individual.docx');
  const doc = new Docxtemplater(new PizZip(fs.readFileSync(templatePath, 'binary')), { paragraphLoop: true, linebreaks: true });
  doc.render(render);
  const buf = doc.getZip().generate({ type: 'nodebuffer' });

  const dir = path.join(UPLOADS_DIR, 'contratos');
  fs.mkdirSync(dir, { recursive: true });
  // ponytail: id + timestamp — dos empresas con "Juan Pérez" no se pisan el archivo.
  const ruta = path.join(dir, `contrato_${empleado.id}_${Date.now()}.docx`);
  fs.writeFileSync(ruta, buf);

  const { rows: tipoRows } = await pool.query("SELECT id FROM tipos_documento WHERE nombre = 'Contrato de trabajo'");
  if (!tipoRows[0]) return res.status(500).json({ error: 'Tipo "Contrato de trabajo" no encontrado en la base de datos' });

  const nombre = (datos.nombre_trabajador || `${empleado.nombre} ${empleado.apellido_paterno}`).replace(/\s+/g, '_');
  const docRecord = await DocumentoModel.upsert({
    empleado_id: empleado.id,
    tipo_documento_id: tipoRows[0].id,
    filename: `contrato_${nombre}.docx`,
    ruta: relativa(ruta),
    estatus: 'completo',
  });
  res.status(201).json(docRecord);
});

module.exports = router;
