const express = require('express');
const router = express.Router();
const multer = require('multer');

const SalonController = require('../Controllers/SalonesController');

const upload = multer({

    // Guardar temporalmente las fotografías en memoria.
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 8
    },

    // Permitir únicamente estos formatos.
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


router.get(
    '/salones',
    SalonController.listar
);


router.get(
    '/salones/detalle/:id',
    SalonController.obtenerPorId
);


router.post(
    '/salones/crear',
    upload.array('imagenes', 8),
    SalonController.crear
);


router.post(
    '/salones/editar/:id',
    SalonController.actualizar
);

router.post(
    '/salones/estado/:id',
    SalonController.cambiarActivo
);

router.post(
    '/salones/:id/imagenes/agregar',
    upload.single('imagen'),
    SalonController.agregarImagen
);

router.post(
    '/salones/:id/imagenes/:imagenId/portada',
    SalonController.establecerPortada
);

router.post(
    '/salones/:id/imagenes/:imagenId/reemplazar',
    upload.single('imagen'),
    SalonController.reemplazarImagen
);

router.post(
    '/salones/:id/imagenes/:imagenId/eliminar',
    SalonController.eliminarImagen
);

router.use((error, req, res, next) => {

    if (error instanceof multer.MulterError) {

        const mensajes = {

            LIMIT_FILE_SIZE:
                'Cada fotografía debe pesar máximo 5 MB.',

            LIMIT_FILE_COUNT:
                'Puedes subir máximo 8 fotografías.',

            LIMIT_UNEXPECTED_FILE:
                'Cantidad de fotografías o campo de archivo incorrecto.'
        };

        return res.status(400).send(
            mensajes[error.code] ||
            'No se pudieron subir las fotografías.'
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