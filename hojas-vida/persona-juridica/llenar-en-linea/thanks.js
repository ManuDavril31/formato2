const { PDFDocument, StandardFonts, rgb } = PDFLib;

// Función para obtener parámetros de la URL
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return Object.fromEntries(params);
}

// Función para validar código de transacción
function validateTransactionCode() {
    const params = getUrlParams();

    // Buscar parámetros comunes de Wompi (reference, transaction_id, id, etc)
    const validCodes = [
        'reference',
        'transaction_id',
        'id',
        'transactionId',
        'reference_code',
        'codigo'
    ];

    for (let code of validCodes) {
        if (params[code]) {
            console.log(`✅ Código de transacción validado: ${code}=${params[code]}`);
            return { valid: true, code: code, value: params[code] };
        }
    }

    console.log('❌ No se encontró código de transacción en la URL');
    return { valid: false };
}

// Función para mostrar pantalla de error
function showErrorScreen(title, message) {
    const successIcon = document.getElementById('success-icon');
    const pageTitle = document.getElementById('page-title');
    const pageDescription = document.getElementById('page-description');
    const infoBox = document.getElementById('info-box');
    const downloadSection = document.getElementById('download-section');
    const loadingSection = document.getElementById('loading-section');
    const paymentStatusContainer = document.getElementById('payment-status-container');
    const errorDiv = document.getElementById('error-message');

    if (successIcon) {
        successIcon.textContent = '❌';
        successIcon.style.color = '#dc3545';
    }
    if (pageTitle) pageTitle.textContent = title || '⚠️ Error de Validación';
    if (pageDescription) pageDescription.textContent = message ||
        'No se pudo validar tu pago. Por favor, intenta de nuevo o contacta al soporte.';

    if (infoBox) infoBox.style.display = 'none';
    if (downloadSection) downloadSection.style.display = 'none';
    if (loadingSection) loadingSection.style.display = 'none';
    if (paymentStatusContainer) paymentStatusContainer.style.display = 'none';

    if (errorDiv) {
        errorDiv.textContent = '❌ ' + (message || 'Acceso denegado. Es posible que el pago no se haya completado o que el ID de transacción sea inválido.');
        errorDiv.style.display = 'block';
    }
}

// Función para consultar el estado en Wompi
async function checkWompiStatus(transactionId) {
    const loadingText = document.getElementById('loading-text');
    const spinner = document.getElementById('spinner');
    const downloadSection = document.getElementById('download-section');
    const statusContainer = document.getElementById('payment-status-container');
    const statusBadge = document.getElementById('status-badge');
    const pageTitle = document.getElementById('page-title');
    const pageDescription = document.getElementById('page-description');

    try {
        // Intentar consultar la API de Wompi (Endpoint público de transacciones)
        // Nota: Wompi permite consultar transacciones por ID de forma pública en producción
        const response = await fetch(`https://production.wompi.co/v1/transactions/${transactionId}`);

        if (!response.ok) {
            throw new Error('No se pudo obtener información de la transacción desde Wompi.');
        }

        const { data } = await response.json();
        const status = data.status; // APPROVED, DECLINED, VOIDED, PENDING

        console.log('--- ESTADO DE WOMPI ---', status);

        // Actualizar UI según el estado
        const loadingSection = document.getElementById('loading-section');
        if (loadingSection) loadingSection.style.display = 'none';

        if (statusContainer) statusContainer.style.display = 'block';
        if (statusBadge) {
            statusBadge.textContent = `Estado: ${status}`;
            statusBadge.className = `status-badge status-${status.toLowerCase()}`;
        }

        if (status === 'APPROVED') {
            if (pageTitle) pageTitle.textContent = '¡Pago Exitoso! ✅';
            if (pageDescription) pageDescription.textContent = 'Tu pago se ha confirmado. Ya puedes descargar tu documento.';
            if (downloadSection) downloadSection.style.display = 'block';
            const btnDownload = document.getElementById('btn-download-pdf');
            if (btnDownload) btnDownload.disabled = false;
            const successIcon = document.getElementById('success-icon');
            if (successIcon) successIcon.textContent = '✅';
        } else if (status === 'PENDING') {
            if (pageTitle) pageTitle.textContent = 'Pago Pendiente ⏳';
            if (pageDescription) pageDescription.textContent = 'Tu pago aún se está procesando. Por favor espera unos segundos o recarga la página.';
            showRetryButton(transactionId);
        } else {
            if (pageTitle) pageTitle.textContent = 'Pago no Exitoso ❌';
            if (pageDescription) pageDescription.textContent = `Lo sentimos, el pago fue ${status}. No se puede habilitar la descarga.`;
            showErrorScreen('Pago no realizado', `La transacción fue ${status}. Por favor intenta pagar nuevamente.`);
        }

    } catch (error) {
        console.error('Error verificando pago:', error);
        showErrorScreen('Error de Conexión', 'Hubo un problema al conectar con Wompi. Por favor recarga la página.');
    }
}

function showRetryButton(id) {
    const loadingSection = document.getElementById('loading-section');
    if (loadingSection) {
        loadingSection.innerHTML = `
          <p style="color: #856404;">El pago sigue en proceso...</p>
          <button onclick="window.location.reload()" class="btn btn-secondary">
            🔄 Reintentar Verificación
          </button>
        `;
        loadingSection.style.display = 'block';
    }
}

