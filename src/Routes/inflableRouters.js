
const express = require('express');
const router = express.Router();
const multer = require('multer');

const InflableController = require('../Controllers/InflableController');


// CONFIGURAR SUBIDA DE IMÁGENES
const upload = multer({

    // Guardar temporalmente la fotografía en memoria
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    // Permitir únicamente estos formatos
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

// LISTAR INFLABLES PARA ADMINISTRACIÓN
router.get(
    '/inflables',
    InflableController.listar
);

// MOSTRAR CATÁLOGO PÚBLICO
router.get(
    '/inflables/catalogo',
    InflableController.obtenerCatalogoPublico
);

// CREAR INFLABLE CON FOTOGRAFÍA
router.post(
    '/inflables/crear',
    upload.single('imagen'),
    InflableController.crear
);

// ACTUALIZAR INFLABLE
router.post(
    '/inflables/editar/:id',
    upload.single('imagen'),
    InflableController.actualizar
);  

// ELIMINAR INFLABLE
router.post(
    '/inflables/eliminar/:id',
    InflableController.eliminar
); 


// MANEJAR ERRORES DE SUBIDA DE ARCHIVOS
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


// HABILITAR O DESHABILITAR
router.post(
    '/inflables/estado/:id',
    InflableController.cambiarActivo
);

module.exports = router;
