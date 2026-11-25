/* Songtudy · B 담당 주간 플래너. 과목/할 일은 공통 MyStudy 모듈을 사용합니다. */
(() => {
  const PREF_KEY = "myStudy.planner.preferences";
  const NOTE_KEY = "myStudy.planner.notes";
  const esc = MyUI.escapeHTML;
  const $ = (id) => document.getElementById(id);
  const els = {
    app: $("weeklyApp"), loading: $("loading"), error: $("loadError"),
    title: $("weekTitle"), month: $("weekMonth"), grid: $("weekGrid"),
    calendar: $("calendarGrid"), calendarTitle: $("calendarTitle"), filters: $("subjectFilters"),
    progress: $("weekProgress"), progressText: $("progressText"),
    undated: $("undatedList"), undatedCount: $("undatedCount"),
    dialog: $("taskDialog"), form: $("taskForm"), formTitle: $("taskDialogTitle"),
    subject: $("taskSubject"), taskTitle: $("taskTitleInput"), due: $("taskDueDate"),
    noDue: $("noDueDate"), formError: $("taskError"), customDue: $("customDueDate"), datePicker: $("dueDateCalendar"), datePickerGrid: $("datePickerGrid"), datePickerTitle: $("datePickerTitle"), datePickerToggle: document.querySelector(".date-picker-toggle"),
  };
  let editingId = null;
  let opener = null;
  let ready = false;
  let selectedDay = null;
  let selectedTaskId = null;
  let hoveredTaskId = null;
  let datePickerMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function toDate(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function validDate(key) {
    try { MyStudy.getWeek(key); return typeof key === "string"; }
    catch { return false; }
  }

  function renderDatePicker() {
    const year = datePickerMonth.getFullYear();
    const month = datePickerMonth.getMonth();
    els.datePickerTitle.textContent = `${year}년 ${month + 1}월`;
    const start = new Date(year, month, 1);
    start.setDate(start.getDate() - start.getDay());
    const today = dateKey(new Date());
    const selected = els.due.value;
    els.datePickerGrid.innerHTML = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      const key = dateKey(date);
      const classes = ["date-picker-day", date.getMonth() !== month ? "is-other-month" : "", key === today ? "is-today" : "", key === selected ? "is-selected" : ""].join(" ");
      return `<button class="${classes}" type="button" data-date-picker-value="${key}">${date.getDate()}</button>`;
    }).join("");
  }

  function closeDatePicker() {
    els.datePicker.hidden = true;
    els.datePickerToggle.setAttribute("aria-expanded", "false");
  }

  function openDatePicker() {
    const base = validDate(els.due.value) ? toDate(els.due.value) : new Date();
    datePickerMonth = new Date(base.getFullYear(), base.getMonth(), 1);
    renderDatePicker();
    els.datePicker.hidden = false;
    els.datePickerToggle.setAttribute("aria-expanded", "true");
  }

  const saved = readJSON(PREF_KEY, {});
  const requested = new URLSearchParams(location.search).get("date");
  const initialDate = validDate(requested) ? requested : validDate(saved?.date) ? saved.date : dateKey(new Date());
  const state = {
    date: initialDate,
    month: new Date(toDate(initialDate).getFullYear(), toDate(initialDate).getMonth(), 1),
    subjectId: typeof saved?.subjectId === "string" ? saved.subjectId : "all",
  };

  function savePreferences() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ date: state.date, subjectId: state.subjectId })); }
    catch { MyUI.toast("보기 설정을 저장하지 못했어요."); }
  }

  function selectDate(key) {
    if (!validDate(key)) return;
    state.date = key;
    const date = toDate(key);
    state.month = new Date(date.getFullYear(), date.getMonth(), 1);
    selectedDay = null;
    selectedTaskId = null;
    savePreferences();
    render();
  }

  function paintSubjectColors(container) {
    container.querySelectorAll("[data-subject-color]").forEach((element) => {
      const color = element.dataset.subjectColor;
      if (/^#[0-9a-f]{6}$/i.test(color)) element.style.setProperty("--subject-color", color);
    });
  }

  function getSubject(task) {
    return MyStudy.getSubject(task.subjectId) || { name: "삭제된 과목", color: MyStudy.COLORS[0].hex };
  }

  const matchesSubject = (task) => state.subjectId === "all" || task.subjectId === state.subjectId;
  function taskHTML(task) {
    const subject = getSubject(task);
    return `<li class="planner-task ${task.done ? "is-done" : ""}" data-task-card="${esc(task.id)}" data-subject-color="${esc(subject.color)}">
      <label class="check"><input type="checkbox" data-complete-task="${esc(task.id)}" aria-label="${esc(task.title)} 완료" ${task.done ? "checked" : ""}><span class="box" aria-hidden="true">${MyUI.icon("check")}</span></label>
      <button class="task-open" type="button" data-select-task="${esc(task.id)}" aria-label="${esc(subject.name)} ${esc(task.title)} 선택" aria-expanded="false" aria-controls="task-actions-${esc(task.id)}"><span class="planner-task-subject">${esc(subject.name)}</span><span class="planner-task-title">${esc(task.title)}</span></button>
      <div class="planner-task-actions" id="task-actions-${esc(task.id)}" hidden>
        <button class="btn btn-sm" type="button" data-edit-task="${esc(task.id)}" aria-label="${esc(task.title)} 수정">${MyUI.icon("edit")}수정</button>
        <button class="btn btn-sm btn-danger" type="button" data-delete-task="${esc(task.id)}" aria-label="${esc(task.title)} 삭제">${MyUI.icon("trash")}삭제</button>
      </div>
    </li>`;
  }

  // 선택 상태만 갱신해 메모·키보드 초점이 불필요하게 다시 그려지지 않게 합니다.
  function syncSelection(focusedElement = document.activeElement) {
    els.grid.querySelectorAll("[data-planner-date]").forEach((day) => {
      const selected = day.dataset.plannerDate === selectedDay;
      day.classList.toggle("is-selected", selected);
      day.querySelector("[data-select-day]").setAttribute("aria-expanded", selected);
      day.querySelector(".day-actions").hidden = !selected;
    });
    els.app.querySelectorAll("[data-task-card]").forEach((card) => {
      const selected = card.dataset.taskCard === selectedTaskId;
      const showActions = selected || card.dataset.taskCard === hoveredTaskId || card.contains(focusedElement);
      card.classList.toggle("is-selected", selected);
      card.querySelector("[data-select-task]").setAttribute("aria-expanded", showActions);
      card.querySelector(".planner-task-actions").hidden = !showActions;
    });
  }

  function selectDay(date) {
    selectedDay = selectedDay === date ? null : date;
    selectedTaskId = null;
    syncSelection();
  }

  function selectTask(id) {
    const task = MyStudy.getTasks().find((item) => item.id === id);
    if (!task) { render(); return; }
    selectedTaskId = selectedTaskId === id ? null : id;
    selectedDay = task.dueDate || null;
    syncSelection();
  }

  function focusPlanner() {
    if (opener?.isConnected && !opener.closest("[hidden]")) { opener.focus(); return; }
    const taskButton = Array.from(els.app.querySelectorAll("[data-select-task]")).find((button) => button.dataset.selectTask === selectedTaskId);
    const openerTask = opener?.closest("[data-task-card]")?.querySelector("[data-select-task]");
    const dayButton = Array.from(els.grid.querySelectorAll("[data-select-day]")).find((button) => button.dataset.selectDay === selectedDay);
    (taskButton || openerTask || dayButton || els.title).focus();
  }

  function deleteTask(id) {
    const tasks = MyStudy.getTasks();
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) { render(); return; }
    const removed = tasks[index];
    try { MyStudy.saveTasks(tasks.filter((task) => task.id !== id)); }
    catch { MyUI.toast("할 일을 삭제하지 못했어요."); return; }
    selectedTaskId = null;
    opener = null;
    render();
    focusPlanner();
    MyUI.toast("할 일을 삭제했어요.", {
      actionLabel: "되돌리기",
      onAction: () => {
        if (!MyStudy.getSubject(removed.subjectId)) { MyUI.toast("과목이 삭제되어 할 일을 복원할 수 없어요."); return; }
        const current = MyStudy.getTasks();
        if (current.some((task) => task.id === removed.id)) return;
        current.splice(Math.min(index, current.length), 0, removed);
        try { MyStudy.saveTasks(current); render(); }
        catch { MyUI.toast("할 일을 복원하지 못했어요."); }
      },
    });
  }

  function renderCalendar(week) {
    const year = state.month.getFullYear();
    const month = state.month.getMonth();
    els.calendarTitle.textContent = `${year}. ${String(month + 1).padStart(2, "0")}`;
    const start = new Date(year, month, 1);
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const today = dateKey(new Date());
    els.calendar.innerHTML = Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      const key = dateKey(date);
      const classes = ["calendar-date", key >= week.startDate && key <= week.endDate ? "is-week" : "", key === state.date ? "is-selected" : "", date.getMonth() !== month ? "is-other-month" : ""].join(" ");
      return `<button class="${classes}" type="button" data-select-date="${key}" aria-label="${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일" aria-pressed="${key === state.date}" ${key === today ? 'aria-current="date"' : ""}>${date.getDate()}</button>`;
    }).join("");
  }

  function render() {
    if (!ready) return;
    hoveredTaskId = null;
    const subjects = MyStudy.getSubjects();
    if (state.subjectId !== "all" && !subjects.some((subject) => subject.id === state.subjectId)) state.subjectId = "all";
    const week = MyStudy.getWeek(state.date);
    const allWeekTasks = week.days.flatMap((day) => day.tasks);
    const filteredTasks = allWeekTasks.filter(matchesSubject);
    const progress = MyStudy.progress(filteredTasks);
    const start = toDate(week.startDate);
    const end = toDate(week.endDate);
    els.month.textContent = `${start.getFullYear()}년 ${start.getMonth() + 1}월`;
    els.title.textContent = `${start.getMonth() + 1}.${String(start.getDate()).padStart(2, "0")} – ${end.getMonth() + 1}.${String(end.getDate()).padStart(2, "0")}`;
    els.progress.style.setProperty("--value", progress.percent / 100);
    els.progress.setAttribute("aria-valuenow", progress.percent);
    els.progress.setAttribute("aria-valuetext", `${progress.done}개 / ${progress.total}개 완료`);
    els.progressText.textContent = `(${progress.done}/${progress.total})`;
    const today = dateKey(new Date());
    const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
    const notes = readJSON(NOTE_KEY, {});
    const note = typeof notes?.[week.startDate] === "string" ? notes[week.startDate] : "";
    els.grid.innerHTML = week.days.map((day, i) => {
      const tasks = day.tasks.filter(matchesSubject);
      return `<section class="planner-day ${day.date === today ? "is-today" : ""} ${i > 4 ? "is-weekend" : ""}" data-planner-date="${day.date}" aria-label="${MyStudy.formatDate(day.date)}">
        <header class="day-heading"><h3><button class="day-select" type="button" data-select-day="${day.date}" aria-label="${MyStudy.formatDate(day.date)} 선택" aria-expanded="false" aria-controls="day-actions-${day.date}"><span class="day-number num">${toDate(day.date).getDate()}</span><span class="day-name">${weekdays[i]}요일</span></button></h3><div class="day-heading-actions">${day.date === today ? '<span class="day-today">오늘</span>' : ""}<button class="icon-btn day-quick-add" type="button" data-add-date="${day.date}" aria-label="${MyStudy.formatDate(day.date)} 할 일 추가" title="할 일 추가">${MyUI.icon("plus")}</button></div></header>
        <ul class="day-list">${tasks.length ? tasks.map(taskHTML).join("") : '<li class="day-empty"><span>마감 일정이 없어요.</span></li>'}</ul>
        <div class="day-actions" id="day-actions-${day.date}" hidden><button class="day-add" type="button" data-add-date="${day.date}" aria-label="${MyStudy.formatDate(day.date)} 할 일 추가">${MyUI.icon("plus")}할 일 추가</button></div>
      </section>`;
    }).join("") + `<section class="week-note" aria-labelledby="weekNoteTitle"><h3 id="weekNoteTitle">${MyUI.icon("pen")}이번 주 메모</h3><textarea id="weekNote" maxlength="500" aria-label="이번 주 메모" placeholder="이번 주에 기억하고 싶은 것들을 적어 보세요.">${esc(note)}</textarea></section>`;
    const filters = [{ id: "all", name: "전체 과목" }, ...subjects];
    els.filters.innerHTML = filters.map((subject) => `<button class="subject-filter" type="button" data-filter-subject="${esc(subject.id)}" aria-pressed="${subject.id === state.subjectId}" ${subject.color ? `data-subject-color="${esc(subject.color)}"` : ""}><span class="${subject.id === "all" ? "all-subjects" : "subject-dot"}" aria-hidden="true"></span><span>${esc(subject.name)}</span><span class="filter-count num">${allWeekTasks.filter((task) => subject.id === "all" || task.subjectId === subject.id).length}</span></button>`).join("");
    const undated = MyStudy.getUnscheduledTasks().filter(matchesSubject);
    els.undatedCount.textContent = undated.length;
    els.undated.innerHTML = undated.length ? undated.map(taskHTML).join("") : '<li class="undated-empty">마감 미정인 할 일이 없어요.</li>';
    renderCalendar(week);
    paintSubjectColors(els.app);
    syncSelection();
  }

  function openTaskDialog({ taskId = null, date = state.date, target = null } = {}) {
    const subjects = MyStudy.getSubjects();
    if (!subjects.length) { MyUI.toast("과목 관리에서 과목을 먼저 추가해 주세요."); return; }
    const task = taskId ? MyStudy.getTasks().find((item) => item.id === taskId) : null;
    if (taskId && !task) { render(); return; }
    editingId = task?.id || null;
    opener = target;
    els.form.reset();
    els.formError.textContent = "";
    els.taskTitle.removeAttribute("aria-invalid");
    els.formTitle.textContent = task ? "할 일 수정" : "할 일 추가";
    els.subject.innerHTML = subjects.map((subject) => `<option value="${esc(subject.id)}">${esc(subject.name)}</option>`).join("");
    els.subject.value = task?.subjectId || (state.subjectId !== "all" ? state.subjectId : subjects[0].id);
    els.taskTitle.value = task?.title || "";
    els.due.value = task ? task.dueDate : date;
    els.customDue.value = els.due.value;
    els.noDue.checked = Boolean(task && !task.dueDate);
    els.due.disabled = els.noDue.checked;
    els.customDue.disabled = els.noDue.checked;
    els.dialog.showModal();
    els.taskTitle.focus();
  }

  $("thisWeekBtn").addEventListener("click", () => selectDate(dateKey(new Date())));
  els.app.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    const card = event.target.closest("[data-task-card]");
    if (!card || card.contains(event.relatedTarget)) return;
    hoveredTaskId = card.dataset.taskCard;
    syncSelection();
  });
  els.app.addEventListener("pointerout", (event) => {
    const card = event.target.closest("[data-task-card]");
    if (!card || card.contains(event.relatedTarget)) return;
    if (hoveredTaskId === card.dataset.taskCard) hoveredTaskId = null;
    syncSelection();
  });
  els.app.addEventListener("focusin", () => syncSelection());
  els.app.addEventListener("focusout", (event) => syncSelection(event.relatedTarget));
  els.app.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
      if (event.target.closest("input, textarea, label, [data-task-card]")) return;
      const day = event.target.closest("[data-planner-date]");
      if (day) selectDay(day.dataset.plannerDate);
      return;
    }
    if (button.dataset.weekShift) {
      const next = toDate(state.date); next.setDate(next.getDate() + Number(button.dataset.weekShift)); selectDate(dateKey(next));
    } else if (button.dataset.monthShift) {
      state.month = new Date(state.month.getFullYear(), state.month.getMonth() + Number(button.dataset.monthShift), 1);
      renderCalendar(MyStudy.getWeek(state.date));
    } else if (button.dataset.selectDate) selectDate(button.dataset.selectDate);
    else if (button.dataset.filterSubject) {
      state.subjectId = button.dataset.filterSubject; selectedDay = null; selectedTaskId = null; savePreferences(); render();
      Array.from(els.filters.querySelectorAll("button")).find((item) => item.dataset.filterSubject === state.subjectId)?.focus();
    } else if (button.dataset.selectDay) selectDay(button.dataset.selectDay);
    else if (button.dataset.selectTask) selectTask(button.dataset.selectTask);
    else if (button.dataset.addDate) openTaskDialog({ date: button.dataset.addDate, target: button });
    else if (button.dataset.editTask) openTaskDialog({ taskId: button.dataset.editTask, target: button });
    else if (button.dataset.deleteTask) deleteTask(button.dataset.deleteTask);
  });

  document.addEventListener("click", (event) => {
    if (els.dialog.open || event.target.closest("[data-planner-date], [data-task-card]")) return;
    selectedDay = null;
    selectedTaskId = null;
    syncSelection();
  });
  document.addEventListener("keydown", (event) => {
    const focusedTask = document.activeElement?.closest("[data-task-card]");
    if (event.key !== "Escape" || els.dialog.open || (!selectedDay && !selectedTaskId && !hoveredTaskId && !focusedTask)) return;
    const day = focusedTask?.closest("[data-planner-date]") || Array.from(els.grid.querySelectorAll("[data-planner-date]")).find((item) => item.dataset.plannerDate === selectedDay);
    opener = null;
    selectedDay = null;
    selectedTaskId = null;
    hoveredTaskId = null;
    (day?.querySelector("[data-select-day]") || els.title).focus({ preventScroll: true });
    syncSelection();
  });
  els.app.addEventListener("change", (event) => {
    const input = event.target.closest("[data-complete-task]");
    if (!input) return;
    try {
      MyStudy.setTaskDone(input.dataset.completeTask, input.checked);
      render();
      Array.from(els.app.querySelectorAll("[data-complete-task]")).find((item) => item.dataset.completeTask === input.dataset.completeTask)?.focus();
    } catch { input.checked = !input.checked; MyUI.toast("완료 상태를 저장하지 못했어요."); }
  });
  els.grid.addEventListener("input", (event) => {
    if (event.target.id !== "weekNote") return;
    const notes = readJSON(NOTE_KEY, {});
    const next = notes && typeof notes === "object" && !Array.isArray(notes) ? notes : {};
    next[MyStudy.getWeek(state.date).startDate] = event.target.value;
    try { localStorage.setItem(NOTE_KEY, JSON.stringify(next)); }
    catch { MyUI.toast("메모를 저장하지 못했어요."); }
  });
  els.dialog.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => els.dialog.close()));
  els.dialog.addEventListener("close", focusPlanner);
  els.noDue.addEventListener("change", () => { els.due.disabled = els.noDue.checked; els.customDue.disabled = els.noDue.checked; if (els.noDue.checked) closeDatePicker(); });
  els.datePickerToggle.addEventListener("click", () => els.datePicker.hidden ? openDatePicker() : closeDatePicker());
  els.customDue.addEventListener("click", () => { if (!els.due.disabled) openDatePicker(); });
  els.datePicker.addEventListener("click", (event) => {
    const shift = event.target.closest("[data-date-picker-shift]");
    if (shift) { datePickerMonth.setMonth(datePickerMonth.getMonth() + Number(shift.dataset.datePickerShift)); renderDatePicker(); return; }
    const day = event.target.closest("[data-date-picker-value]");
    if (day) { els.due.value = day.dataset.datePickerValue; els.customDue.value = els.due.value; closeDatePicker(); els.customDue.focus(); return; }
    if (event.target.closest("[data-date-picker-today]")) { els.due.value = dateKey(new Date()); els.customDue.value = els.due.value; closeDatePicker(); els.customDue.focus(); }
  });
  document.addEventListener("click", (event) => { if (!event.target.closest(".date-picker-enhanced")) closeDatePicker(); });
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = els.taskTitle.value.trim();
    const subjectId = els.subject.value;
    const dueDate = els.noDue.checked ? "" : els.due.value;
    if (!title || title.length > 40) {
      els.formError.textContent = "할 일은 1~40자로 입력해 주세요."; els.taskTitle.setAttribute("aria-invalid", "true"); els.taskTitle.focus(); return;
    }
    if (!MyStudy.getSubject(subjectId)) { els.formError.textContent = "과목을 다시 선택해 주세요."; return; }
    if (!els.noDue.checked && !validDate(dueDate)) { els.formError.textContent = "마감일을 입력하거나 마감 미정을 선택해 주세요."; els.due.focus(); return; }
    const tasks = MyStudy.getTasks();
    const existing = editingId ? tasks.find((task) => task.id === editingId) : null;
    if (editingId && !existing) { els.formError.textContent = "다른 화면에서 삭제된 할 일이에요. 창을 닫고 다시 확인해 주세요."; return; }
    const task = { ...(existing || { id: MyStudy.uid("t"), category: "assignment", done: false }), subjectId, title, dueDate };
    try {
      MyStudy.saveTasks(existing ? tasks.map((item) => item.id === task.id ? task : item) : [...tasks, task]);
      if (state.subjectId !== "all") state.subjectId = subjectId;
      els.dialog.close();
      if (dueDate) selectDate(dueDate); else render();
      selectedDay = dueDate || null;
      selectedTaskId = task.id;
      syncSelection();
      MyUI.toast(existing ? "할 일을 수정했어요." : "할 일을 추가했어요.");
    } catch { els.formError.textContent = "할 일을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요."; }
  });

  window.addEventListener("storage", (event) => {
    if ([MyStudy.KEYS.subjects, MyStudy.KEYS.tasks, NOTE_KEY, null].includes(event.key)) render();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ready) render(); });

  async function init() {
    els.error.hidden = true;
    els.loading.hidden = false;
    try {
      await MyStudy.init();
      ready = true;
      render();
      els.app.hidden = false;
    } catch (error) { console.error(error); els.error.hidden = false; }
    finally { els.loading.hidden = true; }
  }
  $("retryBtn").addEventListener("click", init);
  init();
})();
