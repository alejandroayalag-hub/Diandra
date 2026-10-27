const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const AgendaModel = require('../models/agenda');
const ObligacionModel = require('../models/obligacion');
const { armarCalendario, hoyMx, sumarDias } = require('../lib/vencimientos');

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^\d+$/;
const TIPOS = ['cita', 'llamada', 'entrega', 'impuestos', 'otro'];
const escribir = requireRole('admin', 'rh');

function validar(b) {
  if (!FECHA_RE.test(b.fecha || '')) return 'Fecha inválida (AAAA-MM-DD)';
  if (b.hora && !HORA_RE.test(b.hora)) return 'Hora inválida (HH:MM)';
  if (!String(b.titulo || '').trim()) return 'El título es obligatorio';
  if (String(b.titulo).length > 200) return 'Título demasiado largo';
  if (b.tipo && !TIPOS.includes(b.tipo)) return 'Tipo inválido';
  if (b.empresa_id && !ID_RE.test(String(b.empresa_id))) return 'Cliente inválido';
  return null;
}
const limpio = b => ({ ...b, titulo: String(b.titulo).trim(), tipo: b.tipo || 'otro' });

// Eventos + vencimientos fiscales del rango (solo los que caen dentro; lo vencido de antes vive en Obligaciones).
router.get('/', async (req, res) => {
  const { desde, hasta } = req.query;
  if (!FECHA_RE.test(desde || '') || !FECHA_RE.test(hasta || '') || desde > hasta) {
    return res.status(400).json({ error: 'Rango de fechas inválido (AAAA-MM-DD, desde ≤ hasta)' });
  }
  if (hasta > sumarDias(desde, 62)) return res.status(400).json({ error: 'Rango demasiado largo (máximo 2 meses)' });
  const obs = await ObligacionModel.paraCalendario(null);
  const [eventos, cumplimientos] = await Promise.all([
    AgendaModel.rango(desde, hasta), ObligacionModel.cumplimientosDe(obs.map(o => o.id))]);
  const vencimientos = armarCalendario(obs, cumplimientos, { desde, hasta, hoy: hoyMx() }).filter(v => v.fecha_vence >= desde);
  res.json({ eventos, vencimientos });
});

router.post('/', escribir, async (req, res) => {
  const b = req.body || {};
  const error = validar(b);
  if (error) return res.status(400).json({ error });
  res.status(201).json(await AgendaModel.create(limpio(b), req.user.id));   // empresa inexistente → 23503 → 400
});

router.put('/:id', escribir, async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Parámetro inválido' });
  const b = req.body || {};
  const error = validar(b);
  if (error) return res.status(400).json({ error });
  const ev = await AgendaModel.update(req.params.id, limpio(b));
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  res.json(ev);
});

router.delete('/:id', escribir, async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Parámetro inválido' });
  if (!(await AgendaModel.remove(req.params.id))) return res.status(404).json({ error: 'Evento no encontrado' });
  res.status(204).end();
});

module.exports = router;
