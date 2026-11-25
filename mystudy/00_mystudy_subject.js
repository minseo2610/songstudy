/* =========================================================
   Songtudy · 과목 상세 페이지 (주소: 00_mystudy_subject.html?id=과목id)
   - 과제 / 중간고사 준비 / 기말고사 준비별로 할 일을 묶어 표시
   - 묶음마다 완료 개수 / 전체 개수
   - 체크한 할 일은 지워지지 않고 묶음 아래 '완료' 구역으로 내려감
     (아이폰 미리알림 방식, 완료 구역은 접고 펼 수 있음)
   - 할 일 추가(추가 창) · 완료 체크 · 삭제(되돌리기 가능)
   - 마감 임박 정도를 할 일 왼쪽 색 띠로 표시
   - 시험명·시험일 등록 · 삭제(되돌리기 가능), 과목 이름·색상·메모 수정 (연필 버튼 → 수정 창)
   - 다시 그린 뒤에도 키보드 초점이 제자리에 남도록 처리
   ========================================================= */

const SHOW_DONE_KEY = "myStudy.showDone";
const SETTLE_MS = 600; // 마지막 체크 후 아래로 정리되기 전 잠깐 머무는 시간
const MOVE_MS = 320;   // 할 일이 새 자리로 미끄러지는 시간
const subjectId = new URLSearchParams(location.search).get("id");
const { icon, escapeHTML: esc } = MyUI;

const els = {
  detail: document.querySelector("#detail"),
  loading: document.querySelector("#loading"),
  notFound: document.querySelector("#notFound"),
  name: document.querySelector("#subjectName"),
  crumb: document.querySelector("#crumbName"),
  totalBar: document.querySelector("#totalBar"),
  totalText: document.querySelector("#totalText"),
  memo: document.querySelector("#subjectMemo"),
  editBtn: document.querySelector("#editBtn"),
  editModal: document.querySelector("#editModal"),
  editForm: document.querySelector("#editForm"),
  editNameCount: document.querySelector("#editNameCount"),
  editNameError: document.querySelector("#editNameError"),
  editMemoCount: document.querySelector("#editMemoCount"),
  colorPicker: document.querySelector("#colorPicker"),
  examChips: document.querySelector("#examChips"),
  examForm: document.querySelector("#examForm"),
  examError: document.querySelector("#examError"),
  showDoneBtn: document.querySelector("#showDoneBtn"),
  groupGrid: document.querySelector("#groupGrid"),
  groupAdd: document.querySelector("#groupAdd"),
  groupAddText: document.querySelector("#groupAddText"),
  groupAddButtons: document.querySelector("#groupAddButtons"),
  template: document.querySelector("#groupTemplate"),
  taskModal: document.querySelector("#taskModal"),
  taskForm: document.querySelector("#taskForm"),
  taskCatOptions: document.querySelector("#taskCatOptions"),
  taskTitleCount: document.querySelector("#taskTitleCount"),
  taskTitleError: document.querySelector("#taskTitleError"),
};

let showDone = localStorage.getItem(SHOW_DONE_KEY) !== "false";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 데이터 변경 도우미 ---------- */
function updateSubject(changes) {
  MyStudy.saveSubjects(MyStudy.getSubjects().map((s) => (s.id === subjectId ? { ...s, ...changes } : s)));
}

function updateTasks(fn) {
  MyStudy.saveTasks(fn(MyStudy.getTasks()));
}

function setBar(bar, percent) {
  bar.setAttribute("aria-valuenow", percent);
  bar.querySelector("span").style.setProperty("--value", percent / 100);
}

// 다시 그린 뒤 초점 옮기기: 앞의 선택자부터 찾아서 처음 있는 곳으로
function focusFirst(...selectors) {
  for (const sel of selectors) {
    const el = sel && document.querySelector(sel);
    if (el) {
      el.focus();
      return;
    }
  }
}

/* ---------- 머리 · 색상 ---------- */
function renderHead(subject, tasks) {
  const p = MyStudy.progress(tasks);
  document.title = `${subject.name} | Songtudy`;
  els.name.textContent = subject.name;
  els.crumb.textContent = subject.name;
  MyUI.setAddr(`subjects/${subject.name}`);
  els.totalText.textContent = `${p.done} / ${p.total} 완료`;
  els.memo.textContent = subject.memo || "";
  els.memo.hidden = !subject.memo;
  setBar(els.totalBar, p.percent);
  els.detail.style.setProperty("--subject-color", subject.color);
}

