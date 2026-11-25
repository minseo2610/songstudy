# 공통 과목·할 일 데이터

[원본 JSON](./00_mystudy_data.json)과 [MyStudy 모듈](./00_mystudy_store.js)을 팀 전체가 함께 사용합니다. 과목 관리, 위클리 플래너, 홈 등에서 별도 데이터 사본을 만들지 않고 같은 모듈을 연결합니다.

## 데이터 구조

JSON의 `schemaVersion`은 구조 버전, `month`는 기본 데이터의 대상 월(`2026-11`)입니다. `subjects`와 `tasks`는 배열이며, 할 일의 `subjectId`가 과목의 `id`를 가리킵니다. 과목 이름이나 배열 순서로 연결하지 않습니다.

| 과목 필드 | 형식 | 의미 |
| --- | --- | --- |
| `id` | 문자열 | 고유 ID. 이름을 수정해도 유지 |
| `name` | 문자열 | 과목명 |
| `color` | 문자열 | 기존 과목 팔레트의 HEX 색상 |
| `memo` | 문자열 | 과목 메모. 없으면 빈 문자열 |
| `exams` | 배열 | 시험 일정 `{ id, name, date }`. 제공된 시험 정보가 없어 현재 모두 빈 배열 |

| 할 일 필드 | 형식 | 의미 |
| --- | --- | --- |
| `id` | 문자열 | 고유 ID. 제목·마감을 수정해도 유지 |
| `subjectId` | 문자열 | 연결된 과목의 ID |
| `category` | 문자열 | 기존 화면의 `assignment`, `midterm`, `final` 중 하나 |
| `title` | 문자열 | 할 일 이름 |
| `dueDate` | 문자열 | 마감일 `YYYY-MM-DD`. 마감 미정은 `""` |
| `done` | boolean | 완료 여부. 최초 데이터는 모두 `false` |

이번에 제공된 17개는 퀴즈·기말 프로젝트를 포함한 제출/수행 항목이므로 모두 `assignment`로 두었습니다. 기존 화면에서 `midterm`과 `final`은 각각 중간고사·기말고사 **준비** 묶음입니다. 날짜는 마감일이며 별도의 시각은 지정하지 않았습니다.

## 2026년 11월 기본 데이터

| 과목 | 할 일과 마감일 |
| --- | --- |
| 공학수학1 | 과제3: 18일 |
| 프로그래밍방법론 | 10주차 과제: 5일, 11주차 과제: 12일, 12주차 과제: 19일, 13주차 과제: 26일 |
| 웹프로그래밍 | 9주차 실습과제: 5일, 11주차 과제: 16일, 12주차 과제: 23일, 기말 프로젝트 과제: 30일 |
| 인공지능입문 | w9 강의 자료 요약: 2일, w10: 9일, w11: 16일, w12: 23일, w13: 30일 |
| 데이터베이스 | ISQL 과제30: 4일, 퀴즈 #2: 18일, ESQL 과제: 마감 미정 |

총 5과목·17개 할 일입니다. 날짜가 있는 16개는 주간 마감에 배치하고, ESQL 과제 1개는 마감 미정 목록으로 조회합니다. 지난 날짜라는 이유로 완료 처리하지 않습니다.

## 페이지에서 연결하기

`mystudy`처럼 루트 아래 한 단계의 폴더에 있는 HTML에서는 다음 순서로 연결합니다. 기존 공통 UI 스크립트와 스타일은 그대로 연결하면 됩니다.

```html
<script src="../common/00_mystudy_store.js" defer></script>
<script src="내페이지.js" defer></script>
```

페이지 스크립트는 데이터를 읽기 전에 `await MyStudy.init()`을 호출합니다. 모듈은 **자기 파일 위치를 기준으로** 같은 폴더의 JSON을 Fetch하므로 페이지 폴더가 달라도 같은 데이터를 읽습니다. ES 모듈이 아닌 일반 `defer` 스크립트로 연결합니다.

