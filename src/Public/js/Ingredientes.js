// Interacción del formulario de edición
  document.querySelectorAll('.btn-editar').forEach(boton => {
    boton.addEventListener('click', () => {
      const id = Number(boton.dataset.id);
      if (!Number.isSafeInteger(id) || id <= 0) return;
      document.getElementById('formEditar').action = `/admin/ingredientes/${id}/editar`;
      document.getElementById('editarNombre').value = boton.dataset.nombre;
      document.getElementById('editarUnidad').value = boton.dataset.unidad;
      document.getElementById('editarCaducidad').checked = boton.dataset.caducidad === '1';
    });
  });

  // Abrir el formulario de entradas con el ingrediente seleccionado.
  document.querySelectorAll('.btn-entrada').forEach(boton => {
    boton.addEventListener('click', () => {
      const id = Number(boton.dataset.id);
      if (!Number.isSafeInteger(id) || id <= 0) return;
      document.getElementById('formEntrada').reset();
      document.getElementById('errorEntrada').classList.add('d-none');
      document.getElementById('formEntrada').action = `/admin/ingredientes/${id}/entrada`;
      document.getElementById('formEntrada').dataset.ingredienteId = String(id);
      document.getElementById('entradaNombre').textContent = boton.dataset.nombre;
      document.getElementById('entradaUnidad').textContent = boton.dataset.unidad;
      document.getElementById('entradaTotal').textContent = 'Total aproximado: —';
    });
  });
  const actualizarTotal = () => {
    const cantidad = Number(document.getElementById('entradaCantidad').value);
    const costo = Number(document.getElementById('entradaCosto').value);
    const texto = cantidad > 0 && costo >= 0 && document.getElementById('entradaCosto').value !== ''
      ? (cantidad * costo).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
      : '—';
    document.getElementById('entradaTotal').textContent = 'Total aproximado: ' + texto;
  };
  document.getElementById('entradaCantidad').addEventListener('input', actualizarTotal);
  document.getElementById('entradaCosto').addEventListener('input', actualizarTotal);

  // Enviar la entrada con fetch (sin navegación ni recarga de la pantalla).
  const formEntrada = document.getElementById('formEntrada');
  const botonEntrada = document.getElementById('btnGuardarEntrada');
  const errorEntrada = document.getElementById('errorEntrada');

  function mostrarAvisoEntrada(mensaje) {
    const aviso = document.getElementById('avisoEntrada');
    document.getElementById('avisoEntradaTexto').textContent = mensaje;
    aviso.classList.remove('d-none');
    aviso.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Consultar el HTML actualizado para reflejar las existencias reales de MySQL.
  async function refrescarExistencias(id) {
    const respuesta = await fetch('/admin/ingredientes', {
      headers: { Accept: 'text/html' },
      credentials: 'same-origin'
    });
    if (!respuesta.ok || respuesta.redirected) {
      throw new Error('No se pudo actualizar la tabla.');
    }

    const html = await respuesta.text();
    const documento = new DOMParser().parseFromString(html, 'text/html');
    const selector = `tr[data-ingrediente-id="${id}"]`;
    const origen = documento.querySelector(selector);
    const destino = document.querySelector(selector);
    if (!origen || !destino) throw new Error('No se encontró el ingrediente.');

    ['disponible', 'costo'].forEach(columna => {
      const nuevo = origen.querySelector(`[data-col="${columna}"]`);
      const actual = destino.querySelector(`[data-col="${columna}"]`);
      if (nuevo && actual) actual.textContent = nuevo.textContent;
    });
  }

  
formEntrada.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  if (!formEntrada.reportValidity() || botonEntrada.disabled) {
    return;
  }

  botonEntrada.disabled = true;
  botonEntrada.textContent = 'Guardando…';
  errorEntrada.classList.add('d-none');

  try {
    const respuesta = await fetch(formEntrada.action, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      },
      credentials: 'same-origin',
      body: new URLSearchParams(new FormData(formEntrada))
    });

    // DIAGNÓSTICO DE LA RESPUESTA
    const tipoRespuesta =
      respuesta.headers.get('content-type') || '';

    console.log('=== REGISTRO DE ENTRADA ===');
    console.log('Estado HTTP:', respuesta.status);
    console.log('URL final:', respuesta.url);
    console.log('Redirección:', respuesta.redirected);
    console.log('Tipo de contenido:', tipoRespuesta);

    // Comprobar si Express realizó una redirección
    if (respuesta.redirected) {
      throw new Error(
        'El servidor realizó una redirección a: ' +
        respuesta.url +
        '. Comprueba si la entrada ya se guardó.'
      );
    }

    // Comprobar que la respuesta sea JSON
    if (!tipoRespuesta.includes('application/json')) {
      throw new Error(
        'El servidor devolvió HTML en lugar de JSON. ' +
        'Estado HTTP: ' + respuesta.status +
        '. Revisa la consola del navegador.'
      );
    }

    const resultado = await respuesta.json();

    // Comprobar resultado del guardado
    if (!respuesta.ok || !resultado.ok) {
      throw new Error(
        resultado.mensaje || 'No se pudo registrar la entrada.'
      );
    }

    // GUARDADO CONFIRMADO
    bootstrap.Modal.getOrCreateInstance(
      document.getElementById('modalEntrada')
    ).hide();

    mostrarAvisoEntrada(
      resultado.mensaje ||
      '¡Entrada registrada correctamente!'
    );

    // Actualizar existencias sin recargar la página
    try {
      await refrescarExistencias(
        formEntrada.dataset.ingredienteId
      );
    } catch (error) {
      console.error('Error actualizando tabla:', error);

      mostrarAvisoEntrada(
        'Entrada guardada. Recarga la página ' +
        'para visualizar las existencias actualizadas.'
      );
    }

  } catch (error) {
    console.error('Error al registrar entrada:', error);

    errorEntrada.textContent =
      error.message || 'Ocurrió un error de conexión.';

    errorEntrada.classList.remove('d-none');

  } finally {
    botonEntrada.disabled = false;
    botonEntrada.textContent = 'Registrar entrada';
  }
});


  const buscar = document.getElementById('buscarIngrediente');
  const estado = document.getElementById('filtrarEstado');
  const filtrar = () => {
    let visibles = 0;
    document.querySelectorAll('#tablaIngredientes tr').forEach(fila => {
      const coincideNombre = fila.dataset.nombre.includes(buscar.value.trim().toLowerCase());
      const coincideEstado = estado.value === 'todos' || fila.dataset.estado === estado.value;
      const visible = coincideNombre && coincideEstado;
      fila.classList.toggle('d-none', !visible);
      if (visible) visibles++;
    });
    document.getElementById('sinResultados').classList.toggle('d-none', visibles > 0 || document.querySelectorAll('#tablaIngredientes tr').length === 0);
  };
  buscar.addEventListener('input', filtrar);
  estado.addEventListener('change', filtrar);