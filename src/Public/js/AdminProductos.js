 const formProducto = document.getElementById('formProducto');
    const btnGuardar = document.getElementById('btnGuardarProducto');
    const btnCancelar = document.getElementById('cancelarEdicion');
    const tituloFormulario = document.getElementById('tituloFormulario');

    // Función para EDITAR
    document.querySelectorAll('.btn-editar-producto').forEach(boton => {

        boton.addEventListener('click', () => {
            formProducto.elements.namedItem('imagen').value = '';
            // Obtener los datos del platillo
            const id = boton.dataset.id;
            const nombre = boton.dataset.nombre;
            const precio = boton.dataset.precio;
            const stock = boton.dataset.stock;
            const categoria = boton.dataset.categoria;

            // Colocar los datos en el formulario
            formProducto.elements.namedItem('nombre').value = nombre;
            formProducto.elements.namedItem('precio').value = precio;
            formProducto.elements.namedItem('stock').value = stock;
            formProducto.elements.namedItem('categoria_id').value = categoria;

            // Cambiar la ruta del formulario para ACTUALIZAR
            formProducto.action = '/admin/menu/productos/editar/' + id;

            // Cambiar el título
            tituloFormulario.textContent = 'Editar Platillo: ' + nombre;

            // Cambiar el botón
            btnGuardar.textContent = 'Actualizar Platillo';

            // Mostrar botón de cancelar
            btnCancelar.hidden = false;

            // Desplazar la página al formulario
            document.getElementById('panelFormulario').scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

        });

    });


    // Función para CANCELAR edición
    btnCancelar.addEventListener('click', () => {

        // Limpiar formulario
        formProducto.reset();

        // Regresar a la ruta de creación
        formProducto.action = '/admin/menu/productos/crear';

        // Restaurar título
        tituloFormulario.textContent = 'Registrar Nuevo Platillo';

        // Restaurar botón
        btnGuardar.textContent = 'Guardar Platillo';

        // Ocultar cancelar
        btnCancelar.hidden = true;

    });