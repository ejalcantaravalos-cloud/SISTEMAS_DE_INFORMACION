 let comanda = [];
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('btn-agregar')) {
        const id = e.target.getAttribute('data-id');
        const nombre = e.target.getAttribute('data-nombre');
        const precio = Number(e.target.getAttribute('data-precio'));
        
        agregarAComanda(id, nombre, precio);
      }
    });

    function agregarAComanda(id, nombre, precio) {
      const existe = comanda.find(item => item.id == id);
      if (existe) {
        existe.cantidad += 1;
      } else {
        comanda.push({ id, nombre, precio, cantidad: 1 });
      }
      actualizarVistaComanda();
    }

    function cambiarCantidad(id, cambio) {
      const item = comanda.find(i => i.id == id);
      if (item) {
        item.cantidad += cambio;
        if (item.cantidad <= 0) {
          comanda = comanda.filter(i => i.id != id);
        }
      }
      actualizarVistaComanda();
    }

    function actualizarVistaComanda() {
      const contenedor = document.getElementById('listaProductos');
      const mensajeVacio = document.getElementById('mensajeVacio');
      const btnGuardar = document.getElementById('btnGuardar');
      
      let total = 0;
      contenedor.innerHTML = '';

      if (comanda.length === 0) {
        contenedor.appendChild(mensajeVacio);
        btnGuardar.disabled = true;
      } else {
        btnGuardar.disabled = false;
        comanda.forEach(item => {
          const subtotal = item.precio * item.cantidad;
          total += subtotal;

          const div = document.createElement('div');
          div.className = 'item-carrito d-flex justify-content-between align-items-center';
          div.innerHTML = `
            <div>
              <div class="fw-medium small">${item.nombre}</div>
              <div class="text-muted" style="font-size: 0.75rem;">$${item.precio.toFixed(2)} c/u</div>
            </div>
            <div class="d-flex align-items-center gap-1">
              <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="cambiarCantidad('${item.id}', -1)">-</button>
              <span class="small px-1">${item.cantidad}</span>
              <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="cambiarCantidad('${item.id}', 1)">+</button>
            </div>
          `;
          contenedor.appendChild(div);
        });
      }

      document.getElementById('textoTotal').innerText = `$${total.toFixed(2)}`;
    }

    function toggleMesaField() {
      const tipo = document.getElementById('tipoOrden').value;
      const campoMesa = document.getElementById('campoMesa');
      const numeroMesa = document.getElementById('numeroMesa');
      const contenedorCliente = document.getElementById('contenedorCliente');

      if (tipo === 'Para llevar') {
        campoMesa.style.display = 'none';
        numeroMesa.required = false;
        numeroMesa.value = '';
        contenedorCliente.className = 'col-12';
      } else {
        campoMesa.style.display = 'block';
        numeroMesa.required = true;
        contenedorCliente.className = 'col-6';
      }
    }

    function prepararEnvio(event) {
      document.getElementById('inputDetalles').value = JSON.stringify(comanda);
    }