/* =========================================================
   Songtudy · 과목 관리 페이지
   - 과목 추가 / 수정 / 삭제 (모달)
   - 과목별 색상 지정
   - 과목별 시험명·시험일 등록
   - 카드: 다음 시험 D-day, 남은 할 일, 진행률
     (과제·중간고사·기말고사별 자세한 개수는 과목 상세 페이지에서)
   - 정렬 방식은 localStorage에 저장해 다음 방문 때 유지
   ========================================================= */

const SORT_KEY = "myStudy.subjectSort";
const { icon, escapeHTML: esc } = MyUI;

const els = {
  summary: document.querySelector("#summary"),
  grid: document.querySelector("#subjectGrid"),
  empty: document.querySelector("#emptyState"),
  examList: document.querySelector("#examList"),
  sort: document.querySelector("#sortSelect"),
  resetBtn: document.querySelector("#resetBtn"),
  modal: document.querySelector("#subjectModal"),
  form: document.querySelector("#subjectForm"),
  modalTitle: document.querySelector("#modalTitle"),
  colorPicker: document.querySelector("#colorPicker"),
  examRows: document.querySelector("#examRows"),
  addExamRow: document.querySelector("#addExamRow"),
  formError: document.querySelector("#formError"),
  nameError: document.querySelector("#nameError"),
  nameCount: document.querySelector("#nameCount"),
  memoCount: document.querySelector("#memoCount"),
  examCount: document.querySelector("#examCount"),
  confirmModal: document.querySelector("#confirmModal"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmText: document.querySelector("#confirmText"),
  confirmOk: document.querySelector("#confirmOk"),
};

let editingId = null;     // 수정 중인 과목 id (추가일 때 null)
let onConfirm = null;     // 확인 모달에서 '확인'을 눌렀을 때 할 일

/* ---------- 목록 그리기 ---------- */
function sortSubjects(subjects, tasks) {
  const list = [...subjects];
  const mode = els.sort.value;
  if (mode === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  } else if (mode === "left") {
    const left = (s) => MyStudy.progress(tasks.filter((t) => t.subjectId === s.id)).left;
    list.sort((a, b) => left(b) - left(a));
  } else {
    // 시험 임박순: 다가오는 시험이 없는 과목은 뒤로
    const diff = (s) => MyStudy.nextExam(s)?.dd.diff ?? Infinity;
    list.sort((a, b) => diff(a) - diff(b));
  }
  return list;
}

function cardHTML(subject, tasks) {
  const p = MyStudy.progress(tasks.filter((t) => t.subjectId === subject.id));
  const exam = MyStudy.nextExam(subject);
  const detailURL = `00_mystudy_subject.html?id=${encodeURIComponent(subject.id)}`;
  const leftText = p.total === 0 ? "할 일 없음" : p.left === 0 ? "모두 완료" : `남은 할 일 ${p.left}개`;

  return `
    <li class="card subject-card" data-id="${esc(subject.id)}" style="--subject-color: ${esc(subject.color)}">
      <div class="subject-card-head">
        <h3 class="subject-name">${esc(subject.name)}</h3>
        ${exam ? `<span class="${exam.dd.className}">${exam.dd.label}</span>` : ""}
      </div>

      <p class="subject-exam">
        ${exam
          ? `<strong>${esc(exam.name)}</strong><span>${MyStudy.formatDate(exam.date)}</span>`
          : `<span>예정된 시험 없음</span>`}
      </p>

      <div class="subject-progress">
        <div class="progress-row">
          <span class="${p.total > 0 && p.left === 0 ? "is-zero" : ""}">${leftText}</span>
          <span class="num">${p.done} / ${p.total}</span>
        </div>
        <div class="progress" role="progressbar" aria-label="${esc(subject.name)} 완료율"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percent}">
          <span style="--value: ${p.percent / 100}"></span>
        </div>
      </div>

      <div class="subject-card-foot">
        <a class="btn btn-sm" href="${detailURL}">할 일 보기</a>
        <button class="icon-btn" type="button" data-action="edit" aria-label="${esc(subject.name)} 수정" title="수정">${icon("edit")}</button>
        <button class="icon-btn" type="button" data-action="delete" aria-label="${esc(subject.name)} 삭제" title="삭제">${icon("trash")}</button>
      </div>
    </li>`;
}

function renderExamList(subjects) {
  const upcoming = subjects
    .flatMap((s) => s.exams.filter((e) => e.date).map((e) => ({ ...e, subject: s, dd: MyStudy.dday(e.date) })))
    .filter((e) => e.dd.diff >= 0)
    .sort((a, b) => a.dd.diff - b.dd.diff);

  els.examList.innerHTML = upcoming.length === 0
    ? `<li class="exam-item"><span class="exam-date">예정된 시험이 없어요.</span></li>`
    : upcoming.slice(0, 5).map((e) => `
      <li class="exam-item">
        <span class="subject-dot" style="--subject-color: ${esc(e.subject.color)}"></span>
        <span class="exam-info">
          <a href="00_mystudy_subject.html?id=${encodeURIComponent(e.subject.id)}">${esc(e.subject.name)} ${esc(e.name)}</a>
          <span class="exam-date">${MyStudy.formatDate(e.date)}</span>
        </span>
        <span class="${e.dd.className}">${e.dd.label}</span>
      </li>`).join("");
  return upcoming.length;
}

function render() {
  const subjects = MyStudy.getSubjects();
  const tasks = MyStudy.getTasks();

  els.grid.innerHTML = sortSubjects(subjects, tasks).map((s) => cardHTML(s, tasks)).join("");
  els.grid.removeAttribute("aria-busy");
  els.empty.hidden = subjects.length > 0;
  els.grid.hidden = subjects.length === 0;

  const examCount = renderExamList(subjects);
  els.summary.innerHTML = `
    <span class="badge badge-plain">과목 ${subjects.length}개</span>
    <span class="badge badge-plain">다가오는 시험 ${examCount}개</span>`;
}

/* ---------- 모달: 과목 추가 · 수정 (알바몬 경력 입력 방식) ----------
   왼쪽 항목 이름 / 오른쪽 입력칸, 필수 항목 *, 글자 수 카운터,
   시험은 블록 단위로 추가·삭제 (최대 5개)
*/
const MAX_EXAMS = 5;
const EXAM_TYPES = ["중간고사", "기말고사"];
let examSeq = 0; // 시험 블록마다 고유 id를 만들기 위한 번호

function renderColorPicker(selected) {
  els.colorPicker.innerHTML = MyStudy.COLORS.map((c) => `
    <label class="swatch" title="${c.name}">
      <input type="radio" name="color" value="${c.hex}" ${c.hex === selected ? "checked" : ""}>
      <span style="--subject-color: ${c.hex}">${icon("check")}</span>
      <span class="sr-only">${c.name}</span>
    </label>`).join("");
}

// 글자 수 표시: "<b>14</b>/20"
function updateCount(input, countEl) {
  countEl.innerHTML = `<b>${input.value.length}</b>/${input.maxLength}`;
}

function updateExamCount() {
  const count = els.examRows.querySelectorAll(".exam-block-item").length;
  els.examCount.innerHTML = `<b>${count}</b>/${MAX_EXAMS}`;
  els.addExamRow.disabled = count >= MAX_EXAMS;
}

// 라디오 '기타'일 때만 시험명 입력칸, '날짜 미정'이면 날짜칸 비활성
function syncExamBlock(block) {
  const type = block.querySelector('input[type="radio"]:checked')?.value;
  const other = block.querySelector('[name="examOther"]');
  const date = block.querySelector('[name="examDate"]');
  const tbd = block.querySelector('[name="examTbd"]');
  other.disabled = type !== "기타";
  date.disabled = tbd.checked;
  if (tbd.checked) date.value = "";
}

function addExamRow(exam = { name: "", date: "" }) {
  const n = ++examSeq;
  const type = EXAM_TYPES.includes(exam.name) ? exam.name : exam.name ? "기타" : "중간고사";
  const tbd = Boolean(exam.id) && !exam.date; // 저장된 시험인데 날짜가 없으면 '날짜 미정'
  const radios = [...EXAM_TYPES, "기타"].map((t) => `
    <label class="radio"><input type="radio" name="examType${n}" value="${t}" ${t === type ? "checked" : ""}>${t}</label>`).join("");

  const block = document.createElement("div");
  block.className = "exam-block-item";
  if (exam.id) block.dataset.examId = exam.id;
  block.innerHTML = `
    <button class="icon-btn exam-block-close" type="button" data-action="remove-exam" aria-label="이 시험 삭제" title="삭제">${icon("x")}</button>
    <div class="form-row">
      <span class="form-row-label" id="examTypeLabel${n}">시험 종류 <span class="req" aria-hidden="true">*</span></span>
      <div class="form-row-field">
        <div class="radio-row" role="radiogroup" aria-labelledby="examTypeLabel${n}">
          ${radios}
          <input class="input" type="text" name="examOther" maxlength="20" placeholder="예: 쪽지시험" aria-label="기타 시험명">
        </div>
      </div>
    </div>
    <div class="form-row">
      <label class="form-row-label" for="examDate${n}">시험일 <span class="req" aria-hidden="true">*</span></label>
      <div class="form-row-field">
        <div class="date-row">
          <input class="input" type="date" id="examDate${n}" name="examDate">
          <label class="check-inline">
            <span class="check"><input type="checkbox" name="examTbd" ${tbd ? "checked" : ""}><span class="box">${icon("check")}</span></span>
            날짜 미정
          </label>
        </div>
      </div>
    </div>`;
  block.querySelector('[name="examOther"]').value = type === "기타" ? exam.name : "";
  block.querySelector('[name="examDate"]').value = exam.date || "";
  els.examRows.append(block);
  syncExamBlock(block);
  updateExamCount();
  return block;
}

// 오류 문구를 해당 칸 아래(또는 폼 아래)에 표시하고 그 칸으로 초점 이동
function showError(message, field, target = els.formError) {
  els.nameError.textContent = "";
  els.formError.textContent = "";
  els.form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  target.textContent = message;
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
  }
}

