const fs = require('fs');
const DocumentoModel = require('../models/documento');
const EmpleadoModel = require('../models/empleado');
const { relativa, absoluta } = require('../lib/archivos');

exports.getTipos = async (req, res) => res.json(await DocumentoModel.findTipos());

exports.getByEmpleado = async (req, res) => {
  const empleado = await EmpleadoModel.findById(req.empresaId, req.params.empleadoId);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.json(await DocumentoModel.findByEmpleado(req.empresaId, empleado.id));
};

exports.upload = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  const { empleado_id, tipo_documento_id, estatus } = req.body;
  const empleado = await EmpleadoModel.findById(req.empresaId, empleado_id);
  if (!empleado) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Empleado no encontrado' });
  }
  const doc = await DocumentoModel.upsert({
    empleado_id: empleado.id,
    tipo_documento_id,
    filename: req.file.originalname,
    ruta: relativa(req.file.path),
    estatus,
  });
  res.status(201).json(doc);
};

exports.remove = async (req, res) => {
  const doc = await DocumentoModel.delete(req.empresaId, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  if (fs.existsSync(absoluta(doc.ruta))) fs.unlinkSync(absoluta(doc.ruta));
  res.status(204).end();
};

exports.download = async (req, res) => {
  const doc = await DocumentoModel.findById(req.empresaId, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  const ruta = absoluta(doc.ruta);
  if (!fs.existsSync(ruta)) return res.status(404).json({ error: 'El archivo ya no existe en el servidor. Por favor vuelve a subirlo.' });
  res.download(ruta, doc.filename);
};
