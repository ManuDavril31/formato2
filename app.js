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

selectMarkings.caracterde = {
  'representante': 'caracterde_representante',
  'apoderado': 'caracterde_apoderado'
}
// Mapeo para inhabilidad
selectMarkings.inhabilidad = {
  'si': 'inhabilidad_si',
  'no': 'inhabilidad_no'
}
// Mapeo para tipo de documento del representante
selectMarkings.tipo_documento_rep = {
  'cc': 'tipo_documento_rep_cc',
  'ce': 'tipo_documento_rep_ce',
  'pasaporte': 'tipo_documento_rep_pasaporte'
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
  primerApellido: { x: 87, y: 303 },
  segundoApellido: { x: 306, y: 303 },
  nombres: { x: 410, y: 303 },
  // Coordenadas para tipo de documento del representante (marcar con X)
  tipo_documento_rep_cc: { x: 63, y: 275 },
  tipo_documento_rep_ce: { x: 103, y: 275 },
  tipo_documento_rep_pasaporte: { x: 173, y: 275 },
  documento: { x: 203, y: 275 },
  caracterde_representante: { x: 383, y: 275 },
  caracterde_apoderado: { x: 444, y: 275 },
  capacidad_contratacion: { x: 468, y: 275 },
  inhabilidad_si: { x: 382, y: 236 },
  inhabilidad_no: { x: 412, y: 236 },
  observaciones: { x: 100, y: 210 },
  // Coordenadas para firma (esquina inferior derecha)
  firma: { x: 50, y:155, width: 80, height: 40 }
}

let baseCanvasImage = null
let firmaImageData = null // Almacenar imagen de firma
const scale = 1.5
// Tamaño de fuente en el PDF para las marcas 'X' (en puntos).
const MARK_FONT_SIZE = 14

