const db = require('../Database/db').promise();
const mysql = require('mysql2/promise');

function exigir(ok, mensaje) {
    if (!ok) { const e = new Error(mensaje); e.status = 400; throw e; }
}
function centavos(v) {
    const n = Number(v);
    exigir(v != null && Number.isFinite(n) && n >= 0 && n <= 9999999999.99,
        'Tarifa inválida en el catálogo.');
    return Math.round(n * 100);
}
const pesos = n => n / 100;
const suma = filas => filas.reduce((a, f) => a + f.importe, 0);
async function filas(c, sql, params = []) {
    const [r] = await c.query(sql, params); return r;
}
async function insertar(c, sql, params) {
    const [r] = await c.query(sql, params); return r.insertId;
}
async function transaccion(fn) {
    const pool = typeof db.getConnection === 'function';
    const config = db.connection?.config;
    if (!pool && !config) throw new Error('No se pudo obtener una conexión MySQL exclusiva.');
    const c = pool ? await db.getConnection() : await mysql.createConnection({
        host: config.host, port: config.port, user: config.user,
        password: config.password, database: config.database,
        socketPath: config.socketPath, ssl: config.ssl, timezone: config.timezone
    });
    try {
        await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await c.beginTransaction();
        const r = await fn(c);
        await c.commit(); return r;
    } catch (e) {
        try { await c.rollback(); } catch (err) { console.error(err); }
        throw e;
    } finally { if (pool) c.release(); else await c.end(); }
}

// Asigna los beneficios primero a las unidades de mayor precio.
function distribuir(seleccion, catalogo, cupo, limite) {
    return seleccion.map(s => {
        const p = catalogo.find(x => Number(x.id) === s.id);
        exigir(p, 'Algún servicio seleccionado ya no está disponible.');
        return { ...s, nombre: p.nombre, precio: centavos(p.precio_base ?? p.precio_renta) };
    }).sort((a,b) => b.precio - a.precio || a.id - b.id).map(s => {
        const incluidas = Math.min(cupo, s.cantidad);
        cupo -= incluidas;
        return { ...s, incluidas, importe: s.cantidad * s.precio -
            incluidas * Math.min(s.precio, limite) };
    });
}

