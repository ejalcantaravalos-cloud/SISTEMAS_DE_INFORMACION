'use strict';

const SeguimientoModel = require('../models/SeguimientoModel');
const Avisos = require('../utils/Avisos');

const mensajes = {
    orden_tomada: 'Orden tomada. La preparación puede comenzar.',
    orden_lista: 'Comanda marcada como lista para entregar.',
    orden_entregada: 'Entrega registrada correctamente.',
    error_conflicto: 'La comanda cambió o ya no está en el estado requerido. Revisa la lista actualizada.'
};

async function mostrar(req, res, vista, consultar) {
    try {
        const pedidos = await consultar();
        return res.render(vista, { user: req.user, pedidos, ...Avisos.obtener(req, mensajes) });
    } catch (error) {
        console.error('Error en seguimiento:', error);
        return res.status(500).render(vista, {
            user: req.user, pedidos: [], aviso: 'No se pudieron consultar los pedidos.', tipoAviso: 'error'
        });
    }
}

exports.mostrarCocina = (req, res) => mostrar(req, res, 'VistaCocinero', SeguimientoModel.listarCocina);
exports.mostrarMesero = (req, res) => mostrar(req, res, 'VistaMesero', SeguimientoModel.listarMesero);

async function cambiar(res, destino, accion, codigo) {
    try {
        await accion();
        return Avisos.exito(res, destino, codigo);
    } catch (error) {
        return Avisos.error(res, error, destino);
    }
}

exports.tomarPedido = (req, res) => cambiar(res, '/ordenes/cocina',
    () => SeguimientoModel.tomarPedido(req.params.id, req.body.version), 'orden_tomada');

exports.completarPedido = (req, res) => cambiar(res, '/ordenes/cocina',
    () => SeguimientoModel.marcarListo(req.params.id), 'orden_lista');

exports.entregarPedido = (req, res) => cambiar(res, '/ordenes/mesero',
    () => SeguimientoModel.marcarEntregado(req.params.id), 'orden_entregada');
