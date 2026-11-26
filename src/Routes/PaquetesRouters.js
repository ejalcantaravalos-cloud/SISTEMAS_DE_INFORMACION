const express = require('express');
const router = express.Router();
const multer = require('multer');

const PaquetesController =
    require('../Controllers/PaquetesController');


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


// LISTAR

router.get(
    '/',
    PaquetesController.listar
);


// CREAR

router.post(
    '/crear',
    upload.single('imagen'),
    PaquetesController.crear
);


// ACTUALIZAR

router.post(
    '/editar/:id',
    upload.single('imagen'),
    PaquetesController.actualizar
);


// ACTIVAR O DESACTIVAR

router.post(
    '/estado/:id',
    PaquetesController.cambiarActivo
);

// ELIMINAR FOTOGRAFÍA
router.post(
    '/:id/imagen/eliminar',
    PaquetesController.eliminarImagen
);

// ERRORES DE MULTER

router.use((error, req, res, next) => {

    if (
        error instanceof multer.MulterError ||
        error.message === 'Formato de imagen no permitido'
    ) {

        return res.redirect(
            303,
            '/rentas/paquetes?aviso=error_imagen'
        );
    }

    next(error);
});


module.exports = router;