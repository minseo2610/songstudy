const SHOW_DONE_KEY = "myStudy.showDone";
const SETTLE_MS = 600;
const MOVE_MS = 320;
const subjectId = new URLSearchParams(location.search).get("id");
const { icon, escapeHTML: esc } = MyUI;

const els = {
  detail: document.querySelector("#detail"),
  loading: document.querySelector("#loading"),
  notFound: document.querySelector("#notFound"),
  name: document.querySelector("#subjectName"),
  crumb: document.querySelector("#crumbName"),
  memo: document.querySelector("#subjectMemo"),
  walk: document.querySelector("#walk"),
  walkBubble: document.querySelector("#walkBubble"),
  walkGoal: document.querySelector("#walkGoal"),
  walkDots: document.querySelector("#walkDots"),
  walkLane: document.querySelector("#walkLane"),
  editBtn: document.querySelector("#editBtn"),
  editGradeBtn: document.querySelector("#editGradeBtn"),
  gradeView: document.querySelector("#gradeView"),
  scoreSection: document.querySelector("#scoreSection"),
  scoreView: document.querySelector("#scoreView"),
  editScoreBtn: document.querySelector("#editScoreBtn"),
  subjectInfo: document.querySelector("#subjectInfo"),
  examChips: document.querySelector("#examChips"),
  addExamBtn: document.querySelector("#addExamBtn"),
  examModal: document.querySelector("#examModal"),
  examForm: document.querySelector("#examForm"),
  examError: document.querySelector("#examError"),
  catModal: document.querySelector("#catModal"),
  catForm: document.querySelector("#catForm"),
  catNameCount: document.querySelector("#catNameCount"),
  catError: document.querySelector("#catError"),
  showDoneBtn: document.querySelector("#showDoneBtn"),
  groupGrid: document.querySelector("#groupGrid"),
  template: document.querySelector("#groupTemplate"),
  taskModal: document.querySelector("#taskModal"),
  taskForm: document.querySelector("#taskForm"),
  taskCatOptions: document.querySelector("#taskCatOptions"),
  taskTitleCount: document.querySelector("#taskTitleCount"),
  taskTitleError: document.querySelector("#taskTitleError"),
  taskModalTitle: document.querySelector("#taskModalTitle"),
  taskSubmitBtn: document.querySelector("#taskSubmitBtn"),
};

let showDone = localStorage.getItem(SHOW_DONE_KEY) !== "false";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

function focusFirst(...selectors) {
  for (const sel of selectors) {
    const el = sel && document.querySelector(sel);
    if (el) {
      el.focus();
      return;
    }
  }
}

function renderHead(subject, tasks) {
  document.title = `${subject.name} | Songtudy`;
  els.name.textContent = subject.name;
  els.crumb.textContent = subject.name;
  MyUI.setAddr(`과목관리/${subject.name}`);
  els.memo.textContent = subject.memo || "";
  els.memo.hidden = !subject.memo;
  renderInfo(subject);
  els.detail.style.setProperty("--subject-color", subject.color);
}

function infoItems(subject) {
  const info = subject.info || {};
  const items = [];
  if (info.professor) items.push(`${info.professor} 교수님`);
  if (info.building || info.room) items.push([info.building, info.room && `${info.room}호`].filter(Boolean).join(" "));
  const time = [info.start, info.end].filter(Boolean).join("~");
  if (info.days?.length || time) items.push([info.days?.join("·"), time].filter(Boolean).join(" "));
  if (info.credits) items.push(`${info.credits}학점`);
  return items;
}

function renderInfo(subject) {
  const items = infoItems(subject);
  els.subjectInfo.hidden = items.length === 0;
  els.subjectInfo.innerHTML = items.map((t) => `<li>${esc(t)}</li>`).join("");
}

const GRADE_TONES = 5;

function gradeItemOf(subject, name) {
  return (subject.grading?.items || []).find((it) => it.name === name) || null;
}

