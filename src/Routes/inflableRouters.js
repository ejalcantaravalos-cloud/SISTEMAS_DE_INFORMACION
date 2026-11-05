
const express = require('express');
const router = express.Router();
const multer = require('multer');

const InflableController = require('../Controllers/InflableController');

// Configurar subida de imágenes
const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {
        const formatos = [
            'image/jpeg',
            'image/png',
            'image/webp'
        ];

        if (formatos.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de imagen no permitido'));
        }
    }
});

// Rutas de inflables
router.get('/inflables', InflableController.listar);
router.post('/inflables/editar/:id', InflableController.actualizar);

router.get(
    '/inflables/catalogo',
    InflableController.obtenerCatalogoPublico
);

// Crear inflable con fotografía
router.post(
    '/inflables/crear',
    upload.single('imagen'),
    InflableController.crear
);

// Eliminar inflable
router.get(
    '/inflables/eliminar/:id',
    InflableController.eliminar
);

// Errores al subir archivos
router.use((error, req, res, next) => {
    if (
        error instanceof multer.MulterError ||
        error.message === 'Formato de imagen no permitido'
    ) {
        return res.status(400).send(
            'No se pudo subir la fotografía: ' + error.message
        );
    }

    next(error);
    
});



module.exports = router;