const router = require('express').Router();
const ctrl = require('../controllers/documentosController');
const upload = require('../middleware/upload');
const empresa = require('../middleware/empresa');

router.get('/tipos', ctrl.getTipos);   // catálogo compartido del despacho
router.use(empresa);                    // todo lo de abajo es por empresa
router.get('/empleado/:empleadoId', ctrl.getByEmpleado);
router.post('/upload', upload.single('archivo'), ctrl.upload);
router.get('/:id/download', ctrl.download);
router.delete('/:id', ctrl.remove);

module.exports = router;
