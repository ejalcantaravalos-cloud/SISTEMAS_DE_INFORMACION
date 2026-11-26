const express = require('express');
const router = express.Router();
const multer = require('multer');

const MantelesController =
    require('../Controllers/MantelesController');


// CONFIGURACIÓN DE MULTER

const upload = multer({

    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
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
// LISTAR MANTELES
router.get(
    '/',
    MantelesController.listar
);


// OBTENER DETALLES

router.get(
    '/detalle/:id',
    MantelesController.obtenerPorId
);

// CREAR MANTEL

router.post(
    '/crear',
    upload.single('imagen'),
    MantelesController.crear
);


// EDITAR MANTEL

router.post(
    '/editar/:id',
    upload.single('imagen'),
    MantelesController.actualizar
);


// CAMBIAR ESTADO
router.post(
    '/estado/:id',
    MantelesController.cambiarActivo
);


// ELIMINAR IMAGEN
router.post(
    '/:id/imagen/eliminar',
    MantelesController.eliminarImagen
);


// ERRORES DE MULTER

router.use((error, req, res, next) => {

    if (error instanceof multer.MulterError) {

        const mensajes = {
            LIMIT_FILE_SIZE: 'La imagen debe pesar máximo 5 MB.',
            LIMIT_FILE_COUNT: 'Solo puedes subir una imagen.',
            LIMIT_UNEXPECTED_FILE: 'Campo de imagen incorrecto.'
        };

        return res.status(400).send(
            mensajes[error.code] || 'Error al subir la imagen.'
        );
    }

    if (error.message === 'Formato de imagen no permitido') {

        return res.status(400).send(
            'Solo se permiten imágenes JPG, PNG o WEBP.'
        );
    }

    next(error);
});


module.exports = router;