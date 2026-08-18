(() => {
  "use strict";

  const archive = window.PHOTO_ARCHIVE;
  const photos = [...archive.photos].sort((a, b) => a.date.localeCompare(b.date));
  const photoPath = photo => `assets/photos/${photo.file}`;
  const dateFormatter = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  const compactFormatter = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });

  const elements = {
    viewer: document.getElementById("viewer"),
    stage: document.getElementById("imageStage"),
    baseImage: document.getElementById("baseImage"),
    compareImage: document.getElementById("compareImage"),
    baseDate: document.getElementById("baseDate"),
    compareDate: document.getElementById("compareDate"),
    timeline: document.getElementById("timeline"),
    range: document.getElementById("compareRange"),
    rangeStart: document.getElementById("rangeStartLabel"),
    rangeEnd: document.getElementById("rangeEndLabel"),
    play: document.getElementById("playButton"),
    playStyle: document.getElementById("playStyleSelect"),
    zoomValue: document.getElementById("resetViewButton"),
    helpDialog: document.getElementById("helpDialog")
  };

  const query = new URLSearchParams(location.search);
  const findIndex = value => Math.max(0, photos.findIndex(photo => photo.date.replaceAll("-", "") === value));
  const state = {
    baseIndex: query.has("base") ? findIndex(query.get("base")) : 0,
    compareIndex: query.has("compare") ? findIndex(query.get("compare")) : photos.length - 1,
    mode: ["split", "fade", "difference"].includes(query.get("mode")) ? query.get("mode") : "split",
    value: Math.min(100, Math.max(0, Number(query.get("position")) || 50)),
    scale: 1,
    x: 0,
    y: 0,
    playing: false,
    playTimer: null,
    playFrame: null,
    playStyle: "fade"
  };

  function displayDate(date, compact = false) {
    const value = new Date(`${date}T00:00:00`);
    return (compact ? compactFormatter : dateFormatter).format(value);
  }

  function placeholder(photo) {
    const date = displayDate(photo.date);
    const safeFile = photo.file.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22384a"/><stop offset="1" stop-color="#0b121a"/></linearGradient></defs>
      <rect width="1600" height="900" fill="url(#g)"/>
      <path d="M0 650L180 590l140 34 170-135 145 45 210-168 190 85 145-110 170 110 250-74v523H0z" fill="#14232f"/>
      <g fill="none" stroke="#55d3b6" stroke-width="6" opacity=".7"><path d="M680 260h240v240H680z"/><path d="M740 500V360h120v140"/></g>
      <text x="800" y="600" fill="#f7f8fa" font-family="sans-serif" font-size="48" text-anchor="middle">${date}</text>
      <text x="800" y="670" fill="#9aabba" font-family="sans-serif" font-size="25" text-anchor="middle">元画像を assets/photos に追加してください</text>
      <text x="800" y="715" fill="#6f8191" font-family="sans-serif" font-size="20" text-anchor="middle">${safeFile}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function loadWithFallback(image, photo) {
    image.onload = () => {
      if (image === elements.baseImage && image.naturalWidth && image.naturalHeight && image.dataset.missing !== "true") {
        const ratio = Math.min(2.4, Math.max(1, image.naturalWidth / image.naturalHeight));
        document.documentElement.style.setProperty("--mobile-photo-ratio", ratio);
      }
    };
    image.onerror = () => {
      image.onerror = null;
      image.src = placeholder(photo);
      image.dataset.missing = "true";
    };
    image.dataset.missing = "false";
    image.src = photoPath(photo);
  }

  function buildTimeline() {
    const fragment = document.createDocumentFragment();
    photos.forEach((photo, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timeline-item";
      button.dataset.index = index;
      button.setAttribute("aria-label", `${displayDate(photo.date)}を選択`);

      const image = document.createElement("img");
      image.className = "timeline-thumb";
      image.loading = index > 2 ? "lazy" : "eager";
      image.alt = "";
      loadWithFallback(image, photo);

      const date = document.createElement("span");
      date.className = "timeline-date";
      date.textContent = displayDate(photo.date, true);

      button.append(image, date);
      button.addEventListener("click", () => selectTimeline(index));
      fragment.append(button);
    });
    elements.timeline.append(fragment);
  }

  function selectTimeline(index) {
    stopPlayback();
    if (index === state.compareIndex) {
      state.baseIndex = index;
      if (state.baseIndex === state.compareIndex) {
        state.compareIndex = Math.min(photos.length - 1, index + 1);
        if (state.compareIndex === state.baseIndex) state.compareIndex = Math.max(0, index - 1);
      }
    } else {
      state.compareIndex = index;
    }
    renderSelection(true);
  }

  function renderSelection(scroll = false) {
    const base = photos[state.baseIndex];
    const compare = photos[state.compareIndex];
    loadWithFallback(elements.baseImage, base);
    loadWithFallback(elements.compareImage, compare);
    elements.baseDate.textContent = displayDate(base.date);
    elements.compareDate.textContent = displayDate(compare.date);

    document.querySelectorAll(".timeline-item").forEach((item, index) => {
      item.classList.toggle("is-base", index === state.baseIndex);
      item.classList.toggle("is-compare", index === state.compareIndex);
      item.querySelector(".item-role")?.remove();
      if (index === state.baseIndex || index === state.compareIndex) {
        const role = document.createElement("span");
        role.className = "item-role";
        role.textContent = index === state.baseIndex ? "基準" : "比較";
        item.append(role);
      }
    });

    if (scroll) document.querySelector(`.timeline-item[data-index="${state.compareIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    updateUrl();
  }

  function setMode(mode) {
    state.mode = mode;
    elements.viewer.dataset.mode = mode;
    document.querySelectorAll(".mode-tab").forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    elements.rangeStart.textContent = mode === "fade" ? "基準" : "左";
    elements.rangeEnd.textContent = mode === "fade" ? "比較" : "右";
    elements.range.setAttribute("aria-label", mode === "fade" ? "比較写真の透明度" : "比較位置");
    updateUrl();
  }

  function setRange(value, updateHistory = true) {
    state.value = Number(value);
    document.documentElement.style.setProperty("--compare-position", `${state.value}%`);
    document.documentElement.style.setProperty("--compare-opacity", state.value / 100);
    elements.range.value = state.value;
    if (updateHistory) updateUrl();
  }

  function clampPan() {
    const maxX = innerWidth * Math.max(0, state.scale - 1) / 2;
    const maxY = elements.viewer.clientHeight * Math.max(0, state.scale - 1) / 2;
    state.x = Math.min(maxX, Math.max(-maxX, state.x));
    state.y = Math.min(maxY, Math.max(-maxY, state.y));
  }

  function renderTransform() {
    clampPan();
    document.documentElement.style.setProperty("--image-scale", state.scale);
    document.documentElement.style.setProperty("--image-x", `${state.x}px`);
    document.documentElement.style.setProperty("--image-y", `${state.y}px`);
    elements.zoomValue.textContent = `${Math.round(state.scale * 100)}%`;
  }

  function zoomBy(factor) {
    state.scale = Math.min(4, Math.max(1, state.scale * factor));
    if (state.scale === 1) { state.x = 0; state.y = 0; }
    renderTransform();
  }

  function resetView() {
    state.scale = 1; state.x = 0; state.y = 0; renderTransform();
  }

  function updateUrl() {
    const base = photos[state.baseIndex].date.replaceAll("-", "");
    const compare = photos[state.compareIndex].date.replaceAll("-", "");
    const params = new URLSearchParams({ base, compare, mode: state.mode, position: String(state.value) });
    history.replaceState(null, "", `${location.pathname}?${params}${location.hash}`);
  }

  function prepareFadeFrame() {
    state.baseIndex = state.compareIndex;
    state.compareIndex = (state.compareIndex + 1) % photos.length;
    setRange(0, false);
    renderSelection(true);
  }

  function startFadePlayback() {
    setMode("fade");
    state.compareIndex = state.baseIndex;
    prepareFadeFrame();
    const duration = 1300;
    const hold = 650;
    let startedAt = null;

    const animate = timestamp => {
      if (!state.playing) return;
      if (startedAt === null) startedAt = timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      setRange(eased * 100, false);

      if (progress < 1) {
        state.playFrame = requestAnimationFrame(animate);
      } else {
        updateUrl();
        state.playTimer = window.setTimeout(() => {
          if (!state.playing) return;
          prepareFadeFrame();
          startedAt = null;
          state.playFrame = requestAnimationFrame(animate);
        }, hold);
      }
    };

    state.playFrame = requestAnimationFrame(animate);
  }

  function startStepPlayback() {
    state.playTimer = window.setInterval(() => {
      state.compareIndex = (state.compareIndex + 1) % photos.length;
      if (state.compareIndex === state.baseIndex) state.compareIndex = (state.compareIndex + 1) % photos.length;
      renderSelection(true);
    }, 1800);
  }

  function startPlayback() {
    state.playing = true;
    elements.play.setAttribute("aria-pressed", "true");
    elements.play.querySelector(".play-icon").textContent = "Ⅱ";
    elements.play.querySelector(".play-label").textContent = "停止";
    state.playStyle = elements.playStyle.value;
    elements.playStyle.disabled = true;
    if (state.playStyle === "fade") startFadePlayback();
    else startStepPlayback();
  }

  function stopPlayback() {
    clearInterval(state.playTimer);
    clearTimeout(state.playTimer);
    cancelAnimationFrame(state.playFrame);
    state.playing = false;
    elements.play.setAttribute("aria-pressed", "false");
    elements.play.querySelector(".play-icon").textContent = "▶";
    elements.play.querySelector(".play-label").textContent = "自動再生";
    elements.playStyle.disabled = false;
  }

  function bindPointerGestures() {
    const pointers = new Map();
    let lastDistance = 0;
    let lastCenter = null;
    let sliderDrag = false;

    const setSliderFromPointer = event => {
      const rect = elements.stage.getBoundingClientRect();
      setRange(Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * 100));
    };

    elements.stage.addEventListener("pointerdown", event => {
      const rect = elements.stage.getBoundingClientRect();
      const splitX = rect.left + rect.width * state.value / 100;
      sliderDrag = state.mode === "split" && Math.abs(event.clientX - splitX) < 38 && pointers.size === 0;
      elements.stage.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (sliderDrag) setSliderFromPointer(event);
    });

    elements.stage.addEventListener("pointermove", event => {
      if (!pointers.has(event.pointerId)) return;
      const previous = pointers.get(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (sliderDrag) { setSliderFromPointer(event); return; }

      if (pointers.size === 1 && state.scale > 1) {
        state.x += event.clientX - previous.x;
        state.y += event.clientY - previous.y;
        renderTransform();
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (lastDistance) state.scale = Math.min(4, Math.max(1, state.scale * distance / lastDistance));
        if (lastCenter) { state.x += center.x - lastCenter.x; state.y += center.y - lastCenter.y; }
        lastDistance = distance;
        lastCenter = center;
        renderTransform();
      }
    });

    const end = event => {
      pointers.delete(event.pointerId);
      sliderDrag = false;
      if (pointers.size < 2) { lastDistance = 0; lastCenter = null; }
    };
    elements.stage.addEventListener("pointerup", end);
    elements.stage.addEventListener("pointercancel", end);
    elements.stage.addEventListener("wheel", event => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.12 : .89); }, { passive: false });
  }

  function bindEvents() {
    document.querySelectorAll(".mode-tab").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
    elements.range.addEventListener("input", event => setRange(event.target.value));
    elements.play.addEventListener("click", () => state.playing ? stopPlayback() : startPlayback());
    elements.playStyle.addEventListener("change", () => { state.playStyle = elements.playStyle.value; });
    document.getElementById("zoomInButton").addEventListener("click", () => zoomBy(1.25));
    document.getElementById("zoomOutButton").addEventListener("click", () => zoomBy(.8));
    elements.zoomValue.addEventListener("click", resetView);
    document.getElementById("fullscreenButton").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.());
    document.getElementById("helpButton").addEventListener("click", () => elements.helpDialog.showModal());
    document.getElementById("closeHelpButton").addEventListener("click", () => elements.helpDialog.close());
    elements.helpDialog.addEventListener("click", event => { if (event.target === elements.helpDialog) elements.helpDialog.close(); });
    window.addEventListener("resize", () => { updateMediaProfile(); renderTransform(); });
    window.addEventListener("keydown", event => {
      if (event.key === "ArrowRight") selectTimeline((state.compareIndex + 1) % photos.length);
      if (event.key === "ArrowLeft") selectTimeline((state.compareIndex - 1 + photos.length) % photos.length);
      if (event.key.toLowerCase() === "f") document.getElementById("fullscreenButton").click();
      if (event.key === "Escape") stopPlayback();
    });
  }

  function updateMediaProfile() {
    document.documentElement.dataset.media = matchMedia("(pointer: coarse)").matches ? "touch" : "mouse";
    document.documentElement.dataset.layout = matchMedia("(max-width: 760px)").matches ? "mobile" : "desktop";
    document.documentElement.dataset.orientation = matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape";
  }

  function init() {
    if (!archive || photos.length < 2) throw new Error("data.js に2枚以上の写真を登録してください。");
    document.title = `${archive.title}｜変化を比較`;
    document.getElementById("siteTitle").textContent = archive.title;
    document.getElementById("photoCount").textContent = photos.length;
    updateMediaProfile();
    buildTimeline();
    bindEvents();
    bindPointerGestures();
    setMode(state.mode);
    setRange(state.value);
    renderSelection();
    renderTransform();
  }

  init();
})();
