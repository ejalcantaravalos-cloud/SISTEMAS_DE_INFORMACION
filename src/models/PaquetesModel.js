const db = require('../Database/db').promise();

// ========================================
// FUNCIONES AUXILIARES
// ========================================

function errorHttp(status, mensaje, codigoAviso) {
    const error = new Error(mensaje);
    error.status = status;
    error.codigoAviso = codigoAviso;
    return error;
}

async function transaccion(operacion) {

    const conexion = typeof db.getConnection === 'function'
        ? await db.getConnection()
        : db;

    try {

        await conexion.beginTransaction();

        const resultado = await operacion(conexion);

        await conexion.commit();

        return resultado;

    } catch (error) {

        try {
            await conexion.rollback();
        } catch (errorRollback) {
            console.error(errorRollback);
        }

        throw error;

    } finally {

        if (conexion !== db) {
            conexion.release();
        }
    }
}

// ========================================
// MODELO
// ========================================

class PaquetesModel {

    // OBTENER CATÁLOGOS

    static async obtenerCatalogos() {

        const [
            [tipos],
            [salones],
            [sonidos]
        ] = await Promise.all([

            db.query(`
                SELECT *
                FROM tipo_paquete
                ORDER BY id
            `),

            db.query(`
                SELECT id, nombre, capacidad,
                       tarifa_base, activo
                FROM salones
                ORDER BY nombre
            `),

            db.query(`
                SELECT *
                FROM sonido
                ORDER BY nombre
            `)

        ]);

        return {
            tipos,
            salones,
            sonidos
        };
    }

    // OBTENER TODOS LOS PAQUETES

    static async obtenerTodos() {

        const [
            [paquetes],
            [salones],
            [sonidos]
        ] = await Promise.all([

            db.query(`
                SELECT p.*, t.nombre AS tipo
                FROM paquetes p
                INNER JOIN tipo_paquete t
                    ON t.id = p.tipo_paquete_id
                ORDER BY p.id DESC
            `),

            db.query(`
                SELECT ps.*, s.nombre, s.capacidad
                FROM paquete_salon ps
                INNER JOIN salones s
                    ON s.id = ps.salon_id
            `),

            db.query(`
                SELECT ps.*, s.nombre
                FROM paquete_sonido ps
                INNER JOIN sonido s
                    ON s.id = ps.sonido_id
            `)

        ]);

        return paquetes.map(paquete => ({

            ...paquete,

            salones: salones.filter(
                s => Number(s.paquete_id) === Number(paquete.id)
            ),

            sonidos: sonidos.filter(
                s => Number(s.paquete_id) === Number(paquete.id)
            )

        }));
    }

    // OBTENER PAQUETE POR ID

    static async obtenerPorId(id) {

        const [rows] = await db.query(`
            SELECT *
            FROM paquetes
            WHERE id = ?
        `, [id]);

        return rows[0] || null;
    }

    // ========================================
    // VALIDAR RELACIONES
    // ========================================

