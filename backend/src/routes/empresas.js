const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const { EmpresaModel, normalizarRfc } = require('../models/empresa');

function validar(body) {
  if (!String(body.razon_social || '').trim()) return 'La razón social es obligatoria';
  if (!normalizarRfc(body.rfc)) return 'RFC inválido (12 caracteres persona moral, 13 persona física)';
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

module.exports = router;
