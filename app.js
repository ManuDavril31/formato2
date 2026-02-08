const { PDFDocument, StandardFonts, rgb } = PDFLib

// ============================================================
// ALTERNATIVA 3 (RECOMENDADA): CANVAS + PDF HÍBRIDO
// ============================================================
// Preview con Canvas API (rápido) + Exportación con PDF-lib (exacta)
// ============================================================

// Configuración de selects que marcan con X
const selectMarkings = {
  orden: {
    'nal': 'orden_nal',
    'dptl': 'orden_dptl',
    'dstr': 'orden_dstr',
    'mpl': 'orden_mpl',
    'otro': 'orden_otro'
  }
}

// Mapeo para tipoEmpresa1: pública -> marca en una posición, privada -> en otra
selectMarkings.tipoEmpresa1 = {
  'X': 'tipoEmpresa1_publica', // valor 'X' en el select representa Pública
  'privada': 'tipoEmpresa1_privada'
}
// Mapeos para tipoEmpresa2..5
selectMarkings.tipoEmpresa2 = {
  'X': 'tipoEmpresa2_publica',
  'privada': 'tipoEmpresa2_privada'
}
selectMarkings.tipoEmpresa3 = {
  'X': 'tipoEmpresa3_publica',
  'privada': 'tipoEmpresa3_privada'
}
selectMarkings.tipoEmpresa4 = {
  'X': 'tipoEmpresa4_publica',
  'privada': 'tipoEmpresa4_privada'
}
selectMarkings.tipoEmpresa5 = {
  'X': 'tipoEmpresa5_publica',
  'privada': 'tipoEmpresa5_privada'
}
// Mapeo de coordenadas: nombre del campo -> posición en PDF
const pdfCoordinates = {
  // I. IDENTIFICACIÓN
  razonSocial: { x: 135, y: 640 },
  sigla: { x: 55, y: 626 },
  nit: { x: 440, y: 626 },
  orden_nal: { x: 46, y: 586 },     // Para marcar "Nacional"
  orden_dptl: { x: 76, y: 586 },    // Para marcar "Departamental"
  orden_dstr: { x: 106, y: 586 },    // Para marcar "Distrital"
  orden_mpl: { x: 136, y: 586 },     // Para marcar "Municipal"
  orden_otro: { x: 166, y: 586 },    // Para marcar "Otro"
  ordenCual: { x: 223, y: 586 },
  tipo: { x: 304, y: 586 },
  clase: { x: 464, y: 586 }, // Coordenada ejemplo, ajustar si es necesario
  // DOMICIOLIO CORRESPONDENCIA,
  pais: { x: 170, y: 561 },
  departamento: { x: 353, y: 561 },
  municipio: { x: 70, y: 548 },
  direccion: { x: 283, y: 548 },
  telefonos: { x: 72, y: 535 },
  fax: { x: 255, y: 535 },
  apartadoAereo: { x: 500, y: 535 },
    
  // II. SERVICIOS
    servicio1: { x: 50, y: 485 },
    servicio2: { x: 320, y: 485 },
    servicio3: { x: 50, y: 470 },
    servicio4: { x: 320, y: 470 },
  servicio5: { x: 50, y: 458 },
  servicio6: { x: 320, y: 458 },

  // III. EXPERIENCIA
  experiencia1: { x: 35, y: 393 },
  // Posiciones para marcar 'X' según tipoEmpresa1
  tipoEmpresa1_publica: { x: 293, y: 393 },
  tipoEmpresa1_privada: { x: 323, y: 393 },
  telefono_exp1: { x: 343, y: 393 },
  fecha_term_exp1: { x: 420, y: 393 },
  valorContrato_exp1: { x: 502, y: 393 },

  // Experiencias adicionales (se ponen un poco más abajo cada una)
  experiencia2: { x: 35, y: 380 },
  tipoEmpresa2_publica: { x: 293, y: 378 },
  tipoEmpresa2_privada: { x: 323, y: 378 },
  telefono_exp2: { x: 343, y: 380 },
  fecha_term_exp2: { x: 420, y: 380 },
  valorContrato_exp2: { x: 502, y: 380 },

  experiencia3: { x: 35, y: 367 },
  tipoEmpresa3_publica: { x: 293, y: 365 },
  tipoEmpresa3_privada: { x: 323, y: 365 },
  telefono_exp3: { x: 343, y: 367 },
  fecha_term_exp3: { x: 420, y: 367 },
  valorContrato_exp3: { x: 502, y: 367 },

  experiencia4: { x: 35, y: 354 },
  tipoEmpresa4_publica: { x: 293, y: 352 },
  tipoEmpresa4_privada: { x: 323, y: 352 },
  telefono_exp4: { x: 343, y: 354 },
  fecha_term_exp4: { x: 420, y: 354 },
  valorContrato_exp4: { x: 502, y: 354 },

  experiencia5: { x: 35, y: 341 },
  tipoEmpresa5_publica: { x: 293, y: 339 },
  tipoEmpresa5_privada: { x: 323, y: 339 },
  telefono_exp5: { x: 343, y: 341 },
  fecha_term_exp5: { x: 420, y: 341 },
  valorContrato_exp5: { x: 502, y: 341 },

  
  // IV. REPRESENTANTE LEGAL
  primerApellido: { x: 80, y: 260 },
  segundoApellido: { x: 240, y: 260 },
  nombres: { x: 380, y: 260 },
  documento: { x: 200, y: 230 },
}

