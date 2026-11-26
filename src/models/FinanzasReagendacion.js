// Los importes se calculan en centavos. Nunca se altera el dinero recibido en caja.
const CONCEPTOS = ['ANTICIPO', 'SALDO', 'TOTAL'];
const RETENCION = 'RETENCION_REAGENDA';
const centavos = valor => Math.round(Number(valor) * 100);
const pesos = valor => (valor / 100).toFixed(2);

async function filas(c, sql, params = []) {
    const [r] = await c.query(sql, params);
    return r;
}

function exigir(ok, mensaje, status = 409) {
    if (!ok) {
        const error = new Error(mensaje);
        error.status = status;
        throw error;
    }
}

function calcular(area, responsable, servicios, aplicaciones, apartadoOriginal) {
    const total = servicios.reduce((n, r) => n + centavos(r.tarifa_acordada), 0);
    const pagado = aplicaciones.reduce((n, p) => n + centavos(p.importe), 0);
    const apartado = area === 'eventos' ? Math.ceil(total / 2) : apartadoOriginal;
    exigir([total, pagado, apartado].every(n => Number.isSafeInteger(n) && n >= 0),
        'Los importes de la reservación no son válidos.');
    const retenido = responsable === 'cliente' ? Math.min(apartado, pagado) : 0;
    const conservado = pagado - retenido;
    return {
        total, apartado, retenido, conservado,
        nuevoAnticipo: responsable === 'cliente' ? Math.max(0, apartado - conservado) : 0,
        saldo: Math.max(0, total - conservado)
    };
}

async function preparar(c, area, principal, servicios, datos) {
    const ids = servicios.map(r => r.servicio_contratado_id);
    const aplicaciones = await filas(c, `SELECT pa.*, cp.codigo FROM pago_aplicacion pa
        JOIN concepto_pago cp ON cp.id = pa.concepto_pago_id
        WHERE pa.servicio_contratado_id IN (?) AND cp.codigo IN (?)
        ORDER BY CASE WHEN cp.codigo = 'ANTICIPO' THEN 0 ELSE 1 END, pa.id FOR UPDATE`,
        [ids, CONCEPTOS]);
    let apartadoOriginal = 0;
    if (area === 'inflables') {
        // El importe del primer pago de apartado no cambia por una liquidación posterior.
        // Si ya se retuvo, el historial conserva el importe para la siguiente fecha.
        const [anterior] = await filas(c, `SELECT f.apartado_objetivo FROM reagendacion_finanzas f
            JOIN reagendacion h ON h.id = f.reagendacion_id
            WHERE h.servicio_contratado_id = ? ORDER BY h.id LIMIT 1`, [principal.servicio_contratado_id]);
        if (anterior) apartadoOriginal = centavos(anterior.apartado_objetivo);
        else {
            const [original] = await filas(c, `SELECT pa.pago_id, SUM(pa.importe) AS importe
                FROM pago_aplicacion pa JOIN concepto_pago cp ON cp.id = pa.concepto_pago_id
                WHERE pa.servicio_contratado_id = ? AND cp.codigo = 'ANTICIPO'
                GROUP BY pa.pago_id ORDER BY pa.pago_id LIMIT 1`, [principal.servicio_contratado_id]);
            apartadoOriginal = original ? centavos(original.importe) : 0;
        }
    }
    return { ...calcular(area, datos.responsable, servicios, aplicaciones, apartadoOriginal), aplicaciones };
}

