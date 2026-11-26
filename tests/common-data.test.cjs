const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const seed = JSON.parse(fs.readFileSync(path.join(root, "common/00_mystudy_data.json"), "utf8"));
const source = fs.readFileSync(path.join(root, "common/00_mystudy_store.js"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function createStore({ values = new Map(), fetchSeed } = {}) {
  const requests = [];
  const context = vm.createContext({
    URL,
    console,
    document: {
      currentScript: { src: "http://localhost:5500/common/00_mystudy_store.js" },
      baseURI: "http://localhost:5500/another-folder/weekly.html",
    },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    },
    fetch: async (url) => {
      requests.push(url);
      return fetchSeed ? fetchSeed(url) : { ok: true, json: async () => plain(seed) };
    },
  });
  vm.runInContext(source, context);
  return { store: vm.runInContext("MyStudy", context), values, requests };
}

test("the seed matches all five subjects and seventeen user-provided tasks", () => {
  const expected = {
    공학수학1: [["과제3", "2026-11-18"]],
    프로그래밍방법론: [
      ["10주차 과제", "2026-11-05"], ["11주차 과제", "2026-11-12"],
      ["12주차 과제", "2026-11-19"], ["13주차 과제", "2026-11-26"],
    ],
    웹프로그래밍: [
      ["9주차 실습과제", "2026-11-05"], ["11주차 과제", "2026-11-16"],
      ["12주차 과제", "2026-11-23"], ["기말 프로젝트 과제", "2026-11-30"],
    ],
    인공지능입문: [
      ["w9 강의 자료 요약", "2026-11-02"], ["w10 강의 자료 요약", "2026-11-09"],
      ["w11 강의 자료 요약", "2026-11-16"], ["w12 강의 자료 요약", "2026-11-23"],
      ["w13 강의 자료 요약", "2026-11-30"],
    ],
    데이터베이스: [["ISQL 과제30", "2026-11-04"], ["퀴즈 #2", "2026-11-18"], ["ESQL 과제", ""]],
  };
  assert.equal(seed.schemaVersion, 1);
  assert.equal(seed.month, "2026-11");
  assert.equal(seed.subjects.length, 5);
  assert.equal(seed.tasks.length, 17);
  assert.equal(new Set(seed.subjects.map((subject) => subject.id)).size, 5);
  assert.equal(new Set(seed.tasks.map((task) => task.id)).size, 17);
  const actual = {};
  for (const subject of seed.subjects) {
    assert.deepEqual(subject.exams, []);
    assert.equal(subject.memo, "");
    actual[subject.name] = seed.tasks.filter((task) => task.subjectId === subject.id)
      .map((task) => [task.title, task.dueDate]);
  }
  assert.deepEqual(actual, expected);
  for (const task of seed.tasks) {
    assert.ok(seed.subjects.some((subject) => subject.id === task.subjectId));
    assert.equal(task.done, false);
    assert.equal(task.category, "assignment");
    assert.ok(task.dueDate === "" || /^2026-11-(0[1-9]|[12][0-9]|30)$/.test(task.dueDate));
  }
});

test("nested pages fetch the canonical common JSON, with concurrent init coalesced", async () => {
  const { store, requests } = createStore();
  await Promise.all([store.init(), store.init(), store.init()]);
  assert.deepEqual(requests, ["http://localhost:5500/common/00_mystudy_data.json"]);
  assert.deepEqual(plain(store.getSubjects()), seed.subjects);
  assert.deepEqual(plain(store.getTasks()), seed.tasks);
  assert.equal(store.getTasksOf("subject-programming").length, 4);
  assert.equal(store.getSubject("subject-web").name, "웹프로그래밍");
});

test("November 18 belongs to Monday 16 through Sunday 22 with five deadlines", async () => {
  const { store } = createStore();
  await store.init();
  const week = store.getWeek("2026-11-18");
  assert.equal(week.startDate, "2026-11-16");
  assert.equal(week.endDate, "2026-11-22");
  assert.deepEqual(plain(week.days.map((day) => day.date)), [
    "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19",
    "2026-11-20", "2026-11-21", "2026-11-22",
  ]);
  assert.deepEqual(plain(week.days.map((day) => day.tasks.length)), [2, 0, 2, 1, 0, 0, 0]);
  assert.deepEqual(plain(week.days[2].tasks.map((task) => task.title)).sort(), ["과제3", "퀴즈 #2"].sort());
});

test("week queries handle Sunday and month/year boundaries without UTC day shifts", async () => {
  const { store } = createStore();
  await store.init();
  const first = store.getWeek("2026-11-01");
  assert.equal(first.startDate, "2026-10-26");
  assert.equal(first.endDate, "2026-11-01");
  assert.ok(first.days.every((day) => day.tasks.length === 0));
  const last = store.getWeek("2026-12-01");
  assert.equal(last.startDate, "2026-11-30");
  assert.equal(last.endDate, "2026-12-06");
  assert.equal(last.days[0].tasks.length, 2);
  const newYear = store.getWeek("2027-01-01");
  assert.equal(newYear.startDate, "2026-12-28");
  assert.equal(newYear.endDate, "2027-01-03");
});

test("range queries include both endpoints and keep ESQL in the unscheduled list", async () => {
  const { store } = createStore();
  await store.init();
  assert.equal(store.getTasksInRange("2026-11-01", "2026-11-30").length, 16);
  assert.equal(store.getTasksInRange("2026-11-30", "2026-11-30").length, 2);
  assert.equal(store.getTasksInRange("2026-11-02", "2026-11-05").length, 4);
  const unscheduled = store.getUnscheduledTasks();
  assert.equal(unscheduled.length, 1);
  assert.equal(unscheduled[0].title, "ESQL 과제");
  assert.ok(store.getWeek("2026-11-18").days.every((day) => day.tasks.every((task) => task.dueDate)));
  assert.throws(() => store.getWeek("2026-11-31"), /존재하는 날짜/);
  assert.throws(() => store.getWeek("2026-11-5"), /YYYY-MM-DD/);
  assert.throws(() => store.getTasksInRange("2026-11-20", "2026-11-01"), /시작일/);
});

test("completion changes persist across page loads without replacing existing records", async () => {
  const values = new Map([["myStudy.timer", "keep-me"]]);
  const first = createStore({ values });
  await first.store.init();
  const id = "task-web-week-9";
  assert.equal(first.store.setTaskDone(id, true).done, true);
  const updated = first.store.getTasks();
  updated.push({ id: "task-custom", subjectId: "subject-web", category: "assignment", title: "직접 추가", dueDate: "2026-11-05", done: false });
  first.store.saveTasks(updated);
  const nextPage = createStore({ values });
  await nextPage.store.init();
  assert.equal(nextPage.requests.length, 0);
  assert.equal(nextPage.store.getTasks().find((task) => task.id === id).done, true);
  assert.equal(nextPage.store.getTasksOf("subject-web").length, 5);
  assert.equal(values.get("myStudy.timer"), "keep-me");
  assert.equal(nextPage.store.setTaskDone("missing", true), null);
  assert.throws(() => nextPage.store.setTaskDone(id, "false"), /true 또는 false/);
});

test("legacy storage keys and manually emptied arrays are respected until explicit reset", async () => {
  const values = new Map([
    ["myStudy.subjects", JSON.stringify([{ id: "s1", name: "기존 사용자 과목", color: "#e5508c", memo: "", exams: [] }])],
    ["myStudy.tasks", "[]"],
    ["myStudy.subjectSort", "name"],
  ]);
  const { store, requests } = createStore({ values });
  await store.init();
  assert.equal(requests.length, 0);
  assert.equal(store.getSubjects()[0].name, "기존 사용자 과목");
  store.saveSubjects([]);
  await store.init();
  assert.equal(requests.length, 0);
  await store.reset();
  assert.equal(store.getSubjects().length, 5);
  assert.equal(store.getTasks().length, 17);
  assert.equal(values.get("myStudy.subjectSort"), "name");
});

test("reset fetch failures preserve both existing data arrays", async () => {
  const values = new Map([
    ["myStudy.subjects", JSON.stringify(seed.subjects)],
    ["myStudy.tasks", JSON.stringify([{ ...seed.tasks[0], done: true }])],
  ]);
  const before = Array.from(values);
  const { store } = createStore({ values, fetchSeed: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(store.reset(), /503/);
  assert.deepEqual(Array.from(values), before);
});

test("failed initialization can retry and malformed seeds do not erase existing data", async () => {
  let tries = 0;
  const retry = createStore({ fetchSeed: async () => {
    if (++tries === 1) throw new Error("offline");
    return { ok: true, json: async () => plain(seed) };
  } });
  await assert.rejects(retry.store.init(), /offline/);
  await retry.store.init();
  assert.equal(retry.store.getTasks().length, 17);

  const invalid = createStore({ fetchSeed: async () => ({ ok: true, json: async () => ({ subjects: [] }) }) });
  await assert.rejects(invalid.store.init(), /subjects와 tasks/);
  assert.equal(invalid.values.size, 0);
});

test("both existing subject screens reference the moved shared module", () => {
  for (const file of ["9_Songstudy_subjects.html", "9_Songstudy_subject.html"]) {
    const html = fs.readFileSync(path.join(root, "mystudy", file), "utf8");
    assert.match(html, /src="\.\.\/common\/00_mystudy_store\.js" defer/);
  }
});
