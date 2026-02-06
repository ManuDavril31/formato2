const { PDFDocument, StandardFonts, rgb } = PDFLib

// ============================================================
// ALTERNATIVA 3 (RECOMENDADA): CANVAS + PDF HÍBRIDO
// ============================================================
// Preview con Canvas API (rápido) + Exportación con PDF-lib (exacta)
// ============================================================

// Mapeo de coordenadas: nombre del campo -> posición en PDF
const pdfCoordinates = {
  razonSocial: { x: 85, y: 650 },
  sigla: { x: 80, y: 650 },
  nit: { x: 400, y: 650 },
  servicio1: { x: 80, y: 495 },
  servicio2: { x: 320, y: 495 },
  servicio3: { x: 80, y: 470 },
  servicio4: { x: 320, y: 470 },
  servicio5: { x: 80, y: 445 },
  servicio6: { x: 320, y: 445 },
  primerApellido: { x: 80, y: 260 },
  segundoApellido: { x: 240, y: 260 },
  nombres: { x: 380, y: 260 },
  documento: { x: 200, y: 235 }
}

let baseCanvasImage = null
const scale = 1.5

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
  
  // Superponer texto con Canvas API
  ctx.font = 'bold 14px Arial'
  ctx.fillStyle = '#000'
  
  // Iterar cada campo y dibujarlo
  Object.entries(pdfCoordinates).forEach(([field, coords]) => {
    if (formData[field]) {
      // Convertir coordenadas PDF a canvas
      const canvasX = coords.x * scale
      const canvasY = canvas.height - (coords.y * scale)
      
      ctx.fillText(String(formData[field]), canvasX, canvasY)
    }
  })
}

// ============================================================
// PASO 3: EXPORTACIÓN FINAL (SOLO EN SUBMIT)
// ============================================================
// Generar PDF con pdf-lib usando coordenadas exactas
async function generateFinalPDF(formData) {
  const pdfBytes = await fetch('plantilla.pdf').then(res => res.arrayBuffer())
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const page = pdfDoc.getPages()[0]
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

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

  // Escribir todos los campos en el PDF
  Object.entries(pdfCoordinates).forEach(([field, coords]) => {
    if (formData[field]) {
      draw(formData[field], coords.x, coords.y)
    }
  })

  // Agregar fecha
  draw(new Date().toLocaleDateString(), 400, 150)

  return await pdfDoc.save()
}

// ============================================================
// LISTENERS: CONECTAR TODO
// ============================================================

// Al cargar página: inicializar + escuchar inputs
document.addEventListener('DOMContentLoaded', async () => {
  await initializePDF()
  
  const form = document.getElementById('form')
  const inputs = form.querySelectorAll('input[name]')
  
  // Escuchar cambios en inputs
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)  // Preview rápido (<50ms)
    })
  })
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
