/* Songtudy 홈 · 외부 라이브러리 없이 수업의 JavaScript로 구현합니다.
   강의 9~10: 함수, 조건문, 배열·객체, Date, Math, setTimeout
   강의 11~12: DOM 조회·생성, 속성 변경, addEventListener, 이벤트 위임
   강의 13: 공통 MyStudy.init()의 Fetch·JSON, JSON.parse/stringify, localStorage

   공통 데이터: myStudy.subjects / myStudy.tasks (기존 MyStudy API 사용)
   홈 학습 기록: songstudy.studySessions.v1
     [{ id, subjectId, subjectName, color, date: 'YYYY-MM-DD', durationMs }]
   홈 타이머 상태: songstudy.home.timer.v1 / 완료 숨기기: songstudy.home.hideDone
   통계 페이지에서도 같은 학습 기록 키를 읽으면 타이머 기록을 재사용할 수 있습니다.
   새로고침·탭 이동 중에도 실행한 타이머는 종료 시각까지 계속 진행합니다.
   기존 파일은 수정하지 않고 이 페이지의 메뉴 링크만 DOM에서 연결합니다. */

(function () {
  "use strict";

  const KEYS = {
    sessions: "songstudy.studySessions.v1",
    timer: "songstudy.home.timer.v1",
    hideDone: "songstudy.home.hideDone"
  };
  const tabId = "home-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const $ = (id) => document.getElementById(id);
  const esc = MyUI.escapeHTML;
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  let ready = false;
  let timer = null;
  let tickId = null;
  let viewedDate = new Date();
  let openedSubjects = new Set();
  let initialSubjects = true;
  let storageWarningShown = false;

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
    $("todayDate").textContent = now.getFullYear() + ". " + (now.getMonth() + 1) + ". " + now.getDate() + " (" + days[now.getDay()] + ")";
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
      home: "9_songstudy_home.html", subjects: "00_mystudy_subjects.html",
      planner: "#weekly-planner", timer: "#study-timer", report: "#study-report"
    };
    document.querySelectorAll("[data-nav] .tab").forEach(function (tab, index) {
      const page = MyUI.PAGES[index];
      if (page && routes[page.key]) tab.setAttribute("href", routes[page.key]);
    });
    const brand = document.querySelector("[data-nav] .brand");
    if (brand) brand.setAttribute("href", routes.home);
  }

  function createTimer(subjectId, minutes) {
    return {
      version: 1, id: MyStudy.uid("focus-"), subjectId: subjectId || "",
      durationMinutes: minutes, totalMs: minutes * 60000, remainingMs: minutes * 60000,
      running: false, endAt: 0, accountedAt: 0, updatedAt: Date.now(), owner: tabId
    };
  }

  function validTimer(value) {
    return value && value.version === 1 && typeof value.id === "string" &&
      typeof value.subjectId === "string" && [15, 25, 50].includes(value.durationMinutes) &&
      value.totalMs === value.durationMinutes * 60000 && Number.isFinite(value.remainingMs) &&
      value.remainingMs >= 0 && value.remainingMs <= value.totalMs &&
      typeof value.running === "boolean" && Number.isFinite(value.endAt) &&
      Number.isFinite(value.accountedAt) && (!value.running || (value.accountedAt > 0 && value.endAt >= value.accountedAt));
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
          id: id, subjectId: timer.subjectId, subjectName: subject ? subject.name : "이전 과목",
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
    const end = Math.min(Date.now(), timer.endAt);
    if (end > timer.accountedAt) {
      recordTime(timer.accountedAt, end);
      timer.accountedAt = end;
    }
    timer.remainingMs = Math.max(0, timer.endAt - Date.now());
    if (timer.remainingMs === 0) {
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
    const remaining = timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.remainingMs;
    const seconds = Math.ceil(remaining / 1000);
    $("timerDisplay").textContent = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
    $("timerTrack").style.setProperty("--value", Math.max(0, Math.min(1, 1 - remaining / timer.totalMs)));
    $("timerSubject").value = timer.subjectId;
    $("timerDuration").value = timer.durationMinutes;
    const inProgress = timer.running || (remaining > 0 && remaining < timer.totalMs);
    $("timerSubject").disabled = !ready || inProgress;
    $("timerDuration").disabled = !ready || inProgress;
    $("timerStart").disabled = !ready || !timer.subjectId || storageWarningShown;
    $("timerReset").disabled = !ready || storageWarningShown;
    $("timerStartLabel").textContent = timer.running ? "일시정지" : remaining === 0 ? "다시 집중" : inProgress ? "이어서 집중" : "집중 시작";
    const subject = MyStudy.getSubject(timer.subjectId);
    $("timerState").textContent = !subject ? "과목 관리에서 공부할 과목을 추가해 주세요" : timer.running ? subject.name + "에 집중하고 있어요" : remaining === 0 ? "잘했어요! 오늘의 집중이 차곡차곡 쌓였어요" : inProgress ? "잠시 쉬는 중 · 준비되면 이어서 집중해요" : "공부할 과목을 고르고 시작해 보세요";
    document.querySelector(".home-timer-card").classList.toggle("is-running", timer.running);
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
        if (timer.remainingMs === 0) timer = createTimer($("timerSubject").value, Number($("timerDuration").value));
        if (!MyStudy.getSubject(timer.subjectId)) return;
        timer.running = true;
        timer.endAt = Date.now() + timer.remainingMs;
        timer.accountedAt = Date.now();
        saveTimer();
        $("timerAnnouncement").textContent = "집중 타이머를 시작했어요.";
      }
      renderTimer();
      renderReport();
    } catch (error) { storageFailure(error); renderTimer(); }
  }

  function resetTimer() {
    try {
      adoptTimer();
      settleTimer();
      timer = createTimer(timer.subjectId, timer.durationMinutes);
      saveTimer();
      renderTimer();
      renderReport();
      MyUI.toast("타이머를 다시 설정했어요. 공부한 기록은 그대로 남아요.");
    } catch (error) { storageFailure(error); renderTimer(); }
  }

  function changeTimerOptions() {
    try {
      timer = createTimer($("timerSubject").value, Number($("timerDuration").value));
      saveTimer();
      renderTimer();
    } catch (error) { storageFailure(error); }
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
    $("timerSubject").innerHTML = options || '<option value="">등록된 과목 없음</option>';
    $("taskSubject").innerHTML = options;
    $("addTask").disabled = !subjects.length;
    if (timer && !subjects.some(function (subject) { return subject.id === timer.subjectId; })) {
      if (timer.running && timer.owner === tabId) settleTimer();
      timer = createTimer(subjects[0] ? subjects[0].id : "", timer.durationMinutes);
      saveTimer();
    }
    if (initialSubjects && subjects.length) {
      openedSubjects.add(timer.subjectId || subjects[0].id);
      initialSubjects = false;
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
    $("toggleDone").setAttribute("aria-pressed", String(hideDone));
    $("toggleDone").textContent = hideDone ? "완료 표시" : "완료 숨기기";
    const progress = MyStudy.progress(tasks);
    $("taskSummary").textContent = "남은 할 일 " + progress.left + "개 · 전체 " + progress.total + "개";
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
    }).join("") : '<div class="empty"><p>아직 등록한 과목이 없어요.</p><a href="00_mystudy_subjects.html">첫 과목 추가하기</a></div>';
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
      return '<li class="home-report-row" data-color="' + esc(subject.color) + '"><div class="home-report-label"><span><i class="subject-dot" aria-hidden="true"></i>' + esc(subject.name) + '</span><strong>' + studyDuration(duration) + '</strong></div>' +
        '<div class="home-report-bar" role="progressbar" aria-label="' + esc(subject.name) + ' 월간 집중 시간 비율" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(ratio * 100) + '" aria-valuetext="' + studyDuration(duration) + ', 전체의 ' + Math.round(ratio * 100) + '%"><span data-value="' + ratio + '"></span></div></li>';
    }).join("");
    applyColors($("reportList"));
    $("reportNote").textContent = total ? "막대는 이번 달 전체 집중 시간 중 각 과목의 비율이에요." : "아직 기록이 없어요. 타이머로 첫 집중 시간을 쌓아 보세요.";
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
      const exams = [];
      subjects.forEach(function (subject) {
        (subject.exams || []).forEach(function (exam) {
          if (exam.date === day.date) exams.push({ name: exam.name, subjectName: subject.name });
        });
      });
      return '<section class="home-day' + (isToday ? ' is-today' : '') + '" aria-label="' + esc(MyStudy.formatDate(day.date)) + '"><div class="home-day-head"><h3>' + ["월", "화", "수", "목", "금", "토", "일"][index] + ' <time datetime="' + day.date + '">' + localDate(day.date).getDate() + '</time></h3>' + (isToday ? '<span>오늘</span>' : '') + '</div><div class="home-day-content"><ul>' + day.tasks.map(function (task) {
        const subject = MyStudy.getSubject(task.subjectId);
        const id = "week-task-" + task.id;
        return '<li class="home-week-task' + (task.done ? ' is-done' : '') + '" data-color="' + esc(subject ? subject.color : "") + '"><span class="check"><input type="checkbox" id="' + esc(id) + '" data-task-id="' + esc(task.id) + '"' + (task.done ? ' checked' : '') + '><span class="box">' + MyUI.icon("check") + '</span></span><label for="' + esc(id) + '"><span>' + esc(task.title) + '</span><small>' + esc(subject ? subject.name : "이전 과목") + '</small></label></li>';
      }).join("") + '</ul>' + exams.map(function (exam) {
        return '<div class="home-exam"><strong>시험 · ' + esc(exam.name) + '</strong><span>' + esc(exam.subjectName) + '</span></div>';
      }).join("") + (!day.tasks.length && !exams.length ? '<p class="home-week-empty">등록된 일정 없음</p>' : '') + '</div></section>';
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
      timer = validTimer(stored) ? stored : createTimer(subjects[0] ? subjects[0].id : "", 25);
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
    $("timerReset").addEventListener("click", resetTimer);
    $("timerSubject").addEventListener("change", changeTimerOptions);
    $("timerDuration").addEventListener("change", changeTimerOptions);
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
    $("addTask").addEventListener("click", openTaskModal);
    $("taskForm").addEventListener("submit", saveTask);
    ["closeTaskModal", "cancelTask"].forEach(function (id) { $(id).addEventListener("click", function () { $("taskModal").close(); }); });
    $("taskModal").addEventListener("click", function (event) { if (event.target === $("taskModal")) $("taskModal").close(); });
    $("taskModal").addEventListener("close", function () { $("addTask").focus(); });
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
