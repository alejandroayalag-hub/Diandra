const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');
const { relativa, absoluta } = require('../lib/archivos');
const ObligacionModel = require('../models/obligacion');
const { armarCalendario, hoyMx, sumarDias, finDeMes, periodoValido } = require('../lib/vencimientos');

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d+$/;
// Síncrono: al responder, el archivo rechazado ya no está en disco.
const borrarSubido = (file) => { if (file) fs.rmSync(file.path, { force: true }); };

async function calendario(empresaId, desde, hasta, hoy) {
  const obligaciones = await ObligacionModel.paraCalendario(empresaId);
  const cumplimientos = await ObligacionModel.cumplimientosDe(obligaciones.map(o => o.id));
  return armarCalendario(obligaciones, cumplimientos, { desde, hasta, hoy });
}

router.get('/calendario', async (req, res) => {
  const hoy = hoyMx();
  const desde = req.query.desde || `${hoy.slice(0, 7)}-01`;
  const hasta = req.query.hasta || finDeMes(hoy, 1);
  if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta) || desde > hasta) {
    return res.status(400).json({ error: 'Rango de fechas inválido (AAAA-MM-DD, desde ≤ hasta)' });
  }
  const { empresa_id: empresaId } = req.query;
  if (empresaId && !ID_RE.test(empresaId)) return res.status(400).json({ error: 'empresa_id inválido' });
  res.json(await calendario(empresaId ? Number(empresaId) : null, desde, hasta, hoy));
});

router.get('/resumen', async (req, res) => {
  const hoy = hoyMx();
  const items = await calendario(null, hoy, sumarDias(hoy, 7), hoy);
  res.json({
    vencidas: items.filter(i => i.estado === 'vencida').length,
    esta_semana: items.filter(i => i.estado === 'proxima').length,
  });
});

router.post('/:id/cumplimientos', requireRole('admin', 'rh'), upload.single('acuse'), async (req, res) => {
  const fallar = (status, error) => { borrarSubido(req.file); res.status(status).json({ error }); };
  if (!ID_RE.test(req.params.id)) return fallar(400, 'Parámetro inválido');
  const ob = await ObligacionModel.findById(req.params.id);
  if (!ob) return fallar(404, 'Obligación no encontrada');
  const { periodo } = req.body;
  const fecha = req.body.fecha_presentacion || hoyMx();
  if (!periodoValido(ob.periodicidad, periodo)) return fallar(400, 'Periodo inválido para esta obligación');
  if (!FECHA_RE.test(fecha)) return fallar(400, 'Fecha de presentación inválida (AAAA-MM-DD)');
  try {
    res.status(201).json(await ObligacionModel.crearCumplimiento(ob.id, periodo, fecha, req.file ? relativa(req.file.path) : null));
  } catch (err) {
    borrarSubido(req.file);
    throw err;   // 23505 → 409 por errorHandler
  }
});

router.delete('/cumplimientos/:id', requireRole('admin', 'rh'), async (req, res) => {
  const c = await ObligacionModel.borrarCumplimiento(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cumplimiento no encontrado' });
  if (c.acuse) fs.unlink(absoluta(c.acuse), () => {});
  res.status(204).end();
});

router.get('/cumplimientos/:id/acuse', async (req, res) => {
  const c = await ObligacionModel.findCumplimiento(req.params.id);
  if (!c || !c.acuse) return res.status(404).json({ error: 'Este cumplimiento no tiene acuse' });
  const ruta = absoluta(c.acuse);
  if (!fs.existsSync(ruta)) return res.status(404).json({ error: 'El archivo ya no existe en el servidor. Por favor vuelve a subirlo.' });
  res.download(ruta, `acuse-${c.periodo}${path.extname(ruta)}`);
});

module.exports = router;