function renderColorPicker(subject) {
  els.colorPicker.innerHTML = MyStudy.COLORS.map((c) => `
    <label class="swatch" title="${c.name}">
      <input type="radio" name="color" value="${c.hex}" ${c.hex === subject.color ? "checked" : ""}>
      <span style="--subject-color: ${c.hex}">${icon("check")}</span>
      <span class="sr-only">${c.name}</span>
    </label>`).join("");
}

/* ---------- 시험 일정 ---------- */
// 시험 이름으로 준비 묶음 찾기: '중간' → 중간고사 준비, '기말' → 기말고사 준비 (기타 시험은 없음)
function prepCategoryOf(exam) {
  return Object.keys(EXAM_KEYWORD).find((key) => exam.name.includes(EXAM_KEYWORD[key])) || null;
}

// 시험별 준비 진행률: 그 묶음의 할 일 중 몇 개를 끝냈는지
function examPrepHTML(exam, tasks) {
  const catKey = prepCategoryOf(exam);
  if (!catKey) return "";
  const p = MyStudy.progress(tasks.filter((t) => t.category === catKey));
  if (p.total === 0) {
    return `<button class="link-btn exam-prep-add" type="button" data-prep="${catKey}">준비할 일 추가하기</button>`;
  }
  const doneMark = p.left === 0 ? `<svg class="icon" aria-hidden="true"><use href="#i-star"></use></svg>` : "";
  return `
    <span class="exam-prep${p.left === 0 ? " is-complete" : ""}">
      <span class="exam-prep-text num">${doneMark}준비 ${p.done}/${p.total}</span>
      <span class="progress" role="progressbar" aria-label="${esc(exam.name)} 준비 진행률"
            aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percent}"><span style="--value: ${p.percent / 100}"></span></span>
    </span>`;
}

function renderExams(subject, tasks) {
  // 날짜 순, '날짜 미정'은 맨 뒤
  const exams = [...subject.exams].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  els.examChips.innerHTML = exams.length === 0
    ? `<li class="task-empty">등록된 시험이 없어요.</li>`
    : exams.map((e) => {
      const dd = e.date ? MyStudy.dday(e.date) : { className: "badge badge-plain", label: "미정" };
      return `
        <li class="exam-chip" data-id="${esc(e.id)}">
          <span class="${dd.className}">${dd.label}</span>
          <span class="exam-info">
            <strong>${esc(e.name)}</strong>
            <span class="exam-date">${e.date ? MyStudy.formatDate(e.date) : "날짜 미정"}</span>
          </span>
          <button class="icon-btn" type="button" data-action="remove-exam" aria-label="${esc(e.name)} 삭제" title="삭제">${icon("x")}</button>
          ${examPrepHTML(e, tasks)}
        </li>`;
    }).join("");
}

function showExamError(message, field) {
  els.examError.textContent = message;
  els.examForm.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
  }
}

/* ---------- 할 일 묶음 ---------- */
// 마감 임박 정도 → 왼쪽 색 띠 (1일 이내·지남 / 3일 이내 / 여유). 끝낸 일과 마감일 없는 일은 띠 없음
function urgencyClass(task) {
  if (task.done || !task.dueDate) return "";
  const { diff } = MyStudy.dday(task.dueDate);
  if (diff <= 1) return "urg-high";
  if (diff <= 3) return "urg-mid";
  return "urg-low";
}

