// Reagendar conserva las tarifas, pero aplica la política de apartados.
const Finanzas = require('./FinanzasReagendacion');
const CONFIG = Object.freeze({
    eventos: { tabla: 'reservacion_salon', recurso: 'salon_id', catalogo: 'salones' },
    inflables: { tabla: 'reservacion_inflable', recurso: 'inflable_id', catalogo: 'juegos_inflables' }
});

function exigir(ok, mensaje, status = 409) {
    if (!ok) {
        const error = new Error(mensaje);
        error.status = status;
        throw error;
    }
}

async function filas(c, sql, params = []) {
    const [r] = await c.query(sql, params);
    return r;
}

function config(area) {
    exigir(Object.hasOwn(CONFIG, area), 'Esta área no admite reagendaciones.', 400);
    return CONFIG[area];
}

// Los DATETIME de MySQL representan horas locales del negocio, no instantes UTC.
// UTC se utiliza únicamente para hacer aritmética de calendario sin cambios de zona.
function ms(fecha) {
    return Date.parse(fecha.replace(' ', 'T') + 'Z');
}

function sqlFecha(valor) {
    return new Date(valor).toISOString().slice(0, 19).replace('T', ' ');
}

function ahoraLocal() {
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).format(new Date());
}

const CAMPOS_FECHA = `DATE_FORMAT(r.inicio, '%Y-%m-%d %H:%i:%s') AS inicio_sql,
    DATE_FORMAT(r.fin, '%Y-%m-%d %H:%i:%s') AS fin_sql`;

async function bloquearRecurso(c, tabla, id) {
    const [r] = await filas(c, `SELECT id, activo FROM ${tabla} WHERE id = ? FOR UPDATE`, [id]);
    exigir(r && Number(r.activo) === 1, 'El salón o inflable está deshabilitado.');
    if (tabla === 'juegos_inflables') {
        const [revision] = await filas(c, `SELECT resultado FROM revision_inflable
            WHERE inflable_id = ? ORDER BY fecha DESC, id DESC LIMIT 1`, [id]);
        exigir(!revision || !['REQUIERE_LIMPIEZA', 'MANTENIMIENTO', 'FUERA_SERVICIO'].includes(revision.resultado),
            'El inflable necesita limpieza o revisión antes de reservarse.');
    }
}

function calcularRango(area, registro, datos) {
    const inicio = ms(registro.inicio_sql);
    const fin = ms(registro.fin_sql);
    exigir(Number.isFinite(inicio) && Number.isFinite(fin) && fin > inicio, 'El horario original no es válido.');
    let nuevoInicio;
    if (area === 'eventos') {
        nuevoInicio = ms(`${datos.fecha} ${datos.hora}:00`);
    } else {
        // El fin es exclusivo: el último día ocupado es la fecha del evento.
        const fechaEvento = sqlFecha(fin - 1000).slice(0, 10);
        nuevoInicio = inicio + ms(datos.fecha + ' 00:00:00') - ms(fechaEvento + ' 00:00:00');
    }
    exigir(Number.isFinite(nuevoInicio), 'La nueva fecha no es válida.', 400);
    const delta = nuevoInicio - inicio;
    const nuevoFin = fin + delta;
    const rango = { inicio: sqlFecha(nuevoInicio), fin: sqlFecha(nuevoFin), delta };
    exigir(rango.inicio > ahoraLocal(), 'La nueva reservación debe iniciar en el futuro.', 400);
    exigir(delta !== 0, 'Selecciona una fecha u horario diferente.', 400);
    exigir(area !== 'eventos' || rango.inicio.slice(0, 10) === rango.fin.slice(0, 10),
        'El evento debe terminar el mismo día; se conserva la duración original.', 400);
    return rango;
}

async function comprobarDisponibilidad(c, area, registro, inicio, fin, idsExcluidos) {
    const cfg = config(area);
    const choques = await filas(c, `SELECT id FROM ${cfg.tabla}
        WHERE ${cfg.recurso} = ? AND id NOT IN (?) AND estado <> 'Cancelada'
        AND inicio < ? AND fin > ? LIMIT 1`, [registro[cfg.recurso], idsExcluidos, fin, inicio]);
    exigir(!choques.length, area === 'eventos'
        ? 'El salón está ocupado en el nuevo horario.' : 'El inflable está ocupado en el nuevo horario.');
}

