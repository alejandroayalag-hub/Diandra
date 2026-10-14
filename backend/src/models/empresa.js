const pool = require('../db/pool');

const CAMPOS = ['razon_social', 'nombre_comercial', 'rfc', 'registro_patronal', 'representante_legal',
  'domicilio', 'colonia', 'cp', 'ciudad', 'giro',
  'tipo_persona', 'contacto_nombre', 'contacto_telefono', 'contacto_whatsapp', 'monto_facturacion', 'condiciones_pago'];

// '' y undefined → NULL; 0 se conserva (monto_facturacion puede ser 0).
const valor = v => (v === '' || v === undefined ? null : v);

// Persona moral (3 letras) o física (4 letras) + fecha AAMMDD + homoclave de 3.
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

function normalizarRfc(rfc) {
  const v = String(rfc || '').trim().toUpperCase();
  return RFC_RE.test(v) ? v : null;
}

const SELECT = `
  SELECT e.*, (SELECT count(*)::int FROM empleados em WHERE em.empresa_id = e.id AND em.estado = 'activo') AS empleados_activos
  FROM empresas e`;

const EmpresaModel = {
  async findAll() {
    const { rows } = await pool.query(`${SELECT} ORDER BY e.activo DESC, e.razon_social`);
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(`${SELECT} WHERE e.id = $1`, [id]);
    return rows[0] || null;
  },

  async create(data) {
    const values = CAMPOS.map(c => valor(data[c]));
    const { rows } = await pool.query(
      `INSERT INTO empresas (${CAMPOS.join(', ')}) VALUES (${CAMPOS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      values
    );
    return rows[0];
  },

  async update(id, data) {
    const fields = CAMPOS.filter(c => c in data);
    if (!fields.length) return this.findById(id);
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE empresas SET ${set} WHERE id = $${fields.length + 1} RETURNING *`,
      [...fields.map(f => valor(data[f])), id]
    );
    return rows[0] || null;
  },

  async setActivo(id, activo) {
    const { rows } = await pool.query('UPDATE empresas SET activo = $1 WHERE id = $2 RETURNING *', [activo, id]);
    return rows[0] || null;
  },
};

const EmpresaDocumentoModel = {
  async create(empresaId, tipo, archivo, nombreOriginal) {
    const { rows } = await pool.query(
      'INSERT INTO empresa_documentos (empresa_id, tipo, archivo, nombre_original) VALUES ($1,$2,$3,$4) RETURNING *',
      [empresaId, tipo, archivo, nombreOriginal]);
    return rows[0];
  },

  async porEmpresa(empresaId) {
    const { rows } = await pool.query(
      'SELECT * FROM empresa_documentos WHERE empresa_id = $1 ORDER BY created_at DESC, id DESC', [empresaId]);
    return rows;
  },

  async findById(empresaId, id) {
    const { rows } = await pool.query('SELECT * FROM empresa_documentos WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rows[0] || null;
  },
};

module.exports = { EmpresaModel, EmpresaDocumentoModel, normalizarRfc };
