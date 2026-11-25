/* =========================================================
   Songtudy · 과목/할 일 데이터 모듈
   - 처음 방문: fetch로 JSON 기본 데이터를 불러와 localStorage에 저장
   - 다음 방문부터: localStorage에 저장된 사용자 기록을 사용
   - 다른 팀원 페이지(플래너, 타이머, 홈)도 이 파일을 연결하면
     같은 과목·할 일 데이터를 읽을 수 있습니다.
   - 화면 관련 도우미(토스트, 아이콘)는 00_mystudy_common.js 에 있습니다.
   - 발표 전 데이터 초기화: 콘솔에서 MyStudy.reset()

   localStorage 키
     myStudy.subjects : [{ id, name, color, memo,
                          categories: [{ id, name }],          ← 할 일 카테고리 (과목마다 추가·삭제)
                          exams: [{ id, name, date, catId }] }]
                        date가 ""이면 '날짜 미정'
                        catId: 이 시험의 준비 카테고리 id (null이면 사용자가 카테고리를 지운 것)
     myStudy.tasks    : [{ id, subjectId, category, title, dueDate, done }]
                        category: 그 과목 categories 의 id
   예전 데이터(categories 없음)는 ensureCategories()가 처음 열 때 채워 줍니다.
   ========================================================= */

const MyStudy = (() => {
  const KEYS = {
    subjects: "myStudy.subjects",
    tasks: "myStudy.tasks",
  };
  const SEED_URL = "00_mystudy_subjects.json";

  const CATEGORIES = [
    { key: "assignment", label: "과제" },
    { key: "midterm", label: "중간고사 준비" },
    { key: "final", label: "기말고사 준비" },
  ];

  // 시험 이름 → 예전 기본 카테고리 id (예전 데이터 연결용)
  const EXAM_KEYWORD = { midterm: "중간", final: "기말" };

  const COLORS = [
    { hex: "#e5508c", name: "체리" },
    { hex: "#f08a74", name: "피치" },
    { hex: "#e8b23a", name: "버터" },
    { hex: "#5fb89a", name: "민트" },
    { hex: "#5ba7d9", name: "하늘" },
    { hex: "#a58bd6", name: "라벤더" },
    { hex: "#b98a74", name: "코코아" },
    { hex: "#8e8790", name: "그레이" },
  ];

  /* ---------- 저장소 ---------- */
  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn("localStorage 읽기 실패:", key, err);
      return null;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // 저장된 데이터가 없을 때만 JSON 기본 데이터를 불러옵니다.
  async function init() {
    if (read(KEYS.subjects) && read(KEYS.tasks)) return;
    const res = await fetch(SEED_URL);
    if (!res.ok) throw new Error(`기본 데이터 불러오기 실패 (${res.status})`);
    const data = await res.json();
    write(KEYS.subjects, data.subjects);
    write(KEYS.tasks, data.tasks);
  }

  // 기본 데이터로 되돌리기 (발표·테스트용)
  async function reset() {
    localStorage.removeItem(KEYS.subjects);
    localStorage.removeItem(KEYS.tasks);
    await init();
  }

  const getSubjects = () => read(KEYS.subjects) || [];
  const getTasks = () => read(KEYS.tasks) || [];
  const saveSubjects = (list) => write(KEYS.subjects, list);
  const saveTasks = (list) => write(KEYS.tasks, list);

  const getSubject = (id) => getSubjects().find((s) => s.id === id) || null;
  const getTasksOf = (subjectId) => getTasks().filter((t) => t.subjectId === subjectId);

  function uid(prefix) {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  /* ---------- 날짜 ---------- */
  function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function parseDate(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // D-day 계산: { diff, label, className }
  function dday(dateStr) {
    const diff = Math.round((parseDate(dateStr) - startOfToday()) / 86400000);
    let label = "D-DAY";
    if (diff > 0) label = `D-${diff}`;
    if (diff < 0) label = `D+${-diff}`;
    let className = "badge";
    if (diff >= 0 && diff <= 3) className += " dday-soon";
    if (diff < 0) className += " dday-past";
    return { diff, label, className };
  }

  // "2026-11-27" → "11월 27일 (금)"
  function formatDate(dateStr, withDay = true) {
    const d = parseDate(dateStr);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const base = `${d.getMonth() + 1}월 ${d.getDate()}일`;
    return withDay ? `${base} (${days[d.getDay()]})` : base;
  }

  // 오늘 이후 가장 가까운 시험 (없으면 null)
  function nextExam(subject) {
    return subject.exams
      .filter((e) => e.date) // 날짜 미정인 시험은 D-day 계산에서 제외
      .map((e) => ({ ...e, dd: dday(e.date) }))
      .filter((e) => e.dd.diff >= 0)
      .sort((a, b) => a.dd.diff - b.dd.diff)[0] || null;
  }

  /* ---------- 할 일 카테고리 ---------- */
  // 과목의 카테고리를 정리해서 저장
  // 1) categories가 없으면(예전 데이터): '과제' + 할 일이 있는 예전 기본 카테고리로 시작
  // 2) 준비 카테고리가 아직 없는 시험(catId가 undefined)은 '○○ 준비' 카테고리를 만들어 연결
  //    → 시험을 등록하면 그 시험 준비 카테고리가 자동으로 생김
  function ensureCategories(subjectId) {
    const subjects = getSubjects();
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) return null;
    let changed = false;

    if (!Array.isArray(subject.categories)) {
      const used = new Set(getTasksOf(subjectId).map((t) => t.category));
      subject.categories = CATEGORIES
        .filter((c) => c.key === "assignment" || used.has(c.key))
        .map((c) => ({ id: c.key, name: c.label }));
      changed = true;
    }

    subject.exams.forEach((exam) => {
      if (exam.catId !== undefined) return;
      const legacyKey = Object.keys(EXAM_KEYWORD).find((k) => exam.name.includes(EXAM_KEYWORD[k]));
      let cat = subject.categories.find((c) => c.id === legacyKey);
      if (!cat) {
        cat = { id: uid("c"), name: `${exam.name} 준비` };
        subject.categories.push(cat);
      }
      exam.catId = cat.id;
      changed = true;
    });

    if (changed) saveSubjects(subjects);
    return subject;
  }

  // 카테고리 이름 (다른 페이지에서 할 일의 묶음 이름을 보여 줄 때)
  function categoryName(subject, catId) {
    const cat = (subject.categories || []).find((c) => c.id === catId)
             || CATEGORIES.find((c) => c.key === catId);
    return cat ? (cat.name || cat.label) : "";
  }

  // 할 일 진행 상황: { done, total, left, percent }
  function progress(tasks) {
    const done = tasks.filter((t) => t.done).length;
    const total = tasks.length;
    return { done, total, left: total - done, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  return {
    KEYS, CATEGORIES, COLORS,
    init, reset,
    getSubjects, getTasks, saveSubjects, saveTasks, getSubject, getTasksOf,
    uid, dday, formatDate, nextExam, progress,
    ensureCategories, categoryName,
  };
})();
