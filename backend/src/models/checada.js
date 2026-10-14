const crypto = require('crypto');
const pool = require('../db/pool');

// checador_dispositivos es raíz; mapeos y checadas heredan por empleado/dispositivo.
const CheckadaModel = {
  async findByEmpleado(empresaId, empleadoId, { desde, hasta } = {}) {
    let query = `
      SELECT c.*, d.nombre AS dispositivo_nombre, d.ubicacion
      FROM checadas c
      JOIN checador_dispositivos d ON d.id = c.dispositivo_id
      WHERE d.empresa_id = $1 AND c.empleado_id = $2
    `;
    const params = [empresaId, empleadoId];
    if (desde) { params.push(desde); query += ` AND c.timestamp >= $${params.length}`; }
    if (hasta) { params.push(hasta); query += ` AND c.timestamp <= $${params.length}`; }
    query += ' ORDER BY c.timestamp DESC';
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async syncBatch(dispositivo, registros) {
    const insertadas = [];
    for (const r of registros) {
      // Solo mapeos a empleados de la misma empresa que el reloj
      const { rows: [mapa] } = await pool.query(
        `SELECT ce.empleado_id FROM checador_empleados ce
         JOIN empleados e ON e.id = ce.empleado_id
         WHERE ce.dispositivo_id = $1 AND ce.uid_checador = $2 AND e.empresa_id = $3`,
        [dispositivo.id, r.uid_checador, dispositivo.empresa_id]
      );
      if (!mapa) continue;
      const { rows: [checada] } = await pool.query(
        `INSERT INTO checadas (empleado_id, dispositivo_id, timestamp, tipo, uid_checador)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (dispositivo_id, uid_checador, timestamp) DO NOTHING
         RETURNING *`,
        [mapa.empleado_id, dispositivo.id, r.timestamp, r.tipo || 'desconocido', r.uid_checador]
      );
      if (checada) insertadas.push(checada);
    }
    return insertadas;
  },

  async getDispositivo(apiKey) {
    const { rows: [d] } = await pool.query(
      'SELECT * FROM checador_dispositivos WHERE api_key = $1 AND activo = true', [apiKey]);
    return d || null;
  },

  async getDispositivoDeEmpresa(empresaId, id) {
    const { rows: [d] } = await pool.query(
      'SELECT * FROM checador_dispositivos WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return d || null;
  },

  async getMappings(dispositivo) {
    const { rows } = await pool.query(
      `SELECT ce.uid_checador, e.id, e.nombre, e.apellido_paterno, e.apellido_materno
       FROM checador_empleados ce
       JOIN empleados e ON e.id = ce.empleado_id
       WHERE ce.dispositivo_id = $1 AND e.empresa_id = $2`,
      [dispositivo.id, dispositivo.empresa_id]
    );
    return rows;
  },

  // El caller valida que dispositivo y empleado son de la empresa activa.
  async upsertMapping(dispositivoId, empleadoId, uidChecador) {
    const { rows: [r] } = await pool.query(
      `INSERT INTO checador_empleados (dispositivo_id, empleado_id, uid_checador)
       VALUES ($1,$2,$3)
       ON CONFLICT (dispositivo_id, uid_checador) DO UPDATE SET empleado_id = EXCLUDED.empleado_id
       RETURNING *`,
      [dispositivoId, empleadoId, uidChecador]
    );
    return r;
  },

  async deleteMapping(empresaId, id) {
    const { rowCount } = await pool.query(
      `DELETE FROM checador_empleados ce USING checador_dispositivos d
       WHERE d.id = ce.dispositivo_id AND d.empresa_id = $1 AND ce.id = $2`,
      [empresaId, id]
    );
    return rowCount > 0;
  },

  async getAllMappings(empresaId) {
    const { rows } = await pool.query(
      `SELECT ce.id, ce.uid_checador,
              e.id AS empleado_id, e.nombre, e.apellido_paterno, e.apellido_materno, e.puesto,
              d.id AS dispositivo_id, d.nombre AS dispositivo_nombre, d.ubicacion
       FROM checador_empleados ce
       JOIN empleados e ON e.id = ce.empleado_id
       JOIN checador_dispositivos d ON d.id = ce.dispositivo_id
       WHERE d.empresa_id = $1
       ORDER BY d.nombre, ce.uid_checador`,
      [empresaId]
    );
    return rows;
  },

  async getAllDispositivos(empresaId) {
    const { rows } = await pool.query(
      'SELECT id, nombre, ubicacion, ip, activo FROM checador_dispositivos WHERE empresa_id = $1 ORDER BY nombre',
      [empresaId]
    );
    return rows;
  },

  async crearDispositivo(empresaId, { nombre, ubicacion, ip }) {
    const apiKey = crypto.randomBytes(32).toString('hex'); // 64 chars = VARCHAR(64)
    const { rows: [d] } = await pool.query(
      `INSERT INTO checador_dispositivos (empresa_id, nombre, ubicacion, ip, api_key)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [empresaId, nombre, ubicacion || null, ip || null, apiKey]
    );
    return d;
  },
};

module.exports = CheckadaModel;
