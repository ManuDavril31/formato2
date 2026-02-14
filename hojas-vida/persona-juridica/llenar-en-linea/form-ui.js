/**
 * Lógica de Interfaz de Usuario para el Formulario de Hoja de Vida
 * Extraída de index.html para mejorar la mantenibilidad.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Lógica del modal para vista previa en móvil
    const btnPreview = document.getElementById("btn-preview");
    const modalOverlay = document.getElementById("modal-overlay");
    const modalCloseBtn = document.querySelector(".modal-close-btn");
    const isMobile = () => window.innerWidth <= 1024;

    if (btnPreview) {
        btnPreview.addEventListener("click", (e) => {
            if (isMobile()) {
                e.preventDefault();
                modalOverlay.classList.add("active");
                // Copiar el contenido del canvas principal al modal
                const mainCanvas = document.getElementById("pdf-preview");
                const mobileCanvas = document.getElementById("pdf-preview-mobile");
                const ctx = mobileCanvas.getContext("2d");
                if (mainCanvas.width > 0 && mainCanvas.height > 0) {
                    mobileCanvas.width = mainCanvas.width;
                    mobileCanvas.height = mainCanvas.height;
                    ctx.drawImage(mainCanvas, 0, 0);
                }
            }
        });
    }

    const closeModal = () => {
        if (!modalOverlay) return;
        const modalContent = document.querySelector(".modal-content");
        modalContent.classList.add("closing");
        setTimeout(() => {
            modalOverlay.classList.remove("active");
            modalContent.classList.remove("closing");
        }, 300);
    };

    if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener("click", (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    // Cerrar modal con Esc
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modalOverlay && modalOverlay.classList.contains("active")) {
            closeModal();
        }
    });

    // 2. Colapsar todos los fieldsets excepto el primero
    const fieldsets = document.querySelectorAll("form fieldset");
    fieldsets.forEach((fieldset, idx) => {
        const btn = fieldset.querySelector(".collapse-btn");
        if (!btn) return;
        
        const content = Array.from(fieldset.children).filter(
            (el) => el.tagName !== "LEGEND",
        );
        
        if (idx === 0) {
            // El primero queda expandido
            content.forEach((el) => (el.style.display = ""));
            btn.textContent = "▲";
        } else {
            // Los demás colapsados
            content.forEach((el) => (el.style.display = "none"));
            btn.textContent = "▼";
        }
        
        btn.addEventListener("click", function () {
            if (btn.textContent === "▲") {
                content.forEach((el) => (el.style.display = "none"));
                btn.textContent = "▼";
            } else {
                content.forEach((el) => (el.style.display = ""));
                btn.textContent = "▲";
            }
        });
    });

    // 3. Mostrar/ocultar campo 'ordenCual' según selección en #orden
    const ordenSelect = document.getElementById("orden");
    const ordenCualInput = document.getElementById("ordenCual");
    
    if (ordenSelect && ordenCualInput) {
        const ordenCualField = ordenCualInput.closest(".field");

        const updateOrdenCual = () => {
            if (ordenSelect.value === "otro") {
                if (ordenCualField) ordenCualField.style.display = "";
                try {
                    ordenCualInput.focus();
                } catch (e) { }
            } else {
                if (ordenCualField) ordenCualField.style.display = "none";
                ordenCualInput.value = "";
            }
        };

        ordenSelect.addEventListener("change", updateOrdenCual);
        // Inicializar estado en carga
        updateOrdenCual();
    }

    // 4. Lógica del menú de navegación (Header)
    (function initNavigation() {
        const menuToggle = document.getElementById("menu-toggle");
        const nav = document.getElementById("main-nav");
        const backdrop = document.getElementById("nav-backdrop");
        const navClose = document.getElementById("nav-close");

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

        const navLinks = nav.querySelectorAll("a");
        navLinks.forEach((link) => {
            link.addEventListener("click", closeNav);
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && nav.classList.contains("open")) closeNav();
        });
    })();
});
