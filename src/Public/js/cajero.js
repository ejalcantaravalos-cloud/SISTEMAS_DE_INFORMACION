'use strict';

// ZABAVA | Caja: interfaz de personalización, SIN consultas SQL.
// Los precios y permisos se vuelven a validar en OrdenModel.crearOrden().
(() => {
    const $ = id => document.getElementById(id);
    const catalogo = new Map();
    const edicion = JSON.parse($('formOrden').dataset.edicion || 'null');
    const carrito = edicion ? edicion.items : []; // Cada elemento representa un renglón (puede repetirse el producto).
    let productoActual = null;
    let indiceEdicion = -1;
    let guardando = false;
    const modalElemento = $('modalPersonalizar');
    const modal = bootstrap.Modal.getOrCreateInstance(modalElemento);

    const moneda = centavos => (centavos / 100).toLocaleString('es-MX', {
        style: 'currency', currency: 'MXN'
    });
    const aCentavos = valor => Math.round(Number(valor || 0) * 100);
    const esc = valor => String(valor ?? '').replace(/[&<>"']/g, caracter => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[caracter]);
    const idIngrediente = i => Number(i.platillo_ingrediente_id);

    document.querySelectorAll('.btn-agregar').forEach(boton => {
        try {
            const producto = JSON.parse(boton.dataset.producto);
            if (!producto || !Number.isSafeInteger(Number(producto.id))) {
                throw new Error('Producto inválido');
            }
            catalogo.set(Number(producto.id), producto);
            boton.addEventListener('click', () => abrirPersonalizacion(producto));
        } catch (error) {
            console.error('No se pudo cargar el platillo:', error);
            boton.disabled = true;
            boton.textContent = 'Producto no disponible';
        }
    });

    function porcionExtra(ingrediente, modificaciones) {
        const elegido = modificaciones.find(m =>
            Number(m.platillo_ingrediente_id) === idIngrediente(ingrediente) &&
            m.accion === 'EXTRA'
        );
        return elegido ? Number(elegido.porciones) : 0;
    }

    function abrirPersonalizacion(producto, indice = -1) {
        productoActual = producto;
        indiceEdicion = indice;
        const anterior = indice >= 0 ? carrito[indice] : null;
        const modificaciones = anterior?.modificaciones || [];
        $('tituloModal').textContent = (anterior ? 'Editar: ' : 'Personalizar: ') + producto.nombre;
        $('subtituloModal').textContent = `Precio base ${moneda(aCentavos(producto.precio_base))} · ajustes por unidad`;
        $('cantidadPlatillo').value = anterior?.cantidad || 1;
        $('notaCocina').value = anterior?.nota_cocina || '';
        $('formPersonalizar').querySelector('[type=submit]').textContent = anterior
            ? 'Guardar cambios' : 'Agregar al pedido';

        const receta = producto.ingredientes || [];
        const fijos = receta.filter(i => i.tipo === 'FIJO');
        const removibles = receta.filter(i => i.tipo === 'REMOVIBLE');
        const extras = receta.filter(i => i.tipo === 'EXTRA');

        const imprimirFila = (i) => `<div class="receta-fila d-flex align-items-center justify-content-between gap-3">
            <span>${esc(i.nombre)} <small class="texto-suave">(${esc(i.cantidad_porcion)} ${esc(i.unidad)})</small></span>
            <span class="badge text-bg-light border"><i class="bi bi-lock me-1"></i>Fijo</span>
        </div>`;
        const imprimirRemovible = i => {
            const quitado = modificaciones.some(m =>
                Number(m.platillo_ingrediente_id) === idIngrediente(i) && m.accion === 'QUITAR'
            );
            return `<label class="receta-fila d-flex align-items-center justify-content-between gap-3">
                <span>Con ${esc(i.nombre)} <small class="texto-suave">(${esc(i.cantidad_porcion)} ${esc(i.unidad)})</small></span>
                <input class="form-check-input flex-shrink-0 check-removible" type="checkbox"
                    data-id="${idIngrediente(i)}" ${quitado ? '' : 'checked'} aria-label="Incluir ${esc(i.nombre)}">
            </label>`;
        };
        const imprimirExtra = i => {
            const max = Math.max(1, Number(i.max_porciones_extra) || 1);
            const porciones = Math.min(max, porcionExtra(i, modificaciones));
            const id = idIngrediente(i);
            return `<div class="receta-fila d-flex align-items-center justify-content-between gap-2 flex-wrap">
                <span>${esc(i.nombre)}
                    <small class="texto-suave d-block">+ ${moneda(aCentavos(i.precio_extra))} por porción · máximo ${max}</small>
                </span>
                <div class="input-group input-group-sm" style="max-width: 138px;">
                    <button type="button" class="btn btn-outline-secondary cambiar-extra" data-id="${id}" data-direccion="-1" aria-label="Quitar porción extra">−</button>
                    <input class="form-control text-center numero-extra" type="number" data-id="${id}" min="0" max="${max}" step="1" value="${porciones}" aria-label="Porciones de ${esc(i.nombre)}">
                    <button type="button" class="btn btn-outline-secondary cambiar-extra" data-id="${id}" data-direccion="1" aria-label="Agregar porción extra">+</button>
                </div>
            </div>`;
        };
        const seccion = (titulo, subtitulo, contenido) => contenido
            ? `<section class="receta-seccion"><h3 class="h6 fw-bold mb-1">${titulo}</h3><p class="texto-suave small mb-2">${subtitulo}</p>${contenido}</section>` : '';
        $('seccionesIngredientes').innerHTML =
            seccion('Ingredientes fijos', 'Siempre incluidos; no se pueden quitar.', fijos.map(imprimirFila).join('')) +
            seccion('Ingredientes removibles', 'Desmarca lo que el cliente NO quiere (no cambia el precio).', removibles.map(imprimirRemovible).join('')) +
            seccion('Extras con costo', 'Agrega porciones adicionales con + y −.', extras.map(imprimirExtra).join(''));

        actualizarSubtotalModal();
        modal.show();
    }

    function leerModificaciones() {
        const receta = productoActual.ingredientes || [];
        const modificaciones = [];
        for (const i of receta) {
            const id = idIngrediente(i);
            if (i.tipo === 'REMOVIBLE') {
                const caja = [...modalElemento.querySelectorAll('.check-removible')]
                    .find(e => Number(e.dataset.id) === id);
                if (caja && !caja.checked) {
                    modificaciones.push({ platillo_ingrediente_id: id, accion: 'QUITAR' });
                }
            }
            if (i.tipo === 'EXTRA') {
                const campo = [...modalElemento.querySelectorAll('.numero-extra')]
                    .find(e => Number(e.dataset.id) === id);
                const porciones = Number(campo?.value || 0);
                if (!Number.isSafeInteger(porciones) || porciones < 0 ||
                        porciones > Number(i.max_porciones_extra || 1)) {
                    throw new Error(`Cantidad inválida para ${i.nombre}.`);
                }
                if (porciones > 0) {
                    modificaciones.push({ platillo_ingrediente_id: id, accion: 'EXTRA', porciones });
                }
            }
        }
        return modificaciones;
    }

    function precioUnitarioCentavos(producto, modificaciones) {
        let precio = aCentavos(producto.precio_base);
        for (const cambio of modificaciones) {
            if (cambio.accion !== 'EXTRA') continue;
            const ingrediente = (producto.ingredientes || []).find(i =>
                idIngrediente(i) === Number(cambio.platillo_ingrediente_id)
            );
            if (ingrediente) precio += aCentavos(ingrediente.precio_extra) * Number(cambio.porciones);
        }
        return precio;
    }

    function resumenCambios(producto, modificaciones) {
        return modificaciones.map(cambio => {
            const ingrediente = (producto.ingredientes || []).find(i =>
                idIngrediente(i) === Number(cambio.platillo_ingrediente_id)
            );
            if (!ingrediente) return '';
            return cambio.accion === 'QUITAR'
                ? `Sin ${ingrediente.nombre}`
                : `${ingrediente.nombre} extra × ${cambio.porciones}`;
        }).filter(Boolean);
    }

    function actualizarSubtotalModal() {
        if (!productoActual) return;
        try {
            const cantidad = Math.min(99, Math.max(1, Number($('cantidadPlatillo').value) || 1));
            const cambios = leerModificaciones();
            $('subtotalModal').textContent = moneda(precioUnitarioCentavos(productoActual, cambios) * cantidad);
        } catch (_) {
            $('subtotalModal').textContent = 'Revisa las cantidades';
        }
    }

    modalElemento.addEventListener('change', actualizarSubtotalModal);
    modalElemento.addEventListener('input', actualizarSubtotalModal);
    modalElemento.addEventListener('click', e => {
        const boton = e.target.closest('.cambiar-extra');
        if (!boton) return;
        const campo = [...modalElemento.querySelectorAll('.numero-extra')]
            .find(i => i.dataset.id === boton.dataset.id);
        if (!campo) return;
        const max = Number(campo.max);
        const proximo = (Number(campo.value) || 0) + Number(boton.dataset.direccion);
        campo.value = Math.max(0, Math.min(max, proximo));
        actualizarSubtotalModal();
    });

    $('formPersonalizar').addEventListener('submit', e => {
        e.preventDefault();
        if (!$('formPersonalizar').reportValidity() || !productoActual) return;
        const cantidad = Number($('cantidadPlatillo').value);
        if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 99) {
            return mostrarAviso('danger', 'Selecciona una cantidad de platillos entre 1 y 99.');
        }
        let modificaciones;
        try { modificaciones = leerModificaciones(); }
        catch (error) { return mostrarAviso('danger', error.message); }

        const linea = {
            id: Number(productoActual.id),
            cantidad,
            modificaciones,
            nota_cocina: $('notaCocina').value.trim()
        };
        if (indiceEdicion >= 0) carrito[indiceEdicion] = linea;
        else carrito.push(linea);
        renderizarCarrito();
        modal.hide();
    });

    function renderizarCarrito() {
        const lista = $('listaProductos');
        const vacio = $('mensajeVacio');
        lista.querySelectorAll('.detalle-item').forEach(fila => fila.remove());
        let totalCentavos = 0;
        carrito.forEach((linea, indice) => {
            const producto = catalogo.get(linea.id);
            if (!producto) return;
            const precio = precioUnitarioCentavos(producto, linea.modificaciones);
            totalCentavos += precio * linea.cantidad;
            const cambios = resumenCambios(producto, linea.modificaciones);
            const div = document.createElement('div');
            div.className = 'detalle-item';
            div.innerHTML = `<div class="d-flex justify-content-between gap-2">
                <div class="flex-grow-1">
                    <strong class="small">${esc(linea.cantidad)} × ${esc(producto.nombre)}</strong>
                    <div class="small text-success fw-semibold">${moneda(precio * linea.cantidad)}</div>
                    ${cambios.length ? `<div class="small texto-suave">${esc(cambios.join(' · '))}</div>` : ''}
                    ${linea.nota_cocina ? `<div class="small texto-suave">Nota: ${esc(linea.nota_cocina)}</div>` : ''}
                </div>
                <div class="d-flex flex-column align-items-end gap-1">
                    <button class="btn btn-sm btn-outline-secondary btn-editar-item" data-indice="${indice}" type="button" aria-label="Editar platillo"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger btn-quitar-item" data-indice="${indice}" type="button" aria-label="Quitar platillo"><i class="bi bi-trash"></i></button>
                </div>
            </div>`;
            lista.append(div);
        });
        vacio.classList.toggle('d-none', carrito.length > 0);
        $('textoTotal').textContent = moneda(totalCentavos);
        $('btnGuardar').disabled = guardando || carrito.length === 0;
    }

    $('listaProductos').addEventListener('click', e => {
        const editar = e.target.closest('.btn-editar-item');
        const quitar = e.target.closest('.btn-quitar-item');
        if (!editar && !quitar) return;
        const indice = Number((editar || quitar).dataset.indice);
        if (!Number.isSafeInteger(indice) || indice < 0 || indice >= carrito.length) return;
        if (quitar) { carrito.splice(indice, 1); renderizarCarrito(); return; }
        const producto = catalogo.get(carrito[indice].id);
        if (producto) abrirPersonalizacion(producto, indice);
    });

    function mostrarAviso(tipo, mensaje, pedidoId = null) {
        window.mostrarAvisoZabava(tipo, mensaje, pedidoId);
    }

    function actualizarMesa() {
        const local = $('tipoOrden').value === 'Mesa';
        $('campoMesa').classList.toggle('d-none', !local);
        $('numeroMesa').required = local;
        if (!local) $('numeroMesa').value = '';
    }
    $('tipoOrden').addEventListener('change', actualizarMesa);
    if (edicion) {
        $('tipoOrden').value = edicion.tipo_orden;
        $('numeroMesa').value = edicion.numero_mesa;
        $('nombreCliente').value = edicion.nombre_cliente;
        $('notaGeneral').value = edicion.nota;
        renderizarCarrito();
    }
    actualizarMesa();

    $('buscarPlatillo').addEventListener('input', e => {
        const filtro = e.target.value.trim().toLocaleLowerCase('es-MX');
        let encontrados = 0;
        document.querySelectorAll('.producto-columna').forEach(col => {
            const visible = col.dataset.busqueda.includes(filtro);
            col.classList.toggle('d-none', !visible);
            if (visible) encontrados++;
        });
        $('sinCoincidencias').classList.toggle('d-none', encontrados > 0 || filtro === '');
    });

    $('formOrden').addEventListener('submit', async evento => {
        evento.preventDefault();
        if (guardando || !carrito.length || !$('formOrden').reportValidity()) return;
        guardando = true;
        $('inputDetalles').value = JSON.stringify(carrito.map(({ id, cantidad, modificaciones, nota_cocina }) => ({
            id, cantidad, modificaciones, nota_cocina
        })));
        const boton = $('btnGuardar');
        boton.disabled = true;
        boton.textContent = 'Guardando orden…';
        try {
            const respuesta = await fetch($('formOrden').action, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
                body: new URLSearchParams(new FormData($('formOrden')))
            });
            const tipo = respuesta.headers.get('content-type') || '';
            if (respuesta.redirected || !tipo.includes('application/json')) {
                throw new Error(`Respuesta inesperada del servidor (HTTP ${respuesta.status}). Comprueba la ruta y tu sesión antes de reintentar.`);
            }
            const datos = await respuesta.json();
            if (!respuesta.ok || !datos.ok) {
                throw new Error(datos.error || 'No se pudo registrar la orden.');
            }
            if (edicion) {
                window.location.assign(datos.redirect);
                return;
            }
            mostrarAviso('success', `¡Orden #${datos.pedido_id} registrada! Total: ${moneda(aCentavos(datos.total))}.`, datos.pedido_id);
            carrito.splice(0);
            $('formOrden').reset();
            actualizarMesa();
            renderizarCarrito();
        } catch (error) {
            console.error('Error registrando orden:', error);
            mostrarAviso('danger', error.message || 'Error de conexión. Verifica si la orden ya aparece antes de reintentar.');
        } finally {
            guardando = false;
            boton.textContent = edicion ? 'Guardar cambios' : 'Registrar orden';
            boton.disabled = carrito.length === 0;
        }
    });
})();
