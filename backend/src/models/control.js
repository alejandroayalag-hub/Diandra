const pool = require('../db/pool');

// Por defecto a cada cliente; Nómina e IMSS solo si tiene registro patronal.
const DOCUMENTOS_DEFAULT = [['XML emitidos', false], ['XML recibidos', false], ['Estado de cuenta bancario', false], ['Nómina', true], ['IMSS', true]];

const ControlModel = {
  // Clientes activos (o uno, aunque esté inactivo) con lo necesario para su estado de cuenta (suma de pagos basta, ver lib/honorarios).
  async clientes(empresaId = null) {
    const { rows } = await pool.query(
      `SELECT e.id AS empresa_id, e.razon_social, e.monto_facturacion AS honorario,
         COALESCE(e.cobro_desde, to_char(e.created_at AT TIME ZONE 'America/Mexico_City', 'YYYY-MM')) AS cobro_desde,
         COALESCE((SELECT sum(p.monto) FROM honorario_pagos p WHERE p.empresa_id = e.id), 0) AS total_pagado
       FROM empresas e WHERE (($1::int IS NULL AND e.activo) OR e.id = $1) ORDER BY e.razon_social`, [empresaId]);
    return rows;
  },

  // Siembra la lista por defecto a quien nunca ha tenido una (clientes viejos y nuevos, sin tocar el alta).
  async asegurarRequeridos(empresaIds) {
    await pool.query(
      `INSERT INTO documentos_requeridos (empresa_id, nombre)
       SELECT e.id, d.nombre FROM empresas e
       CROSS JOIN unnest($2::text[], $3::bool[]) AS d(nombre, patronal)
       WHERE e.id = ANY($1::int[]) AND (NOT d.patronal OR COALESCE(btrim(e.registro_patronal), '') <> '')
         AND NOT EXISTS (SELECT 1 FROM documentos_requeridos r WHERE r.empresa_id = e.id)
       ON CONFLICT DO NOTHING`,
      [empresaIds, DOCUMENTOS_DEFAULT.map(d => d[0]), DOCUMENTOS_DEFAULT.map(d => d[1])]);
  },

  // Requeridos activos con su recepción del periodo.
  async documentosDelMes(empresaIds, periodo) {
    const { rows } = await pool.query(
      `SELECT r.id AS requerido_id, r.empresa_id, r.nombre, d.id AS recibido_id,
         d.fecha_recibido::text AS fecha_recibido, (d.archivo IS NOT NULL) AS tiene_archivo, d.nombre_original
       FROM documentos_requeridos r
       LEFT JOIN documentos_recibidos d ON d.requerido_id = r.id AND d.periodo = $2
       WHERE r.activo AND r.empresa_id = ANY($1::int[]) ORDER BY r.id`, [empresaIds, periodo]);
    return rows;
  },

  async conteoBitacora(periodo) {
    const { rows } = await pool.query(
      'SELECT empresa_id, count(*)::int AS n FROM bitacora WHERE periodo = $1 GROUP BY empresa_id', [periodo]);
    return new Map(rows.map(r => [r.empresa_id, r.n]));
  },

  async pagos(empresaId) {
    const { rows } = await pool.query(
      `SELECT p.id, p.monto, p.fecha_pago::text AS fecha_pago, p.forma_pago, p.nota, u.nombre AS registro
       FROM honorario_pagos p LEFT JOIN usuarios u ON u.id = p.created_by
       WHERE p.empresa_id = $1 ORDER BY p.fecha_pago DESC, p.id DESC`, [empresaId]);
    return rows;
  },

  async crearPago(empresaId, { monto, fecha_pago, forma_pago, nota }, usuarioId) {
    const { rows } = await pool.query(
      `INSERT INTO honorario_pagos (empresa_id, monto, fecha_pago, forma_pago, nota, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, monto, fecha_pago::text AS fecha_pago, forma_pago, nota`,
      [empresaId, monto, fecha_pago, forma_pago || null, nota || null, usuarioId]);
    return rows[0];
  },

  async borrarPago(id) {
    const { rowCount } = await pool.query('DELETE FROM honorario_pagos WHERE id = $1', [id]);
    return rowCount > 0;
  },

  async requeridos(empresaId) {
    const { rows } = await pool.query(
      'SELECT id, nombre FROM documentos_requeridos WHERE empresa_id = $1 AND activo ORDER BY id', [empresaId]);
    return rows;
  },

  // Upsert por nombre; los que no vienen se desactivan (conservan lo recibido).
  async reemplazarRequeridos(empresaId, nombres) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO documentos_requeridos (empresa_id, nombre) SELECT $1, unnest($2::text[])
         ON CONFLICT (empresa_id, nombre) DO UPDATE SET activo = true`, [empresaId, nombres]);
      await client.query(
        'UPDATE documentos_requeridos SET activo = false WHERE empresa_id = $1 AND NOT (nombre = ANY($2::text[]))',
        [empresaId, nombres]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.requeridos(empresaId);
  },

  async findRequerido(empresaId, id) {
    const { rows } = await pool.query('SELECT * FROM documentos_requeridos WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rows[0] || null;
  },

  async marcarRecibido(requeridoId, periodo, fecha, archivo, nombreOriginal) {
    const { rows } = await pool.query(
      `INSERT INTO documentos_recibidos (requerido_id, periodo, fecha_recibido, archivo, nombre_original)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, requerido_id, periodo, fecha_recibido::text AS fecha_recibido`,
      [requeridoId, periodo, fecha, archivo, nombreOriginal]);
    return rows[0];
  },

  async findRecibido(id) {
    const { rows } = await pool.query('SELECT * FROM documentos_recibidos WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async borrarRecibido(id) {
    const { rows } = await pool.query('DELETE FROM documentos_recibidos WHERE id = $1 RETURNING *', [id]);
    return rows[0] || null;
  },

  async bitacora(empresaId, periodo) {
    const { rows } = await pool.query(
      `SELECT b.id, b.texto, b.created_at, u.nombre AS autor FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id
       WHERE b.empresa_id = $1 AND b.periodo = $2 ORDER BY b.created_at DESC, b.id DESC`, [empresaId, periodo]);
    return rows;
  },

  async crearNota(empresaId, periodo, texto, usuarioId) {
    const { rows } = await pool.query(
      'INSERT INTO bitacora (empresa_id, periodo, texto, usuario_id) VALUES ($1,$2,$3,$4) RETURNING id, texto, created_at',
      [empresaId, periodo, texto, usuarioId]);
    return rows[0];
  },

  async borrarNota(id) {
    const { rowCount } = await pool.query('DELETE FROM bitacora WHERE id = $1', [id]);
    return rowCount > 0;
  },
};

module.exports = ControlModel;