function gradeSummary(items) {
  const scored = items.filter((it) => it.score !== undefined && it.score !== "");
  const earned = scored.reduce((acc, it) => acc + (it.percent * it.score) / 100, 0);
  const counted = scored.reduce((acc, it) => acc + it.percent, 0);
  return { earned: Math.round(earned * 10) / 10, counted, scoredCount: scored.length };
}

function renderGrading(subject) {
  const { items = [], rules = "" } = subject.grading || {};

  els.gradeView.innerHTML = items.length ? `
    <div class="grade-bar" role="img" aria-label="평가 비율: ${esc(items.map((it) => `${it.name} ${it.percent}%`).join(", "))}">
      ${items.map((it, i) => `<span class="tone-${i % GRADE_TONES}" style="--value: ${it.percent / 100}"></span>`).join("")}
    </div>
    <ul class="grade-legend">
      ${items.map((it, i) => `<li><i class="tone-${i % GRADE_TONES}" aria-hidden="true"></i>${esc(it.name)} <b class="num">${it.percent}%</b></li>`).join("")}
    </ul>`
    : `<p class="exam-empty">시험·과제·출석 비율을 적어 두면 어디에 힘을 쏟을지 정하기 쉬워요.</p>`;

  els.scoreSection.hidden = !items.length && !rules;
  if (els.scoreSection.hidden) return;
  const sum = gradeSummary(items);
  const table = items.length ? `
    <div class="score-table" role="table" aria-label="항목별 내 점수">
      <div class="score-row score-head" role="row">
        <span role="columnheader">항목</span><span role="columnheader">비중</span>
        <span role="columnheader">내 점수</span><span role="columnheader">반영</span>
      </div>
      ${items.map((it, i) => {
        const has = it.score !== undefined && it.score !== "";
        return `
        <div class="score-row" role="row">
          <span class="score-name" role="cell"><i class="tone-${i % GRADE_TONES}" aria-hidden="true"></i>${esc(it.name)}</span>
          <span class="num" role="cell">${it.percent}%</span>
          <span role="cell" class="score-input">
            <input class="input" type="number" min="0" max="100" step="0.5" inputmode="decimal"
                   data-score="${i}" value="${has ? it.score : ""}" placeholder="-" aria-label="${esc(it.name)} 내 점수 (100점 만점)">
            <span class="suffix">/100</span>
          </span>
          <b class="num" role="cell">${has ? `${Math.round(((it.percent * it.score) / 100) * 10) / 10}점` : "-"}</b>
        </div>`;
      }).join("")}
    </div>` : "";
  const rulesHTML = rules ? `
    <div class="grade-rules">
      <h3 class="grade-rules-title">감점 기준</h3>
      <p>${esc(rules)}</p>
    </div>` : "";

  let at = 0;
  const stops = items.map((it, i) => {
    if (it.score === undefined || it.score === "") return "";
    const from = at;
    at += (it.percent * it.score) / 100;
    return `var(--tone-${i % GRADE_TONES}) ${from}% ${at}%`;
  }).filter(Boolean);
  stops.push(`var(--pink-100) ${at}% 100%`);
  const donut = items.length ? `
    <figure class="score-donut">
      <div class="donut" style="--donut: conic-gradient(${stops.join(", ")})" role="img"
           aria-label="100점 중 지금까지 ${sum.earned}점 반영">
        <div class="donut-center"><b class="num">${sum.earned}</b><span>/ 100점</span></div>
      </div>
      <figcaption>${sum.scoredCount ? `입력한 ${sum.counted}% 반영` : "점수를 입력하면 채워져요"}</figcaption>
    </figure>` : "";
  els.scoreView.innerHTML = `<div class="score-body${rules ? "" : " no-rules"}">${donut}<div class="score-main">${table}</div>${rulesHTML}</div>`;
}