    static async validarRelaciones(conexion, datos) {

        const [tipos] = await conexion.query(`
            SELECT nombre
            FROM tipo_paquete
            WHERE id = ?
        `, [datos.tipo_paquete_id]);

        if (!tipos.length) {

            throw errorHttp(
                400,
                'Tipo de paquete inválido.',
                'error_tipo'
            );
        }

        const tipo = tipos[0].nombre.toLowerCase().trim();

        if (![
            'sencillo',
            'preparado',
            'personalizado'
        ].includes(tipo)) {

            throw errorHttp(
                400,
                'Tipo de paquete inválido.',
                'error_tipo'
            );
        }

        // PAQUETE PREPARADO

        if (tipo === 'preparado') {

            if (
                !Number.isInteger(datos.porciones_incluidas) ||
                datos.porciones_incluidas < 1
            ) {

                throw errorHttp(
                    400,
                    'Debe incluir al menos una porción.',
                    'error_porciones'
                );
            }

            if (
                !Number.isFinite(datos.valor_porcion_incluida) ||
                datos.valor_porcion_incluida <= 0
            ) {

                throw errorHttp(
                    400,
                    'El valor por porción debe ser mayor a cero.',
                    'error_valor_porcion'
                );
            }

            if (
                !Number.isInteger(datos.manteles_incluidos) ||
                datos.manteles_incluidos < 1
            ) {

                throw errorHttp(
                    400,
                    'Debe incluir al menos un mantel.',
                    'error_manteles'
                );
            }

        } else {

            // SENCILLO Y PERSONALIZADO

            if (
                datos.porciones_incluidas > 0 ||
                datos.valor_porcion_incluida > 0 ||
                datos.manteles_incluidos > 0 ||
                datos.cantidad_meseros > 0 ||
                datos.sonidos.length > 0
            ) {

                throw errorHttp(
                    400,
                    'Este paquete no admite extras predefinidos.',
                    'error_extras'
                );
            }
        }

        // VALIDAR SALONES

        if (!datos.salones.length) {

            throw errorHttp(
                400,
                'Selecciona al menos un salón.',
                'error_salones'
            );
        }

        const [salones] = await conexion.query(`
            SELECT id, nombre, capacidad
            FROM salones
            WHERE id IN (?)
            AND activo = 1
            FOR UPDATE
        `, [datos.salones]);

        if (salones.length !== datos.salones.length) {

            throw errorHttp(
                400,
                'Hay salones inactivos o inválidos.',
                'error_salones'
            );
        }

        for (const salon of salones) {

            if (datos.min_invitados > Number(salon.capacidad)) {

                throw errorHttp(
                    400,
                    `Capacidad insuficiente: ${salon.nombre}`,
                    'error_capacidad'
                );
            }
        }

        // VALIDAR SONIDO

        if (datos.sonidos.length) {

            const ids = datos.sonidos.map(s => s.id);

            const [sonidos] = await conexion.query(`
                SELECT id, nombre, stock_total
                FROM sonido
                WHERE id IN (?)
                AND activo = 1
                FOR UPDATE
            `, [ids]);

            const disponibles = new Map(
                sonidos.map(s => [Number(s.id), s])
            );

            for (const sonido of datos.sonidos) {

                const equipo = disponibles.get(sonido.id);

                if (
                    !equipo ||
                    sonido.cantidad > Number(equipo.stock_total)
                ) {

                    throw errorHttp(
                        400,
                        'Existencias de sonido insuficientes.',
                        'error_sonido'
                    );
                }
            }
        }
    }

    // ========================================
    // CREAR Y ACTUALIZAR
    // ========================================

    static async guardar(id, datos) {

        return transaccion(async conexion => {

            let paqueteId = id;
            let imagenAnterior = null;

            if (id !== null) {

                const [rows] = await conexion.query(`
                    SELECT id, imagen_public_id
                    FROM paquetes
                    WHERE id = ?
                    FOR UPDATE
                `, [id]);

                if (!rows.length) {

                    throw errorHttp(
                        404,
                        'Paquete no encontrado.'
                    );
                }

                imagenAnterior = rows[0].imagen_public_id;
            }

            await PaquetesModel.validarRelaciones(
                conexion,
                datos
            );

            const valores = [

                datos.tipo_paquete_id,
                datos.nombre,
                datos.descripcion,
                datos.precio_adicional,
                datos.min_invitados,
                datos.max_invitados,
                datos.cantidad_meseros,
                datos.porciones_incluidas,
                datos.valor_porcion_incluida,
                datos.manteles_incluidos

            ];

            // CREAR

            if (id === null) {

                const [resultado] = await conexion.query(`
                    INSERT INTO paquetes (
                        tipo_paquete_id,
                        nombre,
                        descripcion,
                        precio_adicional,
                        min_invitados,
                        max_invitados,
                        cantidad_meseros,
                        porciones_incluidas,
                        valor_porcion_incluida,
                        manteles_incluidos,
                        imagen_url,
                        imagen_public_id,
                        activo
                    )
                    VALUES (
                        ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?, ?, 1
                    )
                `, [
                    ...valores,
                    datos.imagen_url || null,
                    datos.imagen_public_id || null
                ]);

                paqueteId = resultado.insertId;

            } else {

                // ACTUALIZAR

                let consulta = `
                    UPDATE paquetes
                    SET tipo_paquete_id = ?,
                        nombre = ?,
                        descripcion = ?,
                        precio_adicional = ?,
                        min_invitados = ?,
                        max_invitados = ?,
                        cantidad_meseros = ?,
                        porciones_incluidas = ?,
                        valor_porcion_incluida = ?,
                        manteles_incluidos = ?
                `;

                if (datos.imagen_public_id) {

                    consulta += `,
                        imagen_url = ?,
                        imagen_public_id = ?
                    `;

                    valores.push(
                        datos.imagen_url,
                        datos.imagen_public_id
                    );
                }

                consulta += ' WHERE id = ?';

                valores.push(id);

                await conexion.query(
                    consulta,
                    valores
                );

                // ACTUALIZAR RELACIONES

                await conexion.query(`
                    DELETE FROM paquete_salon
                    WHERE paquete_id = ?
                `, [id]);

                await conexion.query(`
                    DELETE FROM paquete_sonido
                    WHERE paquete_id = ?
                `, [id]);
            }

            // GUARDAR SALONES

            await conexion.query(`
                INSERT INTO paquete_salon (
                    paquete_id,
                    salon_id
                )
                VALUES ?
            `, [
                datos.salones.map(salonId => [
                    paqueteId,
                    salonId
                ])
            ]);

            // GUARDAR SONIDOS

            if (datos.sonidos.length) {

                await conexion.query(`
                    INSERT INTO paquete_sonido (
                        paquete_id,
                        sonido_id,
                        cantidad
                    )
                    VALUES ?
                `, [
                    datos.sonidos.map(sonido => [
                        paqueteId,
                        sonido.id,
                        sonido.cantidad
                    ])
                ]);
            }

            return {
                id: paqueteId,
                imagenAnterior
            };

        });
    }