function taskHTML(task) {
  let due = "";
  if (task.dueDate) {
    const dd = MyStudy.dday(task.dueDate);
    const urgent = !task.done && dd.diff <= 1;
    // 끝낸 할 일은 날짜만, 남은 할 일은 D-day도 함께
    due = `
      <span class="task-meta">
        <span>${MyStudy.formatDate(task.dueDate, false)}</span>
        ${task.done ? "" : `<span class="${urgent ? "is-urgent" : ""}">${dd.label}</span>`}
      </span>`;
  }
  const checkId = `chk-${esc(task.id)}`;
  const plannerLink = task.done ? "" : `
    <a class="icon-btn" href="00_mystudy_planner.html?task=${encodeURIComponent(task.id)}"
       aria-label="${esc(task.title)} 플래너에 등록" title="플래너에 등록">${icon("calendar-plus")}</a>`;

  return `
    <li class="task ${task.done ? "is-done" : ""} ${urgencyClass(task)}" data-id="${esc(task.id)}">
      <span class="check">
        <input type="checkbox" id="${checkId}" ${task.done ? "checked" : ""}>
        <span class="box">${icon("check")}</span>
      </span>
      <label class="task-body" for="${checkId}">
        <span class="task-title">${esc(task.title)}</span>
        ${due}
      </label>
      <span class="task-actions">
        ${plannerLink}
        <button class="icon-btn" type="button" data-action="remove-task" aria-label="${esc(task.title)} 삭제" title="삭제">${icon("x")}</button>
      </span>
    </li>`;
}

// 마감일 빠른 순 (마감일 없으면 뒤로)
function byDue(a, b) {
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
}

/* 묶음 보이기 규칙
   - 할 일이 있거나
   - 그 시험이 등록돼 있거나 (중간고사 일정 → 중간고사 준비)
   - 이번 방문에서 사용자가 직접 연 묶음이면 보여 줌
   나머지는 아래 '＋ 묶음' 버튼으로 접어 둠 */
const openedCategories = new Set();
const EXAM_KEYWORD = { midterm: "중간", final: "기말" };

function isGroupVisible(catKey, tasks, subject) {
  if (openedCategories.has(catKey)) return true;
  if (tasks.some((t) => t.category === catKey)) return true;
  const keyword = EXAM_KEYWORD[catKey];
  return Boolean(keyword) && subject.exams.some((e) => e.name.includes(keyword));
}

function renderGroupAdd(hidden, anyVisible) {
  els.groupAdd.hidden = hidden.length === 0;
  els.groupAddText.textContent = anyVisible ? "다른 묶음도 필요하면 추가하세요." : "어떤 할 일부터 정리할까요?";
  els.groupAddButtons.innerHTML = hidden.map((cat) => `
    <button class="btn btn-sm add-group-btn" type="button" data-open="${cat.key}">${icon("plus")}${cat.label}</button>`).join("");
}

function renderGroups(tasks, subject) {
  els.groupGrid.innerHTML = "";
  const visibleCats = MyStudy.CATEGORIES.filter((cat) => isGroupVisible(cat.key, tasks, subject));
  const hiddenCats = MyStudy.CATEGORIES.filter((cat) => !visibleCats.includes(cat));
  renderGroupAdd(hiddenCats, visibleCats.length > 0);
  els.groupGrid.hidden = visibleCats.length === 0;

  visibleCats.forEach((cat) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const list = tasks.filter((t) => t.category === cat.key);
    const p = MyStudy.progress(list);
    const todo = list.filter((t) => !t.done).sort(byDue);
    const done = list.filter((t) => t.done);  // 완료한 순서대로 (먼저 끝낸 것이 위)
    const headingId = `group-${cat.key}`;

    node.dataset.category = cat.key;
    node.setAttribute("aria-labelledby", headingId);
    node.classList.toggle("is-complete", p.total > 0 && p.left === 0);

    const label = node.querySelector(".group-label");
    label.id = headingId;
    label.textContent = cat.label;
    node.querySelector(".group-done").textContent = p.done;
    node.querySelector(".group-total").textContent = ` / ${p.total}`;

    const bar = node.querySelector(".progress");
    bar.setAttribute("aria-label", `${cat.label} 완료율`);
    setBar(bar, p.percent);

    // 남은 할 일
    node.querySelector(".todo-list").innerHTML = todo.length
      ? todo.map(taskHTML).join("")
      : `<li class="task-empty">${list.length ? "남은 할 일이 없어요." : "할 일이 없어요."}</li>`;

    // 완료 구역: 완료한 할 일이 있고, '완료한 할 일 보기'가 켜져 있을 때만
    const doneArea = node.querySelector(".done-area");
    doneArea.hidden = done.length === 0 || !showDone;
    node.querySelector(".done-count").textContent = done.length;
    node.querySelector(".done-list").innerHTML = done.map(taskHTML).join("");

    const addBtn = node.querySelector("[data-add-task]");
    addBtn.dataset.addTask = cat.key;
    addBtn.setAttribute("aria-label", `${cat.label}에 할 일 추가`);
    els.groupGrid.append(node);
  });
}

