const express = require('express');
const router = express.Router();
const multer = require('multer');

const SonidoController = require('../Controllers/SonidoController');

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

            cb(new Error(
                'Formato de imagen no permitido'
            ));
        }
    }
});


// LISTAR EQUIPOS

router.get(
    '/sonido',
    SonidoController.listar
);


// OBTENER DETALLES

router.get(
    '/sonido/detalle/:id',
    SonidoController.obtenerPorId
);


// REGISTRAR EQUIPO

router.post(
    '/sonido/crear',
    upload.single('imagen'),
    SonidoController.crear
);


// ACTUALIZAR EQUIPO

router.post(
    '/sonido/editar/:id',
    upload.single('imagen'),
    SonidoController.actualizar
);


// ACTIVAR O DESACTIVAR

router.post(
    '/sonido/estado/:id',
    SonidoController.cambiarActivo
);


// ELIMINAR FOTOGRAFÍA

router.post(
    '/sonido/:id/imagen/eliminar',
    SonidoController.eliminarImagen
);


// MANEJO DE ERRORES DE MULTER

router.use((error, req, res, next) => {

    if (error instanceof multer.MulterError) {

        const mensajes = {

            LIMIT_FILE_SIZE:
                'La fotografía debe pesar máximo 5 MB.',

            LIMIT_FILE_COUNT:
                'Solo puedes subir una fotografía.',

            LIMIT_UNEXPECTED_FILE:
                'Campo de fotografía incorrecto.'
        };

        return res.status(400).send(
            mensajes[error.code] ||
            'No se pudo subir la fotografía.'
        );
    }

    if (
        error.message === 'Formato de imagen no permitido'
    ) {

        return res.status(400).send(
            'Solo se permiten imágenes JPG, PNG o WEBP.'
        );
    }

    next(error);
});

module.exports = router;