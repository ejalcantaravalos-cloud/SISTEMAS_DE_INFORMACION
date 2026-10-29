const InflableModel = require('../Models/InflableModel');

class InflableController {

    static async listar(req, res) {
        try {
            const inflables = await InflableModel.obtenerTodos();
            res.render('adminInflables', { user: req.user, inflables });
        } catch (error) {
            console.error("Error al listar inflables:", error);
            res.render('adminInflables', { user: req.user, inflables: [] });
        }
    }

    
    static async obtenerCatalogoPublico(req, res) {
        try {
            const inflables = await InflableModel.obtenerTodos();
            res.render('inflablesPublico', { user: req.user, inflables });
        } catch (error) {
            console.error("Error al cargar el catálogo público:", error);
            res.render('inflablesPublico', { user: req.user, inflables: [] });
        }
    }

  
    static async crear(req, res) {
        try {
            const { nombre, medidas_espacio, estado_disponibilidad } = req.body;
            await InflableModel.crear(nombre, medidas_espacio, estado_disponibilidad);
            res.redirect('/admin/inflables');
        } catch (error) {
            console.error("Error al crear inflable:", error);
            res.redirect('/admin/inflables');
        }
    }

    static async eliminar(req, res) {
        try {
            const { id } = req.params;
            await InflableModel.eliminar(id);
            res.redirect('/admin/inflables');
        } catch (error) {
            console.error("Error al eliminar inflable:", error);
            res.redirect('/admin/inflables');
        }
    }
}

module.exports = InflableController;