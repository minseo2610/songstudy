/* Songtudy · 통계 리포트
   수업 내용: Date·배열·객체·함수, DOM, addEventListener, JSON·Fetch·웹 스토리지.
   공통 MyStudy.init()으로 과목 JSON을 불러옵니다. 별도 서버나 라이브러리는 쓰지 않습니다.
   기존 홈 타이머와 timer.html의 기록을 읽기만 하며 원본 기록은 수정하지 않습니다.
   추가로 학습한 SVG path의 원호로 도넛을 그립니다. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = MyUI.escapeHTML;
  const KEYS = {
    homeSessions: "songstudy.studySessions.v1",
    homeTimer: "songstudy.home.timer.v1",
    timerSessions: "myStudy.studySessions",
    preferences: "songstudy.report.calendarView.v1",
  };
  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  const MIN_DATE = "1900-01-01";
  const saved = readJSON(KEYS.preferences, {});
  let anchor = validDate(saved?.date) && saved.date >= MIN_DATE && saved.date <= todayKey() ? saved.date : todayKey();
  let period = ["day", "week", "month"].includes(saved?.period) ? saved.period : "day";
  let filterId = typeof saved?.subjectId === "string" ? saved.subjectId : "";
  let records = [];
  let catalog = [];
  let ready = false;
  let lastSignature = "";
  let pollId = null;
  let ratioParts = [];
  let ratioTotal = 0;
  let hoveredSubjectId = "";
  const fallbackColor = getComputedStyle(document.documentElement).getPropertyValue("--pink-700").trim();

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function todayKey() { return dateKey(new Date()); }
  function parseDate(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  function validDate(key) {
    return typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(parseDate(key)) === key;
  }
  function shiftDate(key, days) {
    const date = parseDate(key);
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }
  function moveMonth(key, offset) {
    const date = parseDate(key);
    const last = new Date(date.getFullYear(), date.getMonth() + offset + 1, 0).getDate();
    return dateKey(new Date(date.getFullYear(), date.getMonth() + offset, Math.min(date.getDate(), last)));
  }
  function bounds() {
    const date = parseDate(anchor);
    if (period === "day") return { start: anchor, end: anchor };
    if (period === "week") {
      const start = shiftDate(anchor, -((date.getDay() + 6) % 7));
      return { start, end: shiftDate(start, 6) };
    }
    return { start: dateKey(new Date(date.getFullYear(), date.getMonth(), 1)), end: dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)) };
  }
  function fullDate(key) {
    const date = parseDate(key);
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}`;
  }
  function duration(ms) {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    if (hours) return `${hours}시간${minutes ? ` ${minutes}분` : ""}`;
    if (minutes) return `${minutes}분`;
    return seconds ? `${seconds}초` : "0분";
  }
  function exactDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    return `${Math.floor(seconds / 3600)}시간 ${Math.floor(seconds / 60) % 60}분 ${seconds % 60}초`;
  }
  function calendarDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    if (hours) return `<span>${hours}시간</span>${minutes ? `<span>${minutes}분</span>` : ""}`;
    return minutes ? `<span>${minutes}분</span>` : seconds ? `<span>${seconds}초</span>` : "";
  }
  function total(rows) { return rows.reduce((value, row) => value + row.durationMs, 0); }
  function safeColor(value) { return /^#[0-9a-f]{6}$/i.test(value) ? value : fallbackColor; }
  function paintColors(container) {
    container.querySelectorAll("[data-subject-color]").forEach((element) => element.style.setProperty("--subject-color", safeColor(element.dataset.subjectColor)));
  }
  function remember() {
    try { localStorage.setItem(KEYS.preferences, JSON.stringify({ date: anchor, period, subjectId: filterId })); }
    catch { /* 저장할 수 없는 환경에서도 현재 조회는 유지합니다. */ }
  }

  function readRecords() {
    const today = todayKey();
    const home = readJSON(KEYS.homeSessions, []);
    const rows = Array.isArray(home) ? home.filter((row) => row && typeof row.id === "string" && typeof row.subjectId === "string" && validDate(row.date) && row.date >= MIN_DATE && row.date <= today && Number.isFinite(row.durationMs) && row.durationMs > 0).map((row) => ({ ...row })) : [];

    // 홈이 아직 저장하지 않은 경과 시간만 화면에 더합니다. 저장 키에는 쓰지 않습니다.
    const timer = readJSON(KEYS.homeTimer, null);
    if (timer?.version === 1 && timer.running === true && typeof timer.id === "string" && typeof timer.subjectId === "string" && [15, 25, 50].includes(timer.durationMinutes) && timer.totalMs === timer.durationMinutes * 60000 && Number.isFinite(timer.accountedAt) && Number.isFinite(timer.endAt) && timer.accountedAt > 0 && timer.endAt >= timer.accountedAt && timer.endAt - timer.accountedAt <= timer.totalMs) {
      let from = timer.accountedAt;
      const end = Math.min(Date.now(), timer.endAt);
      while (from < end) {
        const date = new Date(from);
        const until = Math.min(end, new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime());
        const key = dateKey(date);
        const id = `${timer.id}:${key}`;
        let row = rows.find((item) => item.id === id && item.date === key && item.subjectId === timer.subjectId);
        if (!row) { row = { id, subjectId: timer.subjectId, date: key, durationMs: 0 }; rows.push(row); }
        row.durationMs += until - from;
        from = until;
      }
    }

    // timer.html과 같은 기준: 기록하기를 누른 종료 날짜에 공부시간을 집계합니다.
    const sessions = readJSON(KEYS.timerSessions, []);
    if (Array.isArray(sessions)) sessions.forEach((row) => {
      if (!row || typeof row.id !== "string" || typeof row.subjectId !== "string" || !Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0 || typeof row.endedAt !== "string" || Number.isNaN(Date.parse(row.endedAt))) return;
      const key = dateKey(new Date(row.endedAt));
      if (key < MIN_DATE || key > today) return;
      rows.push({ id: row.id, subjectId: row.subjectId, subjectName: row.subjectName, date: key, durationMs: row.durationSeconds * 1000 });
    });
    return rows;
  }
  function buildCatalog() {
    const subjects = MyStudy.getSubjects().filter((subject) => subject && typeof subject.id === "string").map((subject) => ({ id: subject.id, name: subject.name || "이름 없는 과목", color: safeColor(subject.color) }));
    records.forEach((row) => {
      if (!subjects.some((subject) => subject.id === row.subjectId)) subjects.push({ id: row.subjectId, name: `${row.subjectName || "이전 과목"} (삭제됨)`, color: safeColor(row.color) });
    });
    return subjects;
  }
  function breakdown(rows) {
    const sums = new Map();
    rows.forEach((row) => sums.set(row.subjectId, (sums.get(row.subjectId) || 0) + row.durationMs));
    return catalog.filter((subject) => sums.has(subject.id)).map((subject) => ({ ...subject, durationMs: sums.get(subject.id) })).sort((a, b) => b.durationMs - a.durationMs || a.name.localeCompare(b.name, "ko"));
  }
  function calendarRecords(date) { return records.filter((row) => row.date === date && (!filterId || row.subjectId === filterId)); }

  function renderRatio() {
    const focusedSubjectId = document.activeElement?.closest("#ratioSubjects [data-donut-id]")?.dataset.donutId;
    const range = bounds();
    const parts = breakdown(records.filter((row) => row.date >= range.start && row.date <= range.end));
    const sum = total(parts);
    const date = parseDate(anchor);
    const endLabel = range.start.slice(0, 4) === range.end.slice(0, 4) ? `${parseDate(range.end).getMonth() + 1}. ${parseDate(range.end).getDate()}` : fullDate(range.end);
    $("periodLabel").textContent = period === "day" ? `${fullDate(anchor)} (${DAY_NAMES[date.getDay()]})` : period === "week" ? `${fullDate(range.start)} – ${endLabel}` : `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
    $("reportDate").value = anchor;
    $("reportDate").max = todayKey();
    $("previousPeriod").disabled = range.start <= MIN_DATE;
    $("nextPeriod").disabled = range.end >= todayKey();
    document.querySelectorAll("[data-period]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.period === period)));
    $("periodTotal").textContent = duration(sum);
    $("periodTotal").title = exactDuration(sum);
    $("ratioEmpty").hidden = parts.length > 0;

    // 마지막 과목까지 포함한 반올림 비율의 합이 정확히 100%가 되도록 배분합니다.
    const percentages = parts.map((subject) => sum ? subject.durationMs / sum * 100 : 0);
    const rounded = percentages.map(Math.floor);
    const remainders = percentages.map((value, index) => ({ index, value: value - rounded[index] })).sort((a, b) => b.value - a.value);
    for (let i = 0, left = 100 - rounded.reduce((a, b) => a + b, 0); i < left && i < remainders.length; i++) rounded[remainders[i].index]++;
    ratioParts = parts;
    ratioTotal = sum;
    let offset = 0;
    $("donutSegments").innerHTML = parts.map((subject) => {
      const length = subject.durationMs / sum;
      const markup = `<path class="report-donut-segment" d="${donutArc(offset, offset + length)}" data-donut-id="${esc(subject.id)}" data-subject-color="${esc(subject.color)}"></path>`;
      offset += length;
      return markup;
    }).join("");
    $("ratioSubjects").innerHTML = parts.map((subject, index) => `<li tabindex="0" data-donut-id="${esc(subject.id)}" data-subject-color="${esc(subject.color)}"><span class="report-subject-name"><i class="report-swatch" aria-hidden="true"></i>${esc(subject.name)}</span><strong class="report-ratio-time num" title="${exactDuration(subject.durationMs)}">${duration(subject.durationMs)}</strong><span class="report-ratio-percent num">${rounded[index]}%</span></li>`).join("");
    $("donutDescription").textContent = `${$("periodLabel").textContent}. 총 ${exactDuration(sum)}. ${parts.length ? parts.map((subject, index) => `${subject.name} ${rounded[index]}%`).join(", ") : "공부 기록 없음"}`;
    const days = new Set(records.filter((row) => row.date >= range.start && row.date <= range.end).map((row) => row.date)).size;
    $("periodNote").textContent = period === "day" ? "기록된 공부시간 기준 · 과목별 시간과 비율" : `기록된 공부시간 기준 · ${days}일 공부${period === "week" ? " · 월요일~일요일" : ""}`;
    paintColors($("donutSegments"));
    paintColors($("ratioSubjects"));
    if (focusedSubjectId) Array.from($("ratioSubjects").children).find((item) => item.dataset.donutId === focusedSubjectId)?.focus({ preventScroll: true });
    hoveredSubjectId = document.querySelector(".report-ratio-body [data-donut-id]:hover")?.dataset.donutId || "";
    updateDonutHighlight();
  }

  function donutArc(start, end) {
    const point = (fraction) => {
      const angle = fraction * Math.PI * 2 - Math.PI / 2;
      return `${120 + Math.cos(angle) * 94} ${120 + Math.sin(angle) * 94}`;
    };
    // 원호 자체를 나누어 각 과목에 마우스가 정확히 반응하게 합니다.
    if (end - start >= .999999999) return `M 120 26 A 94 94 0 1 1 120 214 A 94 94 0 1 1 120 26 Z`;
    return `M ${point(start)} A 94 94 0 ${end - start > .5 ? 1 : 0} 1 ${point(end)}`;
  }
  function updateDonutHighlight() {
    const focusedId = document.activeElement?.closest("#ratioSubjects [data-donut-id]")?.dataset.donutId;
    const subject = ratioParts.find((item) => item.id === (hoveredSubjectId || focusedId));
    document.querySelectorAll(".report-ratio-body [data-donut-id]").forEach((item) => {
      const active = !!subject && item.dataset.donutId === subject.id;
      item.classList.toggle("is-highlight", active);
      item.classList.toggle("is-muted", !!subject && !active && item.classList.contains("report-donut-segment"));
    });
    document.querySelector(".report-donut-center > span").textContent = subject ? subject.name : "총 공부시간";
    $("periodTotal").textContent = duration(subject ? subject.durationMs : ratioTotal);
    $("periodTotal").title = exactDuration(subject ? subject.durationMs : ratioTotal);
  }

  function renderCalendar() {
    const date = parseDate(anchor);
    const month = anchor.slice(0, 7);
    const first = dateKey(new Date(date.getFullYear(), date.getMonth(), 1));
    const last = dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    const start = shiftDate(first, -((parseDate(first).getDay() + 6) % 7));
    const count = Math.ceil((((parseDate(first).getDay() + 6) % 7) + parseDate(last).getDate()) / 7) * 7;
    const monthRows = records.filter((row) => row.date.startsWith(month) && (!filterId || row.subjectId === filterId));
    const monthParts = breakdown(monthRows);
    $("calendarMonth").textContent = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
    $("previousMonth").disabled = month <= MIN_DATE.slice(0, 7);
    $("nextMonth").disabled = month >= todayKey().slice(0, 7);
    $("thisMonth").disabled = month === todayKey().slice(0, 7);
    $("calendarSubject").innerHTML = '<option value="">전체 과목</option>' + catalog.map((subject) => `<option value="${esc(subject.id)}">${esc(subject.name)}</option>`).join("");
    $("calendarSubject").value = filterId;
    $("calendarGrid").innerHTML = Array.from({ length: count }, (_, index) => {
      const key = shiftDate(start, index);
      const parts = breakdown(calendarRecords(key));
      const sum = total(parts);
      const level = !sum ? 0 : sum < 3600000 ? 1 : sum < 7200000 ? 2 : sum < 14400000 ? 3 : 4;
      const inMonth = key.startsWith(month);
      const label = `${fullDate(key)} (${DAY_NAMES[parseDate(key).getDay()]}), ${sum ? exactDuration(sum) + ", " + parts.map((subject) => `${subject.name} ${exactDuration(subject.durationMs)}`).join(", ") : "공부 기록 없음"}`;
      const dots = parts.slice(0, 3).map((subject) => `<i class="report-swatch" data-subject-color="${esc(subject.color)}"></i>`).join("");
      return `<button class="report-calendar-date heat-${level}${inMonth ? "" : " is-other-month"}" type="button" data-date="${key}" tabindex="${key === anchor ? 0 : -1}" aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${key === anchor}"${key === todayKey() ? ' aria-current="date"' : ""}${key > todayKey() || key < MIN_DATE ? " disabled" : ""}><span class="report-date-number">${parseDate(key).getDate()}</span><span class="report-calendar-duration num" aria-hidden="true">${calendarDuration(sum)}</span><span class="report-calendar-dots" aria-hidden="true">${dots}${parts.length > 3 ? `<span class="report-calendar-more">+${parts.length - 3}</span>` : ""}</span></button>`;
    }).join("");
    const scope = filterId ? catalog.find((subject) => subject.id === filterId)?.name || "선택 과목" : "전체 과목";
    $("calendarMonthSummary").textContent = `${scope} · ${new Set(monthRows.map((row) => row.date)).size}일 공부 · ${duration(total(monthRows))}`;
    $("calendarLegend").innerHTML = monthParts.map((subject) => `<span data-subject-color="${esc(subject.color)}"><i class="report-swatch" aria-hidden="true"></i>${esc(subject.name)}</span>`).join("");
    paintColors($("calendarGrid"));
    paintColors($("calendarLegend"));
    renderDay();
  }
  function renderDay() {
    const parts = breakdown(calendarRecords(anchor));
    const date = parseDate(anchor);
    $("selectedDayTitle").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 (${DAY_NAMES[date.getDay()]})${anchor === todayKey() ? " · 오늘" : ""}`;
    $("selectedDayTotal").textContent = duration(total(parts));
    $("selectedDayTotal").title = exactDuration(total(parts));
    $("daySubjects").innerHTML = parts.map((subject) => `<li data-subject-color="${esc(subject.color)}"><span class="report-subject-name"><i class="report-swatch" aria-hidden="true"></i>${esc(subject.name)}</span><strong class="num" title="${exactDuration(subject.durationMs)}">${duration(subject.durationMs)}</strong></li>`).join("");
    $("dayEmpty").hidden = parts.length > 0;
    $("dayEmpty").textContent = filterId ? "이 날짜에는 선택한 과목의 공부 기록이 없어요." : "이 날짜에는 공부 기록이 없어요.";
    paintColors($("daySubjects"));
  }
  function render() { renderRatio(); renderCalendar(); }
  function chooseDate(key, announce = true) {
    if (!validDate(key) || key < MIN_DATE || key > todayKey()) return;
    anchor = key;
    remember();
    render();
    if (announce) $("reportAnnouncement").textContent = `${fullDate(anchor)} 선택. ${$("selectedDayTotal").textContent}.`;
  }
  function stepPeriod(direction) {
    const next = period === "month" ? moveMonth(anchor, direction) : shiftDate(anchor, direction * (period === "week" ? 7 : 1));
    chooseDate(next < MIN_DATE ? MIN_DATE : next > todayKey() ? todayKey() : next);
  }
  function stepMonth(direction) {
    const next = moveMonth(anchor, direction);
    chooseDate(next < MIN_DATE ? MIN_DATE : next > todayKey() ? todayKey() : next);
  }
  function refresh(force = false) {
    if (!ready) return;
    const next = readRecords();
    const signature = JSON.stringify([todayKey(), next, MyStudy.getSubjects()]);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    records = next;
    catalog = buildCatalog();
    if (filterId && !catalog.some((subject) => subject.id === filterId)) { filterId = ""; remember(); }
    const focusedDate = document.activeElement?.dataset.date;
    render();
    if (focusedDate) $("calendarGrid").querySelector(`[data-date="${focusedDate}"]`)?.focus({ preventScroll: true });
  }
  async function load() {
    $("loadError").hidden = true;
    $("loading").hidden = false;
    $("retryButton").disabled = true;
    try {
      await MyStudy.init();
      ready = true;
      refresh(true);
      $("reportApp").hidden = false;
      $("storageNote").hidden = false;
    } catch (error) {
      console.warn("통계 불러오기 실패", error);
      $("loadError").hidden = false;
    } finally {
      $("loading").hidden = true;
      $("retryButton").disabled = false;
    }
  }

  // 보고서 안의 메뉴만 실제 파일로 연결합니다. 공통 파일은 수정하지 않습니다.
  document.querySelectorAll("[data-nav] .tab").forEach((tab, index) => {
    if (MyUI.PAGES[index]?.key === "home") tab.href = "9_songstudy_home.html";
    if (MyUI.PAGES[index]?.key === "report") tab.href = "9_songstudy_report.html";
  });
  const brand = document.querySelector("[data-nav] .brand");
  if (brand) brand.href = "9_songstudy_home.html";
  const ratioBody = document.querySelector(".report-ratio-body");
  ratioBody.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    hoveredSubjectId = event.target.closest("[data-donut-id]")?.dataset.donutId || "";
    updateDonutHighlight();
  });
  ratioBody.addEventListener("pointerout", (event) => {
    if (event.pointerType === "touch") return;
    hoveredSubjectId = event.relatedTarget instanceof Element && ratioBody.contains(event.relatedTarget) ? event.relatedTarget.closest("[data-donut-id]")?.dataset.donutId || "" : "";
    updateDonutHighlight();
  });
  ratioBody.addEventListener("focusin", updateDonutHighlight);
  ratioBody.addEventListener("focusout", () => {
    // focusout 시점에는 이전 항목에 초점이 남아 있어 다음 프레임에 확인합니다.
    requestAnimationFrame(updateDonutHighlight);
  });
  document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => {
    period = button.dataset.period;
    remember();
    renderRatio();
    $("reportAnnouncement").textContent = `${button.textContent} 기준. ${$("periodLabel").textContent}, 총 ${$("periodTotal").textContent}.`;
  }));
  $("previousPeriod").addEventListener("click", () => stepPeriod(-1));
  $("nextPeriod").addEventListener("click", () => stepPeriod(1));
  $("previousMonth").addEventListener("click", () => stepMonth(-1));
  $("nextMonth").addEventListener("click", () => stepMonth(1));
  $("goToday").addEventListener("click", () => chooseDate(todayKey()));
  $("thisMonth").addEventListener("click", () => chooseDate(todayKey()));
  $("reportDate").addEventListener("change", () => {
    const key = $("reportDate").value;
    if (!validDate(key) || key < MIN_DATE || key > todayKey()) { $("reportDate").value = anchor; MyUI.toast("오늘 또는 이전 날짜를 선택해 주세요."); return; }
    chooseDate(key);
  });
  $("calendarSubject").addEventListener("change", () => {
    filterId = $("calendarSubject").value;
    remember();
    renderCalendar();
    $("reportAnnouncement").textContent = `${$("calendarSubject").selectedOptions[0].textContent}의 캘린더. ${$("calendarMonthSummary").textContent}.`;
  });
  $("calendarGrid").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button || button.disabled) return;
    chooseDate(button.dataset.date);
    $("calendarGrid").querySelector(`[data-date="${anchor}"]`)?.focus({ preventScroll: true });
  });
  // 날짜 격자에서 방향키·Home·End로 이동할 수 있습니다.
  $("calendarGrid").addEventListener("keydown", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    const weekday = (parseDate(button.dataset.date).getDay() + 6) % 7;
    const next = offset ? shiftDate(button.dataset.date, offset) : event.key === "Home" ? shiftDate(button.dataset.date, -weekday) : event.key === "End" ? shiftDate(button.dataset.date, 6 - weekday) : "";
    if (!next) return;
    event.preventDefault();
    if (next < MIN_DATE || next > todayKey()) return;
    chooseDate(next);
    $("calendarGrid").querySelector(`[data-date="${anchor}"]`)?.focus({ preventScroll: true });
  });
  $("retryButton").addEventListener("click", load);
  const watchedKeys = [KEYS.homeSessions, KEYS.homeTimer, KEYS.timerSessions, MyStudy.KEYS.subjects, null];
  window.addEventListener("storage", (event) => { if (watchedKeys.includes(event.key)) refresh(); });
  window.addEventListener("focus", () => refresh());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  function startPolling() {
    if (!pollId) pollId = window.setInterval(() => { if (!document.hidden) refresh(); }, 5000);
  }
  window.addEventListener("pagehide", () => { window.clearInterval(pollId); pollId = null; });
  window.addEventListener("pageshow", () => { startPolling(); refresh(); });
  startPolling();
  load();
})();
