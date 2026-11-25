/* =========================================================
   Songtudy · 공통 스크립트 (팀 전체 공유)
   - 아이콘 모음(SVG), 상단 탭 내비게이션, 주소 표시줄을 자동으로 그립니다.
   - 토스트 알림(되돌리기 버튼 지원), HTML 이스케이프 도우미를 제공합니다.

   사용법
     <body data-page="planner" data-addr="planner">
       <header class="window-tabs" data-nav></header>
       <div class="window-bar" data-addr-bar></div>
     아이콘: MyUI.icon("calendar")  → <svg class="icon">…</svg> 문자열
   ========================================================= */

const MyUI = (() => {
  /* ---------- 메뉴 (파일명은 팀원과 맞춰 수정) ---------- */
  const PAGES = [
    { key: "home", label: "홈", short: "홈", href: "00_mystudy_index.html", icon: "home" },
    { key: "subjects", label: "과목 관리", short: "과목", href: "00_mystudy_subjects.html", icon: "book" },
    { key: "planner", label: "주간 플래너", short: "플래너", href: "weekly.html", icon: "calendar" },
    { key: "timer", label: "학습 타이머", short: "타이머", href: "timer.html", icon: "clock" },
    { key: "report", label: "통계 리포트", short: "리포트", href: "00_mystudy_report.html", icon: "chart" },
  ];

  /* ---------- 아이콘: 24x24, 선 두께 2 (공통 .icon 클래스) ---------- */
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

  /* ---------- 내비게이션 ---------- */
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
        <img class="brand-logo" src="00_logo.png" alt="Songtudy 홈" width="640" height="255">
      </a>
      <nav class="tab-nav" aria-label="주요 메뉴">${tabs}</nav>`;
  }

  // 주소 표시줄: 장식이므로 화면 읽기 프로그램에서는 숨김
  function renderAddrBar() {
    const bar = document.querySelector("[data-addr-bar]");
    if (!bar) return;
    const path = document.body.dataset.addr || document.body.dataset.page || "";
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML = `<span class="addr">${icon("heart")}songtudy/<strong data-addr-current>${escapeHTML(path)}</strong></span>`;
  }

  // 상세 페이지처럼 주소 끝부분을 바꿀 때
  function setAddr(text) {
    const el = document.querySelector("[data-addr-current]");
    if (el) el.textContent = text;
  }

  /* ---------- 도우미 ---------- */
  // 사용자 입력을 innerHTML에 넣기 전에 반드시 거칩니다.
  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  /* ---------- 토스트 ----------
     MyUI.toast("삭제했어요.")
     MyUI.toast("삭제했어요.", { actionLabel: "되돌리기", onAction: () => {...} })
     - 되돌리기가 있으면 9초 동안 보이고,
       마우스를 올리거나 키보드 초점이 들어가 있는 동안은 사라지지 않습니다.
  */
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
      toastEl.innerHTML = `<span class="toast-msg"></span><button class="toast-action" type="button" hidden></button>`;
      document.body.append(toastEl);
      // 읽거나 누르려는 동안에는 타이머 멈춤
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
      btn.textContent = actionLabel;
      btn.onclick = () => {
        hideToast();
        onAction();
      };
    }

    toastEl.classList.add("is-show");
    toastDuration = actionLabel ? 9000 : 2500;
    startToastTimer();
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastEl?.classList.remove("is-show");
  }

  /* ---------- 시작 ---------- */
  injectSprite();
  renderNav();
  renderAddrBar();

  return { PAGES, icon, escapeHTML, toast, setAddr };
})();
