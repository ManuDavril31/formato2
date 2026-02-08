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
  
  // IV. REPRESENTANTE LEGAL
  primerApellido: { x: 80, y: 260 },
  segundoApellido: { x: 240, y: 260 },
  nombres: { x: 380, y: 260 },
  documento: { x: 200, y: 235 }
}

let baseCanvasImage = null
const scale = 1.5

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
  if (coords) {
    const xCoord = coords.x * scale
    const yCoord = canvas.height - (coords.y * scale)
    
    ctx.font = 'bold 18px Arial'
    ctx.fillStyle = '#000'
    ctx.fillText('X', xCoord, yCoord)
  }
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

  const draw = (text, x, y, size = 12) => {
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
  const drawWithLetterSpacing = (text, x, y, size = 12, letterSpacing = 2) => {
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
        drawWithLetterSpacing(formData[field], coords.x, coords.y, 12, 2)
      } else {
        draw(formData[field], coords.x, coords.y)
      }
    }
  })

  // Dibujar X según la opción seleccionada
  const markingCoords = getMarkingCoords('orden', formData.orden)
  if (markingCoords) {
    page.drawText('X', {
      x: markingCoords.x,
      y: markingCoords.y,
      size: 14,
      font,
      color: rgb(0, 0, 0)
    })
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
  const claseSelect = document.getElementById('clase')
  const ordenCualInput = document.querySelector('input[name="ordenCual"]')
  
  // Función para mostrar/ocultar campo ordenCual
  const toggleOrdenCualField = () => {
    if (ordenSelect.value === 'otro') {
      ordenCualInput.style.display = 'block'
    } else {
      ordenCualInput.style.display = 'none'
      ordenCualInput.value = ''  // Limpiar valor si está oculto
    }
  }
  
  // Inicializar estado del campo ordenCual
  toggleOrdenCualField()
  
  // Escuchar cambios en inputs
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)  // Preview rápido (<50ms)
    })
  })
  
  // Escuchar cambios en el select "orden"
  ordenSelect.addEventListener('change', () => {
    toggleOrdenCualField()
    const formData = Object.fromEntries(new FormData(form))
    updateCanvasPreview(formData)
  })
  
  // Escuchar cambios en el select "tipo"
  tipoSelect.addEventListener('change', () => {
    const formData = Object.fromEntries(new FormData(form))
    updateCanvasPreview(formData)
  })
  // Escuchar cambios en el select "clase"
  if (claseSelect) {
    claseSelect.addEventListener('change', () => {
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)
    })
  }
})

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

// Botón de Vista Previa: abrir PDF en nueva pestaña
document.getElementById('btn-preview').addEventListener('click', async (e) => {
  e.preventDefault()

  const form = document.getElementById('form')
  const data = Object.fromEntries(new FormData(form))
  
  // Generar PDF
  const pdfBytes = await generateFinalPDF(data)
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  
  // Abrir en nueva pestaña
  const pdfUrl = URL.createObjectURL(blob)
  window.open(pdfUrl, '_blank')
})
