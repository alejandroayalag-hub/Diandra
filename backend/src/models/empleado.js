const pool = require('../db/pool');

// Lista explícita de campos editables — evita inyectar empresa_id, updated_at, id, created_at, etc.
const EDITABLES = [
  'nombre', 'apellido_paterno', 'apellido_materno', 'curp', 'rfc',
  'fecha_nacimiento', 'fecha_ingreso', 'puesto', 'departamento',
  'telefono', 'email', 'direccion', 'nombre_beneficiario', 'observaciones',
  'estatus', 'estado', 'foto',
  'contacto_emergencia_nombre', 'contacto_emergencia_telefono',
];

const EmpleadoModel = {
  async findAll(empresaId, { estado } = {}) {
    const params = [empresaId];
    let query = 'SELECT * FROM empleados WHERE empresa_id = $1';
    if (estado) {
      params.push(estado);
      query += ` AND estado = $${params.length}`;
    }
    query += ' ORDER BY apellido_paterno, nombre';
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async findById(empresaId, id) {
    const { rows } = await pool.query('SELECT * FROM empleados WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rows[0] || null;
  },

  async create(empresaId, data) {
    const {
      nombre, apellido_paterno, apellido_materno, curp, rfc,
      fecha_nacimiento, fecha_ingreso, puesto, departamento,
      telefono, email, direccion, nombre_beneficiario, observaciones, estatus, estado,
    } = data;
    const { rows } = await pool.query(
      `INSERT INTO empleados
        (empresa_id, nombre, apellido_paterno, apellido_materno, curp, rfc,
         fecha_nacimiento, fecha_ingreso, puesto, departamento,
         telefono, email, direccion, nombre_beneficiario, observaciones, estatus, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [empresaId, nombre, apellido_paterno, apellido_materno, curp || null, rfc || null,
       fecha_nacimiento || null, fecha_ingreso, puesto || null, departamento || null,
       telefono || null, email, direccion || null,
       nombre_beneficiario || null, observaciones || null, estatus || 'activo', estado || 'activo']
    );
    return rows[0];
  },

  async update(empresaId, id, data) {
    const fields = Object.keys(data).filter(k => EDITABLES.includes(k));
    if (!fields.length) return this.findById(empresaId, id);
    const values = fields.map(f => data[f] || null);
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE empleados SET ${set}, updated_at = NOW()
       WHERE empresa_id = $${fields.length + 1} AND id = $${fields.length + 2} RETURNING *`,
      [...values, empresaId, id]
    );
    return rows[0] || null;
  },

  async delete(empresaId, id) {
    const { rowCount } = await pool.query('DELETE FROM empleados WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rowCount > 0;
  },
};

module.exports = EmpleadoModel;
