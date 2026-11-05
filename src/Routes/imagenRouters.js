const express = require('express');
const multer = require('multer');
const router = express.Router();

const ImagenController = require('../Controllers/ImagenController');

// Configurar Multer para recibir imágenes
const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024 // Máximo 5 MB
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

// Obtener todas las imágenes
router.get('/', ImagenController.getAll);

// Buscar imagen por título
router.get('/buscar', ImagenController.getByTitle);

// Crear imagen
router.post('/', upload.single('imagen'), ImagenController.create);

// Actualizar imagen
router.put('/:id', upload.single('imagen'), ImagenController.update);

// Eliminar imagen
router.delete('/:id', ImagenController.eliminar);

// Manejar errores de subida
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        return res.status(400).json({ error: error.message });
    }

    if (error.message === 'Formato de imagen no permitido') {
        return res.status(400).json({ error: error.message });
    }

    next(error);
});

module.exports = router;
