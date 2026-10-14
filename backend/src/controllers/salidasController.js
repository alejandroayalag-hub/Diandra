const SalidaModel = require('../models/salida');
const EmpleadoModel = require('../models/empleado');
const DocumentoSalidaModel = require('../models/documentoSalida');
const { tiposDocumentoParaSalida } = require('../constants/documentosSalida');

const TIPOS_SALIDA = ['renuncia', 'despido', 'jubilacion', 'otro'];
const ESTADOS_SALIDA = ['pendiente', 'en_proceso', 'completado'];
const estadoInvalido = (res) =>
  res.status(400).json({ error: `estado inválido. Valores permitidos: ${ESTADOS_SALIDA.join(', ')}` });

exports.getAllSalidas = async (req, res) => {
  const { estado, empleadoId } = req.query;
  if (estado && !ESTADOS_SALIDA.includes(estado)) return estadoInvalido(res);
  res.json(await SalidaModel.findAll(req.empresaId, { estado, empleadoId }));
};

exports.getSalidaById = async (req, res) => {
  const salida = await SalidaModel.findById(req.empresaId, req.params.salidaId);
  if (!salida) return res.status(404).json({ error: 'Salida no encontrada' });
  const documentos = await DocumentoSalidaModel.findBySalidaId(salida.id);
  res.json({ ...salida, documentos });
};

exports.getSalidasByEmpleado = async (req, res) =>
  res.json(await SalidaModel.findByEmpleadoId(req.empresaId, req.params.empleadoId));

exports.createSalida = async (req, res) => {
  const { empleadoId, fechaSalida, tipoSalida, razonSalida, salarioPendiente } = req.body;
  if (!empleadoId || !fechaSalida || !tipoSalida || !razonSalida) {
    return res.status(400).json({ error: 'Campos requeridos: empleadoId, fechaSalida, tipoSalida, razonSalida' });
  }
  if (!TIPOS_SALIDA.includes(tipoSalida)) {
    return res.status(400).json({ error: `tipoSalida inválido. Valores permitidos: ${TIPOS_SALIDA.join(', ')}` });
  }
  const empleado = await EmpleadoModel.findById(req.empresaId, empleadoId);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  if (empleado.estado === 'inactivo') {
    return res.status(400).json({ error: 'No se puede crear salida de empleado inactivo' });
  }

  const salida = await SalidaModel.create(req.empresaId, {
    empleadoId: empleado.id, fechaSalida, tipoSalida, razonSalida,
    salarioPendiente: salarioPendiente || 0, createdBy: req.user?.id,
  });

  // Documentos vacíos; renuncia vs aviso rescisorio depende del tipoSalida
  await Promise.all(tiposDocumentoParaSalida(tipoSalida).map((tipoDocumento) =>
    DocumentoSalidaModel.create({ salidaId: salida.id, tipoDocumento, createdBy: req.user?.id })));

  res.status(201).json(salida);
};

exports.updateSalida = async (req, res) => {
  const { tipoSalida, estado } = req.body;
  if (tipoSalida && !TIPOS_SALIDA.includes(tipoSalida)) {
    return res.status(400).json({ error: `tipoSalida inválido. Valores permitidos: ${TIPOS_SALIDA.join(', ')}` });
  }
  if (estado && !ESTADOS_SALIDA.includes(estado)) return estadoInvalido(res);
  const salida = await SalidaModel.update(req.empresaId, req.params.salidaId, req.body);
  if (!salida) return res.status(404).json({ error: 'Salida no encontrada' });
  res.json(salida);
};

exports.deleteSalida = async (req, res) => {
  const salida = await SalidaModel.findById(req.empresaId, req.params.salidaId);
  if (!salida) return res.status(404).json({ error: 'Salida no encontrada' });
  if (salida.estado !== 'pendiente') {
    return res.status(400).json({ error: 'Solo se pueden eliminar salidas en estado pendiente' });
  }
  await SalidaModel.delete(req.empresaId, salida.id); // documentos_salida cae por ON DELETE CASCADE
  res.status(204).end();
};

exports.getSalidasByEstado = async (req, res) => {
  if (!ESTADOS_SALIDA.includes(req.params.estado)) return estadoInvalido(res);
  res.json(await SalidaModel.findByEstado(req.empresaId, req.params.estado));
};
