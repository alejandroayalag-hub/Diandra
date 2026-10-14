const pool = require('../db/pool');

// semanas_pago es tabla raíz; pagos hereda empresa por su semana.
const PagoModel = {
  async crearSemana(empresaId, { semana, anio, filename, ruta, total_registros }) {
    const { rows } = await pool.query(
      `INSERT INTO semanas_pago (empresa_id, semana, anio, filename, ruta, total_registros)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [empresaId, semana, anio, filename, ruta, total_registros]
    );
    return rows[0];
  },

  async findSemanas(empresaId) {
    const { rows } = await pool.query(
      'SELECT * FROM semanas_pago WHERE empresa_id = $1 ORDER BY anio DESC, semana DESC', [empresaId]);
    return rows;
  },

  async findSemanaById(empresaId, id) {
    const { rows } = await pool.query('SELECT * FROM semanas_pago WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rows[0] || null;
  },

  async semanaExiste(empresaId, semana, anio) {
    const { rows } = await pool.query(
      'SELECT id FROM semanas_pago WHERE empresa_id = $1 AND semana = $2 AND anio = $3', [empresaId, semana, anio]);
    return rows[0] || null;
  },

  // ids de empleados que sí son de la empresa — para descartar ids ajenos que mande el cliente.
  async empleadosDeEmpresa(empresaId, ids) {
    if (!ids.length) return new Set();
    const { rows } = await pool.query(
      'SELECT id FROM empleados WHERE empresa_id = $1 AND id = ANY($2::int[])', [empresaId, ids]);
    return new Set(rows.map(r => r.id));
  },

  // El caller garantiza semana_pago_id y empleado_id de la empresa activa.
  async insertarPagos(registros) {
    if (!registros.length) return [];
    const values = registros.map((r, i) => {
      const base = i * 6;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    }).join(', ');
    const params = registros.flatMap(r => [
      r.semana_pago_id, r.empleado_id || null, r.nombre_pdf, r.cuenta || null, r.monto || null, r.autorizado || null,
    ]);
    const { rows } = await pool.query(
      `INSERT INTO pagos (semana_pago_id, empleado_id, nombre_pdf, cuenta, monto, autorizado)
       VALUES ${values} RETURNING *`,
      params
    );
    return rows;
  },

  async findByEmpleado(empresaId, empleadoId) {
    const { rows } = await pool.query(
      `SELECT p.*, sp.semana, sp.anio, sp.filename AS pdf_filename
       FROM pagos p
       JOIN semanas_pago sp ON sp.id = p.semana_pago_id
       WHERE sp.empresa_id = $1 AND p.empleado_id = $2
       ORDER BY sp.anio DESC, sp.semana DESC`,
      [empresaId, empleadoId]
    );
    return rows;
  },

  async findBySemana(empresaId, semanaId) {
    const { rows } = await pool.query(
      `SELECT p.*, e.nombre, e.apellido_paterno, e.apellido_materno
       FROM pagos p
       JOIN semanas_pago sp ON sp.id = p.semana_pago_id
       LEFT JOIN empleados e ON e.id = p.empleado_id
       WHERE sp.empresa_id = $1 AND p.semana_pago_id = $2
       ORDER BY p.nombre_pdf`,
      [empresaId, semanaId]
    );
    return rows;
  },

  async deleteSemana(empresaId, id) {
    const { rows } = await pool.query(
      'DELETE FROM semanas_pago WHERE empresa_id = $1 AND id = $2 RETURNING *', [empresaId, id]);
    return rows[0] || null;
  },
};

module.exports = PagoModel;
