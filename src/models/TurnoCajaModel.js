'use strict';

// Sigue la misma conexión mysql2 que utiliza el resto de HelpingBee.
const db = require('../Database/db').promise();
function fallo(mensaje, codigo, status = 409) {
    const error = new Error(mensaje);
    error.codigo = codigo;
    error.status = status;
    return error;
}

function idValido(valor) {
    return Number.isSafeInteger(Number(valor)) && Number(valor) > 0;
}

function importeValido(valor) {
    const texto = String(valor ?? '').trim();
    return /^\d{1,10}(\.\d{1,2})?$/.test(texto) ? texto : null;
}

class TurnoCajaModel {
    static async listarCajasDisponibles() {
        const [rows] = await db.query(`
            SELECT caja_id AS id, nombre_caja AS nombre
            FROM v_estado_cajas
            WHERE estado = 'DISPONIBLE'
            ORDER BY nombre_caja
        `);
        return rows;
    }

    // Una sola caja por cajero, independiente del servicio.
    static async consultarCaja(usuarioId) {
        const [rows] = await db.query(`
            SELECT c.id AS caja_id, c.nombre AS caja_nombre,
                   t.id AS turno_id, t.usuario_id, t.apertura,
                   t.fondo_inicial, u.nombre AS nombre_cajero
            FROM turno_caja t
            JOIN caja c ON c.id = t.caja_id
            JOIN usuarios u ON u.id = t.usuario_id
            WHERE t.usuario_id = ? AND t.cierre IS NULL
        `, [usuarioId]);
        return rows[0] || null;
    }

    static async consultarResumen(turnoId) {
        const [rows] = await db.query(
            'SELECT * FROM v_resumen_turno_caja WHERE turno_caja_id = ?',
            [turnoId]
        );
        return rows[0] || null;
    }