function openSubjectModal(subjectId = null) {
  editingId = subjectId;
  const subject = subjectId ? MyStudy.getSubject(subjectId) : null;

  els.form.reset();
  showError("");
  els.examRows.innerHTML = "";
  examSeq = 0;
  els.modalTitle.textContent = subject ? "과목 수정" : "과목 추가";
  els.form.elements.name.value = subject ? subject.name : "";
  els.form.elements.memo.value = subject?.memo || "";
  updateCount(els.form.elements.name, els.nameCount);
  updateCount(els.form.elements.memo, els.memoCount);

  // 새 과목은 아직 안 쓴 색을 먼저 골라 둠
  const used = MyStudy.getSubjects().map((s) => s.color);
  const firstFree = MyStudy.COLORS.find((c) => !used.includes(c.hex)) || MyStudy.COLORS[0];
  renderColorPicker(subject ? subject.color : firstFree.hex);

  (subject ? subject.exams : []).forEach((e) => addExamRow(e));
  updateExamCount();

  els.modal.showModal();
  els.form.elements.name.focus();
}

function saveSubject(event) {
  event.preventDefault();
  const nameInput = els.form.elements.name;
  const name = nameInput.value.trim();
  const memo = els.form.elements.memo.value.trim();
  const color = els.form.querySelector('input[name="color"]:checked')?.value || MyStudy.COLORS[0].hex;
  const subjects = MyStudy.getSubjects();

  if (!name) return showError("과목명을 입력해 주세요.", nameInput, els.nameError);
  if (subjects.some((s) => s.name === name && s.id !== editingId)) {
    return showError("같은 이름의 과목이 이미 있어요.", nameInput, els.nameError);
  }

  // 시험 블록 읽기: 종류(기타면 직접 입력) + 날짜(미정이면 빈 값)
  const exams = [];
  for (const block of els.examRows.querySelectorAll(".exam-block-item")) {
    const type = block.querySelector('input[type="radio"]:checked').value;
    const otherField = block.querySelector('[name="examOther"]');
    const dateField = block.querySelector('[name="examDate"]');
    const tbd = block.querySelector('[name="examTbd"]').checked;
    const examName = type === "기타" ? otherField.value.trim() : type;
    if (!examName) return showError("기타 시험명을 입력해 주세요.", otherField);
    if (!tbd && !dateField.value) return showError("시험일을 선택하거나 '날짜 미정'을 체크해 주세요.", dateField);
    exams.push({ id: block.dataset.examId || MyStudy.uid("e"), name: examName, date: tbd ? "" : dateField.value });
  }

  if (editingId) {
    MyStudy.saveSubjects(subjects.map((s) => (s.id === editingId ? { ...s, name, color, memo, exams } : s)));
    MyUI.toast(`'${name}' 과목을 수정했어요.`);
  } else {
    subjects.push({ id: MyStudy.uid("s"), name, color, memo, exams });
    MyStudy.saveSubjects(subjects);
    MyUI.toast(`'${name}' 과목을 추가했어요.`);
  }

  els.modal.close();
  render();
}