    // ========================================
    // ACTIVAR O DESACTIVAR
    // ========================================

    static async cambiarActivo(id, activo) {

        return transaccion(async conexion => {

            const [rows] = await conexion.query(`
                SELECT p.*, t.nombre AS tipo
                FROM paquetes p
                INNER JOIN tipo_paquete t
                    ON t.id = p.tipo_paquete_id
                WHERE p.id = ?
                FOR UPDATE
            `, [id]);

            if (!rows.length) {
                return false;
            }

            const paquete = rows[0];

            if (activo) {

                const [salones] = await conexion.query(`
                    SELECT salon_id
                    FROM paquete_salon
                    WHERE paquete_id = ?
                `, [id]);

                const [sonidos] = await conexion.query(`
                    SELECT sonido_id, cantidad
                    FROM paquete_sonido
                    WHERE paquete_id = ?
                `, [id]);

                await PaquetesModel.validarRelaciones(
                    conexion,
                    {
                        ...paquete,

                        porciones_incluidas:
                            Number(paquete.porciones_incluidas),

                        valor_porcion_incluida:
                            Number(paquete.valor_porcion_incluida),

                        manteles_incluidos:
                            Number(paquete.manteles_incluidos),

                        cantidad_meseros:
                            Number(paquete.cantidad_meseros),

                        salones: salones.map(
                            s => Number(s.salon_id)
                        ),

                        sonidos: sonidos.map(s => ({
                            id: Number(s.sonido_id),
                            cantidad: Number(s.cantidad)
                        }))
                    }
                );
            }

            await conexion.query(`
                UPDATE paquetes
                SET activo = ?
                WHERE id = ?
            `, [
                activo ? 1 : 0,
                id
            ]);

            return true;
        });
    }

    // ========================================
    // ELIMINAR FOTOGRAFÍA
    // ========================================

    static async eliminarImagen(id) {

        return transaccion(async conexion => {

            const [rows] = await conexion.query(`
                SELECT imagen_public_id
                FROM paquetes
                WHERE id = ?
                FOR UPDATE
            `, [id]);

            if (!rows.length) {

                throw errorHttp(
                    404,
                    'Paquete no encontrado.'
                );
            }

            const publicId = rows[0].imagen_public_id;

            await conexion.query(`
                UPDATE paquetes
                SET imagen_url = NULL,
                    imagen_public_id = NULL
                WHERE id = ?
            `, [id]);

            return publicId;
        });
    }
}

module.exports = PaquetesModel;