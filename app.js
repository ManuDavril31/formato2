const { PDFDocument, StandardFonts, rgb } = PDFLib

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault()

  const data = Object.fromEntries(new FormData(e.target))

  // 1. Cargar PDF base
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

  // ========================
  // I. IDENTIFICACIÓN
  // ========================
  draw(data.razonSocial, 80, 675)
  draw(data.sigla, 80, 650)
  draw(data.nit, 400, 650)

  // ========================
  // II. SERVICIOS
  // ========================
  draw(data.servicio1, 80, 495)
  draw(data.servicio2, 320, 495)
  draw(data.servicio3, 80, 470)
  draw(data.servicio4, 320, 470)
  draw(data.servicio5, 80, 445)
  draw(data.servicio6, 320, 445)

  // ========================
  // IV. REPRESENTANTE
  // ========================
  draw(data.primerApellido, 80, 260)
  draw(data.segundoApellido, 240, 260)
  draw(data.nombres, 380, 260)
  draw(data.documento, 200, 235)

  // ========================
  // FECHA
  // ========================
  draw(new Date().toLocaleDateString(), 400, 150)

  // 2. Guardar y descargar
  const finalPdf = await pdfDoc.save()
  const blob = new Blob([finalPdf], { type: 'application/pdf' })

  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'Hoja_de_Vida_Persona_Juridica.pdf'
  link.click()
})
