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
        return res.status(201).json({
            message: 'Orden registrada exitosamente',
            pedido_id: resultado.insertId
        });
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