    static async abrirTurno(usuarioId, cajaId, fondoInicial) {
        if (!idValido(usuarioId) || !idValido(cajaId)) {
            throw fallo('Selecciona una caja válida.', 'CAJA_NO_EXISTE', 400);
        }
        const fondo = importeValido(fondoInicial);
        if (fondo === null) {
            throw fallo('Introduce un fondo inicial válido.', 'FONDO_INVALIDO', 400);
        }
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            // Orden de bloqueo común: usuario, caja, turno.
            const [usuarios] = await conn.query(
                'SELECT id FROM usuarios WHERE id = ? AND activo = 1 FOR UPDATE',
                [usuarioId]
            );
            if (!usuarios.length) throw fallo('Usuario inactivo.', 'USUARIO_INACTIVO', 403);
            const [cajas] = await conn.query(
                'SELECT id FROM caja WHERE id = ? AND activo = 1 FOR UPDATE', [cajaId]
            );
            if (!cajas.length) throw fallo('Caja inexistente o inactiva.', 'CAJA_NO_EXISTE', 404);
            const [abiertos] = await conn.query(`
                SELECT id, usuario_id, caja_id FROM turno_caja
                WHERE cierre IS NULL AND (usuario_id = ? OR caja_id = ?)
                FOR UPDATE
            `, [usuarioId, cajaId]);
            if (abiertos.some(t => Number(t.usuario_id) === Number(usuarioId))) {
                throw fallo('Ya tienes una caja abierta.', 'YA_ABIERTO');
            }
            if (abiertos.length) throw fallo('Esta caja ya está ocupada.', 'CAJA_OCUPADA');
            const [resultado] = await conn.query(`
                INSERT INTO turno_caja (caja_id, usuario_id, fondo_inicial)
                VALUES (?, ?, ?)
            `, [cajaId, usuarioId, fondo]);
            await conn.commit();
            return resultado.insertId;
        } catch (error) {
            await conn.rollback();
            if (error.code === 'ER_DUP_ENTRY') {
                throw fallo('La caja o el usuario ya tiene un turno abierto.', 'CAJA_OCUPADA');
            }
            throw error;
        } finally {
            conn.release();
        }
    }

    // Corte y cierre son una única transacción. El importe esperado se calcula
    // en MySQL, nunca se acepta desde el navegador.
    static async cerrarTurno(usuarioId, turnoId, efectivoContado, observaciones = '') {
        const contado = importeValido(efectivoContado);
        if (!idValido(turnoId) || contado === null ||
            typeof observaciones !== 'string' || observaciones.length > 1000) {
            throw fallo('Revisa el turno, el efectivo contado y las observaciones.', 'CORTE_INVALIDO', 400);
        }
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [turnos] = await conn.query(`
                SELECT id FROM turno_caja
                WHERE id = ? AND usuario_id = ? AND cierre IS NULL FOR UPDATE
            `, [turnoId, usuarioId]);
            if (!turnos.length) throw fallo('No tienes ese turno abierto.', 'SIN_TURNO');
            // Los cobros bloquean la misma fila de turno hasta confirmar el pago.
            // Esta primera lectura consistente sucede DESPUÉS de obtener el bloqueo.
            const [resumen] = await conn.query(`
                SELECT efectivo_esperado FROM v_resumen_turno_caja
                WHERE turno_caja_id = ?
            `, [turnoId]);
            if (!resumen.length || resumen[0].efectivo_esperado === null) {
                throw fallo('No se pudo calcular el efectivo esperado.', 'SIN_RESUMEN', 500);
            }
            await conn.query(`
                INSERT INTO corte_caja
                    (turno_caja_id, usuario_id, efectivo_contado, efectivo_esperado, observaciones)
                VALUES (?, ?, ?, ?, ?)
            `, [turnoId, usuarioId, contado, resumen[0].efectivo_esperado, observaciones.trim() || null]);
            const [resultado] = await conn.query(
                'UPDATE turno_caja SET cierre = NOW() WHERE id = ? AND cierre IS NULL',
                [turnoId]
            );
            if (resultado.affectedRows !== 1) throw fallo('No se pudo cerrar el turno.', 'SIN_TURNO');
            await conn.commit();
            return turnoId;
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    }

    static async listarReservacionesPorFinalizar() {
        const [rows] = await db.query(
            `SELECT
                ri.id,
                ji.nombre AS inflable,
                cl.nombre AS cliente,
                ri.inicio,
                ri.fin,
                ri.estado
             FROM reservacion_inflable AS ri
             INNER JOIN juegos_inflables AS ji ON ji.id = ri.inflable_id
             INNER JOIN reservaciones AS r ON r.id = ri.reservacion_id
             INNER JOIN clientes AS cl ON cl.id = r.cliente_id
             WHERE ri.fin <= NOW()
               AND ri.estado IN ('Reservada', 'En uso')
             ORDER BY ri.fin DESC
             LIMIT 30`
        );
        return rows;
    }

    static async finalizarReservacion(id) {
        // El estado solo cambia si el evento ya terminó.
        const [resultado] = await db.query(
            `UPDATE reservacion_inflable
             SET estado = 'Finalizada'
             WHERE id = ?
               AND estado IN ('Reservada', 'En uso')
               AND fin <= NOW()`,
            [id]
        );
        return resultado.affectedRows === 1;
    }
    // Listado de reservaciones de inflables con saldo pendiente.
    // Los importes pagados se calculan usando los pagos aplicados al servicio.
    static async listarSaldosPendientes() {
        const [rows] = await db.query(
            `SELECT
                ri.id,
                ji.nombre AS inflable,
                cl.nombre AS cliente,
                ri.inicio,
                ri.estado,
                ri.tarifa_acordada AS total,
                COALESCE(abonos.pagado, 0) AS abonado,
                GREATEST(ri.tarifa_acordada - COALESCE(abonos.pagado, 0), 0) AS saldo
             FROM reservacion_inflable AS ri
             INNER JOIN juegos_inflables AS ji ON ji.id = ri.inflable_id
             INNER JOIN reservaciones AS r ON r.id = ri.reservacion_id
             INNER JOIN clientes AS cl ON cl.id = r.cliente_id
             LEFT JOIN (
                SELECT pa.servicio_contratado_id, SUM(pa.importe) AS pagado
                FROM pago_aplicacion AS pa
                INNER JOIN concepto_pago AS cp
                    ON cp.id = pa.concepto_pago_id
                WHERE cp.codigo IN ('ANTICIPO', 'SALDO', 'TOTAL')
                GROUP BY pa.servicio_contratado_id
             ) AS abonos ON abonos.servicio_contratado_id = ri.servicio_contratado_id
             WHERE ri.estado <> 'Cancelada'
               AND ri.tarifa_acordada > COALESCE(abonos.pagado, 0)
             ORDER BY ri.inicio DESC, ri.id DESC
             LIMIT 50`
        );
        return rows;
    }

    // Registra la liquidación exacta del saldo pendiente.
    // El usuario NO envía el importe: se calcula nuevamente en el servidor.
    // El bloqueo de la reservación impide cobrar dos veces por solicitudes simultáneas.
    static async liquidarSaldo(reservacionId, usuarioId, metodoCodigo, referencia) {
        const permitidos = new Set(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']);
        if (!permitidos.has(metodoCodigo)) {
            const error = new Error('Método de pago inválido.');
            error.codigo = 'METODO_INVALIDO';
            throw error;
        }

        const connection = typeof db.getConnection === 'function'
            ? await db.getConnection()
            : db;

        try {
            await connection.beginTransaction();

            const [turnos] = await connection.query(
                `SELECT t.id
                 FROM turno_caja AS t
                 INNER JOIN caja AS c ON c.id = t.caja_id
                 WHERE c.activo = 1
                   AND t.cierre IS NULL AND t.usuario_id = ?
                 ORDER BY t.id DESC LIMIT 1 FOR UPDATE`,
                [usuarioId]
            );
            if (!turnos.length) {
                const error = new Error('Debes tener tu turno de caja abierto para cobrar.');
                error.codigo = 'SIN_TURNO_PROPIO';
                throw error;
            }

            const [reservas] = await connection.query(
                `SELECT ri.id, ri.tarifa_acordada, ri.estado,
                        sc.id AS servicio_id, sc.operacion_id
                 FROM reservacion_inflable AS ri
                 INNER JOIN servicio_contratado AS sc
                     ON sc.id = ri.servicio_contratado_id
                 WHERE ri.id = ? FOR UPDATE`,
                [reservacionId]
            );
            if (!reservas.length || reservas[0].estado === 'Cancelada') {
                const error = new Error('No existe una reservación vigente con ese folio.');
                error.codigo = 'RESERVA_NO_VALIDA';
                throw error;
            }

            const reserva = reservas[0];
            const [abonos] = await connection.query(
                `SELECT COALESCE(SUM(pa.importe), 0) AS pagado
                 FROM pago_aplicacion AS pa
                 INNER JOIN concepto_pago AS cp
                     ON cp.id = pa.concepto_pago_id
                 WHERE pa.servicio_contratado_id = ?
                   AND cp.codigo IN ('ANTICIPO', 'SALDO', 'TOTAL')`,
                [reserva.servicio_id]
            );

            // DECIMAL(12,2) -> centavos enteros, para evitar restas de punto flotante.
            const total = Math.round(Number(reserva.tarifa_acordada) * 100);
            const pagado = Math.round(Number(abonos[0].pagado) * 100);
            const saldoCentavos = total - pagado;
            if (!Number.isSafeInteger(saldoCentavos) || saldoCentavos <= 0) {
                const error = new Error('La reservación ya está liquidada o no tiene saldo pendiente.');
                error.codigo = 'SIN_SALDO';
                throw error;
            }

            const [metodos] = await connection.query(
                `SELECT id FROM metodo_pago WHERE codigo = ? LIMIT 1`,
                [metodoCodigo]
            );
            const [conceptos] = await connection.query(
                `SELECT id FROM concepto_pago WHERE codigo = 'SALDO' LIMIT 1`
            );
            if (!metodos.length || !conceptos.length) {
                const error = new Error('Falta el catálogo de método de pago o concepto SALDO.');
                error.codigo = 'CATALOGO_INCOMPLETO';
                throw error;
            }

            const importe = (saldoCentavos / 100).toFixed(2);
            const [pago] = await connection.query(
                `INSERT INTO pago
                    (operacion_id, metodo_pago_id, turno_caja_id,
                     usuario_id, importe, referencia)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [reserva.operacion_id, metodos[0].id, turnos[0].id,
                 usuarioId, importe, referencia || null]
            );
            await connection.query(
                `INSERT INTO pago_aplicacion
                    (pago_id, servicio_contratado_id, concepto_pago_id, importe)
                 VALUES (?, ?, ?, ?)`,
                [pago.insertId, reserva.servicio_id, conceptos[0].id, importe]
            );

            await connection.commit();
            return { pagoId: pago.insertId, importe };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (connection !== db) connection.release();
        }
    }

}

module.exports = TurnoCajaModel;
