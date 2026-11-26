// ========================================
// NAVEGACIÓN DE CAJA Y RENTAS
// ========================================
// Este middleware se monta ANTES de TurnoCajaRouter en /rentas.
// No realiza consultas, cobros ni cambios de estado.

const SECCIONES = new Set(['menu', 'caja', 'pagos', 'cierres']);
const ORIGENES = new Set(['general', 'eventos', 'inflables']);

function destinoDespuesDePost(req) {
    const ruta = req.path.replace(/\/$/, '');

    // Liquidación y finalización: volver siempre a su sección.
    if (/^\/reservaciones\/[^/]+\/liquidar$/.test(ruta)) {
        return { seccion: 'pagos', origen: 'inflables' };
    }

    if (/^\/reservaciones\/[^/]+\/finalizar$/.test(ruta)) {
        return { seccion: 'cierres', origen: 'inflables' };
    }

    // Apertura y cierre de turno: conservar el módulo de procedencia.
    if (['/turnos/abrir', '/turnos/cerrar'].includes(ruta)) {
        const solicitado = req.body?.origen_menu_rentas;

        const origen = ORIGENES.has(solicitado)
            ? solicitado
            : 'inflables';

        return {
            seccion: origen === 'general' ? 'menu' : 'caja',
            origen
        };
    }

    return null;
}

function redireccionDeCaja(url, destino) {
    if (typeof url !== 'string') {
        return url;
    }

    // Solo cambiar redirecciones al menú de rentas existente.
    // No modificar redirects a login ni a otras rutas.
    if (!/^\/rentas\/?(?:[?#]|$)/.test(url)) {
        return url;
    }

    const destinoURL = new URL(url, 'http://localhost');

    destinoURL.searchParams.set('seccion', destino.seccion);
    destinoURL.searchParams.set('origen', destino.origen);

    // El hash antiguo ya no se necesita: la sección es una página propia.
    return '/rentas?' + destinoURL.searchParams.toString();
}

function contextoMenuRentas(req, res, next) {
    // Solo afecta la vista del menú principal de rentas.
    const seccion = req.query.seccion;

    res.locals.seccionRentas = SECCIONES.has(seccion)
        ? seccion
        : 'menu';

    res.locals.origenMenuRentas = ORIGENES.has(req.query.origen)
        ? req.query.origen
        : 'inflables';

    // Mantener el destino tras el POST sin reescribir TurnoCajaController.
    // Se conserva el código HTTP original y sus mensajes de aviso.
    if (req.method === 'POST') {
        const destino = destinoDespuesDePost(req);

        if (destino) {
            res.locals.seccionRentas = destino.seccion;
            res.locals.origenMenuRentas = destino.origen;

            const redirectOriginal = res.redirect.bind(res);

            res.redirect = function (...args) {
                if (args.length === 1) {
                    return redirectOriginal(redireccionDeCaja(args[0], destino));
                }

                if (args.length === 2 && typeof args[0] === 'number') {
                    return redirectOriginal(args[0], redireccionDeCaja(args[1], destino));
                }

                return redirectOriginal(...args);
            };
        }
    }

    return next();
}

module.exports = contextoMenuRentas;
