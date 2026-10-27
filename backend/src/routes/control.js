const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');
const { relativa, absoluta } = require('../lib/archivos');
const { PERIODO_RE, estadoCuenta } = require('../lib/honorarios');
const { armarCalendario, hoyMx, finDeMes } = require('../lib/vencimientos');
const ControlModel = require('../models/control');
const ObligacionModel = require('../models/obligacion');
const { EmpresaModel } = require('../models/empresa');

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d+$/;
const escribir = requireRole('admin', 'rh');
const borrarSubido = (file) => { if (file) fs.rmSync(file.path, { force: true }); };

function periodoDe(req, res) {
  const periodo = req.query.periodo || hoyMx().slice(0, 7);
  if (!PERIODO_RE.test(periodo)) { res.status(400).json({ error: 'Periodo inválido (AAAA-MM)' }); return null; }
  return periodo;
}

// Saldo al mes actual; el estado del mes elegido aunque sea futuro.
function cuenta(c, periodo, pagos) {
  const mesHoy = hoyMx().slice(0, 7);
  const base = { honorario: c.honorario, desde: c.cobro_desde, pagos };
  const alMes = estadoCuenta({ ...base, hasta: periodo > mesHoy ? periodo : mesHoy });
  const alDia = estadoCuenta({ ...base, hasta: mesHoy });
  const mes = alMes.meses.find(m => m.periodo === periodo);
  return { saldo: alDia.saldo, cargado: alDia.cargado, pagado: alDia.pagado, meses: alDia.meses, estado_mes: mes ? mes.estado : 'sin_cargo' };
}

// Obligaciones que vencen dentro del mes.
async function obligacionesDelMes(empresaId, periodo) {
  const desde = `${periodo}-01`;
  const hasta = finDeMes(desde, 0);
  const obs = await ObligacionModel.paraCalendario(empresaId);
  const cumplimientos = await ObligacionModel.cumplimientosDe(obs.map(o => o.id));
  return armarCalendario(obs, cumplimientos, { desde, hasta, hoy: hoyMx() }).filter(i => i.fecha_vence >= desde);
}

router.get('/', async (req, res) => {
  const periodo = periodoDe(req, res);
  if (!periodo) return;
  const clientes = await ControlModel.clientes();
  const ids = clientes.map(c => c.empresa_id);
  await ControlModel.asegurarRequeridos(ids);
  const [docs, notas, obligaciones] = await Promise.all([
    ControlModel.documentosDelMes(ids, periodo), ControlModel.conteoBitacora(periodo), obligacionesDelMes(null, periodo)]);
  const filas = clientes.map(c => {
    const { saldo, estado_mes } = cuenta(c, periodo, [{ monto: c.total_pagado }]);
    const d = docs.filter(x => x.empresa_id === c.empresa_id);
    const o = obligaciones.filter(x => x.empresa_id === c.empresa_id);
    return {
      empresa_id: c.empresa_id, razon_social: c.razon_social, honorario: c.honorario, saldo, estado_mes,
      docs_recibidos: d.filter(x => x.recibido_id).length, docs_total: d.length,
      obligaciones_presentadas: o.filter(x => x.estado === 'presentada').length, obligaciones_total: o.length,
      obligaciones_vencidas: o.filter(x => x.estado === 'vencida').length,
      notas: notas.get(c.empresa_id) || 0,
    };
  });
  res.json({
    periodo,
    totales: {
      por_cobrar: Math.round(filas.reduce((s, f) => s + Math.max(f.saldo, 0), 0) * 100) / 100,
      con_documentos_pendientes: filas.filter(f => f.docs_recibidos < f.docs_total).length,
      obligaciones_vencidas: filas.reduce((s, f) => s + f.obligaciones_vencidas, 0),
    },
    clientes: filas,
  });
});

router.get('/:empresaId', async (req, res) => {
  const periodo = periodoDe(req, res);
  if (!periodo) return;
  if (!ID_RE.test(req.params.empresaId)) return res.status(400).json({ error: 'Parámetro inválido' });
  const empresa = await EmpresaModel.findById(req.params.empresaId);
  if (!empresa) return res.status(404).json({ error: 'Cliente no encontrado' });
  const [c] = await ControlModel.clientes(empresa.id);
  await ControlModel.asegurarRequeridos([empresa.id]);
  const [pagos, documentos, obligaciones, bitacora] = await Promise.all([
    ControlModel.pagos(empresa.id), ControlModel.documentosDelMes([empresa.id], periodo),
    obligacionesDelMes(empresa.id, periodo), ControlModel.bitacora(empresa.id, periodo)]);
  res.json({
    periodo, empresa_id: empresa.id, razon_social: empresa.razon_social, activo: empresa.activo,
    honorario: c.honorario, cobro_desde: c.cobro_desde, cuenta: cuenta(c, periodo, pagos), pagos, documentos, obligaciones, bitacora,
  });
});