function renderShowDone() {
  els.showDoneBtn.setAttribute("aria-pressed", String(showDone));
}

/* ---------- 전체 그리기 ---------- */
function render() {
  const subject = MyStudy.getSubject(subjectId);
  els.loading.hidden = true;
  els.detail.hidden = !subject;
  els.notFound.hidden = Boolean(subject);
  if (!subject) {
    document.title = "과목 없음 | Songtudy";
    return;
  }
  const tasks = MyStudy.getTasksOf(subjectId);
  renderHead(subject, tasks);
  renderExams(subject, tasks);
  renderShowDone();
  renderGroups(tasks, subject);
}

// 다시 그리면서 할 일들이 새 자리로 미끄러지게 (FLIP: 처음 위치 → 새 위치)
function renderWithMotion() {
  if (reduceMotion) {
    render();
    return;
  }
  const before = new Map();
  els.groupGrid.querySelectorAll(".task[data-id]").forEach((el) => {
    before.set(el.dataset.id, el.getBoundingClientRect().top);
  });
  render();
  els.groupGrid.querySelectorAll(".task[data-id]").forEach((el) => {
    const oldTop = before.get(el.dataset.id);
    if (oldTop === undefined) return;
    const dy = oldTop - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    el.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
      { duration: MOVE_MS, easing: "cubic-bezier(.2, .7, .3, 1)" }
    );
  });
}

/* ---------- 이벤트: 과목 수정 창 ---------- */
// 글자 수 표시: "<b>14</b>/20"
function updateCount(input, countEl) {
  countEl.innerHTML = `<b>${input.value.length}</b>/${input.maxLength}`;
}

function openEditModal() {
  const subject = MyStudy.getSubject(subjectId);
  const form = els.editForm;
  form.elements.name.value = subject.name;
  form.elements.memo.value = subject.memo || "";
  renderColorPicker(subject);
  updateCount(form.elements.name, els.editNameCount);
  updateCount(form.elements.memo, els.editMemoCount);
  els.editNameError.textContent = "";
  form.elements.name.removeAttribute("aria-invalid");
  els.editModal.showModal();
  form.elements.name.select();
}

function onEditSubmit(e) {
  e.preventDefault();
  const form = els.editForm;
  const nameInput = form.elements.name;
  const name = nameInput.value.trim();
  const memo = form.elements.memo.value.trim();
  const color = form.querySelector('input[name="color"]:checked').value;

  let error = "";
  if (!name) error = "과목명을 입력해 주세요.";
  else if (MyStudy.getSubjects().some((s) => s.name === name && s.id !== subjectId)) error = "같은 이름의 과목이 이미 있어요.";
  if (error) {
    els.editNameError.textContent = error;
    nameInput.setAttribute("aria-invalid", "true");
    nameInput.focus();
    return;
  }

  updateSubject({ name, color, memo });
  els.editModal.close();
  render();
  MyUI.toast("과목 정보를 수정했어요.");
}

function onExamSubmit(e) {
  e.preventDefault();
  const nameField = els.examForm.elements.name;
  const dateField = els.examForm.elements.date;
  const name = nameField.value.trim();
  const date = dateField.value;
  if (!name) return showExamError("시험명을 입력해 주세요.", nameField);
  if (!date) return showExamError("시험일을 선택해 주세요.", dateField);

  const subject = MyStudy.getSubject(subjectId);
  updateSubject({ exams: [...subject.exams, { id: MyStudy.uid("e"), name, date }] });
  els.examForm.reset();
  showExamError("");
  render();
  nameField.focus();
  MyUI.toast(`${name} 일정을 등록했어요.`);
}