// ============================================================
// FUNCIÓN PARA CARGAR IMAGEN DE FIRMA
// ============================================================
function loadFirmaImage(file) {
  if (!file) {
    firmaImageData = null
    return
  }
  
  // Validar que sea una imagen
  if (!file.type.startsWith('image/')) {
    alert('Por favor selecciona un archivo de imagen para la firma')
    document.getElementById('firma').value = ''
    firmaImageData = null
    return
  }
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = () => {
      firmaImageData = img
      // Actualizar canvas preview
      const form = document.getElementById('form')
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
}

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
// FUNCIÓN HELPER: Dividir texto en líneas de máximo 95 caracteres
// ============================================================
function splitTextAt95(text) {
  if (!text || text.length <= 95) return [text]
  
  const lines = []
  let remaining = text
  
  while (remaining.length > 0) {
    if (remaining.length <= 95) {
      lines.push(remaining)
      break
    }
    
    // Intentar dividir en un espacio si existe antes de los 95 caracteres
    let cutPoint = 95
    const lastSpace = remaining.lastIndexOf(' ', 95)
    if (lastSpace > 70) { // Si hay espacio razonable
      cutPoint = lastSpace
    }
    
    lines.push(remaining.substring(0, cutPoint).trimEnd())
    remaining = remaining.substring(cutPoint).trimStart()
  }
  
  return lines
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
    // Saltar el campo 'firma' que se dibuja por separado
    if (field === 'firma') return
    
    if (formData[field]) {
      // Convertir coordenadas PDF a canvas
      const canvasX = coords.x * scale
      const canvasY = canvas.height - (coords.y * scale)
      
      // Caso especial: observaciones se divide en múltiples líneas
      if (field === 'observaciones') {
        const lines = splitTextAt95(String(formData[field]))
        const lineHeight = 12 * scale // altura de línea en pixels
        lines.forEach((line, idx) => {
          const lineY = canvasY + (idx * lineHeight)
          ctx.fillText(line, canvasX, lineY)
        })
      } else if (field === 'tipo' || field === 'clase') {
        // Aplicar letter-spacing solo al campo "tipo" y "clase"
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

  // Dibujar X para el tipo de documento del representante
  const tipoDocCoords = getMarkingCoords('tipo_documento_rep', formData['tipo_documento_rep'])
  if (tipoDocCoords) {
    const xCoord = tipoDocCoords.x * scale
    const yCoord = canvas.height - (tipoDocCoords.y * scale)
    ctx.fillText('X', xCoord, yCoord)
  }

  // Dibujar X para caracterde (representante legal / apoderado)
  const caractereCoords = getMarkingCoords('caracterde', formData.caracterde)
  if (caractereCoords) {
    const xCoord = caractereCoords.x * scale
    const yCoord = canvas.height - (caractereCoords.y * scale)
    ctx.fillText('X', xCoord, yCoord)
  }

  // Dibujar X para inhabilidad (si / no)
  const inhabilidadCoords = getMarkingCoords('inhabilidad', formData.inhabilidad)
  if (inhabilidadCoords) {
    const xCoord = inhabilidadCoords.x * scale
    const yCoord = canvas.height - (inhabilidadCoords.y * scale)
    ctx.fillText('X', xCoord, yCoord)
  }

  // Dibujar imagen de firma si existe
  if (firmaImageData) {
    const firmaCoords = pdfCoordinates.firma
    const canvasX = firmaCoords.x * scale
    const canvasY = canvas.height - ((firmaCoords.y + firmaCoords.height) * scale)
    const canvasWidth = firmaCoords.width * scale
    const canvasHeight = firmaCoords.height * scale
    ctx.drawImage(firmaImageData, canvasX, canvasY, canvasWidth, canvasHeight)
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
    // Saltar el campo 'firma' que se dibuja por separado
    if (field === 'firma') return
    
    if (formData[field]) {
      // Caso especial: observaciones se divide en múltiples líneas
      if (field === 'observaciones') {
        const lines = splitTextAt95(String(formData[field]))
        const lineHeight = 12 // altura de línea en puntos
        lines.forEach((line, idx) => {
          const lineY = coords.y - (idx * lineHeight)
          draw(line, coords.x, lineY, 10)
        })
      } else if (field === 'tipo' || field === 'clase') {
        // Aplicar letter-spacing solo al campo "tipo" y "clase"
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

  // Dibujar X para tipo de documento del representante
  const tipoDocMark = getMarkingCoords('tipo_documento_rep', formData.tipo_documento_rep)
  if (tipoDocMark) {
    page.drawText('X', {
      x: tipoDocMark.x,
      y: tipoDocMark.y,
      size: MARK_FONT_SIZE,
      font,
      color: rgb(0, 0, 0)
    })
  }

  // Dibujar X para caracterde (representante legal / apoderado)
  const caracterdeMark = getMarkingCoords('caracterde', formData.caracterde)
  if (caracterdeMark) {
    page.drawText('X', {
      x: caracterdeMark.x,
      y: caracterdeMark.y,
      size: MARK_FONT_SIZE,
      font,
      color: rgb(0, 0, 0)
    })
  }

  // Dibujar X para inhabilidad (si / no)
  const inhabilidadMark = getMarkingCoords('inhabilidad', formData.inhabilidad)
  if (inhabilidadMark) {
    page.drawText('X', {
      x: inhabilidadMark.x,
      y: inhabilidadMark.y,
      size: MARK_FONT_SIZE,
      font,
      color: rgb(0, 0, 0)
    })
  }

  // Agregar firma si existe
  if (firmaImageData) {
    const firmaCoords = pdfCoordinates.firma
    try {
      // Crear canvas temporal y dibujar la imagen
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = firmaImageData.width
      tempCanvas.height = firmaImageData.height
      const tempCtx = tempCanvas.getContext('2d')
      tempCtx.drawImage(firmaImageData, 0, 0)
      
      // Convertir canvas a data URL y luego a blob
      const dataUrl = tempCanvas.toDataURL('image/png')
      const base64Data = dataUrl.split(',')[1]
      
      // Convertir base64 a Uint8Array para pdf-lib
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      // Embedir PNG en el PDF
      const firmaImage = await pdfDoc.embedPng(bytes)
      page.drawImage(firmaImage, {
        x: firmaCoords.x,
        y: firmaCoords.y,
        width: firmaCoords.width,
        height: firmaCoords.height
      })
    } catch (err) {
      console.warn('Error al insertar firma en PDF:', err)
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
  const tipoDocumentoRepSelect = document.getElementById('tipo_documento_rep')
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
  // Escuchar cambios en el select "tipo_documento_rep"
  if (tipoDocumentoRepSelect) {
    tipoDocumentoRepSelect.addEventListener('change', () => {
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)
    })
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

  // Escuchar cambios en el select "caracterde"
  const caracterdeSelect = document.getElementById('caracterde')
  if (caracterdeSelect) {
    caracterdeSelect.addEventListener('change', () => {
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)
    })
  }

  // Escuchar cambios en el select "inhabilidad"
  const inhabilidadSelect = document.getElementById('inhabilidad')
  if (inhabilidadSelect) {
    inhabilidadSelect.addEventListener('change', () => {
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)
    })
  }

  // Escuchar carga de imagen de firma
  const firmaInput = document.getElementById('firma')
  if (firmaInput) {
    firmaInput.addEventListener('change', (e) => {
      loadFirmaImage(e.target.files[0])
    })
  }

  // --- Manejo dinámico de experiencias (máximo 5) ---
  const MAX_EXP = 5
  const addBtn = document.getElementById('add-experience-btn')
  const expCountLabel = document.getElementById('exp-count')

  function getExpElementFields(i) {
    // Retorna todos los campos (divs con class="field") que contienen elementos de la experiencia i
    const names = [
      `experiencia${i}`,
      `tipoEmpresa${i}`,
      `telefono_exp${i}`,
      `fecha_term_exp${i}`,
      `valorContrato_exp${i}`
    ]
    return names.map(name => {
      const el = document.getElementById(name)
      return el ? el.closest('.field') : null
    }).filter(f => f !== null)
  }

  function getExpIndexVisible(i) {
    const fields = getExpElementFields(i)
    if (fields.length === 0) return false
    return fields[0].style.display !== 'none'
  }

  function countVisibleExps() {
    let c = 0
    for (let i = 1; i <= MAX_EXP; i++) if (getExpIndexVisible(i)) c++
    return c
  }

  function showExperience(i) {
    const fields = getExpElementFields(i)
    fields.forEach(field => {
      field.style.display = ''
    })
    
    // Envolver los 5 campos en un contenedor visual
    wrapExperienceFields(i)
    
    // Agregar botón X en la esquina superior derecha
    attachRemoveButton(i)
    
    // Agregar listeners a los inputs dinámicamente
    attachExperienceInputListeners(i)
    
    updateAddButtonState()
  }

  function wrapExperienceFields(i) {
    const fields = getExpElementFields(i)
    if (fields.length === 0) return
    
    // Si ya está envuelto, no hacer nada
    if (fields[0].parentElement.classList.contains('exp-wrapper')) return
    
    // Crear contenedor
    const wrapper = document.createElement('div')
    wrapper.className = 'exp-wrapper'
    
    // Insertar wrapper antes del primer campo
    fields[0].parentElement.insertBefore(wrapper, fields[0])
    
    // Mover los 5 campos adentro del wrapper
    fields.forEach(field => {
      wrapper.appendChild(field)
    })
  }

  function unwrapExperienceFields(i) {
    const wrapper = document.querySelector(`.exp-wrapper:has(#experiencia${i})`)
    if (!wrapper) return
    
    // Obtener el padre del wrapper (debe ser .fields)
    const parent = wrapper.parentElement
    
    // Mover los campos fuera del wrapper
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper)
    }
    
    // Remover el wrapper
    parent.removeChild(wrapper)
  }

  function hideExperience(i) {
    const fields = getExpElementFields(i)
    fields.forEach(field => {
      field.style.display = 'none'
    })
    
    // Desenvolver los campos
    unwrapExperienceFields(i)
    
    updateAddButtonState()
  }

  function attachRemoveButton(i) {
    const wrapper = document.querySelector(`.exp-wrapper:has(#experiencia${i})`)
    if (!wrapper) return
    
    // Evitar agregar múltiples botones
    if (wrapper.querySelector('.remove-exp-btn')) return
    
    // Crear botón X elegante
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'remove-exp-btn'
    btn.title = 'Eliminar experiencia'
    btn.innerHTML = '×' // ícono X
    btn.addEventListener('click', () => hideExperience(i))
    
    wrapper.appendChild(btn)
  }

  function attachExperienceInputListeners(i) {
    const names = [
      `experiencia${i}`,
      `tipoEmpresa${i}`,
      `telefono_exp${i}`,
      `fecha_term_exp${i}`,
      `valorContrato_exp${i}`
    ]
    
    names.forEach(name => {
      const el = document.getElementById(name)
      if (!el) return
      
      // Evitar agregar múltiples listeners
      if (el.dataset.listenerAttached) return
      el.dataset.listenerAttached = 'true'
      
      el.addEventListener('input', () => {
        const formData = Object.fromEntries(new FormData(form))
        updateCanvasPreview(formData)
      })
      
      // Para selects, usar 'change' en lugar de 'input'
      if (el.tagName === 'SELECT') {
        el.addEventListener('change', () => {
          const formData = Object.fromEntries(new FormData(form))
          updateCanvasPreview(formData)
        })
      }
    })
  }

  function updateAddButtonState() {
    const visible = countVisibleExps()
    expCountLabel.textContent = `(${visible}/${MAX_EXP})`
    if (visible >= MAX_EXP) addBtn.disabled = true
    else addBtn.disabled = false
  }

  // Inicializar: ocultar todas las experiencias (0/5)
  for (let i = 1; i <= MAX_EXP; i++) {
    hideExperience(i)
  }
  updateAddButtonState()

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      for (let i = 1; i <= MAX_EXP; i++) {
        if (!getExpIndexVisible(i)) {
          showExperience(i)
          break
        }
      }
    })
  }

  // --- Manejo dinámico de servicios (máximo 6) ---
  const MAX_SVC = 6
  const addSvcBtn = document.getElementById('add-service-btn')
  const svcCountLabel = document.getElementById('svc-count')

  function getSvcElementFields(i) {
    const el = document.getElementById(`servicio${i}`)
    return el ? [el.closest('.field')] : []
  }

  function getSvcIndexVisible(i) {
    const fields = getSvcElementFields(i)
    if (fields.length === 0) return false
    return fields[0].style.display !== 'none'
  }

  function countVisibleSvcs() {
    let c = 0
    for (let i = 1; i <= MAX_SVC; i++) if (getSvcIndexVisible(i)) c++
    return c
  }

  function showService(i) {
    const fields = getSvcElementFields(i)
    fields.forEach(field => {
      field.style.display = ''
    })
    wrapServiceFields(i)
    attachRemoveButtonSvc(i)
    attachServiceInputListeners(i)
    updateAddButtonStateSvc()
  }

  function hideService(i) {
    const fields = getSvcElementFields(i)
    fields.forEach(field => {
      field.style.display = 'none'
    })
    unwrapServiceFields(i)
    updateAddButtonStateSvc()
  }

  function wrapServiceFields(i) {
    const fields = getSvcElementFields(i)
    if (fields.length === 0) return
    if (fields[0].parentElement.classList.contains('svc-wrapper')) return
    
    const wrapper = document.createElement('div')
    wrapper.className = 'svc-wrapper'
    fields[0].parentElement.insertBefore(wrapper, fields[0])
    fields.forEach(field => {
      wrapper.appendChild(field)
    })
  }

  function unwrapServiceFields(i) {
    const wrapper = document.querySelector(`.svc-wrapper:has(#servicio${i})`)
    if (!wrapper) return
    const parent = wrapper.parentElement
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper)
    }
    parent.removeChild(wrapper)
  }

  function attachRemoveButtonSvc(i) {
    const wrapper = document.querySelector(`.svc-wrapper:has(#servicio${i})`)
    if (!wrapper) return
    if (wrapper.querySelector('.remove-svc-btn')) return
    
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'remove-svc-btn'
    btn.title = 'Eliminar servicio'
    btn.innerHTML = '×'
    btn.addEventListener('click', () => hideService(i))
    wrapper.appendChild(btn)
  }

  function attachServiceInputListeners(i) {
    const svcInput = document.getElementById(`servicio${i}`)
    if (!svcInput) return
    
    // Evitar agregar múltiples listeners
    if (svcInput.dataset.listenerAttached) return
    svcInput.dataset.listenerAttached = 'true'
    
    svcInput.addEventListener('input', () => {
      const formData = Object.fromEntries(new FormData(form))
      updateCanvasPreview(formData)
    })
  }

  function updateAddButtonStateSvc() {
    const visible = countVisibleSvcs()
    svcCountLabel.textContent = `(${visible}/${MAX_SVC})`
    if (visible >= MAX_SVC) addSvcBtn.disabled = true
    else addSvcBtn.disabled = false
  }

  // Inicializar: ocultar todos los servicios (0/6)
  for (let i = 1; i <= MAX_SVC; i++) {
    hideService(i)
  }
  updateAddButtonStateSvc()

  if (addSvcBtn) {
    addSvcBtn.addEventListener('click', () => {
      for (let i = 1; i <= MAX_SVC; i++) {
        if (!getSvcIndexVisible(i)) {
          showService(i)
          break
        }
      }
    })
  }

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
  if (form) {
    form.addEventListener('submit', async (e) => {
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
  }

  // Botón de Vista Previa: abrir PDF en nueva pestaña en desktop, modal en móvil
  const previewBtn = document.getElementById('btn-preview')
  if (previewBtn) {
    previewBtn.addEventListener('click', async (e) => {
      e.preventDefault()

      const isMobile = window.innerWidth <= 768;
      
      // En móvil, solo abrir el modal (manejado por el script en index.html)
      if (isMobile) {
        return;
      }

      const formData = Object.fromEntries(new FormData(form))
      
      // Generar PDF en desktop
      const pdfBytes = await generateFinalPDF(formData)
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      
      // Abrir en nueva pestaña
      const pdfUrl = URL.createObjectURL(blob)
      window.open(pdfUrl, '_blank')
    })
  }
})
