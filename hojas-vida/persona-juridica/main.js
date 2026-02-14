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
    const navLinks = nav.querySelectorAll("a");
    navLinks.forEach((link) => {
        link.addEventListener("click", closeNav);
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && nav.classList.contains("open")) closeNav();
    });
})();