router.post('/:empresaId/pagos', escribir, async (req, res) => {
  const { monto, fecha_pago: fecha, forma_pago: forma, nota } = req.body || {};
  if (!(Number(monto) > 0)) return res.status(400).json({ error: 'Monto inválido' });
  if (!FECHA_RE.test(fecha || '')) return res.status(400).json({ error: 'Fecha de pago inválida (AAAA-MM-DD)' });
  if (forma && String(forma).length > 30) return res.status(400).json({ error: 'Forma de pago demasiado larga' });
  const empresa = ID_RE.test(req.params.empresaId) && await EmpresaModel.findById(req.params.empresaId);
  if (!empresa) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.status(201).json(await ControlModel.crearPago(empresa.id, { monto, fecha_pago: fecha, forma_pago: forma, nota }, req.user.id));
});

router.delete('/pagos/:id', escribir, async (req, res) => {
  if (!(await ControlModel.borrarPago(req.params.id))) return res.status(404).json({ error: 'Pago no encontrado' });
  res.status(204).end();
});

router.put('/:empresaId/documentos-requeridos', escribir, async (req, res) => {
  const lista = req.body && req.body.nombres;
  if (!Array.isArray(lista)) return res.status(400).json({ error: 'nombres debe ser una lista' });
  const nombres = [...new Set(lista.map(n => String(n || '').trim()).filter(Boolean))];
  if (nombres.some(n => n.length > 150)) return res.status(400).json({ error: 'Nombre de documento demasiado largo' });
  const empresa = ID_RE.test(req.params.empresaId) && await EmpresaModel.findById(req.params.empresaId);
  if (!empresa) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(await ControlModel.reemplazarRequeridos(empresa.id, nombres));
});

router.post('/:empresaId/documentos/:requeridoId/recibido', escribir, upload.single('archivo'), async (req, res) => {
  const fallar = (status, error) => { borrarSubido(req.file); res.status(status).json({ error }); };
  if (!ID_RE.test(req.params.empresaId) || !ID_RE.test(req.params.requeridoId)) return fallar(400, 'Parámetro inválido');
  const body = req.body || {};
  const fecha = body.fecha_recibido || hoyMx();
  if (!PERIODO_RE.test(body.periodo || '')) return fallar(400, 'Periodo inválido (AAAA-MM)');
  if (!FECHA_RE.test(fecha)) return fallar(400, 'Fecha inválida (AAAA-MM-DD)');
  const reqd = await ControlModel.findRequerido(req.params.empresaId, req.params.requeridoId);
  if (!reqd) return fallar(404, 'Documento no encontrado');
  try {
    res.status(201).json(await ControlModel.marcarRecibido(reqd.id, body.periodo, fecha,
      req.file ? relativa(req.file.path) : null, req.file ? req.file.originalname : null));
  } catch (err) {
    borrarSubido(req.file);
    throw err;   // 23505 → 409
  }
});

router.delete('/recibidos/:id', escribir, async (req, res) => {
  const d = await ControlModel.borrarRecibido(req.params.id);
  if (!d) return res.status(404).json({ error: 'Registro no encontrado' });
  if (d.archivo) fs.unlink(absoluta(d.archivo), () => {});
  res.status(204).end();
});

router.get('/recibidos/:id/archivo', async (req, res) => {
  const d = await ControlModel.findRecibido(req.params.id);
  if (!d || !d.archivo) return res.status(404).json({ error: 'Este documento no tiene archivo' });
  const ruta = absoluta(d.archivo);
  if (!fs.existsSync(ruta)) return res.status(404).json({ error: 'El archivo ya no existe en el servidor. Por favor vuelve a subirlo.' });
  res.download(ruta, d.nombre_original || path.basename(ruta));
});

router.post('/:empresaId/bitacora', escribir, async (req, res) => {
  const { periodo, texto } = req.body || {};
  if (!PERIODO_RE.test(periodo || '')) return res.status(400).json({ error: 'Periodo inválido (AAAA-MM)' });
  if (!String(texto || '').trim()) return res.status(400).json({ error: 'La nota está vacía' });
  const empresa = ID_RE.test(req.params.empresaId) && await EmpresaModel.findById(req.params.empresaId);
  if (!empresa) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.status(201).json(await ControlModel.crearNota(empresa.id, periodo, String(texto).trim(), req.user.id));
});

router.delete('/bitacora/:id', escribir, async (req, res) => {
  if (!(await ControlModel.borrarNota(req.params.id))) return res.status(404).json({ error: 'Nota no encontrada' });
  res.status(204).end();
});

module.exports = router;
