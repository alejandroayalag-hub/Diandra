const pool = require('../db/pool');

const EDITABLES = ['fecha_salida', 'tipo_salida', 'razon_salida', 'salario_pendiente', 'estado', 'documentos_firmados'];

const SalidaModel = {
  async findAll(empresaId, filters = {}) {
    const params = [empresaId];
    let query = 'SELECT * FROM salidas WHERE empresa_id = $1';
    if (filters.empleadoId) { params.push(filters.empleadoId); query += ` AND empleado_id = $${params.length}`; }
    if (filters.estado) { params.push(filters.estado); query += ` AND estado = $${params.length}`; }
    query += ' ORDER BY fecha_salida DESC';
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async findById(empresaId, id) {
    const { rows } = await pool.query('SELECT * FROM salidas WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rows[0] || null;
  },

  async create(empresaId, data) {
    const {
      empleadoId, fechaSalida, tipoSalida, razonSalida,
      salarioPendiente = 0, estado = 'pendiente', documentosFirmados = false, createdBy,
    } = data;
    const { rows } = await pool.query(
      `INSERT INTO salidas
        (empleado_id, empresa_id, fecha_salida, tipo_salida, razon_salida,
         salario_pendiente, estado, documentos_firmados, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [empleadoId, empresaId, fechaSalida, tipoSalida, razonSalida, salarioPendiente, estado, documentosFirmados, createdBy]
    );
    return rows[0];
  },

  async update(empresaId, id, data) {
    const updates = {};
    Object.keys(data).forEach((key) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase → snake_case
      if (EDITABLES.includes(snakeKey)) updates[snakeKey] = data[key];
    });
    const fields = Object.keys(updates);
    if (!fields.length) return this.findById(empresaId, id);
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE salidas SET ${set}, updated_at = NOW()
       WHERE empresa_id = $${fields.length + 1} AND id = $${fields.length + 2} RETURNING *`,
      [...fields.map(f => updates[f]), empresaId, id]
    );
    return rows[0] || null;
  },

  async delete(empresaId, id) {
    await pool.query('DELETE FROM salidas WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
  },

  async findByEmpleadoId(empresaId, empleadoId) {
    return this.findAll(empresaId, { empleadoId });
  },

  async findByEstado(empresaId, estado) {
    return this.findAll(empresaId, { estado });
  },
};

module.exports = SalidaModel;
