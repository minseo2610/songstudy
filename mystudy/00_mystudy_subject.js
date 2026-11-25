/* =========================================================
   Songtudy · 과목 상세 페이지 (주소: 00_mystudy_subject.html?id=과목id)
   - 할 일을 과목별 카테고리(추가·삭제 가능)로 묶어 표시
   - 시험을 추가하면 '○○ 준비' 카테고리가 자동으로 생기고, 시험 옆에 준비 진행률 표시
   - 카테고리마다 완료 개수 / 전체 개수
   - 체크한 할 일은 지워지지 않고 묶음 아래 '완료' 구역으로 내려감
     (아이폰 미리알림 방식, 완료 구역은 접고 펼 수 있음)
   - 할 일 추가(추가 창) · 완료 체크 · 삭제(되돌리기 가능)
   - 마감 임박 정도를 할 일 왼쪽 색 띠로 표시
   - 시험 추가(추가 창) · 삭제(되돌리기 가능), 과목 이름·색상·수업 정보·메모·성적 기준 수정 (연필 버튼 → 수정 창)
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
  memo: document.querySelector("#subjectMemo"),
  walk: document.querySelector("#walk"),
  walkBubble: document.querySelector("#walkBubble"),
  walkGoal: document.querySelector("#walkGoal"),
  walkDots: document.querySelector("#walkDots"),
  walkLane: document.querySelector("#walkLane"),
  editBtn: document.querySelector("#editBtn"),
  editModal: document.querySelector("#editModal"),
  editForm: document.querySelector("#editForm"),
  editNameCount: document.querySelector("#editNameCount"),
  editNameError: document.querySelector("#editNameError"),
  editMemoCount: document.querySelector("#editMemoCount"),
  editRulesCount: document.querySelector("#editRulesCount"),
  gradeRows: document.querySelector("#gradeRows"),
  addGradeRow: document.querySelector("#addGradeRow"),
  gradeSum: document.querySelector("#gradeSum"),
  gradeError: document.querySelector("#gradeError"),
  editGradeBtn: document.querySelector("#editGradeBtn"),
  gradeView: document.querySelector("#gradeView"),
  scoreSection: document.querySelector("#scoreSection"),
  scoreView: document.querySelector("#scoreView"),
  editScoreBtn: document.querySelector("#editScoreBtn"),
  subjectInfo: document.querySelector("#subjectInfo"),
  colorPicker: document.querySelector("#colorPicker"),
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
  document.title = `${subject.name} | Songtudy`;
  els.name.textContent = subject.name;
  els.crumb.textContent = subject.name;
  MyUI.setAddr(`과목관리/${subject.name}`);
  els.memo.textContent = subject.memo || "";
  els.memo.hidden = !subject.memo;
  renderInfo(subject);
  els.detail.style.setProperty("--subject-color", subject.color);
}

/* ---------- 수업 정보 (교수님 · 강의실 · 시간 · 학점) ---------- */
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

/* ---------- 성적 기준 ---------- */
const GRADE_TONES = 5; // 막대 조각 색: 핑크 진하기 5단계를 돌아가며 사용

function gradeItemOf(subject, name) {
  return (subject.grading?.items || []).find((it) => it.name === name) || null;
}

// 반영 점수 = 비중 × (내 점수 / 100). 점수를 넣은 항목만 계산
function gradeSummary(items) {
  const scored = items.filter((it) => it.score !== undefined && it.score !== "");
  const earned = scored.reduce((acc, it) => acc + (it.percent * it.score) / 100, 0);
  const counted = scored.reduce((acc, it) => acc + it.percent, 0);
  return { earned: Math.round(earned * 10) / 10, counted, scoredCount: scored.length };
}