class ReservacionesEventosModel {
    static async paquetes() {
        return filas(db, `SELECT p.id,p.nombre,t.nombre AS tipo FROM paquetes p
            JOIN tipo_paquete t ON t.id=p.tipo_paquete_id
            WHERE p.activo=1 AND LOWER(TRIM(t.nombre)) IN ('sencillo','preparado') AND (LOWER(TRIM(t.nombre))<>'preparado' OR
            (p.porciones_incluidas>0 AND p.manteles_incluidos>0 AND p.valor_porcion_incluida>0))
            ORDER BY p.nombre`);
    }
    static async clientes() {
        return filas(db, "SELECT id,nombre,telefono,email FROM clientes ORDER BY nombre,id");
    }
    static async listar() {
        return filas(db, `SELECT r.id,r.nombre_evento,c.nombre AS cliente,s.nombre AS salon,
            rs.estado,COALESCE(rp.nombre_paquete,'Sin paquete') AS paquete,
            (SELECT GROUP_CONCAT(i.nombre ORDER BY i.nombre SEPARATOR ', ')
             FROM reservacion_inflable ri JOIN juegos_inflables i ON i.id=ri.inflable_id
             WHERE ri.incluido_en_reservacion_salon_id=rs.id) AS inflable,
            DATE_FORMAT(rs.inicio,'%Y-%m-%d %H:%i') AS inicio,
            DATE_FORMAT(rs.fin,'%Y-%m-%d %H:%i') AS fin,
            rs.tarifa_acordada + COALESCE((SELECT SUM(ri.tarifa_acordada)
                FROM reservacion_inflable ri WHERE ri.incluido_en_reservacion_salon_id=rs.id),0) AS total,
            rs.deposito_limpieza_acordado AS deposito
            FROM reservacion_salon rs JOIN reservaciones r ON r.id=rs.reservacion_id
            JOIN clientes c ON c.id=r.cliente_id JOIN salones s ON s.id=rs.salon_id
            LEFT JOIN reservacion_paquete rp ON rp.reservacion_salon_id=rs.id
            ORDER BY rs.inicio DESC LIMIT 200`);
    }
    static async disponibilidad(d, c = db) {
        const personalizado = d.paquete_id === null;
        const [p] = personalizado ? [{id:null,nombre:'Personalizado',tipo:'personalizado',
            min_invitados:1,max_invitados:null,precio_adicional:0,porciones_incluidas:0,
            valor_porcion_incluida:0,manteles_incluidos:0,cantidad_meseros:0}] : await filas(c, `SELECT p.*,LOWER(TRIM(t.nombre)) AS tipo FROM paquetes p
            JOIN tipo_paquete t ON t.id=p.tipo_paquete_id WHERE p.id=? AND p.activo=1`, [d.paquete_id]);
        exigir(p, 'El paquete no está activo.');
        exigir(personalizado || ['sencillo','preparado'].includes(p.tipo),'Selecciona un paquete de catálogo o la opción Personalizado.');
        if (p.tipo === 'preparado') exigir(Number(p.porciones_incluidas)>0 &&
            Number(p.valor_porcion_incluida)>0 && Number(p.manteles_incluidos)>0,
            'El paquete preparado todavía no está configurado.');
        const salones = await filas(c, `SELECT s.id,s.nombre,s.capacidad,s.largo_m,s.ancho_m,s.alto_m,
            s.tarifa_base,s.horas_incluidas,s.tarifa_hora_extra,s.deposito_limpieza,
            EXISTS(SELECT 1 FROM reservacion_salon r WHERE r.salon_id=s.id
                AND r.estado<>'Cancelada' AND r.inicio<? AND r.fin>?) AS ocupado
            FROM salones s
            WHERE s.activo=1 AND (? IS NULL OR EXISTS(SELECT 1 FROM paquete_salon ps
                WHERE ps.salon_id=s.id AND ps.paquete_id=?)) ORDER BY s.nombre`, [d.fin,d.inicio,p.id,p.id]);
        // La base actual usa precio_completo para la renta del inflable.
        // Usamos precio_completo en SQL, API y cotizador; tarifa_base solo para salones.
        const avisoTarifa = null;
        const inflables = await filas(c, `SELECT i.id,i.nombre,i.largo_m,i.ancho_m,i.alto_m,
            i.precio_completo,
            EXISTS(SELECT 1 FROM reservacion_inflable r WHERE r.inflable_id=i.id
                AND r.estado<>'Cancelada' AND r.inicio<? AND r.fin>?) AS ocupado
            FROM juegos_inflables i WHERE i.activo=1 ORDER BY i.nombre`, [d.fin,d.inicio]);
        const menus = await filas(c, `SELECT id,nombre FROM menu WHERE activo=1
            AND (inicio_vigencia IS NULL OR inicio_vigencia<=?)
            AND (fin_vigencia IS NULL OR fin_vigencia>=?) ORDER BY nombre`, [d.inicio,d.inicio]);
        const productos = await filas(c, `SELECT mp.menu_id,p.id,p.nombre,p.precio_base FROM menu_producto mp
            JOIN producto p ON p.id=mp.producto_id WHERE p.activo=1 ORDER BY p.nombre`);
        const inventario = async (tabla, detalle, llave) => {
            const items = await filas(c, `SELECT * FROM ${tabla} WHERE activo=1 ORDER BY nombre`);
            const usos = await filas(c, `SELECT z.${llave} AS id,z.cantidad,
                DATE_FORMAT(rs.inicio,'%Y-%m-%d %H:%i:%s') AS inicio,
                DATE_FORMAT(rs.fin,'%Y-%m-%d %H:%i:%s') AS fin
                FROM ${detalle} z JOIN reservacion_paquete rp ON rp.reservacion_id=z.reservacion_id
                JOIN reservacion_salon rs ON rs.id=rp.reservacion_salon_id
                WHERE rs.estado<>'Cancelada' AND rs.inicio<? AND rs.fin>?`, [d.fin,d.inicio]);
            // Mayor uso simultáneo dentro del intervalo, no suma de reservas disjuntas.
            return items.map(x=>{
                const eventos=usos.filter(u=>Number(u.id)===Number(x.id)).flatMap(u=>[
                    [u.inicio>d.inicio?u.inicio:d.inicio,Number(u.cantidad)],
                    [u.fin<d.fin?u.fin:d.fin,-Number(u.cantidad)]
                ]).sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]);
                let uso=0,pico=0;
                for(const [,delta] of eventos){uso+=delta;pico=Math.max(pico,uso);}
                return {...x,disponibles:Math.max(0,Number(x.stock_total)-pico)};
            });
        };
        const manteles = await inventario('manteles','reservacion_paquete_mantel','mantel_id');
        const sonidos = await inventario('sonido','reservacion_paquete_sonido','sonido_id');
        const sonidoIncluido = personalizado ? [] : await filas(c, `SELECT sonido_id AS id,cantidad FROM paquete_sonido WHERE paquete_id=?`, [p.id]);
        return { paquete:p,salones,inflables,avisoTarifa,menus,productos:productos.filter(x =>
            menus.some(m => Number(m.id)===Number(x.menu_id))),manteles,sonidos,sonidoIncluido };
    }
    static async cotizar(d, c = db) {
        const a = await this.disponibilidad(d,c), p = a.paquete;
        const s = a.salones.find(x => Number(x.id)===d.salon_id);
        const i = a.inflables.find(x => Number(x.id)===d.inflable_id);
        exigir(s && !Number(s.ocupado), 'El salón no está disponible.');
        exigir(i && !Number(i.ocupado), 'El trampolín o inflable no está disponible en ese horario.');
        exigir(!a.avisoTarifa, a.avisoTarifa);
        exigir(i.precio_completo !== null && i.precio_completo !== undefined && String(i.precio_completo).trim() !== '' &&
            Number.isFinite(Number(i.precio_completo)) && Number(i.precio_completo) >= 0,
            'El inflable seleccionado no tiene una tarifa de renta configurada.');
        exigir(d.invitados >= Number(p.min_invitados) && d.invitados <= Number(s.capacidad) &&
            (p.max_invitados == null || d.invitados <= Number(p.max_invitados)), 'Cantidad de invitados incompatible.');
        const medidas = x => ['largo_m','ancho_m','alto_m'].map(k => Number(x[k]));
        const [sl,sa,sh] = medidas(s), [il,ia,ih] = medidas(i);
        exigir([sl,sa,sh,il,ia,ih].every(n=>Number.isFinite(n)&&n>0), 'Completa las dimensiones del salón e inflable en sus catálogos.');
        exigir(ih<=sh && ((il<=sl&&ia<=sa)||(il<=sa&&ia<=sl)), 'El inflable no cabe en el salón.');
        const preparado = p.tipo==='preparado', sencillo = p.tipo==='sencillo';
        const porciones = preparado ? Number(p.porciones_incluidas) : 0;
        const mantelesIncluidos = preparado ? Number(p.manteles_incluidos) : 0;
        if (sencillo) exigir(!d.comida.length&&!d.manteles.length&&!d.sonidos.length&&!d.meseros&&!d.menu_id, 'El sencillo no incluye extras.');
        if (preparado) exigir(!d.sonidos.length&&!d.meseros, 'El sonido y los meseros del preparado se asignan automáticamente.');
        if (d.comida.length || preparado) exigir(a.menus.some(m=>Number(m.id)===d.menu_id),'Selecciona un menú vigente.');
        exigir(d.comida.reduce((n,x)=>n+x.cantidad,0)>=porciones,'Faltan porciones incluidas por seleccionar.');
        exigir(d.manteles.reduce((n,x)=>n+x.cantidad,0)>=mantelesIncluidos,'Faltan manteles incluidos por seleccionar.');
        const comida = distribuir(d.comida,a.productos.filter(x=>Number(x.menu_id)===d.menu_id),porciones,
            preparado ? centavos(p.valor_porcion_incluida) : 0);
        const seleccionSonido = preparado ? a.sonidoIncluido.map(x=>({id:Number(x.id),cantidad:Number(x.cantidad)})) : d.sonidos;
        function validarStock(seleccion,catalogo) {
            for(const x of seleccion) {
                const item=catalogo.find(y=>Number(y.id)===x.id);
                exigir(item && x.cantidad<=Number(item.disponibles),'Existencias insuficientes para esa fecha (manteles o sonido).');
            }
        }
        validarStock(d.manteles,a.manteles); validarStock(seleccionSonido,a.sonidos);
        const manteles = distribuir(d.manteles,a.manteles,mantelesIncluidos,Infinity);
        const sonidos = distribuir(seleccionSonido,a.sonidos,preparado ? seleccionSonido.reduce((n,x)=>n+x.cantidad,0):0,Infinity);
        const meseros = preparado ? Number(p.cantidad_meseros) : d.meseros;
        const tarifaMesero = preparado || !meseros ? 0 : centavos(d.tarifa_mesero);
        if (!preparado && meseros) exigir(tarifaMesero>0,'Ingresa la tarifa acordada por mesero.');
        exigir(Number(s.horas_incluidas)>0,'Configura las horas incluidas del salón.');
        const horasExtra = Math.max(0,Math.ceil(d.horas-Number(s.horas_incluidas)));
        const salon = centavos(s.tarifa_base) + horasExtra*centavos(s.tarifa_hora_extra);
        const inflable = centavos(i.precio_completo), paquete = centavos(p.precio_adicional);
        const subtotalSalon = salon+paquete+suma(comida)+suma(manteles)+suma(sonidos)+meseros*tarifaMesero;
        const total = subtotalSalon+inflable, deposito = centavos(s.deposito_limpieza);
        exigir(Number.isSafeInteger(total)&&total<=999999999999,'El importe supera el máximo permitido.');
        return { nombrePaquete:p.nombre, salon,inflable,paquete,comida,manteles,sonidos,meseros,tarifaMesero,
            subtotalSalon,total,deposito,anticipo:Math.ceil(total/2),horasExtra };
    }
    static async guardar(d, usuarioId) {
        return transaccion(async c=>{
            // Bloqueos de los recursos, en orden fijo, antes de recalcular disponibilidad.
            if (d.paquete_id !== null) await filas(c,'SELECT id FROM paquetes WHERE id=? FOR UPDATE',[d.paquete_id]);
            await filas(c,'SELECT id FROM salones WHERE id=? FOR UPDATE',[d.salon_id]);
            await filas(c,'SELECT id FROM juegos_inflables WHERE id=? FOR UPDATE',[d.inflable_id]);
            await filas(c,'SELECT id FROM manteles ORDER BY id FOR UPDATE');
            await filas(c,'SELECT id FROM sonido ORDER BY id FOR UPDATE');
            const q = await this.cotizar(d,c);
            exigir(q.total+q.deposito===d.total_esperado,'La cotización cambió. Vuelve a cotizar.');
            const areas=await filas(c,"SELECT id,codigo FROM area_servicio WHERE codigo IN ('SALON','INFLABLE')");
            const area=codigo=>areas.find(x=>x.codigo===codigo)?.id;
            exigir(area('SALON')&&area('INFLABLE'),'Faltan las áreas SALON e INFLABLE.');
            let cliente=d.cliente_id;
            if(cliente) {
                const [existente]=await filas(c,'SELECT id FROM clientes WHERE id=?',[cliente]);
                exigir(existente,'El cliente seleccionado ya no existe.');
            } else {
                cliente=await insertar(c,'INSERT INTO clientes (nombre,telefono,email) VALUES (?,?,?)',[d.cliente,d.telefono,d.email||null]);
            }
            const op=await insertar(c,'INSERT INTO operacion (cliente_id,usuario_id,observaciones) VALUES (?,?,?)',[cliente,usuarioId,d.observaciones||null]);
            const serv=async codigo=>insertar(c,'INSERT INTO servicio_contratado (operacion_id,area_servicio_id) VALUES (?,?)',[op,area(codigo)]);
            const rs=await insertar(c,`INSERT INTO reservaciones (cliente_id,usuario_id,nombre_evento,tipo_evento,numero_invitados,evento_con_menores,observaciones)
                VALUES (?,?,?,?,?,?,?)`,[cliente,usuarioId,d.evento,d.tipo_evento,d.invitados,d.menores,d.observaciones||null]);
            const salonId=await insertar(c,`INSERT INTO reservacion_salon (reservacion_id,salon_id,servicio_contratado_id,inicio,fin,tarifa_acordada,deposito_limpieza_acordado)
                VALUES (?,?,?,?,?,?,?)`,[rs,d.salon_id,await serv('SALON'),d.inicio,d.fin,pesos(q.subtotalSalon),pesos(q.deposito)]);
            await insertar(c,`INSERT INTO reservacion_inflable (reservacion_id,inflable_id,servicio_contratado_id,incluido_en_reservacion_salon_id,inicio,fin,tarifa_acordada)
                VALUES (?,?,?,?,?,?,?)`,[rs,d.inflable_id,await serv('INFLABLE'),salonId,d.inicio,d.fin,pesos(q.inflable)]);
            await c.query(`INSERT INTO reservacion_paquete (reservacion_id,reservacion_salon_id,paquete_id,menu_id,nombre_paquete,precio_paquete,tarifa_salon,cantidad_meseros,tarifa_mesero)
                VALUES (?,?,?,?,?,?,?,?,?)`,[rs,salonId,d.paquete_id,q.comida.length?d.menu_id:null,q.nombrePaquete,pesos(q.paquete),pesos(q.salon),q.meseros,pesos(q.tarifaMesero)]);
            for(const [tabla,llave,items] of [
                ['reservacion_paquete_comida','producto_id',q.comida],
                ['reservacion_paquete_mantel','mantel_id',q.manteles],
                ['reservacion_paquete_sonido','sonido_id',q.sonidos]]) {
                if(items.length) await c.query(`INSERT INTO ${tabla} (reservacion_id,${llave},cantidad,cantidad_incluida,precio_unitario,importe) VALUES ?`,
                    [items.map(x=>[rs,x.id,x.cantidad,x.incluidas,pesos(x.precio),pesos(x.importe)])]);
            }
            return rs;
        });
    }
}
module.exports = ReservacionesEventosModel;
