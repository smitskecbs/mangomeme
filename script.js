const MINT_ADDRESS = "29KN57rM6tV2aWdo1agZcF6ynPXB1dhHdKHNrrAmaNGo";

const copyButtons = document.querySelectorAll(".copy-mint-btn");
const copyFeedbackElements = document.querySelectorAll(".copy-feedback");

const BIRD_SVG =
  '<svg viewBox="0 0 32 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M2 10 C8 2 12 2 16 10 C20 2 24 2 30 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
  "</svg>";

async function copyMintAddress() {
  try {
    await navigator.clipboard.writeText(MINT_ADDRESS);
    showCopySuccess();
  } catch {
    fallbackCopy();
  }
}

function fallbackCopy() {
  const textarea = document.createElement("textarea");
  textarea.value = MINT_ADDRESS;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
    showCopySuccess();
  } catch {
    if (copyFeedbackElements.length) {
      copyFeedbackElements.forEach((el) => {
        el.textContent = "Copy failed — select the address manually.";
      });
    }
  }

  document.body.removeChild(textarea);
}

function showCopySuccess() {
  copyButtons.forEach((btn) => {
    btn.classList.add("copied");
    const textEl = btn.querySelector(".copy-text");
    if (textEl) {
      textEl.textContent = "Copied!";
    } else {
      btn.textContent = "✅ Copied!";
    }
  });

  copyFeedbackElements.forEach((el) => {
    el.textContent = "Mint address copied.";
  });

  setTimeout(resetCopyButtons, 2500);
}

function resetCopyButtons() {
  copyButtons.forEach((btn) => {
    btn.classList.remove("copied");
    const textEl = btn.querySelector(".copy-text");
    if (textEl) {
      textEl.textContent = "Copy Mint";
    } else {
      btn.textContent = "Copy Mint";
    }
  });

  copyFeedbackElements.forEach((el) => {
    el.textContent = "";
  });
}

copyButtons.forEach((btn) => {
  btn.addEventListener("click", copyMintAddress);
});

/* ── Hamburger menu ── */

function initNavMenu() {
  const toggle = document.getElementById("menu-toggle");
  const menu = document.getElementById("nav-menu");
  const overlay = document.getElementById("nav-overlay");

  if (!toggle || !menu || !overlay) {
    return;
  }

  const menuLinks = menu.querySelectorAll("a");

  function openMenu() {
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");
    menu.classList.add("is-open");
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("menu-open");
  }

  function closeMenu() {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    menu.classList.remove("is-open");
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-open");
  }

  function isOpen() {
    return menu.classList.contains("is-open");
  }

  toggle.addEventListener("click", () => {
    if (isOpen()) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  overlay.addEventListener("click", closeMenu);

  menuLinks.forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      closeMenu();
    }
  });
}

/* ── Scroll reveal ── */

const REVEAL_ANIMATION_MS = 1000;

function assignRevealStagger() {
  document.querySelectorAll(".chapter").forEach((chapter) => {
    const reveals = chapter.querySelectorAll(".reveal");

    reveals.forEach((element, index) => {
      element.style.setProperty("--reveal-delay", `${index * 0.1}s`);
    });
  });
}

function activateReveal(element) {
  if (element.dataset.revealed === "true") {
    return;
  }

  element.dataset.revealed = "true";
  element.classList.add("is-entering");

  window.setTimeout(() => {
    element.classList.remove("is-entering");
  }, REVEAL_ANIMATION_MS);
}

function initReveal() {
  const elements = document.querySelectorAll(".reveal");

  if (!elements.length) {
    return;
  }

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReducedMotion) {
    return;
  }

  document.documentElement.classList.add("has-reveal");
  assignRevealStagger();

  if (!("IntersectionObserver" in window)) {
    elements.forEach((element) => activateReveal(element));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        activateReveal(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
  );

  elements.forEach((element) => observer.observe(element));

  window.setTimeout(() => {
    elements.forEach((element) => {
      if (element.dataset.revealed !== "true") {
        activateReveal(element);
      }
    });
  }, 2500);
}

/* ── Sky birds ── */

function initSkyBirds() {
  const container = document.getElementById("sky-birds");

  if (!container) {
    return;
  }

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReducedMotion) {
    return;
  }

  const birdCount = window.matchMedia("(max-width: 640px)").matches ? 2 : 5;

  for (let i = 0; i < birdCount; i += 1) {
    const bird = document.createElement("div");
    bird.className = "bird";
    bird.innerHTML = BIRD_SVG;
    bird.style.setProperty("--bird-top", `${6 + Math.random() * 16}%`);
    bird.style.setProperty("--bird-size", `${10 + Math.random() * 10}px`);
    bird.style.setProperty("--bird-duration", `${55 + Math.random() * 35}s`);
    bird.style.setProperty("--bird-delay", `${Math.random() * 25}s`);
    bird.style.setProperty("--bird-opacity", `${0.18 + Math.random() * 0.18}`);
    container.appendChild(bird);
  }
}

/* ── Sky clouds ── */

function initSkyClouds() {
  const container = document.getElementById("sky-clouds");

  if (!container) {
    return;
  }

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReducedMotion) {
    return;
  }

  const cloudCount = window.matchMedia("(max-width: 640px)").matches ? 2 : 4;

  for (let i = 0; i < cloudCount; i += 1) {
    const cloud = document.createElement("div");
    cloud.className = "cloud";
    cloud.innerHTML = '<span class="cloud__body"></span>';
    cloud.style.setProperty("--cloud-left", `${5 + Math.random() * 70}%`);
    cloud.style.setProperty("--cloud-top", `${6 + Math.random() * 28}%`);
    cloud.style.setProperty("--cloud-width", `${120 + Math.random() * 140}px`);
    cloud.style.setProperty("--cloud-height", `${40 + Math.random() * 40}px`);
    cloud.style.setProperty("--cloud-duration", `${110 + Math.random() * 70}s`);
    cloud.style.setProperty("--cloud-delay", `${Math.random() * 30}s`);
    cloud.style.setProperty("--cloud-opacity", `${0.1 + Math.random() * 0.12}`);
    container.appendChild(cloud);
  }
}

/* ── Sky particles ── */

function initSkyParticles() {
  const container = document.getElementById("sky-particles");

  if (!container) {
    return;
  }

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReducedMotion) {
    return;
  }

  const particleCount = window.matchMedia("(max-width: 640px)").matches ? 12 : 18;

  for (let i = 0; i < particleCount; i += 1) {
    const particle = document.createElement("div");
    particle.className = "particle";
    particle.style.setProperty("--particle-left", `${Math.random() * 100}%`);
    particle.style.setProperty("--particle-top", `${Math.random() * 55}%`);
    particle.style.setProperty("--particle-size", `${1.2 + Math.random() * 1.8}px`);
    particle.style.setProperty("--particle-duration", `${75 + Math.random() * 60}s`);
    particle.style.setProperty("--particle-delay", `${Math.random() * 35}s`);
    particle.style.setProperty("--particle-opacity", `${0.1 + Math.random() * 0.18}`);
    particle.style.setProperty("--particle-x", `${-30 + Math.random() * 60}px`);
    particle.style.setProperty("--particle-y", `${-20 + Math.random() * 30}px`);
    container.appendChild(particle);
  }
}

initNavMenu();
initReveal();
initSkyBirds();
initSkyClouds();
initSkyParticles();
