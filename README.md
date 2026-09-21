# Marcapáginas

App de registro de lectura, instalable en el teléfono (PWA). Sin dependencias ni pasos de compilación: son archivos estáticos.

## Qué incluye
- **Leyendo, Leídos y Quiero leer**, con libros, mangas, cómics, artículos y otros.
- **Avance por página** con porcentaje, ritmo de lectura y fecha estimada de término.
- **Citas y notas** por página.
- **Fechas**: inicio y término exactos, o solo mes y año, o solo año (para lecturas antiguas).
- **Meta anual** de libros con seguimiento de ritmo.
- **Resumen** por año: libros, páginas, calificación promedio, días por libro, gráfica por mes, tipos, formato, calificaciones y favoritos.
- **Búsqueda** en títulos, autores, opiniones, citas y notas (ignora acentos).
- **Copia de seguridad**: exportar e importar JSON, y exportar leídos a CSV.
- Funciona **sin internet** una vez abierta la primera vez.

## Probarla en tu computadora
```
cd marcapaginas
python3 -m http.server 8000
```
Abre http://localhost:8000. (Los service workers funcionan en `localhost` y en sitios con HTTPS, no abriendo el archivo con doble clic.)

## Publicarla para instalarla en el teléfono
Necesita una dirección con **HTTPS**. Opciones gratuitas:

1. **Netlify Drop**: entra a app.netlify.com/drop y arrastra la carpeta `marcapaginas`. Te da una dirección https.
2. **GitHub Pages**: sube la carpeta a un repositorio, y en *Settings > Pages* elige la rama principal y la carpeta raíz.
3. **Cloudflare Pages**: conecta el repositorio o sube la carpeta.

## Instalarla
- **Android (Chrome)**: abre la dirección, menú de tres puntos, *Instalar app*. (También aparece el botón *Instalar app* en la pestaña Resumen.)
- **iPhone/iPad (Safari)**: abre la dirección, botón Compartir, *Agregar a inicio*.
- **Computadora (Chrome/Edge)**: icono de instalar en la barra de direcciones.

## Tus datos
Se guardan en el propio dispositivo (`localStorage`). No hay servidor ni cuenta. Por eso:
- Exporta una copia desde **Resumen > Tus datos** de vez en cuando.
- Los datos del teléfono y de la computadora **no se sincronizan** entre sí; puedes pasar uno al otro con exportar e importar.

## Estructura
| Archivo | Para qué |
|---|---|
| `index.html` | Estructura de la página y datos de instalación |
| `styles.css` | Todo el diseño (modo claro y oscuro) |
| `app.js` | Toda la lógica |
| `sw.js` | Guarda la app para usarla sin internet |
| `manifest.webmanifest` | Nombre, colores e iconos de la app instalada |
| `icons/` | Iconos |

## Al hacer cambios
Si cambias `app.js` o `styles.css` y publicas de nuevo, la app instalada muestra la versión nueva en la **segunda** apertura. Para forzar la actualización, sube el número de `CACHE` en `sw.js` (por ejemplo `marcapaginas-v2`).

## Nota sobre las tipografías
Usa Bricolage Grotesque y Literata desde Google Fonts. Se guardan tras la primera visita, pero esa primera visita necesita internet. Para que sean 100 % locales, descarga las fuentes, ponlas en una carpeta `fonts/` y cambia el `<link>` de `index.html` por reglas `@font-face`.

## Ideas para después
- Sincronizar entre dispositivos (requiere una cuenta y un servidor, por ejemplo Supabase o Firebase).
- Publicarla en Google Play empaquetándola con Capacitor o Bubblewrap.
- Portadas de libros y escaneo de ISBN.
- Recordatorios de lectura.