// Función para generar PDF (adaptada de app.js)
async function generateFinalPDF(formData) {
    try {
        // Obtener la plantilla PDF desde la carpeta actual
        const pdfResponse = await fetch('plantilla.pdf');
        if (!pdfResponse.ok) {
            throw new Error('No se pudo cargar la plantilla PDF');
        }
        const pdfBytes = await pdfResponse.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const page = pdfDoc.getPages()[0];
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        const draw = (text, x, y, size = 10) => {
            if (!text) return;
            page.drawText(String(text), {
                x,
                y,
                size,
                font,
                color: rgb(0, 0, 0),
            });
        };


        // Mapeo de coordenadas: nombre del campo -> posición en PDF
        const pdfCoordinates = {
            razonSocial: { x: 135, y: 640 },
            sigla: { x: 55, y: 626 },
            nit: { x: 440, y: 626 },
            orden_nal: { x: 46, y: 586 },
            orden_dptl: { x: 76, y: 586 },
            orden_dstr: { x: 106, y: 586 },
            orden_mpl: { x: 136, y: 586 },
            orden_otro: { x: 166, y: 586 },
            ordenCual: { x: 223, y: 586 },
            tipo: { x: 304, y: 586 },
            clase: { x: 464, y: 586 },
            pais: { x: 170, y: 561 },
            departamento: { x: 353, y: 561 },
            municipio: { x: 70, y: 548 },
            direccion: { x: 283, y: 548 },
            telefonos: { x: 72, y: 535 },
            fax: { x: 255, y: 535 },
            apartadoAereo: { x: 500, y: 535 },
            servicio1: { x: 50, y: 485 },
            servicio2: { x: 320, y: 485 },
            servicio3: { x: 50, y: 470 },
            servicio4: { x: 320, y: 470 },
            servicio5: { x: 50, y: 458 },
            servicio6: { x: 320, y: 458 },
            experiencia1: { x: 35, y: 393 },
            tipoEmpresa1_publica: { x: 293, y: 393 },
            tipoEmpresa1_privada: { x: 323, y: 393 },
            telefono_exp1: { x: 343, y: 393 },
            fecha_term_exp1: { x: 420, y: 393 },
            valorContrato_exp1: { x: 502, y: 393 },
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
            primerApellido: { x: 87, y: 303 },
            segundoApellido: { x: 306, y: 303 },
            nombres: { x: 410, y: 303 },
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
            fecha_diligenciamiento: { x: 460, y: 172 }
        };

        // Dibujar cada campo en el PDF
        Object.entries(pdfCoordinates).forEach(([field, coords]) => {
            if (formData[field]) {
                draw(formData[field], coords.x, coords.y);
            }
        });

        // Convertir a bytes
        const finalPdfBytes = await pdfDoc.save();
        return finalPdfBytes;
    } catch (error) {
        console.error('Error generando PDF:', error);
        throw error;
    }
}

// Lógica del Menú Móvil
function initNavigation() {
    const menuToggle = document.getElementById("menu-toggle");
    const navClose = document.getElementById("nav-close");
    const nav = document.getElementById("main-nav");
    const backdrop = document.getElementById("nav-backdrop");

    if (!menuToggle || !nav) return;

    function openNav() {
        nav.classList.add("open");
        if (backdrop) backdrop.classList.add("open");
        menuToggle.setAttribute("aria-expanded", "true");
        nav.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }
    function closeNav() {
        nav.classList.remove("open");
        if (backdrop) backdrop.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        nav.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }

    menuToggle.addEventListener("click", () => {
        const opened = nav.classList.contains("open");
        if (opened) closeNav();
        else openNav();
    });
    if (backdrop) backdrop.addEventListener("click", closeNav);
    if (navClose) navClose.addEventListener("click", closeNav);

    // Cerrar menú al hacer click en un enlace
    const navLinks = nav.querySelectorAll("a");
    navLinks.forEach((link) => {
        link.addEventListener("click", closeNav);
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && nav.classList.contains("open")) closeNav();
    });
}

// Cuando se carga la página
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar navegación
    initNavigation();

    // VALIDAR CÓDIGO DE TRANSACCIÓN DESDE URL
    const validation = validateTransactionCode();
    if (!validation.valid) {
        console.error('❌ Validación fallida: No hay código de transacción');
        showErrorScreen('Acceso Denegado', 'No se encontró un ID de transacción válido. Si acabas de pagar, asegúrate de no haber cerrado la página antes de tiempo.');
        return;
    }

    const transactionId = validation.value;
    console.log('✅ ID de transacción encontrado:', transactionId);

    // INICIAR VERIFICACIÓN REAL CON WOMPI
    await checkWompiStatus(transactionId);

    const downloadBtn = document.getElementById('btn-download-pdf');
    const downloadSpinner = document.getElementById('download-spinner');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            try {
                // Obtener datos del localStorage
                const formDataJson = localStorage.getItem('hojaVidaFormData');
                if (!formDataJson) {
                    throw new Error(
                        'No se encontraron los datos del formulario. Por favor, intenta de nuevo.'
                    );
                }

                const formData = JSON.parse(formDataJson);

                // Mostrar spinner de descarga
                if (downloadSpinner) downloadSpinner.style.display = 'block';
                downloadBtn.disabled = true;

                // Generar PDF
                const finalPdfBytes = await generateFinalPDF(formData);
                const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });

                // Descargar
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'Hoja_de_Vida_Persona_Juridica.pdf';
                link.click();

                // Ocultar spinner y mostrar mensaje de éxito
                if (downloadSpinner) downloadSpinner.style.display = 'none';
                downloadBtn.disabled = false;
                if (successMessage) successMessage.style.display = 'block';

                // Limpiar localStorage después de descargar
                setTimeout(() => {
                    localStorage.removeItem('hojaVidaFormData');
                }, 2000);
            } catch (error) {
                if (downloadSpinner) downloadSpinner.style.display = 'none';
                downloadBtn.disabled = false;
                if (errorMessage) {
                    errorMessage.textContent = '❌ ' + error.message;
                    errorMessage.style.display = 'block';
                }
                console.error(error);
            }
        });
    }
});
