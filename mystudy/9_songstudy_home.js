/* Songtudy 홈 · 외부 라이브러리 없이 수업의 JavaScript로 구현합니다.
   강의 9~10: 함수, 조건문, 배열·객체, Date, Math, setTimeout
   강의 11~12: DOM 조회·생성, 속성 변경, addEventListener, 이벤트 위임
   강의 13: 공통 MyStudy.init()의 Fetch·JSON, JSON.parse/stringify, localStorage

   공통 데이터: myStudy.subjects / myStudy.tasks (기존 MyStudy API 사용)
   홈 학습 기록: songstudy.studySessions.v1
     [{ id, subjectId, subjectName, color, date: 'YYYY-MM-DD', durationMs }]
   홈 타이머 상태: songstudy.home.timer.v1 / 완료 숨기기: songstudy.home.hideDone
   통계 페이지에서도 같은 학습 기록 키를 읽으면 타이머 기록을 재사용할 수 있습니다.
   새로고침·탭 이동 중에도 스톱워치는 계속 측정하고, 타이머는 설정한 종료 시각까지 진행합니다.
   기존 파일은 수정하지 않고 이 페이지의 메뉴 링크만 DOM에서 연결합니다. */

(function () {
  "use strict";

  const KEYS = {
    sessions: "songstudy.studySessions.v1",
    timer: "songstudy.home.timer.v1",
    hideDone: "songstudy.home.hideDone"
  };
  const FOCUS_MINUTES = 25;
  const MIN_FOCUS_MINUTES = 5;
  const MAX_FOCUS_MINUTES = 180;
  const FOCUS_STEP_MINUTES = 5;
  const tabId = "home-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const $ = (id) => document.getElementById(id);
  const esc = MyUI.escapeHTML;
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  let ready = false;
  let timer = null;
  let tickId = null;
  let viewedDate = new Date();
  let openedSubjects = new Set();
  let storageWarningShown = false;
  const timerPickerSignatures = {};

  function readJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.warn("저장된 기록을 읽지 못했습니다:", key, error);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    // 저장 오류는 호출한 기능에서 처리해 '저장 완료'로 잘못 표시하지 않습니다.
    localStorage.setItem(key, JSON.stringify(value));
  }

  function dateKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function localDate(key) {
    const parts = key.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function shortDate(key) {
    const date = localDate(key);
    return (date.getMonth() + 1) + "." + String(date.getDate()).padStart(2, "0");
  }

  function showDate() {
    const now = new Date();
    $("todayDate").dateTime = dateKey(now);
    // 큰 제목: 오늘 날짜 (예: 11월 26일 목요일)
    $("todayDate").textContent = (now.getMonth() + 1) + "월 " + now.getDate() + "일 " + days[now.getDay()] + "요일";
  }

  function subjectColor(color) {
    // 과목 색만 공통 CSS가 허용한 사용자 정의 속성으로 전달합니다.
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "var(--pink-500)";
  }

  function applyColors(container) {
    container.querySelectorAll("[data-color]").forEach(function (element) {
      element.style.setProperty("--subject-color", subjectColor(element.dataset.color));
    });
    container.querySelectorAll("[data-value]").forEach(function (element) {
      element.style.setProperty("--value", Number(element.dataset.value) || 0);
    });
  }

  function connectNavigation() {
    const routes = {
      home: "9_songstudy_home.html", subjects: "9_Songstudy_subjects.html",
      planner: "weekly.html", timer: "timer.html", report: "9_songstudy_report.html"
    };
    document.querySelectorAll("[data-nav] .tab").forEach(function (tab, index) {
      const page = MyUI.PAGES[index];
      if (page && routes[page.key]) tab.setAttribute("href", routes[page.key]);
    });
    const brand = document.querySelector("[data-nav] .brand");
    if (brand) brand.setAttribute("href", routes.home);
  }

  function createTimer(subjectId, taskId, mode, selectedMinutes) {
    const subject = MyStudy.getSubject(subjectId);
    const task = MyStudy.getTasksOf(subjectId).find(function (item) { return item.id === taskId; });
    const minutes = Number.isInteger(selectedMinutes) && selectedMinutes >= MIN_FOCUS_MINUTES && selectedMinutes <= MAX_FOCUS_MINUTES ? selectedMinutes : FOCUS_MINUTES;
    return {
      version: 1, id: MyStudy.uid("focus-"), subjectId: subjectId || "",
      mode: mode === "stopwatch" ? "stopwatch" : "focus", elapsedMs: 0,
      subjectName: subject ? subject.name : "", taskId: task ? task.id : "", taskTitle: task ? task.title : "",
      durationMinutes: minutes, totalMs: minutes * 60000, remainingMs: minutes * 60000,
      running: false, endAt: 0, accountedAt: 0, updatedAt: Date.now(), owner: tabId
    };
  }

  function validTimer(value) {
    return value && value.version === 1 && typeof value.id === "string" &&
      typeof value.subjectId === "string" && Number.isInteger(value.durationMinutes) && value.durationMinutes >= 1 && value.durationMinutes <= 180 &&
      (value.mode === undefined || ["focus", "stopwatch"].includes(value.mode)) &&
      (value.mode !== "stopwatch" || (Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0)) &&
      value.totalMs === value.durationMinutes * 60000 && Number.isFinite(value.remainingMs) &&
      value.remainingMs >= 0 && value.remainingMs <= value.totalMs &&
      typeof value.running === "boolean" && Number.isFinite(value.endAt) &&
      Number.isFinite(value.accountedAt) && (!value.running || (value.accountedAt > 0 && value.endAt >= value.accountedAt));
  }

  function timerMode() { return timer.mode === "stopwatch" ? "stopwatch" : "focus"; }

  function timerElapsed() {
    if (timerMode() === "stopwatch") return timer.elapsedMs + (timer.running ? Math.max(0, Date.now() - timer.accountedAt) : 0);
    const remaining = timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.remainingMs;
    return Math.max(0, timer.totalMs - remaining);
  }

  function sessions() {
    const records = readJSON(KEYS.sessions, []);
    return Array.isArray(records) ? records.filter(function (record) {
      return record && typeof record.subjectId === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
        Number.isFinite(record.durationMs) && record.durationMs >= 0;
    }) : [];
  }

  function saveTimer() {
    timer.updatedAt = Date.now();
    writeJSON(KEYS.timer, timer);
  }

  function recordTime(from, to) {
    if (to <= from) return;
    const records = sessions();
    const subject = MyStudy.getSubject(timer.subjectId);
    // 자정을 넘긴 집중도 날짜별로 나누어 저장합니다.
    while (from < to) {
      const day = new Date(from);
      const nextDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
      const end = Math.min(to, nextDay);
      const key = dateKey(day);
      const id = timer.id + ":" + key;
      let record = records.find(function (item) { return item.id === id; });
      if (!record) {
        record = {
          id: id, subjectId: timer.subjectId, subjectName: subject ? subject.name : timer.subjectName || "이전 과목",
          taskId: timer.taskId || "", taskTitle: timer.taskTitle || "",
          color: subject ? subject.color : "", date: key, durationMs: 0
        };
        records.push(record);
      }
      record.durationMs += end - from;
      from = end;
    }
    writeJSON(KEYS.sessions, records);
  }

  function settleTimer() {
    if (!timer || !timer.running || timer.owner !== tabId) return;
    // 여러 홈 탭에서 같은 시간을 중복 기록하지 않도록 마지막 조작 탭만 저장합니다.
    const shared = readJSON(KEYS.timer, null);
    if (validTimer(shared) && (shared.owner !== tabId || shared.id !== timer.id)) {
      timer = shared;
      return;
    }
    const stopwatch = timerMode() === "stopwatch";
    const end = stopwatch ? Date.now() : Math.min(Date.now(), timer.endAt);
    if (end > timer.accountedAt) {
      recordTime(timer.accountedAt, end);
      if (stopwatch) timer.elapsedMs += end - timer.accountedAt;
      timer.accountedAt = end;
    }
    if (stopwatch) timer.endAt = timer.accountedAt;
    else timer.remainingMs = Math.max(0, timer.endAt - Date.now());
    if (!stopwatch && timer.remainingMs === 0) {
      timer.running = false;
      $("timerAnnouncement").textContent = "집중 시간이 끝났어요. 공부한 시간을 리포트에 저장했어요.";
      MyUI.toast("집중 완료! 잠깐 쉬어 가도 좋아요.");
    }
    saveTimer();
  }

  function storageFailure(error) {
    console.error("학습 기록 저장 실패:", error);
    if (timer) timer.running = false;
    if (!storageWarningShown) {
      storageWarningShown = true;
      $("loadErrorText").textContent = "브라우저에 기록을 저장하지 못했어요. 저장 공간과 사이트 저장 권한을 확인한 뒤 새로고침해 주세요.";
      $("loadError").hidden = false;
    }
    $("timerStart").disabled = true;
  }

  function renderTimer() {
    if (!timer) return;
    const stopwatch = timerMode() === "stopwatch";
    const elapsed = timerElapsed();
    const remaining = timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.remainingMs;
    const seconds = stopwatch ? Math.floor(elapsed / 1000) : Math.ceil(remaining / 1000);
    const minutes = stopwatch ? Math.floor(seconds / 60) % 60 : Math.floor(seconds / 60);
    const display = (stopwatch ? String(Math.floor(seconds / 3600)).padStart(2, "0") + ":" : "") + String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
    $("timerDisplay").textContent = display;
    $("timerTrackSize").textContent = String(timer.durationMinutes).padStart(2, "0") + ":00";
    $("timerDisplay").classList.toggle("is-stopwatch", stopwatch);
    $("timerDisplay").setAttribute("aria-label", (stopwatch ? "측정한 공부시간 " : "남은 집중 시간 ") + display);
    $("timerTrack").style.setProperty("--value", stopwatch ? (elapsed % 3600000) / 3600000 : Math.max(0, Math.min(1, 1 - remaining / timer.totalMs)));
    const inProgress = timer.running || elapsed > 0;
    $("timerStart").disabled = !ready || !timer.subjectId || storageWarningShown;
    $("timerFinish").disabled = !ready || storageWarningShown || elapsed < 1000;
    $("timerStartLabel").textContent = timer.running ? "일시정지" : inProgress ? "다시 시작" : "시작하기";
    $("timerStartIcon").innerHTML = timer.running ? '<path d="M8 5v14M16 5v14"></path>' : '<path d="m9 5 10 7-10 7z"></path>';
    const subject = MyStudy.getSubject(timer.subjectId);
    $("timerFocusTitle").textContent = subject ? subject.name : timer.subjectName || "과목 관리에서 과목을 먼저 추가해 주세요.";
    $("timerState").textContent = !subject ? "과목 관리에서 공부할 과목을 추가해 주세요" : !timer.running && !stopwatch && remaining === 0 ? "잘했어요! 오늘의 집중이 차곡차곡 쌓였어요" : "";
    document.querySelector(".home-timer-card").classList.toggle("is-running", timer.running);
    renderTimerPickers();
    renderTimerSettings();
  }

  function adoptTimer() {
    const stored = readJSON(KEYS.timer, null);
    timer = validTimer(stored) ? stored : timer;
    timer.owner = tabId;
    saveTimer();
  }

  function toggleTimer() {
    try {
      adoptTimer();
      settleTimer();
      if (timer.running) {
        timer.running = false;
        saveTimer();
        $("timerAnnouncement").textContent = "타이머를 일시정지하고 집중 시간을 저장했어요.";
      } else {
        if (timerMode() === "focus" && timer.remainingMs === 0) timer = createTimer(timer.subjectId, timer.taskId, timerMode(), timer.durationMinutes);
        if (!MyStudy.getSubject(timer.subjectId) && timerElapsed() === 0) return;
        timer.running = true;
        timer.accountedAt = Date.now();
        timer.endAt = timerMode() === "stopwatch" ? timer.accountedAt : timer.accountedAt + timer.remainingMs;
        saveTimer();
        $("timerAnnouncement").textContent = timerMode() === "stopwatch" ? "스톱워치를 시작했어요." : "타이머를 시작했어요.";
      }
      renderTimer();
      renderReport();
    } catch (error) { storageFailure(error); renderTimer(); }
  }

  function finishTimer() {
    try {
      adoptTimer();
      settleTimer();
      const elapsed = timerElapsed();
      if (elapsed < 1000) return;
      timer = createTimer(timer.subjectId, timer.taskId, timerMode(), timer.durationMinutes);
      saveTimer();
      renderTimer();
      renderReport();
      const message = studyDuration(elapsed) + "의 공부 기록을 저장했어요.";
      $("timerAnnouncement").textContent = message;
      MyUI.toast(message);
    } catch (error) { storageFailure(error); renderTimer(); }
  }

  function changeTimerOptions(kind, value) {
    try {
      adoptTimer();
      if (timer.running) { renderTimer(); return; }
      if (kind === "subject" && (!MyStudy.getSubject(value) || timer.subjectId === value)) return;
      if (kind === "task" && ((timer.taskId || "") === value || (value && !MyStudy.getTasksOf(timer.subjectId).some(function (task) { return task.id === value; })))) return;
      timer = createTimer(kind === "subject" ? value : timer.subjectId, kind === "task" ? value : "", timerMode(), timer.durationMinutes);
      saveTimer();
      renderTimer();
    } catch (error) { storageFailure(error); }
  }

  function renderTimerSettings() {
    const locked = !ready || storageWarningShown || timer.running;
    document.querySelectorAll("[data-home-timer-mode]").forEach(function (button) {
      button.disabled = locked;
      button.setAttribute("aria-pressed", String(button.dataset.homeTimerMode === timerMode()));
    });
    $("timerAdjust").hidden = timerMode() !== "focus";
    $("timerIncrease").disabled = locked || timer.durationMinutes + FOCUS_STEP_MINUTES > MAX_FOCUS_MINUTES;
    $("timerDecrease").disabled = locked || timer.durationMinutes - FOCUS_STEP_MINUTES < MIN_FOCUS_MINUTES || timer.remainingMs < FOCUS_STEP_MINUTES * 60000;
  }

  function adjustTimerMinutes(direction) {
    if (!ready || storageWarningShown) return;
    try {
      adoptTimer();
      if (timer.running || timerMode() !== "focus") { renderTimer(); return; }
      const difference = direction * FOCUS_STEP_MINUTES;
      const nextMinutes = timer.durationMinutes + difference;
      const nextRemaining = timer.remainingMs + difference * 60000;
      if (nextMinutes < MIN_FOCUS_MINUTES || nextMinutes > MAX_FOCUS_MINUTES || nextRemaining < 0) { renderTimer(); return; }
      // 남은 시간과 전체 시간을 함께 바꾸어 이미 공부한 시간은 그대로 유지합니다.
      timer.durationMinutes = nextMinutes;
      timer.totalMs = nextMinutes * 60000;
      timer.remainingMs = nextRemaining;
      saveTimer();
      renderTimer();
      $("timerAnnouncement").textContent = "남은 시간을 5분 " + (direction > 0 ? "늘렸어요. " : "줄였어요. ") + $("timerDisplay").textContent;
    } catch (error) { storageFailure(error); renderTimer(); }
  }

  function changeTimerSettings(mode) {
    if (!ready || storageWarningShown) return;
    try {
      adoptTimer();
      if (timer.running) { renderTimer(); return; }
      if (!["focus", "stopwatch"].includes(mode)) return;
      if (mode !== timerMode()) {
        timer = createTimer(timer.subjectId, timer.taskId, mode, timer.durationMinutes);
        saveTimer();
      }
      renderTimer();
    } catch (error) { storageFailure(error); renderTimer(); }
  }

  function bindTimerSettings() {
    $("timerIncrease").addEventListener("click", function () { adjustTimerMinutes(1); });
    $("timerDecrease").addEventListener("click", function () { adjustTimerMinutes(-1); });
    document.querySelectorAll("[data-home-timer-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        changeTimerSettings(button.dataset.homeTimerMode);
      });
    });
  }

  function updateTimerPopupLayer() {
    document.querySelector(".home-timer-card").classList.toggle("has-open-menu", !$("timerSubjectMenu").hidden || !$("timerTaskMenu").hidden);
  }

  // 홈 타이머의 두 선택창은 통계 페이지 스타일을 쓰되 이름만 표시합니다.
  function timerPickerId(kind) { return kind === "subject" ? "timerSubject" : "timerTask"; }

  function renderTimerPickers() {
    const subjects = MyStudy.getSubjects().map(function (subject) { return { id: subject.id, label: subject.name }; });
    if (timer.subjectId && !subjects.some(function (subject) { return subject.id === timer.subjectId; })) {
      subjects.push({ id: timer.subjectId, label: timer.subjectName || "삭제된 과목" });
    }
    const tasks = MyStudy.getTasksOf(timer.subjectId).map(function (task) {
      return { id: task.id, label: task.title + (task.done ? " (완료)" : "") };
    });
    if (timer.taskId && !tasks.some(function (task) { return task.id === timer.taskId; })) {
      tasks.push({ id: timer.taskId, label: timer.taskTitle || "삭제된 할 일" });
    }
    const locked = !ready || storageWarningShown || timer.running;
    renderTimerPicker("subject", subjects.length ? subjects : [{ id: "", label: "등록된 과목이 없어요" }], timer.subjectId, locked || !subjects.length);
    renderTimerPicker("task", [{ id: "", label: "과목만 기록하기" }].concat(tasks), timer.taskId || "", locked || !timer.subjectId);
  }

  function renderTimerPicker(kind, options, selectedId, disabled) {
    const id = timerPickerId(kind);
    const trigger = $(id);
    trigger.disabled = disabled;
    trigger.value = selectedId;
    trigger.title = timer.running ? "일시정지하면 바꿀 수 있어요" : "";
    if (disabled) closeTimerPicker(kind);
    const signature = JSON.stringify([options, selectedId, disabled]);
    if (timerPickerSignatures[kind] === signature) return;
    timerPickerSignatures[kind] = signature;
    const active = document.activeElement;
    const focusedId = $(id + "Options").contains(active) ? active.dataset.timerOption : undefined;
    const selected = options.find(function (option) { return option.id === selectedId; }) || options[0];
    $(id + "Value").textContent = selected ? selected.label : "";
    $(id + "Options").innerHTML = options.map(function (option) {
      return '<button class="home-timer-menu-option" type="button" role="option" data-timer-option="' + esc(option.id) + '" tabindex="' + (option.id === selectedId ? 0 : -1) + '" aria-selected="' + (option.id === selectedId) + '">' + esc(option.label) + '</button>';
    }).join("");
    if (focusedId !== undefined && !$(id + "Menu").hidden) focusTimerOption(kind, focusedId);
  }

  function focusTimerOption(kind, value) {
    const id = timerPickerId(kind);
    const options = Array.from($(id + "Options").children);
    const target = options.find(function (option) { return option.dataset.timerOption === value; }) || options.find(function (option) { return option.getAttribute("aria-selected") === "true"; }) || options[0];
    options.forEach(function (option) { option.tabIndex = option === target ? 0 : -1; });
    if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: "nearest" }); }
  }

  function closeTimerPicker(kind, restoreFocus) {
    const id = timerPickerId(kind);
    $(id + "Menu").hidden = true;
    $(id).setAttribute("aria-expanded", "false");
    updateTimerPopupLayer();
    if (restoreFocus && !$(id).disabled) $(id).focus({ preventScroll: true });
  }

  function openTimerPicker(kind) {
    renderTimerPickers();
    const id = timerPickerId(kind);
    if ($(id).disabled) return;
    ["subject", "task"].forEach(function (other) { if (other !== kind) closeTimerPicker(other); });
    $(id + "Menu").hidden = false;
    $(id).setAttribute("aria-expanded", "true");
    document.querySelector(".home-timer-card").classList.add("has-open-menu");
    focusTimerOption(kind, $(id).value);
  }

  function bindTimerPickers() {
    ["subject", "task"].forEach(function (kind) {
      const id = timerPickerId(kind);
      $(id).addEventListener("click", function () { if ($(id + "Menu").hidden) openTimerPicker(kind); else closeTimerPicker(kind, true); });
      $(id).addEventListener("keydown", function (event) {
        if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); openTimerPicker(kind); }
      });
      $(id + "Options").addEventListener("click", function (event) {
        const option = event.target.closest("[data-timer-option]");
        if (!option) return;
        closeTimerPicker(kind, true);
        changeTimerOptions(kind, option.dataset.timerOption);
      });
      $(id + "Options").addEventListener("keydown", function (event) {
        const options = Array.from($(id + "Options").children);
        const index = options.indexOf(event.target.closest("[data-timer-option]"));
        const next = event.key === "ArrowDown" ? Math.min(index + 1, options.length - 1) : event.key === "ArrowUp" ? Math.max(0, index - 1) : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); focusTimerOption(kind, options[next].dataset.timerOption); }
      });
      $(id + "Picker").addEventListener("focusout", function () {
        requestAnimationFrame(function () { if (!$(id + "Picker").contains(document.activeElement)) closeTimerPicker(kind); });
      });
    });
    document.addEventListener("pointerdown", function (event) {
      if (!event.target.closest(".home-timer-picker")) { closeTimerPicker("subject"); closeTimerPicker("task"); }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      ["subject", "task"].forEach(function (kind) {
        if (!$(timerPickerId(kind) + "Menu").hidden) { event.preventDefault(); closeTimerPicker(kind, true); }
      });
    });
  }

  function tick() {
    try {
      if (ready) {
        settleTimer();
        renderTimer();
        renderReport();
        const previousDay = $("todayDate").dateTime;
        showDate();
        if (previousDay !== dateKey(new Date())) { renderSubjects(); renderWeek(); }
      }
    } catch (error) { storageFailure(error); renderTimer(); }
    // 강의의 setTimeout을 반복 호출하되, 남은 시간은 횟수가 아닌 종료 시각으로 계산합니다.
    tickId = window.setTimeout(tick, 1000);
  }

  function populateSubjects() {
    const subjects = MyStudy.getSubjects();
    const options = subjects.map(function (subject) {
      return '<option value="' + esc(subject.id) + '">' + esc(subject.name) + '</option>';
    }).join("");
    $("taskSubject").innerHTML = options;
    if (timer && !timer.running && timerElapsed() === 0 && !subjects.some(function (subject) { return subject.id === timer.subjectId; })) {
      timer = createTimer(subjects[0] ? subjects[0].id : "", "", timerMode(), timer.durationMinutes);
      saveTimer();
    }
  }

  function taskDeadline(task) {
    if (!task.dueDate) return "마감 미정";
    const today = dateKey(new Date());
    if (task.done) return shortDate(task.dueDate) + " 마감 · 완료";
    return shortDate(task.dueDate) + (task.dueDate === today ? " · 오늘 마감" : task.dueDate < today ? " · 마감 지남" : " 마감");
  }

  function renderSubjects() {
    const subjects = MyStudy.getSubjects();
    const tasks = MyStudy.getTasks();
    const hideDone = readJSON(KEYS.hideDone, false) === true;
    $("toggleDone").setAttribute("aria-pressed", String(!hideDone)); // 켜짐 = 완료한 할 일 보임
    const progress = MyStudy.progress(tasks);
    // 전체 할 일 진행: 글씨 + 막대
    $("taskSummary").innerHTML =
      '<span class="home-sum-text">완료 <b class="num">' + progress.done + '</b> / ' + progress.total + '개<small>남은 할 일 ' + progress.left + '개</small></span>' +
      '<span class="progress home-sum-bar" role="progressbar" aria-label="전체 할 일 완료율" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress.percent + '">' +
      '<span style="--value: ' + progress.percent / 100 + '"></span></span>';
    $("subjectList").innerHTML = subjects.length ? subjects.map(function (subject) {
      const all = tasks.filter(function (task) { return task.subjectId === subject.id; });
      const list = all.filter(function (task) { return !hideDone || !task.done; }).sort(function (a, b) {
        return Number(a.done) - Number(b.done) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
      });
      const left = all.filter(function (task) { return !task.done; }).length;
      return '<details class="home-subject" data-subject="' + esc(subject.id) + '"' + (openedSubjects.has(subject.id) ? ' open' : '') + '>' +
        '<summary><span class="home-folder" data-color="' + esc(subject.color) + '" aria-hidden="true"></span><span class="home-subject-name"><strong>' + esc(subject.name) + '</strong><small>남은 할 일 ' + left + '개 · 완료 ' + (all.length - left) + '/' + all.length + '</small></span></summary>' +
        '<ul class="home-task-list">' + (list.length ? list.map(function (task) {
          const id = "subject-task-" + task.id;
          return '<li class="home-task' + (task.done ? ' is-done' : '') + '"><span class="check"><input type="checkbox" id="' + esc(id) + '" data-task-id="' + esc(task.id) + '"' + (task.done ? ' checked' : '') + '><span class="box">' + MyUI.icon("check") + '</span></span>' +
            '<label class="home-task-copy" for="' + esc(id) + '"><span>' + esc(task.title) + '</span><small' + (!task.done && task.dueDate && task.dueDate < dateKey(new Date()) ? ' class="home-overdue"' : '') + '>' + esc(taskDeadline(task)) + '</small></label></li>';
        }).join("") : '<li class="home-task-empty">' + (hideDone && all.length ? '남은 할 일이 없어요. 잘했어요!' : '등록된 할 일이 없어요.') + '</li>') + '</ul></details>';
    }).join("") : '<div class="empty"><p>아직 등록한 과목이 없어요.</p><a href="9_Songstudy_subjects.html">첫 과목 추가하기</a></div>';
    applyColors($("subjectList"));
    $("subjectList").setAttribute("aria-busy", "false");
  }

  function studyDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds === 0) return "0분";
    if (seconds < 60) return seconds + "초";
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? minutes + "분" : Math.floor(minutes / 60) + "시간" + (minutes % 60 ? " " + (minutes % 60) + "분" : "");
  }

  function renderReport() {
    const today = dateKey(new Date());
    const records = sessions();
    const monthly = records.filter(function (record) { return record.date.slice(0, 7) === today.slice(0, 7); });
    const total = monthly.reduce(function (sum, record) { return sum + record.durationMs; }, 0);
    const todayTotal = records.filter(function (record) { return record.date === today; }).reduce(function (sum, record) { return sum + record.durationMs; }, 0);
    const thisWeek = MyStudy.getWeek(today);
    const completion = MyStudy.progress(MyStudy.getTasksInRange(thisWeek.startDate, thisWeek.endDate));
    $("todayStudy").textContent = studyDuration(todayTotal);
    $("monthStudy").textContent = studyDuration(total);
    $("weekCompletion").textContent = completion.percent + "%";
    $("weekCompletion").title = "이번 주 마감 할 일 " + completion.done + "/" + completion.total + "개 완료";
    $("reportMonth").textContent = new Date().getFullYear() + "년 " + (new Date().getMonth() + 1) + "월";
    const subjects = MyStudy.getSubjects();
    // 삭제된 과목에서 쌓은 공부 시간도 월간 합계와 그래프에 남깁니다.
    monthly.forEach(function (record) {
      if (!subjects.some(function (subject) { return subject.id === record.subjectId; })) {
        subjects.push({ id: record.subjectId, name: (record.subjectName || "이전 과목") + " (삭제된 과목)", color: record.color || "" });
      }
    });
    $("reportList").innerHTML = subjects.map(function (subject) {
      const duration = monthly.filter(function (record) { return record.subjectId === subject.id; }).reduce(function (sum, record) { return sum + record.durationMs; }, 0);
      const ratio = total ? duration / total : 0;
      return '<li class="home-report-row" data-color="' + esc(subject.color) + '"><div class="home-report-label"><span>' + esc(subject.name) + '</span><strong>' + studyDuration(duration) + '</strong></div>' +
        '<div class="home-report-bar" role="progressbar" aria-label="' + esc(subject.name) + ' 월간 집중 시간 비율" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(ratio * 100) + '" aria-valuetext="' + studyDuration(duration) + ', 전체의 ' + Math.round(ratio * 100) + '%"><span data-value="' + ratio + '"></span></div></li>';
    }).join("");
    applyColors($("reportList"));
    $("reportNote").textContent = total ? "막대는 이번 달 전체 집중 시간 중 각 과목의 비율이에요." : "";
    $("reportNote").hidden = !total;
  }

  function renderWeek() {
    const week = MyStudy.getWeek(dateKey(viewedDate));
    const subjects = MyStudy.getSubjects();
    const today = dateKey(new Date());
    $("weekRange").textContent = shortDate(week.startDate) + " – " + shortDate(week.endDate);
    $("weekRange").title = week.startDate + " ~ " + week.endDate;
    $("thisWeek").disabled = today >= week.startDate && today <= week.endDate;
    $("weekGrid").innerHTML = week.days.map(function (day, index) {
      const isToday = day.date === today;
      // 완료한 할 일은 날짜별 목록 아래에 모으고, 같은 상태끼리는 기존 순서를 유지합니다.
      const tasks = day.tasks.slice().sort(function (a, b) { return Number(a.done) - Number(b.done); });
      const exams = [];
      subjects.forEach(function (subject) {
        (subject.exams || []).forEach(function (exam) {
          if (exam.date === day.date) exams.push({ name: exam.name, subjectName: subject.name });
        });
      });
      return '<section class="home-day' + (isToday ? ' is-today' : '') + '" aria-label="' + esc(MyStudy.formatDate(day.date)) + '"><div class="home-day-head"><h3><time class="home-day-number num" datetime="' + day.date + '"' + (isToday ? ' aria-current="date"' : '') + '>' + localDate(day.date).getDate() + '</time><span class="home-day-name">' + ["월", "화", "수", "목", "금", "토", "일"][index] + '요일</span></h3>' + (isToday ? '<span>오늘</span>' : '') + '</div><div class="home-day-content"><ul>' + tasks.map(function (task) {
        const subject = MyStudy.getSubject(task.subjectId);
        const id = "week-task-" + task.id;
        return '<li class="home-week-task' + (task.done ? ' is-done' : '') + '" data-color="' + esc(subject ? subject.color : "") + '"><span class="check"><input type="checkbox" id="' + esc(id) + '" data-task-id="' + esc(task.id) + '"' + (task.done ? ' checked' : '') + '><span class="box">' + MyUI.icon("check") + '</span></span><label for="' + esc(id) + '"><span>' + esc(task.title) + '</span><small>' + esc(subject ? subject.name : "이전 과목") + '</small></label></li>';
      }).join("") + '</ul>' + exams.map(function (exam) {
        return '<div class="home-exam"><strong>시험 · ' + esc(exam.name) + '</strong><span>' + esc(exam.subjectName) + '</span></div>';
      }).join("") + '</div></section>';
    }).join("");
    applyColors($("weekGrid"));
    $("weekGrid").setAttribute("aria-busy", "false");
    const count = MyStudy.getUnscheduledTasks().filter(function (task) { return !task.done; }).length;
    $("unscheduledCount").textContent = count ? "마감 미정 " + count + "개 · 과목별 목록에서 확인" : "마감 미정인 할 일 없음";
  }

  function renderStudy() {
    // 다시 그릴 때 체크한 항목의 키보드 초점과 목록 스크롤을 유지합니다.
    const activeId = document.activeElement ? document.activeElement.id : "";
    const scroll = $("subjectList").scrollTop;
    renderSubjects();
    renderWeek();
    renderReport();
    $("subjectList").scrollTop = scroll;
    if (activeId && $(activeId)) $(activeId).focus({ preventScroll: true });
    else if (activeId.indexOf("subject-task-") === 0) {
      const firstSummary = $("subjectList").querySelector("details[open] summary");
      if (firstSummary) firstSummary.focus({ preventScroll: true });
    }
  }

  function changeTask(event) {
    const checkbox = event.target.closest("input[data-task-id]");
    if (!checkbox || !ready) return;
    try {
      const task = MyStudy.setTaskDone(checkbox.dataset.taskId, checkbox.checked);
      if (!task) { renderStudy(); return; }
      renderStudy();
      MyUI.toast(task.done ? "할 일을 완료했어요. 수고했어요!" : "할 일을 다시 진행 중으로 바꿨어요.");
    } catch (error) {
      checkbox.checked = !checkbox.checked;
      MyUI.toast("완료 상태를 저장하지 못했어요. 다시 시도해 주세요.");
      console.error(error);
    }
  }

  function openTaskModal() {
    $("taskForm").reset();
    $("taskSubject").value = timer.subjectId;
    $("taskDue").value = dateKey(new Date());
    $("taskError").textContent = "";
    $("taskModal").showModal();
    $("taskTitle").focus();
  }

  function saveTask(event) {
    event.preventDefault();
    const title = $("taskTitle").value.trim();
    const subjectId = $("taskSubject").value;
    if (!title) { $("taskError").textContent = "할 일을 입력해 주세요."; $("taskTitle").focus(); return; }
    if (!MyStudy.getSubject(subjectId)) { $("taskError").textContent = "과목을 다시 선택해 주세요."; return; }
    try {
      const tasks = MyStudy.getTasks();
      tasks.push({ id: MyStudy.uid("task-"), subjectId: subjectId, title: title, dueDate: $("taskDue").value, category: "assignment", done: false });
      MyStudy.saveTasks(tasks);
      openedSubjects.add(subjectId);
      renderStudy();
      $("taskModal").close();
      MyUI.toast("새로운 할 일을 저장했어요.");
    } catch (error) { $("taskError").textContent = "저장하지 못했어요. 브라우저의 저장 공간을 확인해 주세요."; console.error(error); }
  }

  function loadData() {
    $("retryLoad").disabled = true;
    // 공통 모듈이 상대경로의 JSON을 fetch하고, 저장된 사용자 데이터가 있으면 보존합니다.
    MyStudy.init().then(function () {
      ready = true;
      $("loadError").hidden = true;
      const stored = readJSON(KEYS.timer, null);
      const subjects = MyStudy.getSubjects();
      timer = validTimer(stored) ? stored : createTimer(subjects[0] ? subjects[0].id : "");
      adoptTimer();
      settleTimer();
      populateSubjects();
      renderTimer();
      renderStudy();
      if (tickId === null) tick();
    }).catch(function (error) {
      console.error("초기 데이터 불러오기 실패:", error);
      ready = false;
      $("loadErrorText").textContent = location.protocol === "file:" ? "공통 데이터를 읽으려면 프로젝트 폴더를 Live Server로 열어 주세요." : "학습 데이터를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
      $("loadError").hidden = false;
      $("subjectList").setAttribute("aria-busy", "false");
      $("subjectList").innerHTML = '<p class="empty">위의 다시 불러오기 버튼을 눌러 주세요.</p>';
    }).finally(function () { $("retryLoad").disabled = false; });
  }

  function bindEvents() {
    $("timerStart").addEventListener("click", toggleTimer);
    $("timerFinish").addEventListener("click", finishTimer);
    bindTimerPickers();
    bindTimerSettings();
    $("retryLoad").addEventListener("click", loadData);
    $("subjectList").addEventListener("change", changeTask);
    $("weekGrid").addEventListener("change", changeTask);
    $("subjectList").addEventListener("toggle", function (event) {
      const detail = event.target;
      if (!detail.matches("details[data-subject]") || !detail.isConnected) return;
      if (detail.open) openedSubjects.add(detail.dataset.subject);
      else openedSubjects.delete(detail.dataset.subject);
    }, true);
    $("toggleDone").addEventListener("click", function () {
      try { writeJSON(KEYS.hideDone, readJSON(KEYS.hideDone, false) !== true); renderStudy(); }
      catch (error) { MyUI.toast("표시 설정을 저장하지 못했어요."); }
    });
    $("prevWeek").addEventListener("click", function () { if (ready) { viewedDate.setDate(viewedDate.getDate() - 7); renderWeek(); } });
    $("nextWeek").addEventListener("click", function () { if (ready) { viewedDate.setDate(viewedDate.getDate() + 7); renderWeek(); } });
    $("thisWeek").addEventListener("click", function () { if (ready) { viewedDate = new Date(); renderWeek(); } });
    $("taskForm").addEventListener("submit", saveTask);
    ["closeTaskModal", "cancelTask"].forEach(function (id) { $(id).addEventListener("click", function () { $("taskModal").close(); }); });
    $("taskModal").addEventListener("click", function (event) { if (event.target === $("taskModal")) $("taskModal").close(); });
    $("taskTitle").addEventListener("input", function () { $("taskError").textContent = ""; });
    document.addEventListener("visibilitychange", function () {
      if (ready) { try { settleTimer(); renderTimer(); renderReport(); } catch (error) { storageFailure(error); } }
    });
    window.addEventListener("pagehide", function () { if (ready) { try { settleTimer(); } catch (error) { console.error(error); } } });
    window.addEventListener("storage", function (event) {
      if (!ready) return;
      try {
        if (event.key === KEYS.timer || event.key === null) {
          const shared = readJSON(KEYS.timer, null);
          if (validTimer(shared)) timer = shared;
          renderTimer();
        }
        if (event.key === MyStudy.KEYS.subjects) populateSubjects();
        if ([MyStudy.KEYS.subjects, MyStudy.KEYS.tasks, KEYS.sessions, KEYS.hideDone, null].includes(event.key)) renderStudy();
      } catch (error) { storageFailure(error); }
    });
  }

  connectNavigation();
  showDate();
  bindEvents();
  loadData();
})();