/* ---------- 확인 모달 (삭제, 초기화) ---------- */
function openConfirm({ title, text, okLabel, onOk }) {
  els.confirmTitle.textContent = title;
  els.confirmText.textContent = text;
  els.confirmOk.textContent = okLabel;
  onConfirm = onOk;
  els.confirmModal.showModal();
  els.confirmModal.querySelector("[data-close]").focus(); // 위험한 동작이라 '취소'에 먼저 초점
}

function askDeleteSubject(subjectId) {
  const subject = MyStudy.getSubject(subjectId);
  if (!subject) return;
  const count = MyStudy.getTasksOf(subjectId).length;
  openConfirm({
    title: "과목 삭제",
    text: `'${subject.name}' 과목과 할 일 ${count}개, 시험 ${subject.exams.length}개가 함께 삭제돼요.`,
    okLabel: "삭제",
    onOk: () => {
      MyStudy.saveSubjects(MyStudy.getSubjects().filter((s) => s.id !== subjectId));
      MyStudy.saveTasks(MyStudy.getTasks().filter((t) => t.subjectId !== subjectId));
      render();
      MyUI.toast(`'${subject.name}' 과목을 삭제했어요.`);
      document.querySelector('[data-action="add"]').focus();
    },
  });
}

function askReset() {
  openConfirm({
    title: "예시 데이터로 초기화",
    text: "지금까지 입력한 과목과 할 일이 모두 지워지고 예시 데이터로 바뀌어요.",
    okLabel: "초기화",
    onOk: async () => {
      await MyStudy.reset();
      render();
      MyUI.toast("예시 데이터로 초기화했어요.");
    },
  });
}

