const pool = require('../db/pool');

const COLS = `a.id, a.fecha::text AS fecha, to_char(a.hora, 'HH24:MI') AS hora, a.titulo, a.tipo, a.empresa_id,
  e.razon_social, a.notas`;
const CAMPOS = ['fecha', 'hora', 'titulo', 'tipo', 'empresa_id', 'notas'];
const valor = v => (v === '' || v === undefined ? null : v);

const AgendaModel = {
  async rango(desde, hasta) {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM agenda_eventos a LEFT JOIN empresas e ON e.id = a.empresa_id
       WHERE a.fecha BETWEEN $1 AND $2 ORDER BY a.fecha, a.hora NULLS FIRST, a.id`, [desde, hasta]);
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM agenda_eventos a LEFT JOIN empresas e ON e.id = a.empresa_id WHERE a.id = $1`, [id]);
    return rows[0] || null;
  },

  async create(data, usuarioId) {
    const { rows } = await pool.query(
      `INSERT INTO agenda_eventos (${CAMPOS.join(', ')}, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [...CAMPOS.map(c => valor(data[c])), usuarioId]);
    return this.findById(rows[0].id);
  },

  async update(id, data) {
    const { rowCount } = await pool.query(
      `UPDATE agenda_eventos SET ${CAMPOS.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${CAMPOS.length + 1}`,
      [...CAMPOS.map(c => valor(data[c])), id]);
    return rowCount ? this.findById(id) : null;
  },

  async remove(id) {
    const { rowCount } = await pool.query('DELETE FROM agenda_eventos WHERE id = $1', [id]);
    return rowCount > 0;
  },
};

module.exports = AgendaModel;
