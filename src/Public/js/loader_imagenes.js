
const API_IMAGENES = '/api/imagenes/buscar';

// Consultar imagen por título
async function buscarImagen(titulo) {
    const respuesta = await fetch(
        `${API_IMAGENES}?titulo=${encodeURIComponent(titulo)}`
    );

    if (!respuesta.ok) {
        return null;
    }

    return await respuesta.json();
}

// Mostrar imagen en una etiqueta HTML
async function cargarImagen(tituloImagen, idElementoHTML) {
    const img = document.getElementById(idElementoHTML);

    if (!img) {
        console.error('No se encontró:', idElementoHTML);
        return;
    }

    try {
        // Buscar por identificador principal
        let datos = await buscarImagen(tituloImagen);

        // Si no existe, intentar con el nombre anterior
        if (!datos && img.dataset.tituloAlternativo) {
            datos = await buscarImagen(
                img.dataset.tituloAlternativo
            );
        }

        if (!datos?.Imagen_URL) {
            console.warn('Imagen no encontrada:', tituloImagen);
            return;
        }

        img.onload = () => {
            img.hidden = false;
            img.style.display = 'block';

            const mensaje = img.nextElementSibling;

            if (mensaje) {
                mensaje.style.display = 'none';
            }
        };

        img.onerror = () => {
            console.error('No se pudo cargar:', tituloImagen);
        };

        img.src = datos.Imagen_URL;

    } catch (error) {
        console.error('Error al cargar imagen:', error);
    }
}

// Cargar fotografías de platillos e inflables
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll(
        '.imagen-platillo, .imagen-inflable'
    ).forEach(img => {
        if (img.dataset.titulo) {
            cargarImagen(img.dataset.titulo, img.id);
        }
    });
});
