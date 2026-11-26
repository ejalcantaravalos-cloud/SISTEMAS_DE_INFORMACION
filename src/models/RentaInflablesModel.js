
const db = require('../Database/db').promise();

function fallo(mensaje, status = 400) {
    const error = new Error(mensaje);
    error.status = status;
    return error;
}

// Validar fecha con formato YYYY-MM-DD
function fechaValida(valor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor || '')) {
        return false;
    }

    const fecha = new Date(`${valor}T00:00:00Z`);

    return !Number.isNaN(fecha.getTime()) &&
        fecha.toISOString().slice(0, 10) === valor;
}

// Sumar o restar días sin modificar la fecha original
function moverDias(fecha, dias) {
    const f = new Date(`${fecha}T00:00:00Z`);
    f.setUTCDate(f.getUTCDate() + dias);

    return f.toISOString().slice(0, 10);
}

// Calcular el periodo completo de ocupación del inflable
function periodo(fechaEvento, diaAnterior) {
    if (!fechaValida(fechaEvento)) {
        throw fallo('La fecha del evento no es válida.');
    }

    const fechaInstalacion = moverDias(
        fechaEvento,
        diaAnterior ? -1 : 0
    );

    return {
        fechaInstalacion,
        inicio: `${fechaInstalacion} 00:00:00`,
        fin: `${moverDias(fechaEvento, 1)} 00:00:00`
    };
}

// Política del anticipo mínimo, configurable
function anticipoMinimo(precio) {
    const configuracion =
        process.env.ANTICIPO_MINIMO_PORCENTAJE;

    if (
        configuracion === undefined ||
        configuracion === ''
    ) {
        return null;
    }

    const porcentaje = Number(configuracion);

    if (
        !Number.isFinite(porcentaje) ||
        porcentaje < 0 ||
        porcentaje > 100
    ) {
        throw new Error(
            'ANTICIPO_MINIMO_PORCENTAJE debe estar entre 0 y 100.'
        );
    }

    return Math.ceil(Number(precio) * porcentaje) / 100;
}


class CajaInflablesModel {

    // CATÁLOGO PARA EL CAJERO
    static async catalogo() {
        const [filas] = await db.query(
            `SELECT
                j.id,
                j.nombre,
                j.largo_m,
                j.ancho_m,
                j.alto_m,
                j.requisitos_instalacion,
                j.precio_completo,
                i.url AS imagen,

                (SELECT r.resultado
                 FROM revision_inflable r
                 WHERE r.inflable_id = j.id
                 ORDER BY r.fecha DESC, r.id DESC
                 LIMIT 1) AS ultima_revision

             FROM juegos_inflables j

             LEFT JOIN imagen_inflable i
                ON i.id = (
                    SELECT MIN(i2.id)
                    FROM imagen_inflable i2
                    WHERE i2.inflable_id = j.id
                )

             WHERE j.activo = 1
             ORDER BY j.nombre`
        );

        return filas.map(f => ({
            ...f,
            anticipo_minimo: anticipoMinimo(
                f.precio_completo
            )
        }));
    }


