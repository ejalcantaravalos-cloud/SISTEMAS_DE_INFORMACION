    const panelEditar = document.getElementById('panelEditarInflable');
    const formEditar = document.getElementById('formEditarInflable');
    const btnCancelar = document.getElementById('btnCancelarEdicion');

    // Abrir formulario de edición
    document.querySelectorAll('.btn-editar-inflable').forEach(boton => {

        boton.addEventListener('click', () => {

            const id = boton.dataset.id;

            // Cargar datos del inflable
            formEditar.elements.namedItem('nombre').value =
                boton.dataset.nombre;

            formEditar.elements.namedItem('medidas_espacio').value =
                boton.dataset.medidas;

            formEditar.elements.namedItem('estado_disponibilidad').value =
                boton.dataset.estado;

            // Ruta para guardar los cambios
          formEditar.action = `/admin/inflables/editar/${id}`;

            // Mostrar formulario
            panelEditar.classList.remove('d-none');

            // Llevar al usuario al formulario
            panelEditar.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

        });

    });

    // Cancelar edición
    btnCancelar.addEventListener('click', () => {
        formEditar.reset();
        formEditar.removeAttribute('action');
        panelEditar.classList.add('d-none');
    });

    
document.addEventListener('DOMContentLoaded', () => {

    const panelEditar = document.getElementById('panelEditarInflable');
    const formEditar = document.getElementById('formEditarInflable');
    const btnCancelar = document.getElementById('btnCancelarEdicion');

    // Abrir formulario de edición
    document.querySelectorAll('.btn-editar-inflable').forEach(boton => {

        boton.addEventListener('click', () => {

            const id = boton.dataset.id;

            // Cargar los datos seleccionados
            formEditar.elements.namedItem('nombre').value =
                boton.dataset.nombre;

            formEditar.elements.namedItem('medidas_espacio').value =
                boton.dataset.medidas;

            formEditar.elements.namedItem('estado_disponibilidad').value =
                boton.dataset.estado;

            // Indicar qué inflable actualizaremos
            formEditar.action = '/admin/inflables/editar/' + id;

            // Mostrar formulario
            panelEditar.classList.remove('d-none');

            // Desplazarse hacia el formulario
            panelEditar.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    });

    // Cancelar edición
    btnCancelar.addEventListener('click', () => {

        formEditar.reset();
        formEditar.removeAttribute('action');
        panelEditar.classList.add('d-none');

    });

});

