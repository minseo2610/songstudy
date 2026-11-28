(() => {
  const STATE_KEY = "myStudy.timerState";
  const SESSION_KEY = "myStudy.studySessions";
  const esc = MyUI.escapeHTML;
  const $ = (id) => document.getElementById(id);
  const els = {
    app: $("timerApp"), error: $("loadError"), loading: $("loading"), subject: $("studySubject"), task: $("studyTask"),
    focusTitle: $("focusTitle"), display: $("timerDisplay"),
    orbit: $("timerOrbit"), settings: $("focusSettings"), custom: $("customDuration"),
    start: $("startPauseBtn"), finish: $("finishBtn"), reset: $("resetTimerBtn"), announcement: $("timerAnnouncement"),
    date: $("todayDate"), todayDuration: $("todayDuration"), todayCount: $("todayCount"), todaySubjects: $("todaySubjects"),
    soundToggle: $("soundToggle"), soundMenu: $("soundMenu"),
    sessionCount: $("sessionCount"), sessions: $("sessionList"), empty: $("sessionEmpty"), resetDialog: $("resetDialog"),
  };
  let state = TimerModel.create();
  let ready = false;
  let lastDay = "";
  const soundFiles = {
    fire: "FIREBurn_Fireplace 3 (ID 2855)_BigSoundBank.com.mp3",
    rain: "RAINConc_Summer rain on terrace (ID 1019)_BigSoundBank.com.mp3",
    cafe: "AMBRest_Coffee shop at the capucins (ID 2561)_BigSoundBank.com.mp3",
    "white-noise": "MACHFan_Ventilation 5 (ID 3598)_BigSoundBank.com.mp3",
  };
  const soundAudio = new Audio();
  soundAudio.loop = true;
  let selectedSound = "";

  function setSound(key) {
    if (!soundFiles[key]) return;
    if (selectedSound === key && !soundAudio.paused) {
      soundAudio.pause();
      els.soundToggle.classList.remove("is-playing");
      return;
    }
    selectedSound = key;
    soundAudio.src = new URL(`../sounds/${soundFiles[key]}`, document.baseURI).href;
    soundAudio.currentTime = 0;
    soundAudio.play().catch(() => MyUI.toast("사운드를 재생하려면 선택 버튼을 다시 눌러 주세요."));
    els.soundToggle.classList.add("is-playing");
    document.querySelectorAll("[data-sound]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.sound === key));
    try { localStorage.setItem("myStudy.timerSound", key); } catch {}
  }

  els.soundToggle.addEventListener("click", () => {
    const open = els.soundMenu.hidden;
    els.soundMenu.hidden = !open;
    els.soundToggle.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll("[data-sound]").forEach((button) => button.addEventListener("click", () => {
    setSound(button.dataset.sound);
    els.soundMenu.hidden = true;
    els.soundToggle.setAttribute("aria-expanded", "false");
  }));
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".sound-control")) {
      els.soundMenu.hidden = true;
      els.soundToggle.setAttribute("aria-expanded", "false");
    }
  });

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function sessions() {
    const value = readJSON(SESSION_KEY, []);
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string" && Number.isFinite(item.durationSeconds) && item.durationSeconds > 0 && !Number.isNaN(Date.parse(item.endedAt))) : [];
  }

  function dayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function saveState(next) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(next)); state = next; return true; }
    catch { MyUI.toast("타이머 상태를 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요."); return false; }
  }

  function subjectFor(record) {
    return MyStudy.getSubject(record.subjectId) || { name: record.subjectName || "삭제된 과목", color: MyStudy.COLORS[0].hex };
  }

  function paintColors(container) {
    container.querySelectorAll("[data-subject-color]").forEach((element) => {
      if (/^#[0-9a-f]{6}$/i.test(element.dataset.subjectColor)) element.style.setProperty("--subject-color", element.dataset.subjectColor);
    });
  }

  function durationLabel(seconds) {
    if (!seconds) return "0분";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    if (!hours && !minutes) return `${Math.floor(seconds)}초`;
    return `${hours ? `${hours}시간 ` : ""}${minutes}분`;
  }

  function totalLabel(seconds) {
    const whole = Math.max(0, Math.floor(seconds));
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(Math.floor(whole / 3600))}시간 ${pad(Math.floor(whole / 60) % 60)}분 ${pad(whole % 60)}초`;
  }

  let timeline = null;

  function ensureTimeline() {
    if (timeline) return timeline;
    const section = document.createElement("section");
    section.className = "card timeline-section";
    section.setAttribute("aria-labelledby", "timelineTitle");
    section.innerHTML = '<div class="session-section-head"><h2 class="card-title" id="timelineTitle"></h2></div><div class="timeline-table-wrap"><table class="study-timetable" aria-label="오늘 00시부터 24시까지 공부 시간"><thead><tr><th scope="col">시간</th><th scope="col">00</th><th scope="col">10</th><th scope="col">20</th><th scope="col">30</th><th scope="col">40</th><th scope="col">50</th></tr></thead><tbody class="study-timeline"></tbody></table></div><div class="timeline-legend"><span class="timeline-legend-item"><span class="timeline-legend-empty"></span><span>공부하지 않은 시간</span></span><span class="timeline-legend-item"><span class="timeline-legend-filled"></span><span>공부한 시간</span></span></div>';
    els.sessions.closest(".session-section").before(section);
    timeline = section.querySelector(".study-timeline");
    return timeline;
  }

  function renderTimeline(records) {
    const container = ensureTimeline();
    $("timelineTitle").textContent = `${Number(lastDay.slice(5, 7))}\uC6D4 ${Number(lastDay.slice(8, 10))}\uC77C \uD0C0\uC784\uD14C\uC774\uBE14`;
    const dayStart = new Date(`${lastDay}T00:00:00`).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const intervals = records.map((record) => ({
      record,
      start: Math.max(Date.parse(record.startedAt), dayStart),
      end: Math.min(Date.parse(record.endedAt), dayEnd),
    })).filter((item) => item.end > item.start);
    const rows = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const slots = [];
      for (let part = 0; part < 6; part += 1) {
        const slotStart = dayStart + (hour * 60 + part * 10) * 60 * 1000;
        const slotEnd = slotStart + 10 * 60 * 1000;
        const match = intervals.map((item) => ({ ...item, overlap: Math.max(0, Math.min(item.end, slotEnd) - Math.max(item.start, slotStart)) }))
          .filter((item) => item.overlap > 0).sort((a, b) => b.overlap - a.overlap)[0];
        const subject = match ? subjectFor(match.record) : null;
        const minute = part * 10;
        const nextHour = hour + (part === 5 ? 1 : 0);
        const nextMinute = (part + 1) % 6 * 10;
        const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}~${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
        slots.push(`<span class="timeline-slot ${subject ? "is-study" : ""}" role="gridcell" aria-label="${label}${subject ? ` ${esc(subject.name)} 공부` : " 공부하지 않음"}" title="${label}${subject ? ` · ${esc(subject.name)}` : ""}"></span>`);
      }
      rows.push(`<tr class="timeline-hour"><th scope="row">${String(hour).padStart(2, "0")}:00</th>${slots.join("")}</tr>`);
    }
    container.innerHTML = rows.join("").replaceAll('<span class="timeline-slot', '<td class="timeline-slot').replaceAll("</span>", "</td>");
    paintColors(container);
  }

  function renderRecords() {
    const now = new Date();
    lastDay = dayKey(now);
    const records = sessions().filter((record) => dayKey(new Date(record.endedAt)) === lastDay)
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    const total = records.reduce((sum, record) => sum + record.durationSeconds, 0);
    els.date.textContent = `${now.getMonth() + 1}월 ${now.getDate()}일`;
    els.todayDuration.textContent = totalLabel(total);
    els.todayCount.textContent = records.length ? `${records.length}번의 집중을 차곡차곡 모았어요.` : "아직 기록한 공부 시간이 없어요.";
    els.sessionCount.textContent = `${records.length}회`;
    els.empty.hidden = records.length > 0;
    els.sessions.innerHTML = records.map((record) => {
      const subject = subjectFor(record);
      return `<li class="session-item" data-subject-color="${esc(subject.color)}"><div class="session-head"><span class="subject-dot" aria-hidden="true"></span><span>${esc(subject.name)}</span><strong class="num">${durationLabel(record.durationSeconds)}</strong></div>${record.taskTitle ? `<p class="session-task"><span class="session-task-mark" aria-hidden="true">ㄴ</span><span>${esc(record.taskTitle)}</span></p>` : ""}</li>`;
    }).join("");
    const totals = new Map();
    for (const record of records) {
      const prev = totals.get(record.subjectId) || { ...record, durationSeconds: 0 };
      prev.durationSeconds += record.durationSeconds;
      totals.set(record.subjectId, prev);
    }
    els.todaySubjects.innerHTML = Array.from(totals.values()).sort((a, b) => b.durationSeconds - a.durationSeconds).map((record) => {
      const subject = subjectFor(record);
      return `<div class="today-subject-row" data-subject-color="${esc(subject.color)}"><span class="subject-dot" aria-hidden="true"></span><span>${esc(subject.name)}</span><span class="num">${durationLabel(record.durationSeconds)}</span></div>`;
    }).join("");
    renderTimeline(records);
    paintColors(els.app);
  }

  function renderControls() {
    const subjects = MyStudy.getSubjects();
    const started = state.startedAt !== null;
    const locked = state.runningSince !== null;
    const lockHint = locked ? "일시정지하면 바꿀 수 있어요" : "";
    if (!started && !subjects.some((subject) => subject.id === state.subjectId)) {
      const first = subjects[0];
      state = { ...state, subjectId: first?.id || "", subjectName: first?.name || "", taskId: "", taskTitle: "" };
    }
    const displaySubjects = subjects.some((subject) => subject.id === state.subjectId) || !state.subjectId ? subjects : [...subjects, { id: state.subjectId, name: state.subjectName || "삭제된 과목" }];
    els.subject.innerHTML = displaySubjects.length ? displaySubjects.map((subject) => `<option value="${esc(subject.id)}">${esc(subject.name)}</option>`).join("") : '<option value="">등록된 과목이 없어요</option>';
    els.subject.value = state.subjectId;
    const tasks = MyStudy.getTasksOf(state.subjectId);
    const selected = tasks.find((task) => task.id === state.taskId);
    if (!started && !selected) state = { ...state, taskId: "", taskTitle: "" };
    els.task.innerHTML = '<option value="">과목만 기록하기</option>' + tasks.map((task) => `<option value="${esc(task.id)}">${esc(task.title)}${task.done ? " (완료)" : ""}</option>`).join("") + (started && state.taskId && !selected ? `<option value="${esc(state.taskId)}">${esc(state.taskTitle || "삭제된 할 일")}</option>` : "");
    els.task.value = state.taskId;
    els.subject.disabled = locked || !subjects.length;
    els.task.disabled = locked || !subjects.length;
    els.start.disabled = !state.subjectId;
    const settingControls = [els.subject, els.task, els.custom, ...document.querySelectorAll("[data-mode], [data-duration]")];
    settingControls.forEach((control) => { if (lockHint) control.title = lockHint; else control.removeAttribute("title"); });
    document.querySelectorAll("[data-mode]").forEach((button) => { button.disabled = locked; button.setAttribute("aria-pressed", button.dataset.mode === state.mode); });
    document.querySelectorAll("[data-duration]").forEach((button) => { button.disabled = locked; button.setAttribute("aria-pressed", Number(button.dataset.duration) * 60 === state.durationSeconds); });
    els.custom.disabled = locked;
    els.custom.value = state.durationSeconds / 60;
    els.settings.hidden = state.mode !== "focus";
    els.focusTitle.textContent = state.subjectId ? subjectFor(state).name : "과목 관리에서 과목을 먼저 추가해 주세요.";
    renderClock();
  }

  function renderClock() {
    const now = Date.now();
    const elapsed = TimerModel.elapsed(state, now);
    const running = state.runningSince !== null;
    const started = state.startedAt !== null;
    const remaining = Math.max(0, state.durationSeconds - elapsed / 1000);
    const display = TimerModel.format(state.mode === "focus" ? Math.ceil(remaining) : Math.floor(elapsed / 1000), state.mode !== "focus");
    if (els.display.textContent !== display) els.display.textContent = display;
    els.display.setAttribute("aria-label", `${state.mode === "focus" ? "남은" : "학습"} 시간 ${display}`);
    document.title = started ? `${display} · ${running ? "집중 중" : "일시정지"} | Songtudy` : "타이머 | Songtudy";
    els.orbit.style.setProperty("--value", state.mode === "focus" ? elapsed / (state.durationSeconds * 1000) : elapsed > 0 ? (elapsed % 3600000) / 3600000 : 0);
    const label = running ? "일시정지" : started ? "다시 시작" : "시작하기";
    els.start.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${running ? '<path d="M8 5v14M16 5v14"/>' : '<path d="m9 5 10 7-10 7z"/>'}</svg><span>${label}</span>`;
    els.finish.disabled = elapsed < 1000;
    els.reset.disabled = !started;
  }

  function recordSession(automatic = false) {
    const record = TimerModel.toSession(state);
    if (!record) return false;
    try {
      const list = sessions();
      if (!list.some((item) => item.id === record.id)) localStorage.setItem(SESSION_KEY, JSON.stringify([...list, record]));
      const next = TimerModel.create(state);
      localStorage.setItem(STATE_KEY, JSON.stringify(next));
      state = next;
      renderControls(); renderRecords();
      const message = automatic ? "집중 시간을 다 채웠어요. 학습 기록을 저장했어요." : `${durationLabel(record.durationSeconds)}의 학습 기록을 저장했어요.`;
      els.announcement.textContent = message;
      MyUI.toast(message);
      return true;
    } catch {
      state = TimerModel.pause(state);
      renderControls();
      els.announcement.textContent = "기록을 저장하지 못했어요. 기록하기를 눌러 다시 시도해 주세요.";
      MyUI.toast("기록을 저장하지 못했어요. ‘기록하기’로 다시 시도해 주세요.");
      return false;
    }
  }

  function changeSettings(patch) {
    if (state.runningSince !== null) { renderControls(); return; }
    if (Object.entries(patch).every(([key, value]) => state[key] === value)) { renderControls(); return; }
    if (state.startedAt !== null) {
      if (TimerModel.elapsed(state) >= 1000) { if (!recordSession()) return; }
      else state = TimerModel.create(state);
    }
    saveState(TimerModel.create({ ...state, ...patch }));
    renderControls();
  }

  els.subject.addEventListener("change", () => {
    const subject = MyStudy.getSubject(els.subject.value);
    changeSettings({ subjectId: subject?.id || "", subjectName: subject?.name || "", taskId: "", taskTitle: "" });
  });
  els.task.addEventListener("change", () => {
    const task = MyStudy.getTasksOf(state.subjectId).find((item) => item.id === els.task.value);
    changeSettings({ taskId: task?.id || "", taskTitle: task?.title || "" });
  });
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => changeSettings({ mode: button.dataset.mode })));
  function setDuration(minutes) {
    if (state.runningSince !== null) return;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) { MyUI.toast("집중 시간은 1~180분으로 설정해 주세요."); els.custom.value = state.durationSeconds / 60; return; }
    changeSettings({ durationSeconds: minutes * 60 });
  }
  document.querySelectorAll("[data-duration]").forEach((button) => button.addEventListener("click", () => setDuration(Number(button.dataset.duration))));
  els.custom.addEventListener("change", () => setDuration(Number(els.custom.value)));
  els.start.addEventListener("click", () => {
    const running = state.runningSince !== null;
    let next;
    if (running) next = TimerModel.pause(state);
    else {
      const subject = MyStudy.getSubject(state.subjectId);
      if (!subject && state.startedAt === null) { renderControls(); return; }
      next = TimerModel.start({ ...state, sessionId: state.sessionId || MyStudy.uid("session"), subjectName: state.subjectName || subject?.name || "" });
    }
    if (saveState(next)) {
      els.announcement.textContent = running ? "타이머를 일시정지했어요." : "학습 시간을 측정하고 있어요.";
      renderControls();
    }
  });
  els.finish.addEventListener("click", () => recordSession());
  els.reset.addEventListener("click", () => els.resetDialog.showModal());
  $("cancelResetBtn").addEventListener("click", () => els.resetDialog.close());
  $("confirmResetBtn").addEventListener("click", () => {
    if (saveState(TimerModel.create(state))) { els.resetDialog.close(); renderControls(); els.announcement.textContent = "측정 시간을 초기화했어요."; }
  });
  window.addEventListener("storage", (event) => {
    if (!ready) return;
    if (event.key === STATE_KEY || event.key === null) { state = TimerModel.restore(readJSON(STATE_KEY, null)) || TimerModel.create(); renderControls(); }
    if ([SESSION_KEY, MyStudy.KEYS.subjects, MyStudy.KEYS.tasks, null].includes(event.key)) { renderRecords(); renderControls(); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ready) { renderClock(); renderRecords(); } });
  setInterval(() => {
    if (!ready) return;
    if (state.runningSince !== null && TimerModel.isComplete(state)) recordSession(true);
    else renderClock();
    if (lastDay !== dayKey(new Date())) renderRecords();
  }, 250);

  async function init() {
    els.error.hidden = true; els.loading.hidden = false;
    try {
      await MyStudy.init();
      state = TimerModel.restore(readJSON(STATE_KEY, null)) || TimerModel.create();
      if (state.sessionId && sessions().some((record) => record.id === state.sessionId)) state = TimerModel.create(state);
      ready = true;
      renderControls(); renderRecords();
      els.app.hidden = false;
    } catch (error) { console.error(error); els.error.hidden = false; }
    finally { els.loading.hidden = true; }
  }
  $("retryBtn").addEventListener("click", init);
  init();
})();