async function guardar(c, historiaId, f, datos) {
    await c.query(`INSERT INTO reagendacion_finanzas
        (reagendacion_id, responsable, apartado_objetivo, importe_retenido, importe_conservado,
        anticipo_pendiente, saldo_pendiente) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [historiaId, datos.responsable, pesos(f.apartado), pesos(f.retenido), pesos(f.conservado),
            pesos(f.nuevoAnticipo), pesos(f.saldo)]);
    if (!f.retenido) return;
    const [concepto] = await filas(c, 'SELECT id FROM concepto_pago WHERE codigo = ?', [RETENCION]);
    exigir(concepto, 'Falta ejecutar MigracionRetencionReagendaciones.sql.');
    let restante = f.retenido;
    for (const p of f.aplicaciones) {
        if (!restante) break;
        const importe = centavos(p.importe);
        const mover = Math.min(restante, importe);
        let retenidaId = p.id;
        if (mover === importe) {
            await c.query('UPDATE pago_aplicacion SET concepto_pago_id = ? WHERE id = ?', [concepto.id, p.id]);
        } else {
            await c.query('UPDATE pago_aplicacion SET importe = ? WHERE id = ?', [pesos(importe - mover), p.id]);
            const [r] = await c.query(`INSERT INTO pago_aplicacion
                (pago_id, servicio_contratado_id, concepto_pago_id, importe) VALUES (?, ?, ?, ?)`,
                [p.pago_id, p.servicio_contratado_id, concepto.id, pesos(mover)]);
            retenidaId = r.insertId;
        }
        await c.query(`INSERT INTO reagendacion_retencion
            (reagendacion_id, pago_aplicacion_id, concepto_original_id, importe) VALUES (?, ?, ?, ?)`,
            [historiaId, retenidaId, p.concepto_pago_id, pesos(mover)]);
        restante -= mover;
    }
    exigir(restante === 0, 'No se pudo aplicar la retención completa.');
}

// Cobro manual y explícito del importe que falta para cubrir el nuevo apartado.
// El usuario no puede fijar el importe: confirma el calculado por el servidor.
async function cobrar(c, area, historiaId, datos, usuarioId) {
    exigir(['eventos', 'inflables'].includes(area), 'Área inválida.', 400);
    const tabla = area === 'eventos' ? 'reservacion_salon' : 'reservacion_inflable';
    const filtro = area === 'inflables' ? 'AND r.incluido_en_reservacion_salon_id IS NULL' : '';
    const [turno] = await filas(c, `SELECT t.id FROM turno_caja t JOIN caja j ON j.id = t.caja_id
        WHERE t.usuario_id = ? AND t.cierre IS NULL AND j.activo = 1
        ORDER BY t.id DESC LIMIT 1 FOR UPDATE`, [usuarioId]);
    exigir(turno, 'Abre tu turno de caja para registrar el nuevo anticipo.');
    const [ref] = await filas(c, `SELECT r.id, sc.operacion_id FROM reagendacion h
        JOIN ${tabla} r ON r.servicio_contratado_id = h.servicio_contratado_id
        JOIN servicio_contratado sc ON sc.id = r.servicio_contratado_id
        WHERE h.id = ? ${filtro}`, [historiaId]);
    exigir(ref, 'No se encontró la reagendación.', 404);
    await filas(c, 'SELECT id FROM operacion WHERE id = ? FOR UPDATE', [ref.operacion_id]);
    const [principal] = await filas(c, `SELECT * FROM ${tabla} WHERE id = ? FOR UPDATE`, [ref.id]);
    exigir(principal && principal.estado === 'Reservada', 'La reservación ya no está vigente.');
    const [ultima] = await filas(c, `SELECT h.id FROM reagendacion h
        JOIN reagendacion_finanzas f ON f.reagendacion_id = h.id
        WHERE h.servicio_contratado_id = ? ORDER BY h.id DESC LIMIT 1 FOR UPDATE`, [principal.servicio_contratado_id]);
    exigir(ultima && Number(ultima.id) === historiaId, 'Actualiza la lista antes de cobrar.');
    const [porCliente] = await filas(c, `SELECT h.id FROM reagendacion h
        JOIN reagendacion_finanzas f ON f.reagendacion_id = h.id
        WHERE h.servicio_contratado_id = ? AND f.responsable = 'cliente' LIMIT 1`, [principal.servicio_contratado_id]);
    exigir(porCliente, 'No existe un nuevo apartado por reagendación del cliente.');
    const asociados = area === 'eventos' ? await filas(c, `SELECT * FROM reservacion_inflable
        WHERE incluido_en_reservacion_salon_id = ? ORDER BY id FOR UPDATE`, [principal.id]) : [];
    const servicios = [principal, ...asociados];
    exigir(servicios.every(r => r.estado === 'Reservada'), 'Un servicio asociado ya no está reservado.');
    const ids = servicios.map(r => r.servicio_contratado_id).sort((a, b) => a - b);
    await filas(c, 'SELECT id FROM servicio_contratado WHERE id IN (?) ORDER BY id FOR UPDATE', [ids]);
    const devoluciones = await filas(c, `SELECT id FROM solicitud_devolucion
        WHERE servicio_contratado_id IN (?) AND estado <> 'RECHAZADA' FOR UPDATE`, [ids]);
    exigir(!devoluciones.length, 'Existe una devolución previa. Revisa el caso antes de cobrar.');
    const f = await preparar(c, area, principal, servicios, { responsable: 'negocio' });
    const pendiente = Math.min(f.saldo, Math.max(0, f.apartado - f.conservado));
    exigir(pendiente > 0, 'El nuevo anticipo ya está cubierto.');
    exigir(centavos(datos.importeEsperado) === pendiente, 'El importe cambió. Actualiza la lista antes de cobrar.');
    const [metodo] = await filas(c, 'SELECT id FROM metodo_pago WHERE codigo = ?', [datos.metodo]);
    const [concepto] = await filas(c, "SELECT id FROM concepto_pago WHERE codigo = 'ANTICIPO'");
    exigir(metodo && concepto, 'Falta configurar el catálogo de pagos.');
    const [pago] = await c.query(`INSERT INTO pago
        (operacion_id, metodo_pago_id, turno_caja_id, usuario_id, importe, referencia)
        VALUES (?, ?, ?, ?, ?, ?)`, [ref.operacion_id, metodo.id, turno.id, usuarioId, pesos(pendiente), datos.referencia || null]);
    let restante = pendiente;
    for (const r of servicios) {
        if (!restante) break;
        const abonado = f.aplicaciones.filter(p => Number(p.servicio_contratado_id) === Number(r.servicio_contratado_id))
            .reduce((n, p) => n + centavos(p.importe), 0);
        const importe = Math.min(restante, Math.max(0, centavos(r.tarifa_acordada) - abonado));
        if (!importe) continue;
        await c.query(`INSERT INTO pago_aplicacion
            (pago_id, servicio_contratado_id, concepto_pago_id, importe) VALUES (?, ?, ?, ?)`,
            [pago.insertId, r.servicio_contratado_id, concepto.id, pesos(importe)]);
        restante -= importe;
    }
    exigir(restante === 0, 'No se pudo aplicar el nuevo anticipo.');
    return { pagoId: pago.insertId, importe: pesos(pendiente) };
}

module.exports = { preparar, guardar, calcular, cobrar };
