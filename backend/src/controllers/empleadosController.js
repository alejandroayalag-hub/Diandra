const fs = require('fs');
const EmpleadoModel = require('../models/empleado');
const { relativa, absoluta } = require('../lib/archivos');

exports.getAll = async (req, res) => {
  const { estado } = req.query;
  if (estado && !['activo', 'inactivo'].includes(estado)) {
    return res.status(400).json({ error: "estado debe ser 'activo' o 'inactivo'" });
  }
  res.json(await EmpleadoModel.findAll(req.empresaId, { estado }));
};

exports.getOne = async (req, res) => {
  const empleado = await EmpleadoModel.findById(req.empresaId, req.params.id);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.json(empleado);
};

exports.create = async (req, res) => {
  const { curp, rfc, fecha_ingreso, email } = req.body;
  if (!curp || !rfc || !fecha_ingreso || !email)
    return res.status(400).json({ error: 'CURP, RFC, Fecha de ingreso y Email son obligatorios' });
  res.status(201).json(await EmpleadoModel.create(req.empresaId, req.body));
};

exports.update = async (req, res) => {
  const empleado = await EmpleadoModel.update(req.empresaId, req.params.id, req.body);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.json(empleado);
};

exports.remove = async (req, res) => {
  const borrado = await EmpleadoModel.delete(req.empresaId, req.params.id);
  if (!borrado) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.status(204).end();
};

exports.uploadFoto = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
  const empleado = await EmpleadoModel.findById(req.empresaId, req.params.id);
  if (!empleado) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Empleado no encontrado' });
  }
  if (empleado.foto && fs.existsSync(absoluta(empleado.foto))) fs.unlinkSync(absoluta(empleado.foto));
  res.json(await EmpleadoModel.update(req.empresaId, req.params.id, { foto: relativa(req.file.path) }));
};
