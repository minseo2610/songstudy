const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../mystudy/9_Songstudy_timer_model.js"), "utf8"), context);
const timer = vm.runInContext("TimerModel", context);
const start = Date.parse("2026-11-25T01:00:00Z");
const settings = { subjectId: "subject-web", subjectName: "웹프로그래밍", taskId: "task-web-final-project", taskTitle: "기말 프로젝트 과제" };
const active = (options = {}) => timer.start({ ...timer.create({ ...settings, ...options }), sessionId: "session-test" }, start);

test("stopwatch uses wall-clock elapsed time even when no interval ticks run", () => {
  const state = active();
  assert.equal(timer.elapsed(state, start + 3_725_000), 3_725_000);
  assert.equal(timer.format(timer.elapsed(state, start + 3_725_000) / 1000), "01:02:05");
  assert.equal(state.accumulatedMs, 0);
});

test("pauses exclude breaks and repeated starts do not restart the clock", () => {
  const first = active();
  const paused = timer.pause(first, start + 65_000);
  assert.equal(timer.elapsed(paused, start + 600_000), 65_000);
  const resumed = timer.start(paused, start + 600_000);
  const repeated = timer.start(resumed, start + 610_000);
  assert.equal(timer.elapsed(repeated, start + 630_000), 95_000);
  const record = timer.toSession(timer.pause(repeated, start + 630_000), start + 900_000);
  assert.equal(record.durationSeconds, 95);
  assert.equal(record.endedAt, new Date(start + 630_000).toISOString());
});

test("a running timer restores through JSON without losing background time or session identity", () => {
  const original = active();
  const restored = timer.restore(JSON.parse(JSON.stringify(original)));
  assert.ok(restored);
  assert.equal(restored.sessionId, "session-test");
  assert.equal(timer.elapsed(restored, start + 125_000), 125_000);
  assert.equal(timer.toSession(restored, start + 125_000).taskId, settings.taskId);
});

test("focus timers stop at their target and record the actual deadline after a delayed wake-up", () => {
  const state = active({ mode: "focus", durationSeconds: 1500 });
  assert.equal(timer.isComplete(state, start + 1_499_000), false);
  assert.equal(timer.isComplete(state, start + 3_000_000), true);
  const record = timer.toSession(state, start + 3_000_000);
  assert.equal(record.durationSeconds, 1500);
  assert.equal(record.completed, true);
  assert.equal(record.endedAt, new Date(start + 1_500_000).toISOString());
  const paused = timer.pause(state, start + 3_000_000);
  assert.equal(timer.toSession(paused, start + 4_000_000).endedAt, record.endedAt);
});

test("focus time remains correct across pause, reload and resume", () => {
  let state = active({ mode: "focus", durationSeconds: 1500 });
  state = timer.pause(state, start + 600_000);
  state = timer.restore(JSON.parse(JSON.stringify(state)));
  state = timer.start(state, start + 1_000_000);
  assert.equal(timer.toSession(state, start + 2_500_000).durationSeconds, 1500);
  assert.equal(timer.toSession(state, start + 2_500_000).endedAt, new Date(start + 1_900_000).toISOString());
});

test("unfinished focus sessions keep the actual measured duration", () => {
  const record = timer.toSession(active({ mode: "focus", durationSeconds: 1500 }), start + 120_900);
  assert.equal(record.durationSeconds, 120);
  assert.equal(record.completed, false);
  assert.equal(record.subjectName, settings.subjectName);
  assert.equal(record.taskTitle, settings.taskTitle);
});

test("reset preserves choices while removing the active session", () => {
  const state = timer.create(active({ mode: "focus", durationSeconds: 3000 }));
  assert.equal(state.mode, "focus");
  assert.equal(state.durationSeconds, 3000);
  assert.equal(state.subjectId, settings.subjectId);
  assert.equal(state.sessionId, null);
  assert.equal(state.startedAt, null);
  assert.equal(timer.elapsed(state, start + 600_000), 0);
  assert.equal(timer.toSession(state, start), null);
});

test("invalid saved state and subsecond sessions are rejected", () => {
  assert.equal(timer.restore(null), null);
  assert.equal(timer.restore({ ...active(), accumulatedMs: -1 }), null);
  assert.equal(timer.restore({ ...active(), durationSeconds: 0 }), null);
  assert.equal(timer.restore({ ...active(), mode: "unknown" }), null);
  assert.equal(timer.restore({ ...active(), sessionId: null }), null);
  assert.equal(timer.toSession(active(), start + 999), null);
  assert.equal(timer.elapsed(active(), start - 1000), 0);
});

test("timer displays are deterministic and allow focus durations longer than an hour", () => {
  assert.equal(timer.format(1500, false), "25:00");
  assert.equal(timer.format(5400, false), "90:00");
  assert.equal(timer.format(3661), "01:01:01");
  assert.equal(timer.format(-1), "00:00:00");
});
