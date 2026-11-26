const AgendaEventosModel = require('../models/AgendaEventosModel');

class GestionRentasController {
    static menuInflables(req, res) {
        return res.render('MenuInflables', { user: req.user });
    }
    static calendarioEventos(req, res) {
        return res.render('CalendarioEventos', { user: req.user });
    }
    static async datosCalendario(req, res) {
        res.set('Cache-Control', 'no-store');
        const mes = req.query.mes;
        if (typeof mes !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(mes)) {
            return res.status(400).json({ error: 'Selecciona un mes válido.' });
        }
        const [anio, numero] = mes.split('-').map(Number);
        const inicio = mes + '-01 00:00:00';
        const siguiente = `${numero === 12 ? anio + 1 : anio}-${String(numero === 12 ? 1 : numero + 1).padStart(2, '0')}-01 00:00:00`;
        try {
            return res.json(await AgendaEventosModel.consultar(inicio, siguiente));
        } catch (error) {
            console.error('CALENDARIO DE EVENTOS:', error);
            return res.status(500).json({ error: 'No se pudo cargar el calendario. Revisa la consola de Docker.' });
        }
    }
}
module.exports = GestionRentasController;