function onExamRemove(e) {
  // 준비할 일이 없는 시험: 그 묶음으로 할 일 추가 창 열기
  const prepBtn = e.target.closest("[data-prep]");
  if (prepBtn) {
    openTaskModal(prepBtn.dataset.prep, prepBtn);
    return;
  }
  const btn = e.target.closest('[data-action="remove-exam"]');
  if (!btn) return;
  const id = btn.closest(".exam-chip").dataset.id;
  const subject = MyStudy.getSubject(subjectId);
  const removed = subject.exams.find((x) => x.id === id);
  updateSubject({ exams: subject.exams.filter((x) => x.id !== id) });
  render();
  els.examForm.elements.name.focus();

  MyUI.toast(`${removed.name} 일정을 삭제했어요.`, {
    actionLabel: "되돌리기",
    onAction: () => {
      const current = MyStudy.getSubject(subjectId);
      updateSubject({ exams: [...current.exams, removed] });
      render();
    },
  });
}

/* ---------- 이벤트: 할 일 ---------- */
let settleTimer;

function onTaskCheck(e) {
  if (e.target.type !== "checkbox") return;
  const item = e.target.closest(".task");
  const id = item.dataset.id;
  const checked = e.target.checked;
  // 바꾼 할 일을 배열 맨 뒤로 보내 완료 구역에 끝낸 순서대로 쌓이게 함
  updateTasks((all) => {
    const rest = all.filter((t) => t.id !== id);
    const task = { ...all.find((t) => t.id === id), done: checked };
    return [...rest, task];
  });
  const task = MyStudy.getTasks().find((t) => t.id === id);

  // 바로 옮기지 않고 줄 긋기를 잠깐 보여 준 뒤 한 번에 정리
  // 여러 개를 연달아 체크하면 마지막 체크 뒤에 한 번만 다시 그림
  item.classList.toggle("is-done", checked);
  item.classList.add("is-settling");
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    renderWithMotion();
    // 옮겨진 같은 할 일로 초점 복귀 (완료 구역이 접혀 있으면 같은 묶음 '할 일' 버튼으로)
    focusFirst(`.task[data-id="${CSS.escape(id)}"] input[type="checkbox"]`,
               `[data-category="${task.category}"] [data-add-task]`);
  }, reduceMotion ? 0 : SETTLE_MS);

  // 묶음을 모두 끝냈을 때 칭찬
  const group = MyStudy.getTasksOf(subjectId).filter((t) => t.category === task.category);
  if (checked && group.every((t) => t.done)) {
    const label = MyStudy.CATEGORIES.find((c) => c.key === task.category).label;
    MyUI.toast(`${label} 할 일을 모두 끝냈어요!`);
  }
}

function onTaskRemove(e) {
  const btn = e.target.closest('[data-action="remove-task"]');
  if (!btn) return;
  const item = btn.closest(".task");
  const nextId = (item.nextElementSibling || item.previousElementSibling)?.dataset.id;
  const all = MyStudy.getTasks();
  const index = all.findIndex((t) => t.id === item.dataset.id);
  const removed = all[index];

  openedCategories.add(removed.category); // 마지막 할 일을 지워도 묶음이 갑자기 사라지지 않게
  updateTasks((list) => list.filter((t) => t.id !== removed.id));
  render();
  // 옆 할 일로 초점 이동, 없으면 같은 묶음 '할 일' 버튼으로
  focusFirst(nextId && `.task[data-id="${CSS.escape(nextId)}"] input[type="checkbox"]`,
             `[data-category="${removed.category}"] [data-add-task]`);

  MyUI.toast(`'${removed.title}'을(를) 삭제했어요.`, {
    actionLabel: "되돌리기",
    onAction: () => {
      updateTasks((list) => {
        const copy = [...list];
        copy.splice(Math.min(index, copy.length), 0, removed);
        return copy;
      });
      render();
      focusFirst(`.task[data-id="${CSS.escape(removed.id)}"] input[type="checkbox"]`);
    },
  });
}

/* ---------- 할 일 추가 창 ---------- */
let taskModalOpener = null; // 창을 닫으면 초점을 돌려줄 버튼

function openTaskModal(category, opener) {
  taskModalOpener = opener;
  const form = els.taskForm;
  form.reset();
  els.taskCatOptions.innerHTML = MyStudy.CATEGORIES.map((cat) => `
    <label class="radio">
      <input type="radio" name="category" value="${cat.key}" ${cat.key === category ? "checked" : ""}>
      ${cat.label}
    </label>`).join("");
  updateCount(form.elements.title, els.taskTitleCount);
  els.taskTitleError.textContent = "";
  form.elements.title.removeAttribute("aria-invalid");
  els.taskModal.showModal();
  form.elements.title.focus();
}

