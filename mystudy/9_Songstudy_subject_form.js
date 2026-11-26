const MySubjectForm = (() => {
  const { icon } = MyUI;
  let els = null;
  let current = null;

  const TEMPLATE = `
  <dialog class="modal modal-wide" id="editModal" aria-labelledby="editTitle">
    <form id="editForm" novalidate>
      <div class="modal-head">
        <h2 class="modal-title" id="editTitle">과목 수정</h2>
        <button class="icon-btn" type="button" data-close aria-label="닫기"><svg class="icon" aria-hidden="true"><use href="#i-x"></use></svg></button>
      </div>

      <div class="modal-body">
        <div class="form-row">
          <label class="form-row-label" for="editName">과목명 <span class="req" aria-hidden="true">*</span></label>
          <div class="form-row-field">
            <input class="input" type="text" id="editName" name="name" maxlength="20"
                   required aria-required="true" aria-describedby="editNameCount editNameError">
            <span class="count count-end" id="editNameCount" aria-live="polite"><b>0</b>/20</span>
            <p class="form-error" id="editNameError" role="alert"></p>
          </div>
        </div>

        <div class="form-row">
          <span class="form-row-label" id="editColorLabel">과목 색상</span>
          <div class="form-row-field">
            <fieldset class="swatches" id="editColorPicker" aria-labelledby="editColorLabel"></fieldset>
          </div>
        </div>

        <p class="form-section-title">수업 정보 <span>선택</span></p>

        <div class="form-row">
          <label class="form-row-label" for="editProf">교수님</label>
          <div class="form-row-field">
            <div class="with-suffix">
              <input class="input" type="text" id="editProf" name="professor" maxlength="10" placeholder="예: 김숙명">
              <span class="suffix">교수님</span>
            </div>
          </div>
        </div>

        <div class="form-row">
          <label class="form-row-label" for="editBuilding">강의실</label>
          <div class="form-row-field">
            <div class="room-row">
              <select class="select" id="editBuilding" name="building">
                <option value="">건물 선택</option>
                <optgroup label="제1캠퍼스">
                  <option>순헌관</option>
                  <option>명신관</option>
                  <option>새힘관</option>
                  <option>진리관</option>
                  <option>행파교수회관</option>
                  <option>수련교수회관</option>
                  <option>학생회관</option>
                  <option>행정관</option>
                </optgroup>
                <optgroup label="제2창학캠퍼스">
                  <option>과학관</option>
                  <option>르네상스플라자</option>
                  <option>백주년기념관</option>
                  <option>약학대학</option>
                  <option>음악대학</option>
                  <option>미술대학</option>
                  <option>사회교육관</option>
                </optgroup>
                <option value="기타">기타 (직접 입력)</option>
              </select>
              <input class="input" type="text" name="buildingOther" maxlength="15" placeholder="건물 이름" aria-label="기타 건물 이름" hidden>
              <div class="with-suffix room-no">
                <input class="input" type="text" name="room" maxlength="6" inputmode="numeric" placeholder="301" aria-label="호수">
                <span class="suffix">호</span>
              </div>
            </div>
          </div>
        </div>

        <div class="form-row">
          <span class="form-row-label" id="editTimeLabel">수업 시간</span>
          <div class="form-row-field">
            <div class="day-picks" role="group" aria-labelledby="editTimeLabel">
              <label class="day-pick"><input type="checkbox" name="days" value="월"><span>월</span></label>
              <label class="day-pick"><input type="checkbox" name="days" value="화"><span>화</span></label>
              <label class="day-pick"><input type="checkbox" name="days" value="수"><span>수</span></label>
              <label class="day-pick"><input type="checkbox" name="days" value="목"><span>목</span></label>
              <label class="day-pick"><input type="checkbox" name="days" value="금"><span>금</span></label>
              <label class="day-pick"><input type="checkbox" name="days" value="토"><span>토</span></label>
            </div>
            <div class="time-row">
              <input class="input" type="time" name="start" step="300" aria-label="시작 시간">
              <span aria-hidden="true">~</span>
              <input class="input" type="time" name="end" step="300" aria-label="끝 시간">
            </div>
          </div>
        </div>

        <div class="form-row">
          <label class="form-row-label" for="editCredits">학점</label>
          <div class="form-row-field">
            <select class="select credits-select" id="editCredits" name="credits">
              <option value="">선택 안 함</option>
              <option value="1">1학점</option>
              <option value="2">2학점</option>
              <option value="3">3학점</option>
              <option value="4">4학점</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <label class="form-row-label" for="editMemo">메모</label>
          <div class="form-row-field">
            <textarea class="input textarea" id="editMemo" name="memo" maxlength="100" rows="2"
                      placeholder="예: 출석은 전자출결, 교재 3판" aria-describedby="editMemoCount"></textarea>
            <span class="count count-end" id="editMemoCount" aria-live="polite"><b>0</b>/100</span>
          </div>
        </div>

        <p class="form-section-title" id="gradingSection">성적 기준 <span>선택</span></p>

        <div class="form-row">
          <span class="form-row-label" id="gradeLabel">평가 비율</span>
          <div class="form-row-field">
            <div class="grade-rows" id="gradeRows" role="group" aria-labelledby="gradeLabel"></div>
            <div class="grade-rows-foot">
              <button class="btn btn-sm" type="button" id="addGradeRow"><svg class="icon" aria-hidden="true"><use href="#i-plus"></use></svg>항목 추가</button>
              <span class="count" id="gradeSum" aria-live="polite">합계 <b>0</b>/100%</span>
            </div>
            <p class="form-error" id="gradeError" role="alert"></p>
            <datalist id="gradeNames">
              <option value="중간고사"></option>
              <option value="기말고사"></option>
              <option value="과제"></option>
              <option value="출석"></option>
              <option value="발표"></option>
              <option value="퀴즈"></option>
              <option value="수업 참여"></option>
            </datalist>
          </div>
        </div>

        <div class="form-row">
          <label class="form-row-label" for="editRules">감점 기준</label>
          <div class="form-row-field">
            <textarea class="input textarea" id="editRules" name="rules" maxlength="200" rows="2"
                      placeholder="예: 결석 4회 이상 F, 지각 3회 = 결석 1회" aria-describedby="editRulesCount"></textarea>
            <span class="count count-end" id="editRulesCount" aria-live="polite"><b>0</b>/200</span>
          </div>
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn" type="button" data-close>취소</button>
        <button class="btn btn-primary" type="submit">저장</button>
      </div>
    </form>
  </dialog>
`;

  function build() {
    document.body.insertAdjacentHTML("beforeend", TEMPLATE);
    const modal = document.querySelector("#editModal");
    els = {
      modal,
      form: modal.querySelector("#editForm"),
      nameCount: modal.querySelector("#editNameCount"),
      nameError: modal.querySelector("#editNameError"),
      memoCount: modal.querySelector("#editMemoCount"),
      rulesCount: modal.querySelector("#editRulesCount"),
      colorPicker: modal.querySelector("#editColorPicker"),
      gradeRows: modal.querySelector("#gradeRows"),
      addGradeRow: modal.querySelector("#addGradeRow"),
      gradeSum: modal.querySelector("#gradeSum"),
      gradeError: modal.querySelector("#gradeError"),
      gradingSection: modal.querySelector("#gradingSection"),
    };
    MyUI.enhanceDates(modal);
    bind();
  }

  function updateCount(input, countEl) {
    countEl.innerHTML = `<b>${input.value.length}</b>/${input.maxLength}`;
  }

  function renderColorPicker(subject) {
    els.colorPicker.innerHTML = MyStudy.COLORS.map((c) => `
      <label class="swatch" title="${c.name}">
        <input type="radio" name="color" value="${c.hex}" ${c.hex === subject.color ? "checked" : ""}>
        <span style="--subject-color: ${c.hex}">${icon("check")}</span>
        <span class="sr-only">${c.name}</span>
      </label>`).join("");
  }

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
  }

  function syncBuilding() {
    els.form.elements.buildingOther.hidden = els.form.elements.building.value !== "기타";
  }

  function showGradeError(message, field) {
    els.gradeError.textContent = message;
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.focus();
    }
  }

  function open(id, { focusGrading = false, opener = null, onSaved = null } = {}) {
    if (!els) build();
    const subject = MyStudy.getSubject(id);
    if (!subject) return;
    current = { id, opener, onSaved };
    const form = els.form;
    const info = subject.info || {};
    const grading = subject.grading || {};
    form.reset();
    form.elements.name.value = subject.name;
    form.elements.memo.value = subject.memo || "";
    form.elements.professor.value = info.professor || "";

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
    updateCount(form.elements.name, els.nameCount);
    updateCount(form.elements.memo, els.memoCount);
    updateCount(form.elements.rules, els.rulesCount);
    els.nameError.textContent = "";
    els.gradeError.textContent = "";
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    els.modal.showModal();
    if (focusGrading) {
      els.gradingSection.scrollIntoView({ block: "start" });
      (els.gradeRows.querySelector("input") || els.addGradeRow).focus();
    } else {
      form.elements.name.select();
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    const { id } = current;
    const form = els.form;
    const nameInput = form.elements.name;
    const name = nameInput.value.trim();
    const memo = form.elements.memo.value.trim();
    const color = form.querySelector('input[name="color"]:checked').value;

    let error = "";
    if (!name) error = "과목명을 입력해 주세요.";
    else if (MyStudy.getSubjects().some((s) => s.name === name && s.id !== id)) error = "같은 이름의 과목이 이미 있어요.";
    if (error) {
      els.nameError.textContent = error;
      nameInput.setAttribute("aria-invalid", "true");
      nameInput.focus();
      return;
    }

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

    const subject = MyStudy.getSubject(id);
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

      items: rows.map((r) => {
        const prev = (subject.grading?.items || []).find((it) => it.name === r.name);
        return { name: r.name, percent: Number(r.percent), ...(prev?.score !== undefined ? { score: prev.score } : {}) };
      }),
      rules: form.elements.rules.value.trim(),
    };

    MyStudy.saveSubjects(MyStudy.getSubjects().map((s) => (s.id === id ? { ...s, name, color, memo, info, grading } : s)));
    els.modal.close();
    current.onSaved?.();
    MyUI.toast(`'${name}' 과목 정보를 수정했어요.`);
  }

  function bind() {
    els.form.addEventListener("submit", onSubmit);
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
    els.form.elements.building.addEventListener("change", () => {
      syncBuilding();
      if (els.form.elements.building.value === "기타") els.form.elements.buildingOther.focus();
    });
    els.form.addEventListener("input", (e) => {
      const t = e.target;
      if (t.name === "name") {
        updateCount(t, els.nameCount);
        els.nameError.textContent = "";
        t.removeAttribute("aria-invalid");
      }
      if (t.name === "memo") updateCount(t, els.memoCount);
      if (t.name === "rules") updateCount(t, els.rulesCount);
      if (t.name === "gradeName" || t.name === "gradePct") {
        updateGradeSum();
        els.gradeError.textContent = "";
        t.removeAttribute("aria-invalid");
      }
    });

    els.modal.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]") || e.target === els.modal) els.modal.close();
    });

    els.modal.addEventListener("close", () => {
      if (current?.opener?.isConnected) current.opener.focus();
    });
  }

  return { open };
})();