function onScoreChange(e) {
  const input = e.target.closest("[data-score]");
  if (!input) return;
  const subject = MyStudy.getSubject(subjectId);
  const items = [...subject.grading.items];
  const i = Number(input.dataset.score);
  const raw = input.value.trim();
  const score = raw === "" ? "" : Math.min(100, Math.max(0, Number(raw)));
  items[i] = { ...items[i], score };
  updateSubject({ grading: { ...subject.grading, items } });
  renderGrading(MyStudy.getSubject(subjectId));
  els.scoreView.querySelector(`[data-score="${i}"]`)?.focus();
}

const MAX_WALK_DOTS = 12;

function renderWalk(subject, tasks) {
  const p = MyStudy.progress(tasks);
  const next = MyStudy.nextExam(subject);
  els.walk.style.setProperty("--walk", p.total ? p.done / p.total : 0);
  els.walkLane.setAttribute("aria-valuenow", p.percent);
  els.walkLane.setAttribute("aria-valuetext", `할 일 ${p.total}개 중 ${p.done}개 완료`);

  const taskLine = p.total ? `할 일 ${p.done}/${p.total} 완료` : "할 일을 추가하면 기니피그가 출발해요";

  els.walkBubble.innerHTML = next
    ? `<span class="bubble-label">${esc(next.name)}</span><strong class="num">${next.dd.label}</strong>`
    : `<span class="bubble-label">다가오는 시험 없음</span><strong class="bubble-add">시험 추가하기</strong>`;
  els.walkBubble.dataset.exam = next ? next.id : "";
  els.walkBubble.setAttribute("aria-label", next
    ? `${next.name}까지 ${next.dd.label}, ${taskLine}. 시험 일정으로 이동`
    : `${taskLine}. 시험 추가하기`);
  els.walkGoal.textContent = p.total ? `할 일 ${p.total}개` : "할 일";

  const dots = p.total > 1 && p.total <= MAX_WALK_DOTS ? p.total - 1 : 0;
  els.walkDots.innerHTML = Array.from({ length: dots }, (_, i) => {
    const at = (i + 1) / p.total;
    return `<i style="--at: ${at}" class="${p.done / p.total >= at ? "is-passed" : ""}"></i>`;
  }).join("");
}

function onWalkBubbleClick() {
  const id = els.walkBubble.dataset.exam;
  if (!id) {
    openExamModal();
    return;
  }
  flashExam(id);
}

function flashExam(id) {
  const chip = els.examChips.querySelector(`.exam-chip[data-id="${CSS.escape(id)}"]`);
  if (!chip) return;
  chip.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  chip.classList.remove("is-flash");
  void chip.offsetWidth;
  chip.classList.add("is-flash");
}

const BG_RATIO = 2560 / 400;
const BG_ZOOM = 1.12;
function syncWalkTile() {
  els.walk.style.setProperty("--tile", `${Math.round(els.walk.offsetHeight * BG_ZOOM * BG_RATIO)}px`);
}

function prepCategoryOf(exam, subject) {
  return subject.categories.find((c) => c.id === exam.catId) || null;
}

function examPrepHTML(exam, tasks, subject) {
  const cat = prepCategoryOf(exam, subject);
  if (!cat) return "";
  const catKey = cat.id;
  const p = MyStudy.progress(tasks.filter((t) => t.category === catKey));
  if (p.total === 0) {
    return `<button class="link-btn exam-prep-add" type="button" data-prep="${esc(catKey)}">준비할 일 추가하기</button>`;
  }
  const doneMark = p.left === 0 ? `<svg class="icon" aria-hidden="true"><use href="#i-star"></use></svg>` : "";
  return `
    <span class="exam-prep${p.left === 0 ? " is-complete" : ""}">
      <span class="exam-prep-text num">${doneMark}준비 ${p.done}/${p.total}</span>
      <span class="progress" role="progressbar" aria-label="${esc(exam.name)} 준비 진행률"
            aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percent}"><span style="--value: ${p.percent / 100}"></span></span>
    </span>`;
}

function weightBadge(subject, name) {
  const it = gradeItemOf(subject, name);
  return it ? ` <span class="exam-weight num">${it.percent}%</span>` : "";
}