    // CONSULTAR RESERVACIONES DE UN MES
    static async reservasDelMes(mes) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '')) {
            throw fallo('Mes inválido.');
        }

        const desde = `${mes}-01`;

        const [anio, numeroMes] = mes.split('-').map(Number);

        const hasta = new Date(
            Date.UTC(anio, numeroMes, 1)
        ).toISOString().slice(0, 10);

        const [filas] = await db.query(
            `SELECT
                ri.id,
                ri.reservacion_id,
                ri.inflable_id,

                j.nombre AS inflable,
                c.nombre AS cliente,
                c.telefono,

                r.nombre_evento,
                r.tipo_evento,
                r.numero_invitados,
                r.evento_con_menores,

                ri.direccion_instalacion,
                ri.referencias_ubicacion,
                ri.tipo_lugar,
                ri.estado,
                ri.tarifa_acordada,

                DATE_FORMAT(
                    ri.inicio, '%Y-%m-%d'
                ) AS fecha_instalacion,

                DATE_FORMAT(
                    ri.fin - INTERVAL 1 SECOND,
                    '%Y-%m-%d'
                ) AS fecha_evento,

                (SELECT COALESCE(SUM(pa.importe), 0)
                 FROM pago_aplicacion pa
                 JOIN concepto_pago cp ON cp.id = pa.concepto_pago_id
                 WHERE pa.servicio_contratado_id =
                     ri.servicio_contratado_id
                   AND cp.codigo IN ('ANTICIPO', 'SALDO', 'TOTAL')
                ) AS pagado,

                EXISTS(
                    SELECT 1
                    FROM contrato ct
                    WHERE ct.reservacion_id =
                        ri.reservacion_id
                      AND ct.tipo = 'INFLABLE'
                      AND ct.archivo_pdf_url IS NOT NULL
                ) AS contrato_firmado

             FROM reservacion_inflable ri

             JOIN reservaciones r
                ON r.id = ri.reservacion_id

             JOIN clientes c
                ON c.id = r.cliente_id

             JOIN juegos_inflables j
                ON j.id = ri.inflable_id

             WHERE ri.inicio < ?
               AND ri.fin > ?
               AND ri.estado <> 'Cancelada'

             ORDER BY ri.inicio, ri.id`,
            [
                `${hasta} 00:00:00`,
                `${desde} 00:00:00`
            ]
        );

        return filas;
    }


    // CONSULTAR SI UN INFLABLE ESTÁ DISPONIBLE
    static async disponibilidad(
        inflableId,
        fechaEvento,
        diaAnterior
    ) {
        const rango = periodo(fechaEvento, diaAnterior);

        const [filas] = await db.query(
            `SELECT
                j.activo,

                (SELECT r.resultado
                 FROM revision_inflable r
                 WHERE r.inflable_id = j.id
                 ORDER BY r.fecha DESC, r.id DESC
                 LIMIT 1) AS ultima_revision,

                EXISTS(
                    SELECT 1
                    FROM reservacion_inflable ri
                    WHERE ri.inflable_id = j.id
                      AND ri.estado IN (
                          'Reservada', 'En uso'
                      )
                      AND ri.inicio < ?
                      AND ri.fin > ?
                ) AS ocupada

             FROM juegos_inflables j
             WHERE j.id = ?`,
            [
                rango.fin,
                rango.inicio,
                inflableId
            ]
        );

        if (!filas.length) {
            throw fallo('Inflable inexistente.', 404);
        }

        const info = filas[0];

        const requiereRevision = [
            'REQUIERE_LIMPIEZA',
            'MANTENIMIENTO',
            'FUERA_SERVICIO'
        ].includes(info.ultima_revision);

        return {
            disponible:
                Boolean(info.activo) &&
                !info.ocupada &&
                !requiereRevision,

            ocupada: Boolean(info.ocupada),
            requiere_revision: requiereRevision,
            fecha_instalacion: rango.fechaInstalacion
        };
    }


    // REGISTRAR RESERVACIÓN Y ANTICIPO
    static async reservar(datos) {
        const rango = periodo(
            datos.fecha_evento,
            datos.dia_anterior
        );

        const conexion = await db.getConnection();

        try {
            await conexion.beginTransaction();

            // Bloquear el inflable para evitar
            // dos registros simultáneos incompatibles
            const [inflables] = await conexion.query(
                `SELECT id, activo, precio_completo
                 FROM juegos_inflables
                 WHERE id = ?
                 FOR UPDATE`,
                [datos.inflable_id]
            );

            if (
                !inflables.length ||
                Number(inflables[0].activo) !== 1
            ) {
                throw fallo(
                    'El inflable no existe o está deshabilitado.',
                    409
                );
            }

            // Comprobar última revisión
            const [revisiones] = await conexion.query(
                `SELECT resultado
                 FROM revision_inflable
                 WHERE inflable_id = ?
                 ORDER BY fecha DESC, id DESC
                 LIMIT 1`,
                [datos.inflable_id]
            );

            if (
                revisiones.length &&
                [
                    'REQUIERE_LIMPIEZA',
                    'MANTENIMIENTO',
                    'FUERA_SERVICIO'
                ].includes(revisiones[0].resultado)
            ) {
                throw fallo(
                    'El inflable necesita limpieza o revisión antes de rentarse.',
                    409
                );
            }

            // Evitar reservar periodos ocupados
            const [choques] = await conexion.query(
                `SELECT id
                 FROM reservacion_inflable
                 WHERE inflable_id = ?
                   AND estado IN ('Reservada','En uso')
                   AND inicio < ?
                   AND fin > ?
                 LIMIT 1`,
                [
                    datos.inflable_id,
                    rango.fin,
                    rango.inicio
                ]
            );

            if (choques.length) {
                throw fallo(
                    'Ese inflable ya está reservado en el periodo.',
                    409
                );
            }

            const precio = Number(
                inflables[0].precio_completo
            );

            const minimo = anticipoMinimo(precio);

            if (datos.anticipo > precio) {
                throw fallo(
                    'El anticipo supera el precio completo.'
                );
            }

            if (
                minimo !== null &&
                datos.anticipo < minimo
            ) {
                throw fallo(
                    `El anticipo mínimo es $${minimo.toFixed(2)}.`
                );
            }

            // Buscar cliente por teléfono
            const [clientes] = await conexion.query(
                `SELECT id
                 FROM clientes
                 WHERE telefono = ?
                 ORDER BY id DESC
                 LIMIT 1`,
                [datos.telefono]
            );

            let clienteId = clientes[0]?.id;

            // Crear cliente si todavía no existe
            if (!clienteId) {
                const [cliente] = await conexion.query(
                    `INSERT INTO clientes
                     (nombre, telefono, email)
                     VALUES (?, ?, ?)`,
                    [
                        datos.cliente,
                        datos.telefono,
                        datos.email || null
                    ]
                );

                clienteId = cliente.insertId;
            }

            // Registrar operación
            const [operacion] = await conexion.query(
                `INSERT INTO operacion
                 (cliente_id, usuario_id, observaciones)
                 VALUES (?, ?, ?)`,
                [
                    clienteId,
                    datos.usuario_id,
                    datos.observaciones || null
                ]
            );

            // Registrar información general del evento
            const [reservacion] = await conexion.query(
                `INSERT INTO reservaciones
                 (
                    cliente_id,
                    usuario_id,
                    nombre_evento,
                    tipo_evento,
                    numero_invitados,
                    evento_con_menores,
                    observaciones
                 )
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    clienteId,
                    datos.usuario_id,
                    datos.nombre_evento || null,
                    datos.tipo_evento || null,
                    datos.numero_invitados,
                    datos.evento_con_menores ? 1 : 0,
                    datos.observaciones || null
                ]
            );

            // Buscar área de servicio
            const [areas] = await conexion.query(
                `SELECT id
                 FROM area_servicio
                 WHERE codigo = 'INFLABLE'
                 LIMIT 1`
            );

            if (!areas.length) {
                throw new Error(
                    'Falta el catálogo area_servicio INFLABLE.'
                );
            }

            // Vincular servicio con operación
            const [servicio] = await conexion.query(
                `INSERT INTO servicio_contratado
                 (operacion_id, area_servicio_id)
                 VALUES (?, ?)`,
                [
                    operacion.insertId,
                    areas[0].id
                ]
            );

            // Guardar reserva específica del inflable
            await conexion.query(
                `INSERT INTO reservacion_inflable
                 (
                    reservacion_id,
                    inflable_id,
                    servicio_contratado_id,
                    inicio,
                    fin,
                    tarifa_acordada,
                    direccion_instalacion,
                    referencias_ubicacion,
                    tipo_lugar,
                    fecha_instalacion
                 )
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    reservacion.insertId,
                    datos.inflable_id,
                    servicio.insertId,
                    rango.inicio,
                    rango.fin,
                    precio,
                    datos.direccion,
                    datos.referencias || null,
                    datos.tipo_lugar,
                    rango.fechaInstalacion
                ]
            );

            // Registrar anticipo si se recibió dinero
            if (datos.anticipo > 0) {

                // Obtener turno abierto del cajero
                const [turnos] = await conexion.query(
                    `SELECT t.id
                     FROM turno_caja t
                     JOIN caja c ON c.id = t.caja_id AND c.activo = 1
                     WHERE t.usuario_id = ?
                       AND t.cierre IS NULL
                     LIMIT 1 FOR UPDATE`,
                    [datos.usuario_id]
                );

                if (!turnos.length) {
                    throw fallo(
                        'Necesitas un turno de caja abierto para cobrar el anticipo.',
                        409
                    );
                }

                const [metodos] = await conexion.query(
                    `SELECT id
                     FROM metodo_pago
                     WHERE codigo = ?
                     LIMIT 1`,
                    [datos.metodo_pago]
                );

                const [conceptos] = await conexion.query(
                    `SELECT id
                     FROM concepto_pago
                     WHERE codigo = 'ANTICIPO'
                     LIMIT 1`
                );

                if (
                    !metodos.length ||
                    !conceptos.length
                ) {
                    throw new Error(
                        'Faltan catálogos de pago.'
                    );
                }

                // Registrar pago recibido
                const [pago] = await conexion.query(
                    `INSERT INTO pago
                     (
                        operacion_id,
                        metodo_pago_id,
                        turno_caja_id,
                        usuario_id,
                        importe,
                        referencia
                     )
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        operacion.insertId,
                        metodos[0].id,
                        turnos[0].id,
                        datos.usuario_id,
                        datos.anticipo,
                        datos.referencia_pago || null
                    ]
                );

                // Relacionar anticipo con el servicio
                await conexion.query(
                    `INSERT INTO pago_aplicacion
                     (
                        pago_id,
                        servicio_contratado_id,
                        concepto_pago_id,
                        importe
                     )
                     VALUES (?, ?, ?, ?)`,
                    [
                        pago.insertId,
                        servicio.insertId,
                        conceptos[0].id,
                        datos.anticipo
                    ]
                );
            }

            await conexion.commit();

            return reservacion.insertId;

        } catch (error) {
            await conexion.rollback();
            throw error;

        } finally {
            conexion.release();
        }
    }


    // CONSULTAR DOCUMENTO DE UNA RESERVACIÓN
    static async datosContrato(reservacionId) {
        const [filas] = await db.query(
            `SELECT
                r.id,
                ct.id AS contrato_id,
                ct.archivo_pdf_url

             FROM reservaciones r

             JOIN reservacion_inflable ri
                ON ri.reservacion_id = r.id

             LEFT JOIN contrato ct
                ON ct.reservacion_id = r.id
                AND ct.tipo = 'INFLABLE'
                AND ct.version = 1

             WHERE r.id = ?
             LIMIT 1`,
            [reservacionId]
        );

        return filas[0] || null;
    }


    // REGISTRAR PDF DEL CONTRATO FIRMADO
    static async guardarContratoFirmado(
        reservacionId,
        usuarioId,
        url
    ) {
        const conexion = await db.getConnection();

        try {
            await conexion.beginTransaction();

            const [reservas] = await conexion.query(
                `SELECT r.id
                 FROM reservaciones r
                 JOIN reservacion_inflable ri
                    ON ri.reservacion_id = r.id
                 WHERE r.id = ?
                 FOR UPDATE`,
                [reservacionId]
            );

            if (!reservas.length) {
                throw fallo(
                    'Reservación inexistente.',
                    404
                );
            }

            const [contratos] = await conexion.query(
                `SELECT id, archivo_pdf_url
                 FROM contrato
                 WHERE reservacion_id = ?
                   AND tipo = 'INFLABLE'
                   AND version = 1
                 LIMIT 1
                 FOR UPDATE`,
                [reservacionId]
            );

            if (contratos[0]?.archivo_pdf_url) {
                throw fallo(
                    'Ya se registró un contrato firmado.',
                    409
                );
            }

            if (contratos.length) {

                await conexion.query(
                    `UPDATE contrato
                     SET archivo_pdf_url = ?,
                         fecha_firma = NOW()
                     WHERE id = ?`,
                    [url, contratos[0].id]
                );

            } else {

                await conexion.query(
                    `INSERT INTO contrato
                     (
                        reservacion_id,
                        usuario_id,
                        folio,
                        tipo,
                        version,
                        archivo_pdf_url,
                        fecha_firma
                     )
                     VALUES (?, ?, ?, 'INFLABLE', 1, ?, NOW())`,
                    [
                        reservacionId,
                        usuarioId,
                        `INF-${reservacionId}-${Date.now()}`,
                        url
                    ]
                );
            }

            await conexion.commit();

        } catch (error) {
            await conexion.rollback();
            throw error;

        } finally {
            conexion.release();
        }
    }
}

module.exports = CajaInflablesModel;
