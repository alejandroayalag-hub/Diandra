const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');
const { relativa, absoluta } = require('../lib/archivos');
const { leerCsf } = require('../lib/csf');
const { validarObligaciones } = require('../lib/vencimientos');
const { EmpresaModel, EmpresaDocumentoModel, normalizarRfc } = require('../models/empresa');
const ObligacionModel = require('../models/obligacion');

// Síncrono: al responder, el archivo rechazado ya no está en disco.
const borrarSubido = (file) => { if (file) fs.rmSync(file.path, { force: true }); };
const ID_RE = /^\d+$/;

function validar(body) {
  if (!String(body.razon_social || '').trim()) return 'La razón social es obligatoria';
  const rfc = normalizarRfc(body.rfc);
  if (!rfc) return 'RFC inválido (12 caracteres persona moral, 13 persona física)';
  if (body.tipo_persona && !['fisica', 'moral'].includes(body.tipo_persona)) return 'Tipo de persona inválido';
  if (body.tipo_persona === 'moral' && rfc.length !== 12) return 'Persona moral: el RFC lleva 12 caracteres';
  if (body.tipo_persona === 'fisica' && rfc.length !== 13) return 'Persona física: el RFC lleva 13 caracteres';
  const monto = body.monto_facturacion;
  if (monto !== undefined && monto !== null && monto !== '' && !(Number(monto) >= 0)) return 'Monto de facturación inválido';
  return null;
}

router.get('/', async (req, res) => res.json(await EmpresaModel.findAll()));

router.get('/:id', async (req, res) => {
  const empresa = await EmpresaModel.findById(req.params.id);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(empresa);
});

router.post('/', requireRole('admin', 'rh'), async (req, res) => {
  const error = validar(req.body);
  if (error) return res.status(400).json({ error });
  const empresa = await EmpresaModel.create({ ...req.body, rfc: normalizarRfc(req.body.rfc) });
  res.status(201).json(empresa);
});

router.put('/:id', requireRole('admin', 'rh'), async (req, res) => {
  const error = validar(req.body);
  if (error) return res.status(400).json({ error });
  const empresa = await EmpresaModel.update(req.params.id, { ...req.body, rfc: normalizarRfc(req.body.rfc) });
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(empresa);
});

router.patch('/:id/activo', requireRole('admin', 'rh'), async (req, res) => {
  if (typeof req.body.activo !== 'boolean') return res.status(400).json({ error: 'activo debe ser true o false' });
  const empresa = await EmpresaModel.setActivo(req.params.id, req.body.activo);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(empresa);
});

router.get('/:id/documentos', async (req, res) => res.json(await EmpresaDocumentoModel.porEmpresa(req.params.id)));

router.post('/:id/documentos', requireRole('admin', 'rh'), upload.single('archivo'), async (req, res) => {
  const fallar = (status, error) => { borrarSubido(req.file); res.status(status).json({ error }); };
  if (!req.file) return fallar(400, 'Falta el archivo');
  if (!ID_RE.test(req.params.id)) return fallar(400, 'Parámetro inválido');
  const { tipo } = req.body;
  if (!['acta', 'csf'].includes(tipo)) return fallar(400, 'tipo debe ser acta o csf');
  if (tipo === 'csf' && path.extname(req.file.originalname).toLowerCase() !== '.pdf') return fallar(400, 'La CSF debe ser PDF');
  const empresa = await EmpresaModel.findById(req.params.id);
  if (!empresa) return fallar(404, 'Empresa no encontrada');

  const documento = await EmpresaDocumentoModel.create(empresa.id, tipo, relativa(req.file.path), req.file.originalname);
  if (tipo === 'acta') return res.status(201).json({ documento });
  const { obligaciones, aviso } = await leerCsf(fs.readFileSync(req.file.path), empresa.rfc);
  res.status(201).json({ documento, ...(await ObligacionModel.comparar(empresa.id, obligaciones)), aviso });
});

router.get('/:id/documentos/:docId/download', async (req, res) => {
  const doc = await EmpresaDocumentoModel.findById(req.params.id, req.params.docId);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  const ruta = absoluta(doc.archivo);
  if (!fs.existsSync(ruta)) return res.status(404).json({ error: 'El archivo ya no existe en el servidor. Por favor vuelve a subirlo.' });
  res.download(ruta, doc.nombre_original || path.basename(ruta));
});

router.get('/:id/obligaciones', async (req, res) => res.json(await ObligacionModel.porEmpresa(req.params.id)));

router.put('/:id/obligaciones', requireRole('admin', 'rh'), async (req, res) => {
  const lista = req.body.obligaciones;
  const error = validarObligaciones(lista);
  if (error) return res.status(400).json({ error });
  const empresa = await EmpresaModel.findById(req.params.id);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(await ObligacionModel.reemplazar(empresa.id, lista));
});

module.exports = router;