function renderExams(subject, tasks) {

  const exams = [...subject.exams].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  els.examChips.innerHTML = exams.length === 0
    ? `<li class="exam-empty">등록된 시험이 없어요.</li>`
    : exams.map((e) => {
      const dd = e.date ? MyStudy.dday(e.date) : { className: "badge badge-plain", label: "미정" };
      return `
        <li class="exam-chip" data-id="${esc(e.id)}">
          <span class="${dd.className}">${dd.label}</span>
          <span class="exam-info">
            <strong>${esc(e.name)}${weightBadge(subject, e.name)}</strong>
            <span class="exam-date">${e.date ? MyStudy.formatDate(e.date) : "날짜 미정"}</span>
          </span>
          <button class="icon-btn" type="button" data-action="remove-exam" aria-label="${esc(e.name)} 삭제" title="삭제">${icon("x")}</button>
          ${examPrepHTML(e, tasks, subject)}
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

    due = `
      <span class="task-meta">
        <span>${MyStudy.formatDate(task.dueDate, false)}</span>
        ${task.done ? "" : `<span class="${urgent ? "is-urgent" : ""}">${dd.label}</span>`}
      </span>`;
  }
  const checkId = `chk-${esc(task.id)}`;

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
        <button class="icon-btn" type="button" data-action="edit-task" aria-label="${esc(task.title)} 수정" title="수정">${icon("edit")}</button>
        <button class="icon-btn" type="button" data-action="remove-task" aria-label="${esc(task.title)} 삭제" title="삭제">${icon("x")}</button>
      </span>
    </li>`;
}

function byDue(a, b) {
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
}

function renderGroups(tasks, subject) {
  els.groupGrid.innerHTML = "";

  subject.categories.forEach((cat) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const list = tasks.filter((t) => t.category === cat.id);
    const p = MyStudy.progress(list);
    const todo = list.filter((t) => !t.done).sort(byDue);
    const done = list.filter((t) => t.done);
    const headingId = `group-${cat.id}`;

    node.dataset.category = cat.id;
    node.setAttribute("aria-labelledby", headingId);
    node.classList.toggle("is-complete", p.total > 0 && p.left === 0);

    const label = node.querySelector(".group-label");
    label.id = headingId;
    label.textContent = cat.name;
    node.querySelector(".group-done").textContent = `${p.done}개`;
    node.querySelector(".group-total").textContent = ` / ${p.total}개`;

    const bar = node.querySelector(".progress");
    bar.setAttribute("aria-label", `${cat.name} 완료율`);
    setBar(bar, p.percent);

    node.querySelector(".todo-list").innerHTML = todo.length
      ? todo.map(taskHTML).join("")
      : `<li class="task-empty">${list.length ? "남은 할 일이 없어요." : "할 일이 없어요."}</li>`;

    const doneArea = node.querySelector(".done-area");
    doneArea.hidden = done.length === 0 || !showDone;
    node.querySelector(".done-count").textContent = done.length;
    node.querySelector(".done-list").innerHTML = done.map(taskHTML).join("");

    const addBtn = node.querySelector("[data-add-task]");
    addBtn.dataset.addTask = cat.id;
    addBtn.setAttribute("aria-label", `${cat.name}에 할 일 추가`);
    const removeBtn = node.querySelector("[data-remove-cat]");
    removeBtn.dataset.removeCat = cat.id;
    removeBtn.setAttribute("aria-label", `${cat.name} 카테고리 삭제`);
    els.groupGrid.append(node);
  });

  if (subject.categories.length === 0) {
    els.groupGrid.innerHTML = `<p class="group-empty">과제, 퀴즈 준비처럼 카테고리를 만들고 그 안에 할 일을 넣어 보세요. 오른쪽 위 <b>카테고리 추가</b>를 눌러 시작해요.</p>`;
  }
}

function renderShowDone() {
  els.showDoneBtn.setAttribute("aria-pressed", String(showDone));
}

function render() {
  const subject = MyStudy.ensureCategories(subjectId);
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
  renderWalk(subject, tasks);
  renderGrading(subject);
  renderShowDone();
  renderGroups(tasks, subject);
}

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

function updateCount(input, countEl) {
  countEl.innerHTML = `<b>${input.value.length}</b>/${input.maxLength}`;
}

function openEditModal(focusGrading = false, opener = els.editBtn) {
  MySubjectForm.open(subjectId, { focusGrading, opener, onSaved: render });
}

function syncExamForm() {
  const form = els.examForm;
  const type = form.querySelector('input[name="type"]:checked').value;
  form.elements.other.disabled = type !== "기타";
  form.elements.date.disabled = form.elements.tbd.checked;
  if (form.elements.tbd.checked) form.elements.date.value = "";
  MyUI.syncDate(form.elements.date);
}

function openExamModal() {
  els.examForm.reset();
  showExamError("");

  const has = (word) => MyStudy.getSubject(subjectId).exams.some((e) => e.name.includes(word));
  const first = !has("중간") ? "중간고사" : !has("기말") ? "기말고사" : "기타";
  els.examForm.querySelector(`input[name="type"][value="${first}"]`).checked = true;
  syncExamForm();
  els.examModal.showModal();
  els.examForm.querySelector('input[name="type"]:checked').focus();
}

function onExamSubmit(e) {
  e.preventDefault();
  const form = els.examForm;
  const type = form.querySelector('input[name="type"]:checked').value;
  const name = type === "기타" ? form.elements.other.value.trim() : type;
  const tbd = form.elements.tbd.checked;
  const date = tbd ? "" : form.elements.date.value;
  if (!name) return showExamError("기타 시험명을 입력해 주세요.", form.elements.other);
  if (!tbd && !date) return showExamError("시험일을 선택하거나 '날짜 미정'을 체크해 주세요.", form.elements.date);

  const subject = MyStudy.getSubject(subjectId);
  if (subject.exams.some((x) => x.name === name)) return showExamError(`${name}은(는) 이미 등록돼 있어요.`, type === "기타" ? form.elements.other : null);

  updateSubject({ exams: [...subject.exams, { id: MyStudy.uid("e"), name, date }] });
  els.examModal.close();
  render();
  MyUI.toast(`${name} 일정을 추가했어요.`);
}

function onExamClick(e) {

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
  els.addExamBtn.focus();

  MyUI.toast(`${removed.name} 일정을 삭제했어요.`, {
    actionLabel: "되돌리기",
    onAction: () => {
      const current = MyStudy.getSubject(subjectId);
      updateSubject({ exams: [...current.exams, removed] });
      render();
    },
  });
}

function openCatModal() {
  els.catForm.reset();
  els.catError.textContent = "";
  els.catForm.elements.name.removeAttribute("aria-invalid");
  updateCount(els.catForm.elements.name, els.catNameCount);
  els.catModal.showModal();
  els.catForm.elements.name.focus();
}

function onCatSubmit(e) {
  e.preventDefault();
  const input = els.catForm.elements.name;
  const name = input.value.trim();
  const subject = MyStudy.getSubject(subjectId);
  let error = "";
  if (!name) error = "카테고리 이름을 입력해 주세요.";
  else if (subject.categories.some((c) => c.name === name)) error = "같은 이름의 카테고리가 이미 있어요.";
  if (error) {
    els.catError.textContent = error;
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  const id = MyStudy.uid("c");
  updateSubject({ categories: [...subject.categories, { id, name }] });
  els.catModal.close();
  render();
  focusFirst(`[data-add-task="${CSS.escape(id)}"]`);
  MyUI.toast(`'${name}' 카테고리를 만들었어요.`);
}

function onCatRemove(e) {
  const btn = e.target.closest("[data-remove-cat]");
  if (!btn) return;
  const catId = btn.dataset.removeCat;
  const subject = MyStudy.getSubject(subjectId);
  const index = subject.categories.findIndex((c) => c.id === catId);
  const cat = subject.categories[index];
  const allTasks = MyStudy.getTasks();
  const removedTasks = allTasks.filter((t) => t.subjectId === subjectId && t.category === catId);
  const linkedExamIds = subject.exams.filter((x) => x.catId === catId).map((x) => x.id);

  updateSubject({
    categories: subject.categories.filter((c) => c.id !== catId),

    exams: subject.exams.map((x) => (x.catId === catId ? { ...x, catId: null } : x)),
  });
  updateTasks((list) => list.filter((t) => !(t.subjectId === subjectId && t.category === catId)));
  render();
  focusFirst("[data-new-cat]");

  const extra = removedTasks.length ? `와 할 일 ${removedTasks.length}개` : "";
  MyUI.toast(`'${cat.name}' 카테고리${extra}를 삭제했어요.`, {
    actionLabel: "되돌리기",
    onAction: () => {
      const current = MyStudy.getSubject(subjectId);
      const cats = [...current.categories];
      cats.splice(Math.min(index, cats.length), 0, cat);
      updateSubject({
        categories: cats,
        exams: current.exams.map((x) => (linkedExamIds.includes(x.id) ? { ...x, catId } : x)),
      });
      updateTasks((list) => [...list, ...removedTasks]);
      render();
    },
  });
}

let settleTimer;

function onTaskCheck(e) {
  if (e.target.type !== "checkbox") return;
  const item = e.target.closest(".task");
  const id = item.dataset.id;
  const checked = e.target.checked;

  updateTasks((all) => {
    const rest = all.filter((t) => t.id !== id);
    const task = { ...all.find((t) => t.id === id), done: checked };
    return [...rest, task];
  });
  const task = MyStudy.getTasks().find((t) => t.id === id);

  item.classList.toggle("is-done", checked);
  item.classList.add("is-settling");
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    renderWithMotion();

    focusFirst(`.task[data-id="${CSS.escape(id)}"] input[type="checkbox"]`,
               `[data-add-task="${CSS.escape(task.category)}"]`);
  }, reduceMotion ? 0 : SETTLE_MS);

  const group = MyStudy.getTasksOf(subjectId).filter((t) => t.category === task.category);
  if (checked && group.every((t) => t.done)) {
    const label = MyStudy.categoryName(MyStudy.getSubject(subjectId), task.category);
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

  updateTasks((list) => list.filter((t) => t.id !== removed.id));
  render();

  focusFirst(nextId && `.task[data-id="${CSS.escape(nextId)}"] input[type="checkbox"]`,
             `[data-add-task="${CSS.escape(removed.category)}"]`);

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

let taskModalOpener = null;

let editingTaskId = null;

function openTaskModal(category, opener, task = null) {
  taskModalOpener = opener;
  editingTaskId = task ? task.id : null;
  const form = els.taskForm;
  form.reset();
  els.taskModalTitle.textContent = task ? "할 일 수정" : "할 일 추가";
  els.taskSubmitBtn.textContent = task ? "저장" : "추가";
  const cats = MyStudy.getSubject(subjectId).categories;
  els.taskCatOptions.innerHTML = cats.map((cat) => `
    <label class="radio">
      <input type="radio" name="category" value="${esc(cat.id)}" ${cat.id === category ? "checked" : ""}>
      ${esc(cat.name)}
    </label>`).join("");
  form.elements.title.value = task ? task.title : "";
  form.elements.dueDate.value = task ? task.dueDate || "" : "";
  MyUI.syncDate(form.elements.dueDate);
  updateCount(form.elements.title, els.taskTitleCount);
  els.taskTitleError.textContent = "";
  form.elements.title.removeAttribute("aria-invalid");
  els.taskModal.showModal();
  form.elements.title.focus();
  if (task) form.elements.title.select();
}

function onTaskEditClick(e) {
  const btn = e.target.closest('[data-action="edit-task"]');
  if (!btn) return;
  const task = MyStudy.getTasks().find((t) => t.id === btn.closest(".task").dataset.id);
  if (task) openTaskModal(task.category, btn, task);
}

function onTaskAdd(e) {
  e.preventDefault();
  const form = els.taskForm;
  const title = form.elements.title.value.trim();
  const category = form.querySelector('input[name="category"]:checked').value;
  const dueDate = form.elements.dueDate.value;
  if (!title) {
    els.taskTitleError.textContent = "할 일을 입력해 주세요.";
    form.elements.title.setAttribute("aria-invalid", "true");
    form.elements.title.focus();
    return;
  }
  const id = editingTaskId || MyStudy.uid("t");
  if (editingTaskId) {

    updateTasks((all) => all.map((t) => (t.id === id ? { ...t, title, dueDate, category } : t)));
  } else {
    updateTasks((all) => [...all, { id, subjectId, category, title, dueDate, done: false }]);
  }
  const wasEditing = Boolean(editingTaskId);
  editingTaskId = null;
  taskModalOpener = null;
  els.taskModal.close();
  render();
  focusFirst(`.task[data-id="${CSS.escape(id)}"] input[type="checkbox"]`);
  MyUI.toast(wasEditing ? `'${title}'(으)로 수정했어요.` : `'${title}'을(를) 추가했어요.`);
}

function onShowDoneClick() {
  showDone = !showDone;
  localStorage.setItem(SHOW_DONE_KEY, String(showDone));
  render();
}

function bindEvents() {
  els.editBtn.addEventListener("click", () => openEditModal());
  els.editGradeBtn.addEventListener("click", () => openEditModal(true, els.editGradeBtn));
  els.scoreView.addEventListener("change", onScoreChange);
  els.editScoreBtn.addEventListener("click", () => openEditModal(true, els.editScoreBtn));
  els.addExamBtn.addEventListener("click", openExamModal);
  els.walkBubble.addEventListener("click", onWalkBubbleClick);
  els.examForm.addEventListener("submit", onExamSubmit);
  els.examForm.addEventListener("change", syncExamForm);
  els.examForm.addEventListener("input", (e) => {
    els.examError.textContent = "";
    e.target.removeAttribute("aria-invalid");
  });
  els.examModal.addEventListener("close", () => els.addExamBtn.focus());
  els.examChips.addEventListener("click", onExamClick);
  els.showDoneBtn.addEventListener("click", onShowDoneClick);

  els.catForm.addEventListener("submit", onCatSubmit);
  els.catForm.addEventListener("input", (e) => {
    updateCount(e.target, els.catNameCount);
    els.catError.textContent = "";
    e.target.removeAttribute("aria-invalid");
  });
  els.groupGrid.addEventListener("click", onCatRemove);
  document.querySelector("#addCatBtn").addEventListener("click", openCatModal);

  [els.examModal, els.catModal, els.taskModal].forEach((dialog) => {
    dialog.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]") || e.target === dialog) dialog.close();
    });
  });
  els.groupGrid.addEventListener("change", onTaskCheck);
  els.groupGrid.addEventListener("click", onTaskRemove);
  els.groupGrid.addEventListener("click", onTaskEditClick);
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
  els.taskModal.addEventListener("close", () => {

    if (!taskModalOpener) return;
    const key = taskModalOpener.dataset.addTask || taskModalOpener.dataset.prep;
    if (taskModalOpener.isConnected) taskModalOpener.focus();
    else focusFirst(`[data-add-task="${CSS.escape(key)}"]`);
  });

  window.addEventListener("storage", (e) => {
    if (e.key === MyStudy.KEYS.subjects || e.key === MyStudy.KEYS.tasks) render();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  new ResizeObserver(syncWalkTile).observe(els.walk);
  try {
    await MyStudy.init();
  } catch (err) {
    console.error(err);
    MyUI.toast("예시 데이터를 불러오지 못했어요. Live Server로 열어 주세요.");
  }
  render();
  const examId = new URLSearchParams(location.search).get("exam");
  if (examId) flashExam(examId);

  const params = new URLSearchParams(location.search);
  if (params.get("edit") === "1" && MyStudy.getSubject(subjectId)) {
    params.delete("edit");
    history.replaceState(null, "", `${location.pathname}?${params}`);
    openEditModal();
  }
});