// Igual que el cotizador de eventos: revisar el pico de uso simultáneo,
// no la suma de reservaciones que no coinciden entre sí.
function picoUso(usos, inicio, fin) {
    const puntos = usos.flatMap(u => [
        [u.inicio > inicio ? u.inicio : inicio, Number(u.cantidad)],
        [u.fin < fin ? u.fin : fin, -Number(u.cantidad)]
    ]).sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
    let uso = 0;
    let pico = 0;
    for (const [, cambio] of puntos) {
        uso += cambio;
        pico = Math.max(pico, uso);
    }
    return pico;
}

async function comprobarExtras(c, principal, rango) {
    for (const [tabla, detalle, llave] of [
        ['manteles', 'reservacion_paquete_mantel', 'mantel_id'],
        ['sonido', 'reservacion_paquete_sonido', 'sonido_id']
    ]) {
        // Mismo orden de bloqueo que el registro de reservaciones.
        const catalogo = await filas(c, `SELECT id, activo, stock_total FROM ${tabla} ORDER BY id FOR UPDATE`);
        const seleccion = await filas(c, `SELECT z.${llave} AS id, z.cantidad FROM ${detalle} z
            JOIN reservacion_paquete rp ON rp.reservacion_id = z.reservacion_id
            WHERE rp.reservacion_salon_id = ?`, [principal.id]);
        for (const item of seleccion) {
            const recurso = catalogo.find(x => Number(x.id) === Number(item.id));
            const usos = await filas(c, `SELECT z.cantidad,
                DATE_FORMAT(rs.inicio, '%Y-%m-%d %H:%i:%s') AS inicio,
                DATE_FORMAT(rs.fin, '%Y-%m-%d %H:%i:%s') AS fin
                FROM ${detalle} z JOIN reservacion_paquete rp ON rp.reservacion_id = z.reservacion_id
                JOIN reservacion_salon rs ON rs.id = rp.reservacion_salon_id
                WHERE z.${llave} = ? AND rs.id <> ? AND rs.estado <> 'Cancelada'
                AND rs.inicio < ? AND rs.fin > ?`, [item.id, principal.id, rango.fin, rango.inicio]);
            exigir(recurso && Number(recurso.activo) === 1 &&
                Number(item.cantidad) + picoUso(usos, rango.inicio, rango.fin) <= Number(recurso.stock_total),
                'No hay suficientes manteles o equipos de sonido en el nuevo horario.');
        }
    }
}