function onTaskAdd(e) {
  e.preventDefault();
  const form = els.taskForm;
  const title = form.elements.title.value.trim();
  const category = form.querySelector('input[name="category"]:checked').value;
  if (!title) {
    els.taskTitleError.textContent = "할 일을 입력해 주세요.";
    form.elements.title.setAttribute("aria-invalid", "true");
    form.elements.title.focus();
    return;
  }
  const id = MyStudy.uid("t");
  updateTasks((all) => [...all, { id, subjectId, category, title, dueDate: form.elements.dueDate.value, done: false }]);
  openedCategories.add(category);
  taskModalOpener = null; // 새 할 일로 초점을 옮길 것이라 버튼으로 돌아가지 않음
  els.taskModal.close();
  render();
  focusFirst(`.task[data-id="${CSS.escape(id)}"] input[type="checkbox"]`);
  MyUI.toast(`'${title}'을(를) 추가했어요.`);
}

function onShowDoneClick() {
  showDone = !showDone;
  localStorage.setItem(SHOW_DONE_KEY, String(showDone));
  render();
}

/* ---------- 이벤트 연결 ---------- */
function bindEvents() {
  els.editBtn.addEventListener("click", openEditModal);
  els.editForm.addEventListener("submit", onEditSubmit);
  els.editForm.addEventListener("input", (e) => {
    if (e.target.name === "name") {
      updateCount(e.target, els.editNameCount);
      els.editNameError.textContent = "";
      e.target.removeAttribute("aria-invalid");
    }
    if (e.target.name === "memo") updateCount(e.target, els.editMemoCount);
  });
  // 취소·닫기 버튼, 창 바깥(뒤 배경) 클릭으로 닫기. Esc는 dialog가 알아서 닫음
  els.editModal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target === els.editModal) els.editModal.close();
  });
  // 창이 닫히면 연필 버튼으로 초점 돌려주기
  els.editModal.addEventListener("close", () => els.editBtn.focus());
  els.examForm.addEventListener("submit", onExamSubmit);
  els.examForm.addEventListener("input", (e) => {
    els.examError.textContent = "";
    e.target.removeAttribute("aria-invalid");
  });
  els.examChips.addEventListener("click", onExamRemove);
  els.showDoneBtn.addEventListener("click", onShowDoneClick);
  // 접어 둔 묶음 열기 → 바로 할 일 입력칸으로
  els.groupAddButtons.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open]");
    if (!btn) return;
    openTaskModal(btn.dataset.open, btn);
  });
  els.groupGrid.addEventListener("change", onTaskCheck);
  els.groupGrid.addEventListener("click", onTaskRemove);
  els.groupGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add-task]");
    if (btn) openTaskModal(btn.dataset.addTask, btn);
  });
  els.taskForm.addEventListener("submit", onTaskAdd);
  els.taskForm.addEventListener("input", (e) => {
    if (e.target.name !== "title") return;
    updateCount(e.target, els.taskTitleCount);
    els.taskTitleError.textContent = "";
    e.target.removeAttribute("aria-invalid");
  });
  els.taskModal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target === els.taskModal) els.taskModal.close();
  });
  els.taskModal.addEventListener("close", () => {
    // 취소했을 때만 원래 버튼으로 (다시 그려졌으면 같은 묶음의 버튼을 찾아서)
    if (!taskModalOpener) return;
    const key = taskModalOpener.dataset.addTask || taskModalOpener.dataset.open || taskModalOpener.dataset.prep;
    if (taskModalOpener.isConnected) taskModalOpener.focus();
    else focusFirst(`[data-add-task="${key}"]`);
  });

  // 다른 탭(과목 관리, 플래너 등)에서 데이터가 바뀌면 다시 그리기
  window.addEventListener("storage", (e) => {
    if (e.key === MyStudy.KEYS.subjects || e.key === MyStudy.KEYS.tasks) render();
  });
}

/* ---------- 시작 ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  try {
    await MyStudy.init();
  } catch (err) {
    console.error(err);
    MyUI.toast("예시 데이터를 불러오지 못했어요. Live Server로 열어 주세요.");
  }
  render();
});