let baseCanvasImage = null
const scale = 1.5
// Tamaño de fuente en el PDF para las marcas 'X' (en puntos).
const MARK_FONT_SIZE = 14

// Función helper: obtener coordenada de X según el select
function getMarkingCoords(selectName, value) {
  const mapping = selectMarkings[selectName]
  if (!mapping || !mapping[value]) return null
  return pdfCoordinates[mapping[value]]
}

// ============================================================
// PASO 1: INICIALIZACIÓN (UNA SOLA VEZ AL CARGAR PÁGINA)
// ============================================================
// Cargar PDF original en canvas OCULTO, renderizarlo y guardar su imagen
async function initializePDF() {
  if (window['pdfjsLib']) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    
    const pdfBytes = await fetch('plantilla.pdf').then(res => res.arrayBuffer())
    const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise
    const pdfPage = await pdf.getPage(1)
    
    // ⭐ Canvas OCULTO para renderizar el PDF con PDF.js
    const hiddenCanvas = document.getElementById('pdf-canvas-hidden')
    const hiddenCtx = hiddenCanvas.getContext('2d')
    const viewport = pdfPage.getViewport({ scale })
    
    hiddenCanvas.width = viewport.width
    hiddenCanvas.height = viewport.height
    
    // Pintar fondo blanco en canvas oculto
    hiddenCtx.fillStyle = '#fff'
    hiddenCtx.fillRect(0, 0, hiddenCanvas.width, hiddenCanvas.height)
    
    // Renderizar PDF en canvas OCULTO (sin conflictos)
    await pdfPage.render({
      canvasContext: hiddenCtx,
      viewport: viewport
    }).promise
    
    // ⭐ CLAVE: Guardar la imagen base del canvas oculto
    baseCanvasImage = hiddenCtx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height)
    
    // Configurar canvas VISIBLE con las mismas dimensiones
    const visibleCanvas = document.getElementById('pdf-preview')
    visibleCanvas.width = hiddenCanvas.width
    visibleCanvas.height = hiddenCanvas.height
    
    // Dibujar la imagen base en el canvas visible
    const visibleCtx = visibleCanvas.getContext('2d')
    visibleCtx.putImageData(baseCanvasImage, 0, 0)
  }
}