/* ---------- 이벤트 연결 ---------- */
function bindEvents() {
  // '과목 추가' 버튼 (상단, 빈 상태 두 곳)
  document.querySelectorAll('[data-action="add"]').forEach((btn) => {
    btn.addEventListener("click", () => openSubjectModal());
  });

  // 카드 버튼은 목록 하나에 이벤트 위임
  els.grid.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest(".subject-card").dataset.id;
    if (btn.dataset.action === "edit") openSubjectModal(id);
    if (btn.dataset.action === "delete") askDeleteSubject(id);
  });

  els.sort.addEventListener("change", () => {
    localStorage.setItem(SORT_KEY, els.sort.value);
    render();
  });

  els.form.addEventListener("submit", saveSubject);
  els.form.addEventListener("input", (e) => {
    els.formError.textContent = "";
    e.target.removeAttribute("aria-invalid");
    if (e.target.name === "name") {
      els.nameError.textContent = "";
      updateCount(e.target, els.nameCount);
    }
    if (e.target.name === "memo") updateCount(e.target, els.memoCount);
  });
  // 시험 종류 라디오, '날짜 미정' 체크
  els.examRows.addEventListener("change", (e) => {
    const block = e.target.closest(".exam-block-item");
    if (!block) return;
    syncExamBlock(block);
    if (e.target.type === "radio" && e.target.value === "기타") block.querySelector('[name="examOther"]').focus();
  });
  els.addExamRow.addEventListener("click", () => {
    addExamRow().querySelector('input[type="radio"]:checked').focus();
  });
  els.examRows.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="remove-exam"]');
    if (!btn) return;
    btn.closest(".exam-block-item").remove();
    updateExamCount();
    els.addExamRow.focus();
  });

  els.confirmOk.addEventListener("click", () => {
    els.confirmModal.close();
    onConfirm?.();
    onConfirm = null;
  });

  // 두 모달 공통: 닫기 버튼, 바깥 영역 클릭
  [els.modal, els.confirmModal].forEach((dialog) => {
    dialog.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]") || e.target === dialog) dialog.close();
    });
  });

  els.resetBtn.addEventListener("click", askReset);

  // 다른 탭에서 데이터가 바뀌면 다시 그리기
  window.addEventListener("storage", (e) => {
    if (e.key === MyStudy.KEYS.subjects || e.key === MyStudy.KEYS.tasks) render();
  });
}

/* ---------- 시작 ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  els.sort.value = localStorage.getItem(SORT_KEY) || "exam";
  bindEvents();
  try {
    await MyStudy.init();
  } catch (err) {
    console.error(err);
    MyUI.toast("예시 데이터를 불러오지 못했어요. Live Server로 열어 주세요.");
  }
  render();
});
