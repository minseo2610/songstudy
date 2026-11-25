/* =========================================================
   Songtudy · 과목/할 일 데이터 모듈
   - 처음 방문: fetch로 JSON 기본 데이터를 불러와 localStorage에 저장
   - 다음 방문부터: localStorage에 저장된 사용자 기록을 사용
   - 다른 팀원 페이지(플래너, 타이머, 홈)도 이 파일을 연결하면
     같은 과목·할 일 데이터를 읽을 수 있습니다.
   - 화면 관련 도우미(토스트, 아이콘)는 00_mystudy_common.js 에 있습니다.
   - 발표 전 데이터 초기화: 콘솔에서 MyStudy.reset()

   localStorage 키
     myStudy.subjects : [{ id, name, color, memo, exams: [{ id, name, date }] }]
                        date가 ""이면 '날짜 미정' 
     myStudy.tasks    : [{ id, subjectId, category, title, dueDate, done }]
   category: "assignment"(과제) | "midterm"(중간고사) | "final"(기말고사)
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
  };
})();
