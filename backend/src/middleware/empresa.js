const pool = require('../db/pool');

module.exports = async function empresaMiddleware(req, res, next) {
  const raw = req.get('X-Empresa-Id');
  if (!raw || !/^\d+$/.test(raw)) {
    return res.status(400).json({ error: 'Selecciona una empresa', code: 'EMPRESA_REQUERIDA' });
  }
  const { rows } = await pool.query('SELECT id FROM empresas WHERE id = $1 AND activo = true', [Number(raw)]);
  if (!rows.length) {
    return res.status(404).json({ error: 'Empresa no encontrada o inactiva', code: 'EMPRESA_INVALIDA' });
  }
  req.empresaId = rows[0].id;
  next();
};
