const Model = require('../models/ReservacionesEventosModel');
const Avisos = require('../utils/Avisos');
const RUTA = '/rentas/eventos/reservaciones';

function exigir(ok, mensaje) {
    if (!ok) { const e = new Error(mensaje); e.status = 400; throw e; }
}
function entero(v, nombre, min = 1, max = 2147483647) {
    const s = String(v ?? '').trim(), n = Number(s);
    exigir(/^\d+$/.test(s) && Number.isSafeInteger(n) && n>=min && n<=max, `${nombre}: cantidad inválida.`);
    return n;
}
function texto(v, nombre, max, requerido = true) {
    const s = typeof v === 'string' ? v.trim() : '';
    exigir((!requerido || s.length>0) && s.length<=max, `${nombre}: dato inválido.`);
    return s;
}
function fecha(v) {
    exigir(typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v),'Fecha u horario inválido.');
    const d = new Date(v+':00Z');
    exigir(Number.isFinite(d.getTime()) && d.toISOString().slice(0,16)===v,'Fecha u horario inválido.');
    return { sql:v.replace('T',' ')+':00', ms:d.getTime() };
}
function periodo(b) {
    exigir(typeof b.fecha_evento==='string' && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha_evento),'Selecciona una fecha del evento.');
    exigir(typeof b.hora_inicio==='string' && typeof b.hora_fin==='string' && /^\d{2}:\d{2}$/.test(b.hora_inicio) && /^\d{2}:\d{2}$/.test(b.hora_fin),'Selecciona las horas de inicio y fin.');
    const inicio=fecha(b.fecha_evento+'T'+b.hora_inicio), fin=fecha(b.fecha_evento+'T'+b.hora_fin);
    const ahora=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
    exigir(inicio.sql>ahora && fin.ms>inicio.ms,'El evento debe ser futuro y terminar después de iniciar, el mismo día.');
    return { paquete_id:b.paquete_id==='personalizado'?null:entero(b.paquete_id,'Paquete'),inicio:inicio.sql,fin:fin.sql,horas:(fin.ms-inicio.ms)/3600000 };
}
function cantidades(obj) {
    if (obj==null) return [];
    exigir(typeof obj==='object' && !Array.isArray(obj),'Selección inválida.');
    return Object.entries(obj).map(([k,v])=>{
        exigir(/^p_[1-9]\d*$/.test(k),'Identificador inválido.');
        return { id:entero(k.slice(2),'Servicio'),cantidad:entero(v,'Servicio',0,10000) };
    }).filter(x=>x.cantidad>0);
}
function preparar(b) {
    const tarifa=String(b.tarifa_mesero??'0').trim();
    exigir(/^\d+(\.\d{1,2})?$/.test(tarifa) && Number(tarifa)<=9999999999.99,'Tarifa de mesero inválida.');
    return { ...periodo(b),salon_id:entero(b.salon_id,'Salón'),inflable_id:entero(b.inflable_id,'Inflable'),
        invitados:entero(b.invitados,'Invitados',1,10000),
        menu_id:b.menu_id?entero(b.menu_id,'Menú'):null,
        comida:cantidades(b.comida),manteles:cantidades(b.manteles),sonidos:cantidades(b.sonidos),
        meseros:entero(b.meseros??'0','Meseros',0,10000),tarifa_mesero:Number(tarifa) };
}
function responderError(res,e) {
    console.error('RESERVACIONES:',e);
    return res.status(e.status===400?400:500).json({error:e.status===400?e.message:'No se pudo completar la operación. Revisa la consola de Docker.'});
}
class ReservacionesEventosController {
    static async listar(req,res) {
        try {
            const [paquetes,clientes]=await Promise.all([Model.paquetes(),Model.clientes()]);
            return res.render('ReservacionesEventos',{user:req.user,paquetes,clientes,personalizado:req.query.tipo==='personalizado',
                ...Avisos.obtener(req,{creado:'Reservación registrada. Anticipo pendiente de cobro.'})});
        } catch(e) {
            console.error(e);
            return res.status(500).render('ReservacionesEventos',{user:req.user,paquetes:[],clientes:[],personalizado:false,aviso:'No se pudieron cargar las reservaciones.',tipoAviso:'error'});
        }
    }
    static async historial(req,res) {
        try {
            const reservaciones=await Model.listar();
            return res.render('HistorialReservacionesEventos',{user:req.user,reservaciones,
                ...Avisos.obtener(req,{creado:'Reservación registrada. Anticipo pendiente de cobro.'})});
        } catch(e) {
            console.error('HISTORIAL EVENTOS:',e);
            return res.status(500).render('HistorialReservacionesEventos',{user:req.user,reservaciones:[],aviso:'No se pudo cargar el historial.',tipoAviso:'error'});
        }
    }
    static async disponibilidad(req,res) {
        try { res.set('Cache-Control','no-store'); return res.json(await Model.disponibilidad(periodo(req.query))); }
        catch(e) { return responderError(res,e); }
    }
    static async cotizar(req,res) {
        try { return res.json(await Model.cotizar(preparar(req.body))); }
        catch(e) { return responderError(res,e); }
    }
    static async crear(req,res) {
        try {
            const b=req.body, d=preparar(b);
            const usuario=entero(req.user?.id??req.user?.usuario_id,'Usuario de sesión');
            const clienteId=b.cliente_id?entero(b.cliente_id,'Cliente'):null;
            Object.assign(d,{cliente_id:clienteId,cliente:clienteId?'':texto(b.cliente,'Cliente',120),
                telefono:clienteId?'':texto(b.telefono,'Teléfono',30),
                email:clienteId?'':texto(b.email,'Correo',150,false),evento:texto(b.evento,'Evento',150),
                tipo_evento:texto(b.tipo_evento,'Tipo de evento',80),menores:b.menores==='1'?1:0,
                observaciones:texto(b.observaciones,'Observaciones',4000,false),
                total_esperado:entero(b.total_esperado,'Cotización',0,1999999999998)});
            if(d.email) exigir(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email),'Correo inválido.');
            const id=await Model.guardar(d,usuario);
            return res.status(201).json({id,ruta:RUTA+'/historial?aviso=creado'});
        } catch(e) { return responderError(res,e); }
    }
}
module.exports=ReservacionesEventosController;