function renderGrading(subject) {
  const { items = [], rules = "" } = subject.grading || {};

  // 위쪽(머리 카드): 성적 비율 막대 + 범례만
  els.gradeView.innerHTML = items.length ? `
    <div class="grade-bar" role="img" aria-label="평가 비율: ${esc(items.map((it) => `${it.name} ${it.percent}%`).join(", "))}">
      ${items.map((it, i) => `<span class="tone-${i % GRADE_TONES}" style="--value: ${it.percent / 100}"></span>`).join("")}
    </div>
    <ul class="grade-legend">
      ${items.map((it, i) => `<li><i class="tone-${i % GRADE_TONES}" aria-hidden="true"></i>${esc(it.name)} <b class="num">${it.percent}%</b></li>`).join("")}
    </ul>`
    : `<p class="exam-empty">시험·과제·출석 비율을 적어 두면 어디에 힘을 쏟을지 정하기 쉬워요.</p>`;

  // 맨 아래(내 성적): 항목별 점수 입력 + 감점 기준
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
  // 원형 그래프: 항목별 반영 점수(비중 × 내 점수)를 100점 원 위에 색으로, 나머지는 연한 핑크
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

// 내 점수 입력: 칸을 벗어나거나 Enter를 누르면 저장 (0~100 사이로 맞춤)
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

function renderColorPicker(subject) {
  els.colorPicker.innerHTML = MyStudy.COLORS.map((c) => `
    <label class="swatch" title="${c.name}">
      <input type="radio" name="color" value="${c.hex}" ${c.hex === subject.color ? "checked" : ""}>
      <span style="--subject-color: ${c.hex}">${icon("check")}</span>
      <span class="sr-only">${c.name}</span>
    </label>`).join("");
}

/* ---------- 기니피그 산책 ----------
   이 과목의 할 일(모든 카테고리)을 끝낸 만큼 오른쪽으로 이동
   말풍선에는 가장 가까운 시험의 D-day를 함께 표시 */
const MAX_WALK_DOTS = 12; // 할 일이 너무 많으면 중간 점은 생략

function renderWalk(subject, tasks) {
  const p = MyStudy.progress(tasks);
  const next = MyStudy.nextExam(subject);
  els.walk.style.setProperty("--walk", p.total ? p.done / p.total : 0);
  els.walkLane.setAttribute("aria-valuenow", p.percent);
  els.walkLane.setAttribute("aria-valuetext", `할 일 ${p.total}개 중 ${p.done}개 완료`);

  const taskLine = p.total ? `할 일 ${p.done}/${p.total} 완료` : "할 일을 추가하면 기니피그가 출발해요";
  // 말풍선은 짧게: 시험 이름 / 큰 D-day (할 일 수는 아래 게이지에)
  els.walkBubble.innerHTML = next
    ? `<span class="bubble-label">${esc(next.name)}</span><strong class="num">${next.dd.label}</strong>`
    : `<span class="bubble-label">다가오는 시험 없음</span><strong class="bubble-add">시험 추가하기</strong>`;
  els.walkBubble.dataset.exam = next ? next.id : "";
  els.walkBubble.setAttribute("aria-label", next
    ? `${next.name}까지 ${next.dd.label}, ${taskLine}. 시험 일정으로 이동`
    : `${taskLine}. 시험 추가하기`);
  els.walkGoal.textContent = p.total ? `할 일 ${p.total}개` : "할 일";

  // 당근 걸음 수처럼 중간 지점 점: 할 일 1개마다 하나 (지나간 점은 진하게)
  const dots = p.total > 1 && p.total <= MAX_WALK_DOTS ? p.total - 1 : 0;
  els.walkDots.innerHTML = Array.from({ length: dots }, (_, i) => {
    const at = (i + 1) / p.total;
    return `<i style="--at: ${at}" class="${p.done / p.total >= at ? "is-passed" : ""}"></i>`;
  }).join("");
}

// 말풍선 클릭: 그 시험 칸으로 스크롤하고 잠깐 강조, 시험이 없으면 시험 추가 창
function onWalkBubbleClick() {
  const id = els.walkBubble.dataset.exam;
  if (!id) {
    openExamModal();
    return;
  }
  flashExam(id);
}

// 시험 칸으로 스크롤 + 깜빡임 (과목 관리의 '다가오는 시험' 링크 ?exam=id 로 들어와도 사용)
function flashExam(id) {
  const chip = els.examChips.querySelector(`.exam-chip[data-id="${CSS.escape(id)}"]`);
  if (!chip) return;
  chip.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  chip.classList.remove("is-flash");
  void chip.offsetWidth; // 연달아 눌러도 다시 깜빡이게
  chip.classList.add("is-flash");
}

// 흘러가는 배경 한 장 너비 = 배너 높이 × 확대(1.12) × 그림 비율(2560/400)
// 배너 크기가 바뀔 때마다 다시 계산해 이음새가 어긋나지 않게
const BG_RATIO = 2560 / 400;
const BG_ZOOM = 1.12;
function syncWalkTile() {
  els.walk.style.setProperty("--tile", `${Math.round(els.walk.offsetHeight * BG_ZOOM * BG_RATIO)}px`);
}

/* ---------- 시험 일정 ---------- */
// 시험의 준비 카테고리 (사용자가 지웠으면 null)
function prepCategoryOf(exam, subject) {
  return subject.categories.find((c) => c.id === exam.catId) || null;
}

// 시험별 준비 진행률: 그 묶음의 할 일 중 몇 개를 끝냈는지
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

// 성적 기준에 같은 이름 항목이 있으면 시험 이름 옆에 비율 표시 (예: 중간고사 30%)
function weightBadge(subject, name) {
  const it = gradeItemOf(subject, name);
  return it ? ` <span class="exam-weight num">${it.percent}%</span>` : "";
}

function renderExams(subject, tasks) {
  // 날짜 순, '날짜 미정'은 맨 뒤
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

function renderGroups(tasks, subject) {
  els.groupGrid.innerHTML = "";

  subject.categories.forEach((cat) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const list = tasks.filter((t) => t.category === cat.id);
    const p = MyStudy.progress(list);
    const todo = list.filter((t) => !t.done).sort(byDue);
    const done = list.filter((t) => t.done);  // 완료한 순서대로 (먼저 끝낸 것이 위)
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

    // 남은 할 일 → 바로 아래 완료한 할 일
    node.querySelector(".todo-list").innerHTML = todo.length
      ? todo.map(taskHTML).join("")
      : `<li class="task-empty">${list.length ? "남은 할 일이 없어요." : "할 일이 없어요."}</li>`;

    // 완료 구역: 완료한 할 일이 있고, '완료한 할 일 보기'가 켜져 있을 때만
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

  // 카테고리가 하나도 없을 때 안내
  if (subject.categories.length === 0) {
    els.groupGrid.innerHTML = `<p class="group-empty">과제, 퀴즈 준비처럼 카테고리를 만들고 그 안에 할 일을 넣어 보세요. 오른쪽 위 <b>카테고리 추가</b>를 눌러 시작해요.</p>`;
  }
}

function renderShowDone() {
  els.showDoneBtn.setAttribute("aria-pressed", String(showDone));
}

/* ---------- 전체 그리기 ---------- */
function render() {
  const subject = MyStudy.ensureCategories(subjectId); // 예전 데이터·새 시험의 카테고리 정리
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

/* 성적 기준 입력 줄: [항목 이름][비율 %][✕] */
function addGradeRow(item = { name: "", percent: "" }) {
  const row = document.createElement("div");
  row.className = "grade-row";
  row.innerHTML = `
    <input class="input" type="text" name="gradeName" maxlength="10" list="gradeNames" placeholder="예: 중간고사" aria-label="평가 항목 이름">
    <div class="with-suffix grade-pct">
      <input class="input" type="number" name="gradePct" min="0" max="100" step="5" inputmode="numeric" placeholder="30" aria-label="비율">
      <span class="suffix">%</span>
    </div>
    <button class="icon-btn" type="button" data-action="remove-grade" aria-label="이 항목 삭제" title="삭제">${icon("x")}</button>`;
  row.querySelector('[name="gradeName"]').value = item.name;
  row.querySelector('[name="gradePct"]').value = item.percent;
  els.gradeRows.append(row);
  updateGradeSum();
  return row;
}

function readGradeRows() {
  return [...els.gradeRows.querySelectorAll(".grade-row")].map((row) => ({
    row,
    name: row.querySelector('[name="gradeName"]').value.trim(),
    percent: row.querySelector('[name="gradePct"]').value,
  }));
}

function updateGradeSum() {
  const sum = readGradeRows().reduce((acc, r) => acc + (Number(r.percent) || 0), 0);
  els.gradeSum.innerHTML = `합계 <b>${sum}</b>/100%`;
  els.gradeSum.classList.toggle("is-full", sum === 100);
  return sum;
}

function syncBuilding() {
  const form = els.editForm;
  const other = form.elements.buildingOther;
  other.hidden = form.elements.building.value !== "기타";
}

function openEditModal(focusGrading = false) {
  const subject = MyStudy.getSubject(subjectId);
  const form = els.editForm;
  const info = subject.info || {};
  const grading = subject.grading || {};
  form.reset();
  form.elements.name.value = subject.name;
  form.elements.memo.value = subject.memo || "";
  form.elements.professor.value = info.professor || "";
  // 목록에 없는 건물은 '기타'로 선택하고 이름을 직접 입력칸에
  const known = [...form.elements.building.options].some((o) => o.value === info.building && o.value !== "기타");
  form.elements.building.value = !info.building ? "" : known ? info.building : "기타";
  form.elements.buildingOther.value = known ? "" : info.building || "";
  form.elements.room.value = info.room || "";
  form.querySelectorAll('[name="days"]').forEach((box) => { box.checked = (info.days || []).includes(box.value); });
  form.elements.start.value = info.start || "";
  form.elements.end.value = info.end || "";
  form.elements.credits.value = info.credits || "";
  form.elements.rules.value = grading.rules || "";
  els.gradeRows.innerHTML = "";
  (grading.items || []).forEach((it) => addGradeRow(it));
  updateGradeSum();
  syncBuilding();
  renderColorPicker(subject);
  updateCount(form.elements.name, els.editNameCount);
  updateCount(form.elements.memo, els.editMemoCount);
  updateCount(form.elements.rules, els.editRulesCount);
  els.editNameError.textContent = "";
  els.gradeError.textContent = "";
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  els.editModal.showModal();
  if (focusGrading) {
    document.querySelector("#gradingSection").scrollIntoView({ block: "start" });
    (els.gradeRows.querySelector("input") || els.addGradeRow).focus();
  } else {
    form.elements.name.select();
  }
}

function showGradeError(message, field) {
  els.gradeError.textContent = message;
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
  }
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

  // 성적 기준: 빈 줄은 버리고, 이름·비율 확인 후 합계 100%
  els.gradeError.textContent = "";
  const rows = readGradeRows().filter((r) => r.name || r.percent !== "");
  for (const r of rows) {
    if (!r.name) return showGradeError("평가 항목 이름을 입력해 주세요.", r.row.querySelector('[name="gradeName"]'));
    if (r.percent === "") return showGradeError(`${r.name}의 비율을 입력해 주세요.`, r.row.querySelector('[name="gradePct"]'));
  }
  const names = rows.map((r) => r.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return showGradeError(`'${dup}' 항목이 두 번 들어가 있어요.`);
  const sum = rows.reduce((acc, r) => acc + Number(r.percent), 0);
  if (rows.length && sum !== 100) return showGradeError(`합계가 100%가 되도록 맞춰 주세요. (지금 ${sum}%)`, rows.at(-1).row.querySelector('[name="gradePct"]'));

  const building = form.elements.building.value === "기타" ? form.elements.buildingOther.value.trim() : form.elements.building.value;
  const info = {
    professor: form.elements.professor.value.trim(),
    building,
    room: form.elements.room.value.trim(),
    days: [...form.querySelectorAll('[name="days"]:checked')].map((box) => box.value),
    start: form.elements.start.value,
    end: form.elements.end.value,
    credits: form.elements.credits.value,
  };
  const grading = {
    // 이름이 같은 항목은 입력해 둔 내 점수 유지
    items: rows.map((r) => {
      const prev = (MyStudy.getSubject(subjectId).grading?.items || []).find((it) => it.name === r.name);
      return { name: r.name, percent: Number(r.percent), ...(prev?.score !== undefined ? { score: prev.score } : {}) };
    }),
    rules: form.elements.rules.value.trim(),
  };

  updateSubject({ name, color, memo, info, grading });
  els.editModal.close();
  render();
  MyUI.toast("과목 정보를 수정했어요.");
}

/* ---------- 이벤트: 시험 추가 창 ---------- */
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
  // 이미 중간고사가 있으면 기말고사를 먼저 골라 둠
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

  // catId 없이 저장 → render()의 ensureCategories가 '○○ 준비' 카테고리를 만들어 연결
  updateSubject({ exams: [...subject.exams, { id: MyStudy.uid("e"), name, date }] });
  els.examModal.close();
  render();
  MyUI.toast(`${name} 일정을 추가했어요.`);
}

function onExamClick(e) {
  // 준비할 일이 없는 시험: 그 카테고리로 할 일 추가 창 열기
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
  // 시험만 지우고 준비 카테고리와 할 일은 남겨 둠
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

/* ---------- 이벤트: 카테고리 ---------- */
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
  focusFirst(`[data-add-task="${CSS.escape(id)}"]`); // 새 카테고리의 '+ 할 일'로
  MyUI.toast(`'${name}' 카테고리를 만들었어요.`);
}

// 카테고리 삭제: 안의 할 일도 함께 삭제 (되돌리기 가능)
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
    // 연결된 시험은 null로 표시 → 다시 자동으로 만들지 않음
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
    // 옮겨진 같은 할 일로 초점 복귀 (완료 구역이 접혀 있으면 같은 카테고리 '할 일' 버튼으로)
    focusFirst(`.task[data-id="${CSS.escape(id)}"] input[type="checkbox"]`,
               `[data-add-task="${CSS.escape(task.category)}"]`);
  }, reduceMotion ? 0 : SETTLE_MS);

  // 묶음을 모두 끝냈을 때 칭찬
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
  // 옆 할 일로 초점 이동, 없으면 같은 카테고리 '할 일' 버튼으로
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

/* ---------- 할 일 추가 창 ---------- */
let taskModalOpener = null; // 창을 닫으면 초점을 돌려줄 버튼

function openTaskModal(category, opener) {
  taskModalOpener = opener;
  const form = els.taskForm;
  form.reset();
  const cats = MyStudy.getSubject(subjectId).categories;
  els.taskCatOptions.innerHTML = cats.map((cat) => `
    <label class="radio">
      <input type="radio" name="category" value="${esc(cat.id)}" ${cat.id === category ? "checked" : ""}>
      ${esc(cat.name)}
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
  els.editBtn.addEventListener("click", () => openEditModal());
  els.editGradeBtn.addEventListener("click", () => openEditModal(true));
  els.scoreView.addEventListener("change", onScoreChange);
  els.editScoreBtn.addEventListener("click", () => openEditModal(true));
  els.addGradeRow.addEventListener("click", () => addGradeRow().querySelector("input").focus());
  els.gradeRows.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="remove-grade"]');
    if (!btn) return;
    const row = btn.closest(".grade-row");
    const next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    updateGradeSum();
    (next?.querySelector("input") || els.addGradeRow).focus();
  });
  els.editForm.elements.building.addEventListener("change", () => {
    syncBuilding();
    if (els.editForm.elements.building.value === "기타") els.editForm.elements.buildingOther.focus();
  });
  els.editForm.addEventListener("submit", onEditSubmit);
  els.editForm.addEventListener("input", (e) => {
    if (e.target.name === "name") {
      updateCount(e.target, els.editNameCount);
      els.editNameError.textContent = "";
      e.target.removeAttribute("aria-invalid");
    }
    if (e.target.name === "memo") updateCount(e.target, els.editMemoCount);
    if (e.target.name === "rules") updateCount(e.target, els.editRulesCount);
    if (e.target.name === "gradeName" || e.target.name === "gradePct") {
      updateGradeSum();
      els.gradeError.textContent = "";
      e.target.removeAttribute("aria-invalid");
    }
  });
  // 창이 닫히면 연필 버튼으로 초점 돌려주기
  els.editModal.addEventListener("close", () => els.editBtn.focus());
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

  // 모든 창: 취소·닫기 버튼, 창 바깥(뒤 배경) 클릭으로 닫기. Esc는 dialog가 알아서 닫음
  [els.editModal, els.examModal, els.catModal, els.taskModal].forEach((dialog) => {
    dialog.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]") || e.target === dialog) dialog.close();
    });
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
  els.taskModal.addEventListener("close", () => {
    // 취소했을 때만 원래 버튼으로 (다시 그려졌으면 같은 묶음의 버튼을 찾아서)
    if (!taskModalOpener) return;
    const key = taskModalOpener.dataset.addTask || taskModalOpener.dataset.prep;
    if (taskModalOpener.isConnected) taskModalOpener.focus();
    else focusFirst(`[data-add-task="${CSS.escape(key)}"]`);
  });

  // 다른 탭(과목 관리, 플래너 등)에서 데이터가 바뀌면 다시 그리기
  window.addEventListener("storage", (e) => {
    if (e.key === MyStudy.KEYS.subjects || e.key === MyStudy.KEYS.tasks) render();
  });
}

/* ---------- 시작 ---------- */
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
  // 과목 관리의 연필(edit=1)로 들어오면 수정 창 바로 열기. 새로고침 때 또 열리지 않게 주소에서 지움
  const params = new URLSearchParams(location.search);
  if (params.get("edit") === "1" && MyStudy.getSubject(subjectId)) {
    params.delete("edit");
    history.replaceState(null, "", `${location.pathname}?${params}`);
    openEditModal();
  }
});
