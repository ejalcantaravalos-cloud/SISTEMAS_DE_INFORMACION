const conexion = require('../Database/db');

exports.mostrarCaja = (req, res) => {
    const query = "SELECT * FROM producto WHERE activo = TRUE";
    
    conexion.query(query, (error, resultados) => {
        if (error) {
            console.log("Error al consultar productos:", error);
            resultados = []; 
        }
    
        res.render('VistaCajero', { 
            user: req.user,        
            productos: resultados    
        });
    });
};


exports.crearOrden = async (req, res) => {
    const { tipo_orden, numero_mesa, nombre_cliente, nota, detalles } = req.body;
    const tipo = tipo_orden === 'Para llevar' ? 'Para llevar' : 'Mesa';
    const mesa = tipo === 'Mesa' ? Number(numero_mesa) : null;
    let items;

    try {
        items = JSON.parse(detalles);
    } catch (error) {
        return res.status(400).json({ error: 'Los productos de la orden no son válidos' });
    }

    if (!Array.isArray(items) || items.length === 0 ||
        items.some(item => !item ||
            !Number.isSafeInteger(Number(item.id)) || Number(item.id) < 1 ||
            !Number.isSafeInteger(Number(item.cantidad)) || Number(item.cantidad) < 1)) {
        return res.status(400).json({ error: 'Agrega al menos un producto válido a la orden' });
    }

    if (tipo === 'Mesa' && (!Number.isInteger(mesa) || mesa < 1)) {
        return res.status(400).json({ error: 'Indica un número de mesa válido' });
    }

    const cantidades = new Map();
    for (const item of items) {
        const id = Number(item.id);
        cantidades.set(id, (cantidades.get(id) || 0) + Number(item.cantidad));
    }

    const connection = await conexion.promise().getConnection();
    try {
        await connection.beginTransaction();

        const ids = [...cantidades.keys()];
        const [productos] = await connection.query(
            `SELECT id, precio FROM producto WHERE activo = TRUE AND id IN (${ids.map(() => '?').join(',')})`,
            ids
        );
        if (productos.length !== ids.length) {
            await connection.rollback();
            return res.status(400).json({ error: 'Uno o más productos ya no están disponibles' });
        }

        const precioPorId = new Map(productos.map(producto => [producto.id, Number(producto.precio)]));
        const totalCalculado = [...cantidades.entries()].reduce(
            (total, [id, cantidad]) => total + precioPorId.get(id) * cantidad,
            0
        );

        const [resultado] = await connection.query(
            `INSERT INTO pedido (id_usuario, tipo_orden, numero_mesa, nombre_cliente, total, nota, estado)
             VALUES (?, ?, ?, ?, ?, ?, 'Recibido')`,
            [req.user.id, tipo, mesa, nombre_cliente || null, totalCalculado, nota || '']
        );

        const detalleValues = [...cantidades.entries()].map(([id, cantidad]) => [
            resultado.insertId,
            id,
            cantidad,
            precioPorId.get(id)
        ]);
        await connection.query(
            'INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario) VALUES ?',
            [detalleValues]
        );

        await connection.commit();
   return res.redirect(
    303,
    `/ordenes/cobro/${resultado.insertId}`
);
    } catch (error) {
        await connection.rollback();
        console.error('Error al registrar el pedido:', error);
        return res.status(500).json({ error: 'No se pudo registrar la orden' });
    } finally {
        connection.release();
    }
};
    exports.listarPedidos = (req, res) => {
    const query = "SELECT * FROM pedido ORDER BY id DESC";
    conexion.query(query, (error, resultados) => {
        if (error) {
            console.error("Error al obtener pedidos:", error);
            resultados = [];
        }
        res.render('PedidoRegistro', { 
            user: req.user, 
            pedidos: resultados 
        });
    });
};

exports.mostrarCobro = async (req, res) => {
    const pedidoId = Number(req.params.id);

    if (!Number.isSafeInteger(pedidoId) || pedidoId < 1) {
        return res.status(400).send('ID de pedido inválido');
    }

    try {
        // Consultar la orden registrada
        const [ordenes] = await conexion.promise().query(
            `SELECT * FROM pedido
             WHERE id = ? AND id_usuario = ?`,
            [pedidoId, req.user.id]
        );

        if (ordenes.length === 0) {
            return res.status(404).send('Pedido no encontrado');
        }

        // Consultar los alimentos de esa orden
        const [productos] = await conexion.promise().query(
            `SELECT
                p.nombre,
                d.cantidad,
                d.precio_unitario AS precio
             FROM detalle_pedido d
             INNER JOIN producto p
                ON d.producto_id = p.id
             WHERE d.pedido_id = ?`,
            [pedidoId]
        );

        res.render('cobro', {
            user: req.user,
            orden: ordenes[0],
            productos,
            pagoActualizado: req.query.guardado === '1'
        });

    } catch (error) {
        console.error('Error al mostrar cobro:', error);
        res.status(500).send('Error al consultar la orden');
    }
};


// Registrar el estado ficticio del pago
exports.actualizarPago = async (req, res) => {
    const pedidoId = Number(req.params.id);
    const { estado_pago } = req.body;

    if (!Number.isSafeInteger(pedidoId) || pedidoId < 1) {
        return res.status(400).send('ID de pedido inválido');
    }

    if (!['Pagado', 'No pagado'].includes(estado_pago)) {
        return res.status(400).send('Estado de pago inválido');
    }

    try {
        const [resultado] = await conexion.promise().query(
            `UPDATE pedido
             SET estado_pago = ?
             WHERE id = ? AND id_usuario = ?`,
            [estado_pago, pedidoId, req.user.id]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).send('Pedido no encontrado');
        }

        return res.redirect(
            303,
            `/ordenes/cobro/${pedidoId}?guardado=1`
        );

    } catch (error) {
        console.error('Error al actualizar pago:', error);
        res.status(500).send('Error al registrar el pago');
    }
};
