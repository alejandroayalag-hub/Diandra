const CheckadaModel = require('../models/checada');
const EmpleadoModel = require('../models/empleado');

async function dispositivoPorApiKey(req, res) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) { res.status(401).json({ error: 'Falta x-api-key' }); return null; }
  const dispositivo = await CheckadaModel.getDispositivo(apiKey);
  if (!dispositivo) { res.status(401).json({ error: 'Dispositivo no autorizado' }); return null; }
  return dispositivo;
}

// Llamado por el agente local con su api_key
exports.sync = async (req, res) => {
  const dispositivo = await dispositivoPorApiKey(req, res);
  if (!dispositivo) return;
  const { registros } = req.body;
  if (!Array.isArray(registros) || registros.length === 0) return res.status(400).json({ error: 'Sin registros' });
  const insertadas = await CheckadaModel.syncBatch(dispositivo, registros);
  res.json({ ok: true, insertadas: insertadas.length });
};

exports.getMappings = async (req, res) => {
  const dispositivo = await dispositivoPorApiKey(req, res);
  if (!dispositivo) return;
  res.json(await CheckadaModel.getMappings(dispositivo));
};

// Panel web (auth + empresa)
exports.getByEmpleado = async (req, res) => {
  const empleado = await EmpleadoModel.findById(req.empresaId, req.params.empleadoId);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  const { desde, hasta } = req.query;
  res.json(await CheckadaModel.findByEmpleado(req.empresaId, empleado.id, { desde, hasta }));
};

exports.upsertMapping = async (req, res) => {
  const { dispositivo_id, empleado_id, uid_checador } = req.body;
  if (!dispositivo_id || !empleado_id || uid_checador == null)
    return res.status(400).json({ error: 'Faltan campos: dispositivo_id, empleado_id, uid_checador' });
  const dispositivo = await CheckadaModel.getDispositivoDeEmpresa(req.empresaId, dispositivo_id);
  const empleado = await EmpleadoModel.findById(req.empresaId, empleado_id);
  if (!dispositivo || !empleado) return res.status(404).json({ error: 'Dispositivo o empleado no encontrado' });
  res.status(201).json(await CheckadaModel.upsertMapping(dispositivo.id, empleado.id, uid_checador));
};

exports.getAllMappings = async (req, res) => res.json(await CheckadaModel.getAllMappings(req.empresaId));

exports.deleteMapping = async (req, res) => {
  const borrado = await CheckadaModel.deleteMapping(req.empresaId, req.params.id);
  if (!borrado) return res.status(404).json({ error: 'Mapeo no encontrado' });
  res.status(204).end();
};

exports.getDispositivos = async (req, res) => res.json(await CheckadaModel.getAllDispositivos(req.empresaId));
