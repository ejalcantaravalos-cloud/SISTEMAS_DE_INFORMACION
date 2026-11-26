// Motivos permitidos. El servidor valida las opciones del formulario.
const cliente = [
    'Cambio de planes',
    'Error en la reservación o pedido',
    'Ya no requiere el servicio',
    'Otro motivo'
];

const negocio = {
    eventos: [
        'Salón fuera de servicio',
        'Trampolín fuera de servicio',
        'Problemas en las instalaciones',
        'Error en la reservación',
        'Otro motivo'
    ],
    inflables: [
        'Trampolín fuera de servicio',
        'Inflable dañado',
        'Problemas de instalación',
        'Error en la reservación',
        'Otro motivo'
    ],
    restaurante: [
        'Carne insuficientemente cocida',
        'No era lo que el cliente pidió',
        'Alimentos en mal estado',
        'Pedido incompleto',
        'Error en la preparación',
        'Otro motivo'
    ]
};

module.exports = { cliente, negocio };