// ============================================================
// PASO 2: PREVIEW EN TIEMPO REAL (CADA KEYSTROKE)
// ============================================================
// Restaurar PDF base + dibujar texto con Canvas API (ULTRA RÁPIDO)
function updateCanvasPreview(formData) {
  const canvas = document.getElementById('pdf-preview')
  const ctx = canvas.getContext('2d')
  
  // Restaurar la imagen base sin regenerar PDF
  ctx.putImageData(baseCanvasImage, 0, 0)
  
  // Superponer texto con Canvas API (mismo estilo que el PDF)
  ctx.font = 'bold 12px Helvetica, Arial, sans-serif'
  ctx.fillStyle = '#000'
  
  // Iterar cada campo y dibujarlo
  Object.entries(pdfCoordinates).forEach(([field, coords]) => {
    if (formData[field]) {
      // Convertir coordenadas PDF a canvas
      const canvasX = coords.x * scale
      const canvasY = canvas.height - (coords.y * scale)
      // Aplicar letter-spacing solo al campo "tipo" y "clase"
      if (field === 'tipo' || field === 'clase') {
        drawTextWithLetterSpacing(ctx, String(formData[field]), canvasX, canvasY, 3)
      } else {
        ctx.fillText(String(formData[field]), canvasX, canvasY)
      }
    }
  })
  
  // Dibujar X según la opción seleccionada
  const coords = getMarkingCoords('orden', formData.orden)

  // Calcular tamaño de fuente en px para canvas a partir del tamaño en puntos del PDF
  const markFontPx = Math.round(MARK_FONT_SIZE * scale)
  ctx.font = `bold ${markFontPx}px Helvetica, Arial, sans-serif`
  ctx.fillStyle = '#000'

  if (coords) {
    const xCoord = coords.x * scale
    const yCoord = canvas.height - (coords.y * scale)
    ctx.fillText('X', xCoord, yCoord)
  }

  // Dibujar X para tipoEmpresa1..5
  for (let i = 1; i <= 5; i++) {
    const selectName = `tipoEmpresa${i}`
    const tipoCoords = getMarkingCoords(selectName, formData[selectName])
    if (tipoCoords) {
      const xCoord = tipoCoords.x * scale
      const yCoord = canvas.height - (tipoCoords.y * scale)
      ctx.fillText('X', xCoord, yCoord)
    }
  }

  // Dibujar marcas de agua grandes y diagonales a lo largo del canvas
  drawCanvasWatermarks(ctx, canvas.width, canvas.height)
}

