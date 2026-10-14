const pool = require('../db/pool');

// documentos hereda la empresa del empleado.
const DocumentoModel = {
  async findByEmpleado(empresaId, empleadoId) {
    const { rows } = await pool.query(
      `SELECT d.*, td.nombre AS tipo_nombre
       FROM documentos d
       JOIN tipos_documento td ON td.id = d.tipo_documento_id
       JOIN empleados e ON e.id = d.empleado_id
       WHERE e.empresa_id = $1 AND d.empleado_id = $2
       ORDER BY td.nombre`,
      [empresaId, empleadoId]
    );
    return rows;
  },

  async findById(empresaId, id) {
    const { rows } = await pool.query(
      `SELECT d.*, td.nombre AS tipo_nombre
       FROM documentos d
       JOIN tipos_documento td ON td.id = d.tipo_documento_id
       JOIN empleados e ON e.id = d.empleado_id
       WHERE e.empresa_id = $1 AND d.id = $2`,
      [empresaId, id]
    );
    return rows[0] || null;
  },

  // El caller debe haber validado que empleado_id es de la empresa activa.
  async upsert({ empleado_id, tipo_documento_id, filename, ruta, estatus }) {
    const { rows } = await pool.query(
      `INSERT INTO documentos (empleado_id, tipo_documento_id, filename, ruta, estatus)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (empleado_id, tipo_documento_id)
       DO UPDATE SET filename = EXCLUDED.filename, ruta = EXCLUDED.ruta,
                     estatus = EXCLUDED.estatus, updated_at = NOW()
       RETURNING *`,
      [empleado_id, tipo_documento_id, filename, ruta, estatus || 'completo']
    );
    return rows[0];
  },

  async delete(empresaId, id) {
    const { rows } = await pool.query(
      `DELETE FROM documentos d USING empleados e
       WHERE e.id = d.empleado_id AND e.empresa_id = $1 AND d.id = $2
       RETURNING d.ruta`,
      [empresaId, id]
    );
    return rows[0] || null;
  },

  async findTipos() {
    const { rows } = await pool.query('SELECT * FROM tipos_documento ORDER BY nombre');
    return rows;
  },
};

module.exports = DocumentoModel;
