const express = require('express');
const multer = require('multer');

const RentaInflablesController = require('../Controllers/RentaInflablesController');
const authController = require('../Controllers/AuthController');

const router = express.Router();

router.use(
    authController.hasRole([
        'Administrador',
        'Cajero rentas',
        'Cajero restaurante'
    ])
);

const pdf = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 8 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se aceptan archivos PDF.'));
        }
    }
});


router.get(
    '/inflables/caja',
    RentaInflablesController.inicio
);


router.get(
    '/inflables/caja/eventos',
    RentaInflablesController.eventos
);


router.get(
    '/inflables/caja/disponibilidad',
    RentaInflablesController.disponibilidad
);


router.post(
    '/inflables/caja/reservar',
    RentaInflablesController.reservar
);


router.post(
    '/inflables/caja/reservaciones/:id/contrato',
    pdf.single('contrato_firmado'),
    RentaInflablesController.subirContrato
);



router.use((error, req, res, next) => {

    if (
        error instanceof multer.MulterError ||
        error.message === 'Solo se aceptan archivos PDF.'
    ) {
        return res.status(400).send(
            'No se pudo subir el contrato: ' +
            error.message
        );
    }

    next(error);
});

module.exports = router;