// Dibuja múltiples marcas de agua diagonales grandes en el canvas
function drawCanvasWatermarks(ctx, width, height) {
  const text = 'formatounico.com'
  // tamaño relativo al ancho del canvas para que se vea ancho (ligeramente reducido)
  const fontSize = Math.max(100, Math.floor(width * 0.16))
  ctx.save()
  // Ajuste: aclarar color y reducir opacidad ligeramente
  ctx.globalAlpha = 0.42
  ctx.fillStyle = '#666666'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold ${fontSize}px Arial, sans-serif`

  // Posiciones a lo largo de una diagonal, distribuidas uniformemente
  const positions = [0.12, 0.32, 0.52, 0.72, 0.92]
  positions.forEach((px, i) => {
    const x = Math.floor(width * px)
    // distribuir verticalmente con un ligero offset para evitar solapamiento
    const y = Math.floor(height * (0.18 + i * 0.18))
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-Math.PI / 4)
    ctx.fillText(text, 0, 0)
    ctx.restore()
  })

  ctx.restore()
}

// Función helper: dibujar texto con letter-spacing personalizado
function drawTextWithLetterSpacing(ctx, text, x, y, letterSpacing) {
  let currentX = x
  for (let char of text) {
    ctx.fillText(char, currentX, y)
    currentX += ctx.measureText(char).width + letterSpacing
  }
}

// ============================================================
// PASO 3: EXPORTACIÓN FINAL (SOLO EN SUBMIT)
// ============================================================
// Generar PDF con pdf-lib usando coordenadas exactas
async function generateFinalPDF(formData) {
  const pdfBytes = await fetch('plantilla.pdf').then(res => res.arrayBuffer())
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const page = pdfDoc.getPages()[0]
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const draw = (text, x, y, size = 10) => {
    if (!text) return
    page.drawText(String(text), {
      x,
      y,
      size,
      font,
      color: rgb(0, 0, 0)
    })
  }

  // Función para dibujar texto con letter-spacing
  const drawWithLetterSpacing = (text, x, y, size = 10, letterSpacing = 2) => {
    if (!text) return
    let currentX = x
    const textStr = String(text)
    
    for (let char of textStr) {
      page.drawText(char, {
        x: currentX,
        y,
        size,
        font,
        color: rgb(0, 0, 0)
      })
      // Calcular ancho del carácter actual
      const charWidthInPoints = font.widthOfTextAtSize(char, size)
      currentX += charWidthInPoints + letterSpacing
    }
  }

  // Escribir todos los campos en el PDF
  Object.entries(pdfCoordinates).forEach(([field, coords]) => {
    if (formData[field]) {
      // Aplicar letter-spacing solo al campo "tipo" y "clase"
      if (field === 'tipo' || field === 'clase') {
        drawWithLetterSpacing(formData[field], coords.x, coords.y, 10, 2)
      } else {
        draw(formData[field], coords.x, coords.y, 10)
      }
    }
  })

  // Dibujar X según la opción seleccionada
  const markingCoords = getMarkingCoords('orden', formData.orden)
  if (markingCoords) {
    page.drawText('X', {
      x: markingCoords.x,
      y: markingCoords.y,
      size: MARK_FONT_SIZE,
      font,
      color: rgb(0, 0, 0)
    })
  }

  // Dibujar X para tipoEmpresa1..5
  for (let i = 1; i <= 5; i++) {
    const selectName = `tipoEmpresa${i}`
    const tipoMarking = getMarkingCoords(selectName, formData[selectName])
    if (tipoMarking) {
      page.drawText('X', {
        x: tipoMarking.x,
        y: tipoMarking.y,
        size: MARK_FONT_SIZE,
        font,
        color: rgb(0, 0, 0)
      })
    }
  }

  // Agregar fecha
  draw(new Date().toLocaleDateString(), 400, 150)

  return await pdfDoc.save()
}

// ============================================================
// LISTENERS: CONECTAR TODO
// ============================================================

// Al cargar página: inicializar + escuchar inputs
document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('form')
  
  await initializePDF()
  
  // ⭐ IMPORTANTE: Mostrar valores por defecto que ya están en los inputs
  const formData = Object.fromEntries(new FormData(form))
  updateCanvasPreview(formData)
  
  const inputs = form.querySelectorAll('input[name]')
  const ordenSelect = document.getElementById('orden')
  const tipoSelect = document.getElementById('tipo')
  const tipoEmpresa1Select = document.getElementById('tipoEmpresa1')
  const tipoEmpresa2Select = document.getElementById('tipoEmpresa2')
  const tipoEmpresa3Select = document.getElementById('tipoEmpresa3')
  const tipoEmpresa4Select = document.getElementById('tipoEmpresa4')
  const tipoEmpresa5Select = document.getElementById('tipoEmpresa5')
  const claseSelect = document.getElementById('clase')
  const ordenCualInput = document.querySelector('input[name="ordenCual"]')
  
  // Función para mostrar/ocultar campo ordenCual (protegida)
  const toggleOrdenCualField = () => {
    if (!ordenSelect || !ordenCualInput) return
    try {
      if (ordenSelect.value === 'otro') {
        ordenCualInput.style.display = 'block'
      } else {
        ordenCualInput.style.display = 'none'
        ordenCualInput.value = ''  // Limpiar valor si está oculto
      }
    } catch (e) {
      console.warn('toggleOrdenCualField falló:', e)
    }
  }

  // Inicializar estado del campo ordenCual si los elementos existen
  if (ordenSelect && ordenCualInput) toggleOrdenCualField()
  
  // Escuchar cambios en inputs
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)  // Preview rápido (<50ms)
    })
  })
  
  // Escuchar cambios en el select "orden"
  if (ordenSelect) {
    ordenSelect.addEventListener('change', () => {
      toggleOrdenCualField()
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)
    })
  } else {
    console.warn('No se encontró #orden; listener no registrado.')
  }
  
  // Escuchar cambios en el select "tipo"
  if (tipoSelect) {
    tipoSelect.addEventListener('change', () => {
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)
    })
  } else {
    console.warn('No se encontró #tipo; listener no registrado.')
  }
  // Escuchar cambios en los selects "tipoEmpresa1..5"
  [tipoEmpresa1Select, tipoEmpresa2Select, tipoEmpresa3Select, tipoEmpresa4Select, tipoEmpresa5Select].forEach(sel => {
    if (!sel) return
    sel.addEventListener('change', () => {
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)
    })
  })
  // Escuchar cambios en el select "clase"
  if (claseSelect) {
    claseSelect.addEventListener('change', () => {
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)
    })
  }
})

// Click en canvas: mostrar preview grande (desktop only), sin zoom o pan
const mainCanvas = document.getElementById('pdf-preview')
// Evitar menú contextual al hacer clic derecho sobre el canvas principal
if (mainCanvas) mainCanvas.addEventListener('contextmenu', (ev) => ev.preventDefault())
if (mainCanvas) {
  mainCanvas.addEventListener('click', (e) => {
    const isMobile = window.innerWidth <= 768
    if (isMobile) return

    // si canvas no tiene contenido, ignorar
    if (!mainCanvas.width || !mainCanvas.height) return

    // crear overlay
    const overlay = document.createElement('div')
    overlay.id = 'canvas-preview-overlay'
    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.background = 'rgba(0,0,0,0.75)'
    overlay.style.display = 'flex'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.zIndex = '3000'

    // contenedor para la imagen escalada
      const box = document.createElement('div')
      box.style.maxWidth = '98vw'
      box.style.maxHeight = '98vh'
      box.style.boxSizing = 'border-box'
      box.style.padding = '4px'

    // crear canvas temporal para copiar la imagen y escalar preservando ratio
    const temp = document.createElement('canvas')
    const ctx = temp.getContext('2d')
    const srcW = mainCanvas.width
    const srcH = mainCanvas.height

    // calcular escala para que no supere 99vw/99vh y permitir un aumento mayor (hasta 1.6x)
    const maxW = Math.floor(window.innerWidth * 0.99)
    const maxH = Math.floor(window.innerHeight * 0.99)
    let scale = Math.min(maxW / srcW, maxH / srcH, 1.6)
    const destW = Math.floor(srcW * scale)
    const destH = Math.floor(srcH * scale)

    temp.width = destW
    temp.height = destH
    // Evitar menú contextual sobre la vista previa temporal
    temp.addEventListener('contextmenu', (ev) => ev.preventDefault())
    ctx.drawImage(mainCanvas, 0, 0, srcW, srcH, 0, 0, destW, destH)
    temp.style.width = destW + 'px'
    temp.style.height = destH + 'px'
    temp.style.display = 'block'
    temp.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6)'
    temp.style.background = '#fff'

    // cerrar al hacer click fuera del canvas o presionar ESC
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) {
        document.body.removeChild(overlay)
      }
    })
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        if (document.body.contains(overlay)) document.body.removeChild(overlay)
        document.removeEventListener('keydown', onKey)
      }
    }
    document.addEventListener('keydown', onKey)

    box.appendChild(temp)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
  })
}

// Al enviar formulario: generar PDF final
document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault()

  const data = Object.fromEntries(new FormData(e.target))
  
  // Generar PDF final (una sola vez)
  const finalPdfBytes = await generateFinalPDF(data)
  const blob = new Blob([finalPdfBytes], { type: 'application/pdf' })

  // Descargar
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'Hoja_de_Vida_Persona_Juridica.pdf'
  link.click()
})

// Botón de Vista Previa: abrir PDF en nueva pestaña en desktop, modal en móvil
document.getElementById('btn-preview').addEventListener('click', async (e) => {
  e.preventDefault()

  const isMobile = window.innerWidth <= 768;
  
  // En móvil, solo abrir el modal (manejado por el script en index.html)
  if (isMobile) {
    return;
  }

  const form = document.getElementById('form')
  const data = Object.fromEntries(new FormData(form))
  
  // Generar PDF en desktop
  const pdfBytes = await generateFinalPDF(data)
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  
  // Abrir en nueva pestaña
  const pdfUrl = URL.createObjectURL(blob)
  window.open(pdfUrl, '_blank')
})
