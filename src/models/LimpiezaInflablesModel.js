
'use strict';

const db = require('../Database/db').promise();

class LimpiezaInflablesModel {

    // Consultar los inflables y su última revisión
    static async listar() {

        const [filas] = await db.query(`
            SELECT
                j.id,
                j.nombre,
                j.activo,

                rv.id AS revision_id,
                rv.resultado AS ultimo_resultado,
                rv.fecha AS fecha_revision,
                rv.observaciones,

                rv.reservacion_inflable_id
                    AS revision_reservacion_id,

                u.nombre AS empleado_revision,

                (
                    SELECT ri.id
                    FROM reservacion_inflable AS ri
                    WHERE ri.inflable_id = j.id
                      AND ri.estado = 'Finalizada'
                      AND ri.fin <= NOW()
                    ORDER BY ri.fin DESC, ri.id DESC
                    LIMIT 1
                ) AS ultima_reservacion_finalizada_id

            FROM juegos_inflables AS j

            LEFT JOIN revision_inflable AS rv
                ON rv.id = (
                    SELECT r2.id
                    FROM revision_inflable AS r2
                    WHERE r2.inflable_id = j.id
                    ORDER BY r2.fecha DESC, r2.id DESC
                    LIMIT 1
                )

            LEFT JOIN usuarios AS u
                ON u.id = rv.usuario_id

            ORDER BY j.nombre ASC, j.id ASC
        `);

        return filas.map((fila) => {

            // Detectar si existe un evento terminado
            // que todavía no tenga su revisión vinculada.
            const eventoPendiente =
                fila.ultima_reservacion_finalizada_id != null &&
                Number(fila.revision_reservacion_id) !==
                Number(fila.ultima_reservacion_finalizada_id);

            const ultimoResultado =
                fila.ultimo_resultado || 'SIN_REVISION';

            // Mantenimiento y fuera de servicio tienen
            // prioridad sobre una limpieza pendiente.
            const estadoCritico = [
                'MANTENIMIENTO',
                'FUERA_SERVICIO'
            ].includes(ultimoResultado);

            const estadoRevision = estadoCritico
                ? ultimoResultado
                : eventoPendiente
                    ? 'REQUIERE_LIMPIEZA'
                    : ultimoResultado;

            return {
                ...fila,
                estado_revision: estadoRevision,
                evento_pendiente: eventoPendiente
            };
        });
    }

    // Registrar una nueva revisión del inflable
    static async registrar({
        inflableId,
        usuarioId,
        resultado,
        observaciones
    }) {

        const conexion =
            typeof db.getConnection === 'function'
                ? await db.getConnection()
                : db;

        try {
            await conexion.beginTransaction();

            // Bloquear el registro mientras se revisa
            const [inflables] = await conexion.query(
                `SELECT id
                 FROM juegos_inflables
                 WHERE id = ?
                 FOR UPDATE`,
                [inflableId]
            );

            if (!inflables.length) {
                const error = new Error(
                    'El inflable no existe.'
                );

                error.codigo = 'NO_EXISTE';
                throw error;
            }

            // Buscar el evento finalizado más reciente
            const [reservaciones] =
                await conexion.query(`
                    SELECT id
                    FROM reservacion_inflable
                    WHERE inflable_id = ?
                      AND estado = 'Finalizada'
                      AND fin <= NOW()
                    ORDER BY fin DESC, id DESC
                    LIMIT 1
                `, [inflableId]);

            const reservacionId =
                reservaciones.length
                    ? reservaciones[0].id
                    : null;

            // Guardar la revisión
            await conexion.query(`
                INSERT INTO revision_inflable (
                    inflable_id,
                    usuario_id,
                    reservacion_inflable_id,
                    resultado,
                    observaciones
                )
                VALUES (?, ?, ?, ?, ?)
            `, [
                inflableId,
                usuarioId,
                reservacionId,
                resultado,
                observaciones || null
            ]);

            await conexion.commit();

        } catch (error) {

            await conexion.rollback();
            throw error;

        } finally {

            if (conexion !== db) {
                conexion.release();
            }
        }
    }
}

module.exports = LimpiezaInflablesModel;
