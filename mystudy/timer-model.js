/* DOM에서 분리한 시간 계산. 경과 시간은 실제 시각 차이로 계산합니다. */
const TimerModel = (() => {
  function create({ mode = "stopwatch", durationSeconds = 1500, subjectId = "", taskId = "", subjectName = "", taskTitle = "" } = {}) {
    return { mode, durationSeconds, subjectId, taskId, subjectName, taskTitle, accumulatedMs: 0, runningSince: null, startedAt: null, pausedAt: null, sessionId: null };
  }

  function restore(value) {
    if (!value || !["stopwatch", "focus"].includes(value.mode)) return null;
    if (!Number.isInteger(value.durationSeconds) || value.durationSeconds < 60 || value.durationSeconds > 10800) return null;
    if (!Number.isFinite(value.accumulatedMs) || value.accumulatedMs < 0) return null;
    for (const key of ["runningSince", "startedAt", "pausedAt"]) {
      if (value[key] !== null && (!Number.isFinite(value[key]) || value[key] < 0)) return null;
    }
    if (typeof value.subjectId !== "string" || typeof value.taskId !== "string") return null;
    if (value.sessionId !== null && typeof value.sessionId !== "string") return null;
    if (value.runningSince !== null && (value.startedAt === null || !value.sessionId)) return null;
    return { ...create(value), ...value, subjectName: typeof value.subjectName === "string" ? value.subjectName : "", taskTitle: typeof value.taskTitle === "string" ? value.taskTitle : "" };
  }

  function elapsed(state, now = Date.now()) {
    const active = state.runningSince === null ? 0 : Math.max(0, now - state.runningSince);
    const total = Math.max(0, state.accumulatedMs + active);
    return state.mode === "focus" ? Math.min(total, state.durationSeconds * 1000) : total;
  }

  function isComplete(state, now = Date.now()) {
    return state.mode === "focus" && elapsed(state, now) >= state.durationSeconds * 1000;
  }

  function start(state, now = Date.now()) {
    if (state.runningSince !== null || isComplete(state, now)) return { ...state };
    return { ...state, runningSince: now, startedAt: state.startedAt ?? now, pausedAt: null };
  }

  function pause(state, now = Date.now()) {
    if (state.runningSince === null) return { ...state };
    const pausedAt = isComplete(state, now)
      ? Math.min(now, state.runningSince + Math.max(0, state.durationSeconds * 1000 - state.accumulatedMs))
      : now;
    return { ...state, accumulatedMs: elapsed(state, now), runningSince: null, pausedAt };
  }

  function toSession(state, now = Date.now()) {
    const durationSeconds = Math.floor(elapsed(state, now) / 1000);
    if (!state.sessionId || !state.subjectId || state.startedAt === null || durationSeconds < 1) return null;
    const completed = isComplete(state, now);
    let end = state.runningSince === null ? state.pausedAt ?? now : now;
    if (completed && state.runningSince !== null) {
      end = Math.min(now, state.runningSince + Math.max(0, state.durationSeconds * 1000 - state.accumulatedMs));
    }
    return { id: state.sessionId, subjectId: state.subjectId, taskId: state.taskId || null, subjectName: state.subjectName, taskTitle: state.taskTitle, mode: state.mode, durationSeconds, completed, startedAt: new Date(state.startedAt).toISOString(), endedAt: new Date(end).toISOString() };
  }

  function format(seconds, withHours = true) {
    const whole = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor(whole / 60) % 60;
    const secs = whole % 60;
    if (!withHours) return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return { create, restore, elapsed, isComplete, start, pause, toSession, format };
})();