class ReagendacionesModel {
    static async guardar(c, area, id, datos, usuarioId) {
        const cfg = config(area);
        const filtro = area === 'inflables' ? 'AND r.incluido_en_reservacion_salon_id IS NULL' : '';
        const [ref] = await filas(c, `SELECT sc.operacion_id FROM ${cfg.tabla} r
            JOIN servicio_contratado sc ON sc.id = r.servicio_contratado_id WHERE r.id = ? ${filtro}`, [id]);
        exigir(ref, 'No se encontró la reservación.', 404);
        await filas(c, 'SELECT id FROM operacion WHERE id = ? FOR UPDATE', [ref.operacion_id]);
        const [principal] = await filas(c, `SELECT r.*, ${CAMPOS_FECHA} FROM ${cfg.tabla} r
            WHERE r.id = ? ${filtro} FOR UPDATE`, [id]);
        exigir(principal && principal.estado === 'Reservada', 'Solo se pueden reagendar reservaciones pendientes.');
        exigir(principal.inicio_sql === datos.inicioOriginal && principal.fin_sql === datos.finOriginal,
            'La fecha original cambió. Actualiza la lista e inténtalo otra vez.');
        exigir(principal.inicio_sql > ahoraLocal(), 'La reservación original ya comenzó.');
        const rango = calcularRango(area, principal, datos);
        // Bloquear la reservación general para coordinar con la carga de contratos.
        await filas(c, 'SELECT id FROM reservaciones WHERE id = ? FOR UPDATE', [principal.reservacion_id]);
        const contratos = await filas(c, `SELECT id FROM contrato WHERE reservacion_id = ?
            AND (archivo_pdf_url IS NOT NULL OR fecha_firma IS NOT NULL) FOR UPDATE`, [principal.reservacion_id]);
        exigir(!contratos.length, 'Hay un contrato firmado o cargado. Debe gestionarse su actualización antes de reagendar.');

        const asociados = area === 'eventos' ? await filas(c, `SELECT r.*, ${CAMPOS_FECHA},
            DATE_FORMAT(r.fecha_instalacion, '%Y-%m-%d') AS instalacion_sql FROM reservacion_inflable r
            WHERE r.incluido_en_reservacion_salon_id = ? ORDER BY r.id FOR UPDATE`, [id]) : [];
        if (area === 'inflables') {
            const [instalacion] = await filas(c, `SELECT DATE_FORMAT(fecha_instalacion, '%Y-%m-%d') AS instalacion_sql
                FROM reservacion_inflable WHERE id = ?`, [id]);
            principal.instalacion_sql = instalacion.instalacion_sql;
        }
        const servicios = [{ ...principal, area }, ...asociados.map(r => ({ ...r, area: 'inflables' }))];
        exigir(servicios.every(r => r.estado === 'Reservada' && r.inicio_sql > ahoraLocal()),
            'Hay un servicio asociado que ya comenzó o no está reservado.');
        if (area === 'eventos') {
            const pedidos = await filas(c, `SELECT id FROM pedido WHERE reservacion_id = ? AND estado <> 'Cancelado' FOR UPDATE`,
                [principal.reservacion_id]);
            exigir(!pedidos.length, 'Hay pedidos de restaurante vinculados. Deben gestionarse antes de reagendar; la comida no se reagenda.');
        }
        const ids = servicios.map(r => r.servicio_contratado_id).sort((a, b) => a - b);
        await filas(c, 'SELECT id FROM servicio_contratado WHERE id IN (?) ORDER BY id FOR UPDATE', [ids]);
        const cancelaciones = await filas(c, 'SELECT id FROM cancelacion WHERE servicio_contratado_id IN (?) FOR UPDATE', [ids]);
        const devoluciones = await filas(c, `SELECT id FROM solicitud_devolucion
            WHERE servicio_contratado_id IN (?) AND estado <> 'RECHAZADA' FOR UPDATE`, [ids]);
        exigir(!cancelaciones.length && !devoluciones.length, 'Existe una cancelación o devolución previa. Revisa el caso.');

        if (area === 'eventos') await bloquearRecurso(c, 'salones', principal.salon_id);
        const inflables = [...new Set(servicios.filter(r => r.area === 'inflables').map(r => Number(r.inflable_id)))].sort((a, b) => a - b);
        for (const inflable of inflables) await bloquearRecurso(c, 'juegos_inflables', inflable);
        if (area === 'eventos') await comprobarExtras(c, principal, rango);
        const cambios = servicios.map(r => ({
            ...r,
            nuevoInicio: sqlFecha(ms(r.inicio_sql) + rango.delta),
            nuevoFin: sqlFecha(ms(r.fin_sql) + rango.delta),
            nuevaInstalacion: r.instalacion_sql ? sqlFecha(ms(r.instalacion_sql + ' 00:00:00') + rango.delta).slice(0, 10) : null
        }));
        // Los recursos que se mueven juntos quedan excluidos de la consulta externa.
        // Sus intervalos relativos se conservan, por lo que no se generan solapes entre ellos.
        for (const r of cambios) {
            exigir(r.nuevoInicio > ahoraLocal(), 'La instalación o el servicio asociado debe iniciar en el futuro.');
            await comprobarDisponibilidad(c, r.area, r, r.nuevoInicio, r.nuevoFin,
                cambios.filter(x => x.area === r.area).map(x => x.id));
        }
        const finanzas = await Finanzas.preparar(c, area, principal, servicios, datos);
        const motivo = [
            `Responsable: ${datos.responsable === 'negocio' ? 'ZABAVA' : 'Cliente'}`,
            `Motivos: ${datos.motivos.join('; ')}`,
            `Explicación: ${datos.explicacion || 'Sin explicación adicional'}`
        ].join('\n');
        for (const r of cambios) {
            if (r.area === 'eventos') {
                await c.query('UPDATE reservacion_salon SET inicio = ?, fin = ? WHERE id = ?', [r.nuevoInicio, r.nuevoFin, r.id]);
            } else {
                await c.query('UPDATE reservacion_inflable SET inicio = ?, fin = ?, fecha_instalacion = ? WHERE id = ?',
                    [r.nuevoInicio, r.nuevoFin, r.nuevaInstalacion, r.id]);
            }
            const [historia] = await c.query(`INSERT INTO reagendacion (servicio_contratado_id, usuario_id, inicio_anterior,
                fin_anterior, inicio_nuevo, fin_nuevo, motivo) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [r.servicio_contratado_id, usuarioId, r.inicio_sql, r.fin_sql, r.nuevoInicio, r.nuevoFin, motivo]);
            if (r.area === area && Number(r.id) === Number(principal.id)) {
                await Finanzas.guardar(c, historia.insertId, finanzas, datos);
            }
        }
        return { servicios: cambios.length, ...finanzas };
    }

    static async cobrar(c, area, id, datos, usuarioId) {
        return Finanzas.cobrar(c, area, id, datos, usuarioId);
    }

    static async historial(c, area) {
        const cfg = config(area);
        const filtro = area === 'inflables' ? 'WHERE r.incluido_en_reservacion_salon_id IS NULL' : '';
        const nombre = area === 'eventos' ? "CONCAT(j.nombre, ' / ', COALESCE(v.nombre_evento, 'Evento'))" : 'j.nombre';
        const asociados = area === 'eventos'
            ? 'OR pa.servicio_contratado_id IN (SELECT ri.servicio_contratado_id FROM reservacion_inflable ri WHERE ri.incluido_en_reservacion_salon_id = r.id)'
            : '';
        const registros = await filas(c, `SELECT h.id, r.id AS reserva_id, ${nombre} AS servicio, cl.nombre AS cliente,
            DATE_FORMAT(h.inicio_anterior, '%Y-%m-%d %H:%i') AS inicio_anterior,
            DATE_FORMAT(h.fin_anterior, '%Y-%m-%d %H:%i') AS fin_anterior,
            DATE_FORMAT(h.inicio_nuevo, '%Y-%m-%d %H:%i') AS inicio_nuevo,
            DATE_FORMAT(h.fin_nuevo, '%Y-%m-%d %H:%i') AS fin_nuevo,
            h.motivo, h.fecha, u.nombre AS empleado, f.responsable, f.importe_retenido,
            f.importe_conservado, f.anticipo_pendiente, f.saldo_pendiente, f.apartado_objetivo,
            r.estado AS estado_actual,
            NOT EXISTS(SELECT 1 FROM reagendacion h2 JOIN reagendacion_finanzas f2 ON f2.reagendacion_id = h2.id
                WHERE h2.servicio_contratado_id = h.servicio_contratado_id AND h2.id > h.id) AS es_ultima,
            EXISTS(SELECT 1 FROM reagendacion h3 JOIN reagendacion_finanzas f3 ON f3.reagendacion_id = h3.id
                WHERE h3.servicio_contratado_id = h.servicio_contratado_id AND f3.responsable = 'cliente') AS tiene_reagendacion_cliente,
            COALESCE((SELECT SUM(pa.importe) FROM pago_aplicacion pa JOIN concepto_pago cp ON cp.id = pa.concepto_pago_id
                WHERE (pa.servicio_contratado_id = r.servicio_contratado_id ${asociados})
                    AND cp.codigo IN ('ANTICIPO', 'SALDO', 'TOTAL')), 0) AS pago_actual
            FROM reagendacion h JOIN ${cfg.tabla} r ON r.servicio_contratado_id = h.servicio_contratado_id
            JOIN ${cfg.catalogo} j ON j.id = r.${cfg.recurso}
            JOIN reservaciones v ON v.id = r.reservacion_id JOIN clientes cl ON cl.id = v.cliente_id
            JOIN usuarios u ON u.id = h.usuario_id
            LEFT JOIN reagendacion_finanzas f ON f.reagendacion_id = h.id ${filtro} ORDER BY h.fecha DESC, h.id DESC LIMIT 500`);
        return registros.map(r => ({
            ...r,
            anticipo_actual: r.responsable && Number(r.es_ultima) && Number(r.tiene_reagendacion_cliente)
                && r.estado_actual === 'Reservada'
                ? Math.max(0, Math.round(Number(r.apartado_objetivo) * 100) - Math.round(Number(r.pago_actual) * 100)) / 100
                : 0
        }));
    }
}

module.exports = ReagendacionesModel;
