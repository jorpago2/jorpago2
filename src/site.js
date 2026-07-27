const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".primary-nav");
const carouselLabels = {
  previous: document.body.dataset.carouselPrevious || "Previous image",
  next: document.body.dataset.carouselNext || "Next image",
  slide: document.body.dataset.carouselSlide || "{current} of {total}",
  show: document.body.dataset.carouselShow || "Show image {current} of {total}",
  status: document.body.dataset.carouselStatus || "Image {current} of {total}",
  pause: document.body.dataset.carouselPause || "Pause slideshow",
  play: document.body.dataset.carouselPlay || "Play slideshow",
};

function carouselLabel(template, current, total) {
  return template.replace("{current}", current).replace("{total}", total);
}

if (menuButton && navigation) {
  function closeNavigation() {
    menuButton.setAttribute("aria-expanded", "false");
    navigation.classList.remove("is-open");
  }

  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    if (isOpen) closeNavigation();
    else {
      menuButton.setAttribute("aria-expanded", "true");
      navigation.classList.add("is-open");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
      closeNavigation();
      menuButton.focus();
    }
  });
}

document.querySelectorAll(".copy-email").forEach((button) => {
  const status = button.parentElement?.querySelector(".email-copy-status");
  const localPart = button.dataset.emailLocal;
  const domain = button.dataset.emailDomain;

  if (!status || !localPart || !domain || !navigator.clipboard) {
    button.parentElement.hidden = true;
    return;
  }

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(`${localPart}@${domain}`);
      const message = button.dataset.copySuccess || "Email address copied";
      button.textContent = message;
      status.textContent = message;
    } catch {
      const message = button.dataset.copyError || "The address could not be copied";
      button.textContent = message;
      status.textContent = message;
    }
  });
});

document.querySelectorAll(".metaslider").forEach((carousel) => {
  const slides = [...carousel.querySelectorAll(".slides > li")];
  if (slides.length < 2) return;

  let currentSlide = 0;
  let timer;
  let isPaused = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const controls = document.createElement("div");
  const dots = document.createElement("div");
  const status = document.createElement("p");
  const previousButton = document.createElement("button");
  const nextButton = document.createElement("button");
  const pauseButton = document.createElement("button");
  const carouselWidth = Number(carousel.dataset.width);
  const carouselHeight = Number(carousel.dataset.height);

  carousel.classList.add("carousel-ready");
  carousel.setAttribute("aria-roledescription", "carousel");
  if (carouselWidth > 0 && carouselHeight > 0) {
    carousel.style.setProperty("--carousel-aspect", `${carouselWidth} / ${carouselHeight}`);
  }
  controls.className = "carousel-controls";
  dots.className = "carousel-dots";
  status.className = "carousel-status";
  previousButton.type = "button";
  previousButton.className = "carousel-arrow";
  previousButton.setAttribute("aria-label", carouselLabels.previous);
  previousButton.textContent = "‹";
  nextButton.type = "button";
  nextButton.className = "carousel-arrow";
  nextButton.setAttribute("aria-label", carouselLabels.next);
  nextButton.textContent = "›";
  pauseButton.type = "button";
  pauseButton.className = "carousel-arrow carousel-toggle";

  function updatePauseButton() {
    pauseButton.setAttribute("aria-pressed", String(isPaused));
    pauseButton.setAttribute("aria-label", isPaused ? carouselLabels.play : carouselLabels.pause);
    pauseButton.textContent = isPaused ? "▶" : "⏸";
  }

  updatePauseButton();

  const dotButtons = slides.map((slide, index) => {
    slide.removeAttribute("style");
    slide.setAttribute("aria-label", carouselLabel(carouselLabels.slide, index + 1, slides.length));
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(
      "aria-label",
      carouselLabel(carouselLabels.show, index + 1, slides.length),
    );
    button.addEventListener("click", () => showSlide(index));
    dots.append(button);
    return button;
  });

  function loadSlideImage(slide) {
    const image = slide.querySelector("img[data-src]");
    if (!image) return;
    image.src = image.dataset.src;
    image.removeAttribute("data-src");
  }

  function showSlide(index, announce = true) {
    currentSlide = (index + slides.length) % slides.length;
    loadSlideImage(slides[currentSlide]);
    slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === currentSlide;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));
    });
    dotButtons.forEach((button, buttonIndex) => {
      button.setAttribute("aria-current", buttonIndex === currentSlide ? "true" : "false");
    });
    status.setAttribute("aria-live", announce ? "polite" : "off");
    status.textContent = carouselLabel(carouselLabels.status, currentSlide + 1, slides.length);
    loadSlideImage(slides[(currentSlide + 1) % slides.length]);
  }

  function stopAutoplay() {
    clearInterval(timer);
  }

  function startAutoplay() {
    if (isPaused) return;
    stopAutoplay();
    timer = setInterval(() => showSlide(currentSlide + 1, false), 6000);
  }

  pauseButton.addEventListener("click", () => {
    isPaused = !isPaused;
    updatePauseButton();
    if (isPaused) stopAutoplay();
    else startAutoplay();
  });

  previousButton.addEventListener("click", () => showSlide(currentSlide - 1));
  nextButton.addEventListener("click", () => showSlide(currentSlide + 1));
  carousel.addEventListener("mouseenter", stopAutoplay);
  carousel.addEventListener("mouseleave", startAutoplay);
  carousel.addEventListener("focusin", stopAutoplay);
  carousel.addEventListener("focusout", startAutoplay);
  carousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") showSlide(currentSlide - 1);
    if (event.key === "ArrowRight") showSlide(currentSlide + 1);
  });

  controls.append(previousButton, dots, status, nextButton, pauseButton);
  carousel.append(controls);
  showSlide(0, false);
  startAutoplay();
});
