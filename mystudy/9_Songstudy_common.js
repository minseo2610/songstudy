const MyUI = (() => {

  const PAGES = [
    { key: "home", label: "홈", short: "홈", href: "9_Songstudy_home.html", icon: "home" },
    { key: "subjects", label: "과목 관리", short: "과목", href: "9_Songstudy_subjects.html", icon: "book" },
    { key: "planner", label: "주간 플래너", short: "플래너", href: "9_Songstudy_weekly.html", icon: "calendar" },
    { key: "timer", label: "타이머", short: "타이머", href: "9_Songstudy_timer.html", icon: "clock" },
    { key: "report", label: "통계 리포트", short: "리포트", href: "9_Songstudy_report.html", icon: "chart" },
  ];

  const ICONS = {
    pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    "calendar-plus": '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M12 13v5M9.5 15.5h5"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
    chart: '<path d="M4 20h16"/><rect x="6" y="11" width="3" height="6"/><rect x="11" y="6" width="3" height="11"/><rect x="16" y="13" width="3" height="4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    "chevron-right": '<path d="M9 5l7 7-7 7"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  };

  function injectSprite() {
    if (document.getElementById("ms-icons")) return;
    const symbols = Object.entries(ICONS)
      .map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`)
      .join("");
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<svg id="ms-icons" xmlns="http://www.w3.org/2000/svg" hidden aria-hidden="true">${symbols}</svg>`
    );
  }

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  function renderNav() {
    const header = document.querySelector("[data-nav]");
    if (!header) return;
    const current = document.body.dataset.page;
    const tabs = PAGES.map((p) => `
      <a class="tab" href="${p.href}" ${p.key === current ? 'aria-current="page"' : ""}>
        ${icon(p.icon)}
        <span class="tab-label">${p.label}</span>
        <span class="tab-short" aria-hidden="true">${p.short}</span>
      </a>`).join("");
    header.innerHTML = `
      <a class="brand" href="${PAGES[0].href}">
        <img class="brand-logo" src="../images/9_Songstudy_logo.png" alt="Songtudy 홈" width="640" height="255">
      </a>
      <nav class="tab-nav" aria-label="주요 메뉴">${tabs}</nav>`;
  }

  function renderAddrBar() {
    const bar = document.querySelector("[data-addr-bar]");
    if (!bar) return;

    const page = PAGES.find((p) => p.key === document.body.dataset.page);
    const path = document.body.dataset.addr || (page ? page.label.replace(/\s/g, "") : "");
    bar.setAttribute("aria-hidden", "true");

    bar.innerHTML = `<span class="addr">${icon("heart")}<span>songtudy/<strong data-addr-current>${escapeHTML(path)}</strong></span></span>`;
  }

  function renderFooter() {
    const footer = document.querySelector("[data-footer]");
    if (!footer) return;
    footer.insertAdjacentHTML("afterbegin", "<p>Songtudy · 웹프로그래밍 기말 프로젝트 · 김규린 김민서 이예랑</p>");
  }

  function setAddr(text) {
    const el = document.querySelector("[data-addr-current]");
    if (el) el.textContent = text;
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  let toastEl;
  let toastTimer;
  let toastDuration = 0;

  function startToastTimer() {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, toastDuration);
  }

  function pauseToastTimer() {
    clearTimeout(toastTimer);
  }

  function toast(message, { actionLabel, onAction } = {}) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.innerHTML = `<span class="toast-icon" aria-hidden="true">${icon("check")}</span><span class="toast-msg"></span><button class="toast-action" type="button" hidden></button>`;
      document.body.append(toastEl);

      toastEl.addEventListener("mouseenter", pauseToastTimer);
      toastEl.addEventListener("mouseleave", startToastTimer);
      toastEl.addEventListener("focusin", pauseToastTimer);
      toastEl.addEventListener("focusout", startToastTimer);
    }
    const btn = toastEl.querySelector(".toast-action");
    toastEl.querySelector(".toast-msg").textContent = message;

    btn.hidden = !actionLabel;
    btn.onclick = null;
    if (actionLabel) {
      // 되돌리기는 구부러진 뒤로 화살표와 함께
      btn.innerHTML = `${/되돌리기/.test(actionLabel) ? icon("undo") : ""}<span>${escapeHTML(actionLabel)}</span>`;
      btn.onclick = () => {
        hideToast();
        onAction();
      };
    }

    toastEl.classList.remove("is-show");
    void toastEl.offsetWidth; // 연달아 떠도 다시 떠오르게
    toastEl.classList.add("is-show");
    toastDuration = actionLabel ? 9000 : 2500;
    startToastTimer();
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastEl?.classList.remove("is-show");
  }

  function syncDate(input) {
    input.parentElement.classList.toggle("is-empty", !input.value);
  }

  function enhanceDate(input) {
    if (input.dataset.enhanced) return;
    input.dataset.enhanced = "true";
    const wrap = document.createElement("span");
    wrap.className = "date-input";
    input.before(wrap);
    wrap.append(input);
    const ph = document.createElement("span");
    ph.className = "date-ph";
    ph.setAttribute("aria-hidden", "true");
    ph.textContent = input.dataset.placeholder;
    wrap.append(ph);
    ["input", "change"].forEach((type) => input.addEventListener(type, () => syncDate(input)));
    input.form?.addEventListener("reset", () => setTimeout(() => syncDate(input)));
    input.addEventListener("click", () => {
      try { input.showPicker(); } catch (err) {  }
    });
    syncDate(input);
  }

  function enhanceDates(root = document) {
    root.querySelectorAll('input[type="date"][data-placeholder]').forEach(enhanceDate);
  }

  injectSprite();
  renderNav();
  renderAddrBar();
  renderFooter();
  enhanceDates();

  return { PAGES, icon, escapeHTML, toast, setAddr, enhanceDates, syncDate };
})();