```js
async function loadPage() {
  await MyStudy.init();

  const subjects = MyStudy.getSubjects();
  const week = MyStudy.getWeek("2026-11-18");
  // week.startDate: "2026-11-16"
  // week.endDate:   "2026-11-22"
  // week.days: [{ date: "2026-11-16", tasks: [...] }, ...7일]

  for (const day of week.days) {
    for (const task of day.tasks) {
      const subject = MyStudy.getSubject(task.subjectId);
      console.log(day.date, subject.name, subject.color, task.title, task.done);
    }
  }

  const unscheduled = MyStudy.getUnscheduledTasks();
  // ESQL 과제는 날짜 칸 대신 마감 미정 영역에서 표시
}

loadPage().catch((error) => {
  console.error("데이터를 불러오지 못했습니다.", error);
});
```

## 팀 공통 API

| API | 반환/역할 |
| --- | --- |
| `await MyStudy.init()` | 첫 방문 시 JSON을 불러와 저장. 여러 기능이 동시에 호출해도 한 번만 요청 |
| `MyStudy.getSubjects()` | 전체 과목 배열 |
| `MyStudy.getSubject(subjectId)` | 해당 과목 또는 `null` |
| `MyStudy.getTasks()` | 마감 미정·완료 항목을 포함한 전체 할 일 |
| `MyStudy.getTasksOf(subjectId)` | 해당 과목의 할 일 |
| `MyStudy.getTasksInRange(startDate, endDate)` | 양 끝 날짜를 포함한 마감순 할 일. 마감 미정은 제외 |
| `MyStudy.getWeek(date)` | 기준일이 속한 월요일~일요일의 `{ startDate, endDate, days }`. 기준일 생략 시 오늘 |
| `MyStudy.getUnscheduledTasks()` | 마감 미정 할 일 배열 |
| `MyStudy.setTaskDone(taskId, done)` | 완료 상태를 저장하고 수정된 할 일 반환. ID가 없으면 `null` |
| `MyStudy.saveSubjects(subjects)` | 수정한 전체 과목 배열 저장 |
| `MyStudy.saveTasks(tasks)` | 수정한 전체 할 일 배열 저장 |
| `await MyStudy.reset()` | 공통 JSON을 다시 읽어 과목·할 일을 초기화 |

주간 조회는 월 경계에서도 일주일을 온전히 반환합니다. 예를 들어 `getWeek("2026-12-01")`은 11월 30일~12월 6일을 반환하므로 11월 30일 마감 2개도 포함합니다. 할 일이 없는 날도 빈 `tasks` 배열로 반환합니다. 완료 항목도 포함되므로 완료 숨기기는 화면에서 `task.done`으로 필터링합니다.

## 저장과 변경 규칙

- 공통 저장 키는 기존과 같은 `myStudy.subjects`, `myStudy.tasks`입니다. 조회 결과를 수정한 뒤에는 저장 API를 호출해야 반영됩니다. 완료 체크는 `setTaskDone`을 사용합니다.
- JSON은 처음 방문할 때 사용할 기본 데이터입니다. 저장된 사용자 기록이 있으면 `init()`은 그대로 보존합니다. 이전 디자인의 예시 데이터를 이미 불러온 브라우저에서는 과목 화면의 ‘예시 데이터로 초기화’ 버튼을 선택하거나 개발 확인 시 `await MyStudy.reset()`을 실행하면 새 11월 데이터를 적용할 수 있습니다. 초기화는 과목·할 일을 기본값으로 되돌리며, Fetch 실패 시 기존 기록을 유지합니다.
- 팀원들은 Git으로 같은 JSON과 모듈을 공유합니다. 실제 사용 기록은 각 브라우저의 localStorage에 저장되며, 여러 PC의 기록이 자동 동기화되지는 않습니다.
- 같은 브라우저에서도 프로토콜·호스트·포트가 같아야 저장소를 공유합니다. 같은 주소의 다른 탭 변경은 기존 과목 화면처럼 `storage` 이벤트를 구독해 갱신할 수 있습니다.
- 기본 데이터 수정은 [원본 JSON](./00_mystudy_data.json) 한 곳에서 합니다. 새 과목/할 일에는 중복 없는 ID를 사용하고, `subjectId`는 실제 과목 ID와 일치시킵니다. 실제 시험 정보·교수명·마감일은 제공되지 않은 값을 만들지 않습니다.
- `file://`로 여는 대신 프로젝트 루트를 제공하는 정적 HTTP 환경에서 확인합니다. 별도 백엔드는 필요하지 않습니다.

검증은 프로젝트 루트에서 `node --test tests/common-data.test.cjs`로 실행할 수 있습니다.
