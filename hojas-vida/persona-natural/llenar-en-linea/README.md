# Formato Único de Hoja de Vida – Rellenador PDF

Este proyecto permite diligenciar un formulario web y previsualizar/generar un PDF (basado en un formato existente) de forma inmediata. Incluye secciones dinámicas para Educación Superior (hasta 5) e Idiomas (hasta 2), con vista previa en tiempo real (escritorio) u overlay móvil.

## Cómo funciona

- Generación de PDF: usando pdf-lib, se carga un PDF base y se dibuja texto sobre coordenadas específicas.
- Vista previa: usando PDF.js (cargado bajo demanda) para renderizar el PDF en un `<canvas>`.
- Dinámica de secciones: bloques colapsables creados/eliminados desde la UI, con recolección automática de valores y re-render.

## Sistema de coordenadas (resumen)

- Origen (0,0) en la esquina inferior izquierda de la página.
- Unidades en puntos tipográficos (pt), 72 pt ≈ 1 pulgada.
- Y aumenta hacia arriba, X hacia la derecha.

## Ajustar posiciones de texto

- Cada texto se dibuja con `page.drawText(valor, { x, y, size, font, color })`.
- Para mover un campo, modifica `x` y `y`.
- Para textos largos, reduce `size` o abrevia el valor.

## Tablas dinámicas: Educación Superior e Idiomas

Ambas secciones usan filas con `baseY` (coordenada Y inicial) y `step` (salto vertical por fila). La fila i se dibuja en `y = baseY - i * step`.

### Educación Superior (hasta 5)

- baseY = 200, step = 16.
- Columnas (x):
  - Modalidad: 70
  - Semestres: 130
  - Graduado: SI 183 / NO 208
  - Título: 225 (size 7)
  - Mes: 430
  - Año: 460
  - Tarjeta: 505

Si amplías el número de filas, asegúrate de que no colisionen con la sección de Idiomas. Puedes reducir `step` o mover `baseY` unos puntos hacia arriba.

### Idiomas (hasta 2)

- baseYIdiomas = 72, stepIdiomas = 17 (segunda fila aprox. en y=55).
- Columnas (x):
  - Idioma: 160
  - ¿Lo habla?: REGULAR 305, BIEN 320, MUY BIEN 338
  - ¿Lo lee?: REGULAR 355, BIEN 370, MUY BIEN 388
  - ¿Lo escribe?: REGULAR 405, BIEN 422, MUY BIEN 440

## Extender o modificar

- Aumentar filas:
  - Educación superior: sube el límite en `MAX_ITEMS` y verifica solapes.
  - Idiomas: ajusta `MAX_IDIOMAS`; revisa que la última fila no se salga del área.
- Segunda página: no implementado. Si necesitas más espacio, puedes `pdfDoc.addPage()` y dibujar ahí.
- Nuevos campos: añade inputs en `index.html`, léelos en `collectFormValues()` y dibújalos en `buildPdfBytes()` con coordenadas.

## Accesibilidad y UX

- Secciones colapsables con `<details>` y `<summary>`, más H2 colapsables para agrupar.
- Botones de añadir/quitar accesibles con descripciones y `aria-*`.
- Vista previa de escritorio sticky; overlay móvil bloquea scroll y restaura foco al cerrar.

## Ejecutar

- Abre `index.html` en el navegador.
- Completa el formulario. La previsualización en escritorio se actualiza sola.
- En móvil, usa el botón “Ver en PDF” para abrir el overlay.

## Solución de problemas

- Texto desalineado: ajusta `x/y` del campo en `buildPdfBytes()`.
<<<<<<< HEAD
- Se ve al revés o girado: ya se fuerza `rotation: 0` y se reinicia el `canvas` antes de dibujar.
=======
- Se ve al revés o girado: la previsualización usa PDF.js con `dontFlip: false` y `rotation: 0` y se resetean las transformaciones del `canvas` antes de renderizar. Además, en CSS se fija `transform: none` para los canvas. Si sigues viendo algo extraño, prueba limpiar caché del navegador y recargar.
>>>>>>> test-level-2
- No se ve la previsualización: revisa la conexión a CDN de PDF.js (la carga es diferida) o espera unos segundos.

## Estructura mínima

- index.html – Formulario y contenedores de vista previa.
- styles.css – Estilos, responsividad y animaciones.
- script.js – Lógica de recolección, PDF, vista previa y secciones dinámicas.
