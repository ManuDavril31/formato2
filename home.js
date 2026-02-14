// Navegación: scroll suave a secciones
document
    .getElementById("cta-explorar")
    ?.addEventListener("click", function () {
        document
            .getElementById("formatos")
            .scrollIntoView({ behavior: "smooth" });
    });
document
    .getElementById("cta-como")
    ?.addEventListener("click", function () {
        document
            .getElementById("como-funciona")
            .scrollIntoView({ behavior: "smooth" });
    });
document
    .getElementById("start-fill")
    ?.addEventListener("click", function () {
        document
            .getElementById("formatos")
            .scrollIntoView({ behavior: "smooth" });
    });

// Mobile menu: accessible overlay panel
(function () {
    const menuToggle = document.getElementById("menu-toggle");
    const nav = document.getElementById("main-nav");
    const backdrop = document.getElementById("nav-backdrop");
    const navClose = document.getElementById("nav-close");

    function openNav() {
        nav.classList.add("open");
        backdrop.classList.add("open");
        menuToggle.setAttribute("aria-expanded", "true");
        nav.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }
    function closeNav() {
        nav.classList.remove("open");
        backdrop.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        nav.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }

    if (menuToggle) {
        menuToggle.addEventListener("click", () => {
            const opened = nav.classList.contains("open");
            if (opened) closeNav();
            else openNav();
        });
    }
    if (backdrop) {
        backdrop.addEventListener("click", closeNav);
    }
    if (navClose) {
        navClose.addEventListener("click", closeNav);
    }
    // Cerrar menú al hacer click en un enlace
    const navLinks = nav.querySelectorAll("a");
    navLinks.forEach((link) => {
        link.addEventListener("click", closeNav);
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && nav.classList.contains("open")) closeNav();
    });
})();
