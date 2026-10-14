const router = require('express').Router();
const ctrl = require('../controllers/checadasController');
const auth = require('../middleware/auth');
const empresa = require('../middleware/empresa');

// Rutas para el agente local (autenticadas por x-api-key; la empresa sale del dispositivo)
router.post('/sync', ctrl.sync);
router.get('/mappings/agente', ctrl.getMappings);

// Panel web: JWT + empresa activa
const panel = [auth, empresa];
router.get('/dispositivos', panel, ctrl.getDispositivos);
router.get('/mappings', panel, ctrl.getAllMappings);
router.post('/mappings', panel, ctrl.upsertMapping);
router.delete('/mappings/:id', panel, ctrl.deleteMapping);
router.get('/empleado/:empleadoId', panel, ctrl.getByEmpleado);

module.exports = router;
