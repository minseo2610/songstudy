/* Songtudy · 통계 리포트
   수업 내용: 함수/배열/객체/Date(9~10주), DOM(11주), 이벤트 리스너(12주),
   Fetch·JSON·웹 스토리지(13주), 외부 CSS·Flex/Grid·반응형(5~7주).
   공통 MyStudy.init()이 기존 JSON을 Fetch합니다. 과목과 학습 기록의 사본은 만들지 않습니다.
   홈에서 저장한 songstudy.studySessions.v1의 durationMs를 집계합니다.
   진행 중 타이머의 미반영 시간은 읽기 화면에서만 계산합니다.
   기록 수정은 사용자가 저장을 누를 때만 반영하며, 타이머 진행 중에는 수정·삭제하지 않습니다.
   추가로 학습한 기능은 기본 SVG 차트입니다.
   디자인 구성 참고: https://docs.toggl.com/summary-report-in-toggl
                    https://clockify.me/help/reports/dashboard
*/
(function () {
  "use strict";

  const KEYS = {
    sessions: "songstudy.studySessions.v1",
    timer: "songstudy.home.timer.v1",
    preferences: "songstudy.report.preferences.v1",
  };
  const $ = (id) => document.getElementById(id);
  const esc = MyUI.escapeHTML;
  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  const PAGE_SIZE = 10;
  const PLOT = { left: 60, right: 978, top: 24, bottom: 252 };
  let preferences = readPreferences();
  let chosenMonth = preferences.month;
  let records = [];
  let catalog = [];
  let selectedIds = new Set();
  let monthBreakdown = [];
  let monthTotal = 0;
  let chartModel = null;
  let chartIndex = -1;
  let historyRows = [];
  let historyPage = 1;
  let ready = false;
  let refreshId = null;
  let pollId = null;
  let snapshotSignature = "";
  let catalogSignature = "";
  let donutActiveId = "";
  let lastViewportWidth = document.documentElement.clientWidth;
  let detailDate = "";
  let detailOpenerDate = "";
  let editSnapshot = null;
  let lastUndoChange = null;
  let lastUndoMessage = "";
  const defaultColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--pink-700")
      .trim() || "#d4568a";

  function readJSON(key, fallback) {
    try {
      const text = localStorage.getItem(key);
      return text === null ? fallback : JSON.parse(text);
    } catch (error) {
      console.warn("저장된 기록을 읽지 못했습니다:", key, error);
      return fallback;
    }
  }

  function readPreferences() {
    const saved = readJSON(KEYS.preferences, {});
    const value = saved && typeof saved === "object" ? saved : {};
    const savedMonth =
      value.month ||
      (value.range && value.range.mode === "month" ? value.range.month : "");
    return {
      version: 3,
      month:
        typeof savedMonth === "string" &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(savedMonth) &&
        savedMonth >= "1900-01" &&
        savedMonth <= dateKey(new Date()).slice(0, 7)
          ? savedMonth
          : dateKey(new Date()).slice(0, 7),
      subjects: Array.isArray(value.subjects)
        ? value.subjects.filter(function (id) {
            return typeof id === "string";
          })
        : null,
      period: value.version >= 2 && value.period === 30 ? 30 : 7,
      chartMode:
        value.version >= 2 && value.chartMode === "subjects"
          ? "subjects"
          : "total",
      range:
        value.version === 3 && value.range && typeof value.range === "object"
          ? value.range
          : {
              mode:
                value.version >= 2 && value.period === 30
                  ? "recent30"
                  : "recent7",
            },
      includeEmpty: value.includeEmpty === true,
      sort: ["date-desc", "date-asc", "duration-desc", "duration-asc"].includes(
        value.sort,
      )
        ? value.sort
        : "date-desc",
    };
  }

  function savePreferences() {
    try {
      localStorage.setItem(KEYS.preferences, JSON.stringify(preferences));
    } catch (error) {
      console.warn(error);
      MyUI.toast("보기 설정을 저장하지 못했어요. 현재 화면에는 적용했어요.");
    }
  }

  function dateKey(date) {
    return (
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0")
    );
  }

  function parseDate(key) {
    const parts = key.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function validDate(key) {
    return (
      typeof key === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(key) &&
      dateKey(parseDate(key)) === key
    );
  }

  function lastDays(length) {
    const today = new Date();
    const start = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - length + 1,
    );
    return Array.from({ length: length }, function (_, index) {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return dateKey(date);
    });
  }

  function datesBetween(start, end) {
    const keys = [];
    const date = parseDate(start);
    while (dateKey(date) <= end && keys.length <= 366) {
      keys.push(dateKey(date));
      date.setDate(date.getDate() + 1);
    }
    return keys;
  }

  function analysisRange() {
    const today = dateKey(new Date());
    const choice = preferences.range || { mode: "recent7" };
    if (
      choice.mode === "month" &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(choice.month) &&
      choice.month >= "1900-01" &&
      choice.month <= today.slice(0, 7)
    ) {
      const parts = choice.month.split("-").map(Number);
      const start = dateKey(new Date(parts[0], parts[1] - 1, 1));
      const end = [dateKey(new Date(parts[0], parts[1], 0)), today].sort()[0];
      return {
        start: start,
        end: end,
        days: datesBetween(start, end),
        mode: "month",
        label: parts[0] + "년 " + parts[1] + "월",
      };
    }
    if (
      choice.mode === "custom" &&
      validDate(choice.start) &&
      validDate(choice.end) &&
      choice.start >= "1900-01-01" &&
      choice.start <= choice.end &&
      choice.end <= today
    ) {
      const days = datesBetween(choice.start, choice.end);
      if (days.length <= 366 && days[days.length - 1] === choice.end)
        return {
          start: choice.start,
          end: choice.end,
          days: days,
          mode: "custom",
          label: "선택한 기간",
        };
    }
    const length = choice.mode === "recent30" ? 30 : 7;
    const days = lastDays(length);
    return {
      start: days[0],
      end: days[days.length - 1],
      days: days,
      mode: length === 30 ? "recent30" : "recent7",
      label: "최근 " + length + "일",
    };
  }

  function recordSource(record) {
    return record.sourceTimerId || record.id.replace(/:\d{4}-\d{2}-\d{2}$/, "");
  }

  function usageCount(rows) {
    return new Set(rows.map(recordSource)).size;
  }

  function renderAnalysisContext() {
    const range = analysisRange();
    const names = catalog
      .filter(function (subject) {
        return selectedIds.has(subject.id);
      })
      .map(function (subject) {
        return subject.name;
      });
    const label =
      selectedIds.size === catalog.length
        ? "전체 " + selectedIds.size + "개 과목"
        : names.length <= 2
          ? names.join(" · ") || "선택한 과목 없음"
          : names.length + "개 과목 선택";
    $("analysisConditions").textContent =
      range.label +
      " · " +
      shortDate(range.start) +
      "–" +
      shortDate(range.end) +
      " · " +
      label;
    $("appliedFilterSummary").textContent = label;
    $("rangeStart").min = "1900-01-01";
    $("rangeStart").max = dateKey(new Date());
    $("rangeEnd").min = "1900-01-01";
    $("rangeEnd").max = dateKey(new Date());
    if (!$("rangePanel").open) {
      $("rangeStart").value = range.start;
      $("rangeEnd").value = range.end;
    }
    $("resetAnalysis").disabled =
      range.mode === "recent7" && selectedIds.size === catalog.length;
  }

  function shortDate(key) {
    const date = parseDate(key);
    return date.getMonth() + 1 + "." + String(date.getDate()).padStart(2, "0");
  }
  function fullDate(key) {
    const date = parseDate(key);
    return (
      date.getFullYear() + ". " + (date.getMonth() + 1) + ". " + date.getDate()
    );
  }
  function rangeLabel(start, end) {
    return fullDate(start) + " – " + fullDate(end);
  }
  function color(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value
      : defaultColor;
  }
  function sum(list) {
    return list.reduce(function (total, record) {
      return total + record.durationMs;
    }, 0);
  }

  function clock(ms) {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return (
      String(Math.floor(seconds / 3600)).padStart(2, "0") +
      ":" +
      String(Math.floor(seconds / 60) % 60).padStart(2, "0") +
      ":" +
      String(seconds % 60).padStart(2, "0")
    );
  }

  function brief(ms) {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    if (seconds === 0) return "0분";
    if (seconds < 60) return seconds + "초";
    const minutes = Math.floor(seconds / 60);
    return minutes < 60
      ? minutes + "분"
      : Math.floor(minutes / 60) +
          "시간" +
          (minutes % 60 ? " " + (minutes % 60) + "분" : "");
  }

  function applyColors(container) {
    container.querySelectorAll("[data-color]").forEach(function (element) {
      element.style.setProperty(
        "--subject-color",
        color(element.dataset.color),
      );
    });
  }

  function readRecords() {
    const today = dateKey(new Date());
    const stored = readJSON(KEYS.sessions, []);
    const items = Array.isArray(stored)
      ? stored
          .filter(function (record) {
            return (
              record &&
              typeof record.id === "string" &&
              typeof record.subjectId === "string" &&
              validDate(record.date) &&
              record.date <= today &&
              Number.isFinite(record.durationMs) &&
              record.durationMs > 0
            );
          })
          .map(function (record) {
            return Object.assign({}, record);
          })
      : [];

    // 홈이 닫혀 있어도 설정된 종료 시각까지만 포함합니다. 홈의 저장 키에는 쓰지 않습니다.
    const timer = readJSON(KEYS.timer, null);
    if (
      timer &&
      timer.version === 1 &&
      timer.running === true &&
      typeof timer.id === "string" &&
      typeof timer.subjectId === "string" &&
      [15, 25, 50].includes(timer.durationMinutes) &&
      timer.totalMs === timer.durationMinutes * 60000 &&
      Number.isFinite(timer.accountedAt) &&
      Number.isFinite(timer.endAt) &&
      timer.accountedAt > 0 &&
      timer.endAt >= timer.accountedAt &&
      timer.endAt - timer.accountedAt <= timer.totalMs
    ) {
      let from = timer.accountedAt;
      const end = Math.min(Date.now(), timer.endAt);
      const subject = MyStudy.getSubject(timer.subjectId);
      while (from < end) {
        const date = new Date(from);
        const nextMidnight = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate() + 1,
        ).getTime();
        const until = Math.min(end, nextMidnight);
        const key = dateKey(date);
        const id = timer.id + ":" + key;
        let row = items.find(function (record) {
          return (
            record.id === id &&
            record.date === key &&
            record.subjectId === timer.subjectId
          );
        });
        if (!row) {
          row = {
            id: id,
            subjectId: timer.subjectId,
            subjectName: subject ? subject.name : "이전 과목",
            color: subject ? subject.color : "",
            date: key,
            durationMs: 0,
          };
          items.push(row);
        }
        row.durationMs += until - from;
        from = until;
      }
    }
    return items;
  }

  function buildCatalog() {
    const subjects = MyStudy.getSubjects().map(function (subject) {
      return {
        id: subject.id,
        name: subject.name,
        color: color(subject.color),
        archived: false,
      };
    });
    records.forEach(function (record) {
      if (
        !subjects.some(function (subject) {
          return subject.id === record.subjectId;
        })
      ) {
        subjects.push({
          id: record.subjectId,
          name: (record.subjectName || "이전 과목") + " (삭제된 과목)",
          originalName: record.subjectName || "이전 과목",
          color: color(record.color),
          archived: true,
        });
      }
    });
    return subjects;
  }

  function updateSelection() {
    selectedIds = new Set(
      catalog
        .filter(function (subject) {
          return (
            preferences.subjects === null ||
            preferences.subjects.includes(subject.id)
          );
        })
        .map(function (subject) {
          return subject.id;
        }),
    );
  }

  function connectNavigation() {
    const routes = {
      home: "9_songstudy_home.html",
      subjects: "00_mystudy_subjects.html",
      planner: "9_songstudy_home.html#weekly-planner",
      timer: "9_songstudy_home.html#study-timer",
      report: "9_songstudy_report.html",
    };
    document.querySelectorAll("[data-nav] .tab").forEach(function (tab, index) {
      const page = MyUI.PAGES[index];
      if (page) tab.setAttribute("href", routes[page.key]);
    });
    const brand = document.querySelector("[data-nav] .brand");
    if (brand) brand.setAttribute("href", routes.home);
  }

  function renderMonth() {
    const current = dateKey(new Date()).slice(0, 7);
    const monthParts = chosenMonth.split("-").map(Number);
    const first = new Date(monthParts[0], monthParts[1] - 1, 1);
    const last = new Date(monthParts[0], monthParts[1], 0);
    $("reportMonth").value = chosenMonth;
    $("reportMonth").max = current;
    $("reportMonth").min = "1900-01";
    $("nextMonth").disabled = chosenMonth >= current;
    $("previousMonth").disabled = chosenMonth <= "1900-01";
    $("currentMonth").disabled = chosenMonth === current;
    $("monthRange").textContent = rangeLabel(dateKey(first), dateKey(last));
    const monthly = records.filter(function (record) {
      return record.date.slice(0, 7) === chosenMonth;
    });
    monthTotal = sum(monthly);
    monthBreakdown = catalog
      .map(function (subject) {
        const duration = sum(
          monthly.filter(function (record) {
            return record.subjectId === subject.id;
          }),
        );
        return Object.assign({}, subject, {
          durationMs: duration,
          percent: monthTotal ? (duration / monthTotal) * 100 : 0,
        });
      })
      .filter(function (subject) {
        return !subject.archived || subject.durationMs > 0;
      })
      .sort(function (a, b) {
        return (
          b.durationMs - a.durationMs || a.name.localeCompare(b.name, "ko")
        );
      });
    const circumference = 2 * Math.PI * 108;
    const nonzero = monthBreakdown.filter(function (subject) {
      return subject.durationMs > 0;
    });
    let offset = 0;
    $("donutSegments").innerHTML = nonzero
      .map(function (subject) {
        const fullLength = (subject.durationMs / monthTotal) * circumference;
        const gap = nonzero.length === 1 ? 0 : Math.min(3, fullLength * 0.12);
        const length = Math.max(0.1, fullLength - gap);
        const circle =
          '<circle class="report-donut-segment" data-donut-id="' +
          esc(subject.id) +
          '" cx="140" cy="140" r="108" stroke="' +
          color(subject.color) +
          '" stroke-dasharray="' +
          length +
          " " +
          (circumference - length) +
          '" stroke-dashoffset="' +
          (-offset - gap / 2) +
          '" transform="rotate(-90 140 140)"><title>' +
          esc(subject.name) +
          ": " +
          brief(subject.durationMs) +
          ", " +
          subject.percent.toFixed(1) +
          "%</title></circle>";
        offset += fullLength;
        return circle;
      })
      .join("");
    $("donutTitle").textContent =
      monthParts[0] +
      "년 " +
      monthParts[1] +
      "월 총 공부시간 " +
      brief(monthTotal) +
      ". " +
      nonzero
        .map(function (subject) {
          return (
            subject.name +
            " " +
            brief(subject.durationMs) +
            " " +
            subject.percent.toFixed(1) +
            "%"
          );
        })
        .join(", ");
    $("subjectLegend").innerHTML = monthBreakdown
      .map(function (subject) {
        return (
          '<li><button class="report-legend-button" type="button" data-donut-id="' +
          esc(subject.id) +
          '" data-color="' +
          color(subject.color) +
          '" aria-label="' +
          monthParts[0] +
          "년 " +
          monthParts[1] +
          "월 " +
          esc(subject.name) +
          ' 상세 기록 보기"><span><i class="report-swatch" aria-hidden="true"></i><span class="report-legend-name">' +
          esc(subject.name) +
          '</span></span><strong class="num">' +
          brief(subject.durationMs) +
          '</strong><span class="num">' +
          (subject.percent === 0 ? "0" : subject.percent.toFixed(1)) +
          "%</span></button></li>"
        );
      })
      .join("");
    applyColors($("subjectLegend"));
    $("monthEmpty").hidden = monthTotal > 0;
    $("monthEmpty").textContent =
      chosenMonth === current
        ? "이번 달에 기록된 공부시간이 없어요."
        : "선택한 달에 기록된 공부시간이 없어요.";
    $("donutCaption").textContent = monthTotal
      ? "과목을 선택하면 아래에서 일별 기록을 볼 수 있어요."
      : "집중 타이머를 사용하면 과목별 비중이 표시돼요.";
    const ranked = nonzero.slice().sort(function (a, b) {
      return b.durationMs - a.durationMs;
    });
    if (ranked.length) {
      const leaders = ranked.filter(function (subject) {
        return subject.durationMs === ranked[0].durationMs;
      });
      $("monthInsight").innerHTML =
        "<span>가장 많이 공부한 과목</span><strong>" +
        leaders
          .map(function (subject) {
            return esc(subject.name);
          })
          .join(" · ") +
        "</strong><span>" +
        brief(ranked[0].durationMs) +
        " · " +
        ranked[0].percent.toFixed(1) +
        "%" +
        (leaders.length > 1 ? "씩" : "") +
        "</span>";
    } else {
      $("monthInsight").textContent =
        "집중 타이머에서 기록한 공부시간이 이곳에 표시돼요.";
    }
    $("monthContent").setAttribute("aria-busy", "false");
    highlightDonut(donutActiveId);
  }

  function highlightDonut(id) {
    donutActiveId = id;
    const subject = monthBreakdown.find(function (row) {
      return row.id === id;
    });
    $("donutCenterLabel").textContent = subject ? subject.name : "총 공부시간";
    $("donutCenterTime").textContent = brief(
      subject ? subject.durationMs : monthTotal,
    );
    $("donutCenterDetail").textContent = subject
      ? subject.percent.toFixed(1) + "%"
      : chosenMonth.split("-")[1].replace(/^0/, "") + "월";
    document.querySelectorAll("[data-donut-id]").forEach(function (element) {
      element.classList.toggle(
        "is-highlight",
        !!subject && element.dataset.donutId === id,
      );
      element.classList.toggle(
        "is-muted",
        !!subject &&
          element.dataset.donutId !== id &&
          element.matches("circle"),
      );
    });
  }

  function renderSummary() {
    const today = dateKey(new Date());
    const thirty = lastDays(30);
    const recent = records.filter(function (record) {
      return record.date >= thirty[0] && record.date <= today;
    });
    const todays = records.filter(function (record) {
      return record.date === today;
    });
    $("todayMetricDate").textContent = shortDate(today);
    $("todayStudyTime").textContent = brief(sum(todays));
    $("todayStudyTime").title = clock(sum(todays));
    $("todayStudyCount").textContent = "타이머 " + usageCount(todays) + "회";
    $("averageStudyTime").textContent = brief(sum(recent) / 30);
    $("averageStudyTime").title = clock(sum(recent) / 30);
    $("averageMetricRange").textContent =
      shortDate(thirty[0]) +
      "–" +
      shortDate(today) +
      " · " +
      new Set(
        recent.map(function (record) {
          return record.date;
        }),
      ).size +
      "/30일 기록";
    $("allStudyTime").textContent = brief(sum(records));
    $("allStudyTime").title = clock(sum(records));
    $("totalStudyDays").textContent =
      new Set(
        records.map(function (record) {
          return record.date;
        }),
      ).size + "일";
    const fourteen = lastDays(14);
    const recentWeek = records.filter(function (record) {
      return record.date >= fourteen[7] && record.date <= today;
    });
    const beforeWeek = records.filter(function (record) {
      return record.date >= fourteen[0] && record.date < fourteen[7];
    });
    const difference = sum(recentWeek) - sum(beforeWeek);
    $("recentWeekTime").textContent = brief(sum(recentWeek));
    $("recentWeekChange").textContent =
      difference === 0
        ? "직전 7일과 동일"
        : "직전 7일보다 " +
          brief(Math.abs(difference)) +
          (difference > 0 ? " 증가" : " 감소");
    $("recentWeekChange").title =
      "직전 7일: " +
      rangeLabel(fourteen[0], fourteen[6]) +
      " · " +
      brief(sum(beforeWeek));
    $("recentWeekDays").textContent =
      new Set(
        recentWeek.map(function (record) {
          return record.date;
        }),
      ).size + " / 7일";
    $("recentWeekRange").textContent =
      shortDate(fourteen[7]) + "–" + shortDate(today);
  }

  function renderFilter() {
    $("subjectChoices").innerHTML = catalog.length
      ? catalog
          .map(function (subject, index) {
            return (
              '<label class="report-subject-pill" data-color="' +
              color(subject.color) +
              '"><input type="checkbox" name="subject" id="filterSubject' +
              index +
              '" value="' +
              esc(subject.id) +
              '"' +
              (selectedIds.has(subject.id) ? " checked" : "") +
              '><span><i class="report-swatch" aria-hidden="true"></i>' +
              esc(subject.name) +
              "</span></label>"
            );
          })
          .join("")
      : '<p class="report-caption">과목 관리에서 과목을 추가해 주세요.</p>';
    applyColors($("subjectChoices"));
    updateFilterStatus(false);
  }

  function updateFilterStatus(pending) {
    $("filterPending").hidden = !pending;
    if (pending) {
      $("filterStatus").textContent =
        "변경한 선택은 아직 반영되지 않았어요. 적용을 눌러 주세요.";
      return;
    }
    $("filterStatus").textContent =
      (selectedIds.size === catalog.length ? "전체 " : "선택한 ") +
      selectedIds.size +
      "개 과목 · 그래프와 상세 기록에 적용";
    renderAnalysisContext();
  }

  function applyFilter(ids) {
    preferences.subjects = ids.length === catalog.length ? null : ids;
    updateSelection();
    savePreferences();
    historyPage = 1;
    renderFilter();
    renderTrend();
    renderHistory();
    $("filterPanel").open = false;
    $("reportAnnouncement").textContent =
      selectedIds.size + "개 과목으로 그래프와 공부 기록을 갱신했어요.";
  }

  function renderTrend() {
    const range = analysisRange();
    const buckets = [];
    const bucketSize = range.days.length > 31 ? 7 : 1;
    for (let index = 0; index < range.days.length; index += bucketSize) {
      buckets.push({
        start: range.days[index],
        end: range.days[
          Math.min(index + bucketSize - 1, range.days.length - 1)
        ],
      });
    }
    const dates = buckets.map(function (bucket) {
      return bucket.start;
    });
    const subjects = catalog.filter(function (subject) {
      return selectedIds.has(subject.id);
    });
    const recent = records.filter(function (record) {
      return (
        record.date >= range.start &&
        record.date <= range.end &&
        selectedIds.has(record.subjectId)
      );
    });
    const values = subjects.map(function (subject) {
      return Object.assign({}, subject, {
        values: buckets.map(function (bucket) {
          return sum(
            recent.filter(function (record) {
              return (
                record.subjectId === subject.id &&
                record.date >= bucket.start &&
                record.date <= bucket.end
              );
            }),
          );
        }),
      });
    });
    const series =
      preferences.chartMode === "subjects"
        ? values
        : subjects.length
          ? [
              {
                id: "total",
                name:
                  selectedIds.size === catalog.length
                    ? "전체 합계"
                    : "선택 과목 합계",
                color: defaultColor,
                values: dates.map(function (_, index) {
                  return values.reduce(function (total, subject) {
                    return total + subject.values[index];
                  }, 0);
                }),
              },
            ]
          : [];
    const peak =
      Math.max(
        0,
        ...series.map(function (subject) {
          return Math.max(0, ...subject.values);
        }),
      ) / 3600000;
    const maximum =
      peak <= 1 ? 1 : peak <= 2 ? 2 : peak <= 4 ? 4 : Math.ceil(peak / 4) * 4;
    const compact = window.matchMedia("(max-width: 760px)").matches;
    $("lineInteraction").hidden = sum(recent) === 0;
    // 짧은 기간은 화면에 맞추고, 31일을 넘으면 7일 단위 합계로 표시합니다.
    const availableWidth =
      $("lineInteraction").clientWidth ||
      $("lineInteraction").parentElement.clientWidth;
    const width = Math.max(
      dates.length > 7 ? 720 : 220,
      Math.floor(availableWidth),
    );
    const height = compact ? 238 : 272;
    // 시간·분으로 쓴 긴 축 이름도 잘리지 않도록 실제 SVG 글자 폭을 측정합니다.
    const ruler = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    ruler.setAttribute("class", "report-chart-text");
    ruler.setAttribute("visibility", "hidden");
    $("lineChart").append(ruler);
    let labelWidth = 0;
    for (let step = 1; step <= 4; step++) {
      ruler.textContent = brief(((maximum * step) / 4) * 3600000);
      labelWidth = Math.max(labelWidth, ruler.getComputedTextLength());
    }
    ruler.remove();
    PLOT.left = Math.max(compact ? 52 : 64, Math.ceil(labelWidth) + 12);
    PLOT.right = width - (compact ? 16 : 22);
    PLOT.top = 22;
    PLOT.bottom = height - 38;
    chartModel = {
      dates: dates,
      buckets: buckets,
      weekly: bucketSize === 7,
      range: range,
      subjects: values,
      series: series,
      maximum: maximum,
      total: sum(recent),
      width: width,
      height: height,
    };
    $("lineChart").dataset.scroll = String(dates.length > 7);
    $("lineChart").setAttribute("viewBox", "0 0 " + width + " " + height);
    $("chartGuide").setAttribute("y1", PLOT.top);
    $("chartGuide").setAttribute("y2", PLOT.bottom);
    chartIndex = Math.min(
      chartIndex < 0 ? dates.length - 1 : chartIndex,
      dates.length - 1,
    );
    $("trendRange").textContent =
      rangeLabel(range.start, range.end) +
      (bucketSize === 7 ? " · 주간 합계" : " · 일별 기록");
    $("trend7").setAttribute("aria-pressed", String(range.mode === "recent7"));
    $("trend30").setAttribute(
      "aria-pressed",
      String(range.mode === "recent30"),
    );
    $("chartTotal").setAttribute(
      "aria-pressed",
      String(preferences.chartMode === "total"),
    );
    $("chartSubjects").setAttribute(
      "aria-pressed",
      String(preferences.chartMode === "subjects"),
    );
    $("lineTitle").textContent =
      bucketSize === 7 ? "주별 기록시간 추이" : "일별 기록시간 추이";
    $("lineDescription").textContent =
      rangeLabel(range.start, range.end) +
      ", " +
      values.length +
      "개 과목, " +
      (preferences.chartMode === "total" ? "합계 흐름" : "과목별 비교") +
      ", 총 " +
      brief(chartModel.total) +
      (bucketSize === 7 ? ". 긴 기간은 7일 단위로 합산합니다." : ".") +
      " 아래 상세 기록과 같은 조회 조건입니다.";
    const hasData = chartModel.total > 0;
    $("trendEmpty").hidden = hasData;
    $("trendEmptyMessage").textContent = subjects.length
      ? "선택한 기간에 공부 기록이 없어요."
      : "조회할 과목을 선택한 뒤 적용해 주세요.";
    $("lineInteraction").hidden = !hasData;
    $("chartReadout").hidden = !hasData;
    $("chartLegend").hidden = !hasData;
    let grid = "";
    for (let step = 0; step <= 4; step++) {
      const y = PLOT.bottom - ((PLOT.bottom - PLOT.top) * step) / 4;
      grid +=
        '<line class="report-chart-gridline" x1="' +
        PLOT.left +
        '" x2="' +
        PLOT.right +
        '" y1="' +
        y +
        '" y2="' +
        y +
        '"></line><text class="report-chart-text" text-anchor="end" x="' +
        (PLOT.left - 10) +
        '" y="' +
        (y + 5) +
        '">' +
        (step === 0 ? "0" : brief(((maximum * step) / 4) * 3600000)) +
        "</text>";
    }
    grid +=
      '<line class="report-chart-axis" x1="' +
      PLOT.left +
      '" x2="' +
      PLOT.right +
      '" y1="' +
      PLOT.bottom +
      '" y2="' +
      PLOT.bottom +
      '"></line>';
    dates.forEach(function (date, index) {
      const label =
        compact && dates.length <= 7
          ? parseDate(date).getDate() + "일"
          : shortDate(date);
      const tickStep =
        compact && width < 310 && dates.length === 7
          ? 2
          : dates.length <= 7
            ? 1
            : Math.max(1, Math.ceil(dates.length / 7));
      if (index % tickStep === 0 || index === dates.length - 1)
        grid +=
          '<text class="report-chart-text" text-anchor="middle" x="' +
          pointX(index) +
          '" y="' +
          (height - 12) +
          '">' +
          label +
          "</text>";
    });
    $("chartGrid").innerHTML = grid;
    const dashes = ["", "7 4", "2 4", "10 3 2 3"];
    $("chartLegend").innerHTML = series
      .map(function (subject, index) {
        return (
          '<li data-color="' +
          color(subject.color) +
          '"><svg class="report-legend-line" viewBox="0 0 21 8" aria-hidden="true"><line x1="0" x2="21" y1="4" y2="4" stroke-dasharray="' +
          dashes[index % dashes.length] +
          '"></line></svg>' +
          esc(subject.name) +
          "</li>"
        );
      })
      .join("");
    applyColors($("chartLegend"));
    let area = "";
    if (hasData && preferences.chartMode === "total" && dates.length > 1) {
      area =
        '<polygon class="report-chart-area" points="' +
        PLOT.left +
        "," +
        PLOT.bottom +
        " " +
        series[0].values
          .map(function (value, day) {
            return pointX(day) + "," + pointY(value);
          })
          .join(" ") +
        " " +
        PLOT.right +
        "," +
        PLOT.bottom +
        '"></polygon>';
    }
    $("chartLines").innerHTML =
      area +
      (hasData
        ? series
            .map(function (subject, index) {
              const points = subject.values
                .map(function (value, day) {
                  return pointX(day) + "," + pointY(value);
                })
                .join(" ");
              return (
                '<polyline class="report-chart-series" points="' +
                points +
                '" stroke="' +
                color(subject.color) +
                '" stroke-dasharray="' +
                dashes[index % dashes.length] +
                '"><title>' +
                esc(subject.name) +
                "</title></polyline>"
              );
            })
            .join("")
        : "");
    $("chartMarkers").innerHTML = hasData
      ? series
          .map(function (subject, seriesIndex) {
            return subject.values
              .map(function (value, day) {
                const x = pointX(day),
                  y = pointY(value);
                const common =
                  ' class="report-chart-marker" data-day-index="' +
                  day +
                  '" stroke="' +
                  color(subject.color) +
                  '"';
                if (seriesIndex % 3 === 1)
                  return (
                    "<rect" +
                    common +
                    ' x="' +
                    (x - 3) +
                    '" y="' +
                    (y - 3) +
                    '" width="6" height="6"></rect>'
                  );
                if (seriesIndex % 3 === 2)
                  return (
                    "<path" +
                    common +
                    ' d="M ' +
                    x +
                    " " +
                    (y - 4) +
                    " L " +
                    (x + 4) +
                    " " +
                    y +
                    " L " +
                    x +
                    " " +
                    (y + 4) +
                    " L " +
                    (x - 4) +
                    " " +
                    y +
                    ' Z"></path>'
                  );
                return (
                  "<circle" +
                  common +
                  ' cx="' +
                  x +
                  '" cy="' +
                  y +
                  '" r="3"></circle>'
                );
              })
              .join("");
          })
          .join("")
      : "";
    updateChartCaption();
    renderReadout(chartIndex, false);
    renderChartTable();
    renderAnalysisContext();
  }

  function pointX(index) {
    return chartModel.dates.length === 1
      ? (PLOT.left + PLOT.right) / 2
      : PLOT.left +
          ((PLOT.right - PLOT.left) * index) / (chartModel.dates.length - 1);
  }
  function pointY(value) {
    return (
      PLOT.bottom -
      (value / 3600000 / chartModel.maximum) * (PLOT.bottom - PLOT.top)
    );
  }

  function updateChartCaption() {
    if (!chartModel) return;
    $("trendCaption").hidden = !chartModel.total;
    $("trendCaption").textContent = window.matchMedia("(max-width: 760px)")
      .matches
      ? chartModel.dates.length > 7
        ? "좌우로 밀어 날짜를 찾고, 그래프를 누르면 기록시간을 볼 수 있어요."
        : "그래프의 날짜를 누르면 기록시간을 볼 수 있어요."
      : "그래프 위에 마우스를 올리거나 좌우 방향키로 날짜별 기록을 확인하세요.";
  }

  function renderReadout(index, announce) {
    if (!chartModel) return;
    chartIndex = Math.max(0, Math.min(index, chartModel.dates.length - 1));
    const date = chartModel.dates[chartIndex];
    $("readoutDate").textContent = chartModel.weekly
      ? shortDate(date) + "–" + shortDate(chartModel.buckets[chartIndex].end)
      : shortDate(date) + " (" + DAY_NAMES[parseDate(date).getDay()] + ")";
    $("readoutValues").innerHTML = chartModel.series.length
      ? chartModel.series
          .map(function (subject) {
            return (
              '<li data-color="' +
              color(subject.color) +
              '"><i class="report-swatch" aria-hidden="true"></i><span>' +
              esc(subject.name) +
              '</span><strong class="num">' +
              brief(subject.values[chartIndex]) +
              "</strong></li>"
            );
          })
          .join("")
      : '<li class="report-empty-value">선택한 과목이 없어요.</li>';
    applyColors($("readoutValues"));
    $("chartGuide").setAttribute("x1", pointX(chartIndex));
    $("chartGuide").setAttribute("x2", pointX(chartIndex));
    $("chartGuide").toggleAttribute("hidden", !chartModel.total);
    $("chartMarkers")
      .querySelectorAll("[data-day-index]")
      .forEach(function (marker) {
        marker.classList.toggle(
          "is-active",
          Number(marker.dataset.dayIndex) === chartIndex,
        );
      });
    if (announce)
      $("reportAnnouncement").textContent =
        fullDate(date) +
        ". " +
        chartModel.subjects
          .map(function (subject) {
            return subject.name + " " + brief(subject.values[chartIndex]);
          })
          .join(", ");
  }

  function inspectChart(event) {
    if (
      !chartModel ||
      (event.type === "pointermove" && event.pointerType === "touch")
    )
      return;
    const rect = $("lineChart").getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * chartModel.width;
    const index = Math.round(
      ((x - PLOT.left) / (PLOT.right - PLOT.left)) *
        (chartModel.dates.length - 1),
    );
    renderReadout(index, false);
  }

  function renderChartTable() {
    if (!chartModel) return;
    $("chartTableHead").innerHTML =
      '<tr><th scope="col">날짜</th>' +
      chartModel.subjects
        .map(function (subject) {
          return '<th scope="col">' + esc(subject.name) + "</th>";
        })
        .join("") +
      "</tr>";
    $("chartTableBody").innerHTML = chartModel.subjects.length
      ? chartModel.dates
          .map(function (date, index) {
            return (
              '<tr><td class="num">' +
              esc(
                chartModel.weekly
                  ? rangeLabel(date, chartModel.buckets[index].end)
                  : fullDate(date),
              ) +
              "</td>" +
              chartModel.subjects
                .map(function (subject) {
                  return (
                    '<td class="num">' + clock(subject.values[index]) + "</td>"
                  );
                })
                .join("") +
              "</tr>"
            );
          })
          .join("")
      : '<tr><td class="report-table-empty">비교할 과목을 선택해 주세요.</td></tr>';
  }

  function buildHistoryRows() {
    const range = analysisRange();
    const dates = range.days;
    const selected = records.filter(function (record) {
      return (
        selectedIds.has(record.subjectId) &&
        record.date >= range.start &&
        record.date <= range.end
      );
    });
    return dates.map(function (date) {
      const entries = selected.filter(function (record) {
        return record.date === date;
      });
      return {
        date: date,
        durationMs: sum(entries),
        sessions: usageCount(entries),
        subjects: catalog.filter(function (subject) {
          return entries.some(function (record) {
            return record.subjectId === subject.id;
          });
        }),
      };
    });
  }

  function renderHistory() {
    const range = analysisRange();
    const all = buildHistoryRows();
    const total = all.reduce(function (value, row) {
      return value + row.durationMs;
    }, 0);
    $("historyTitle").textContent = range.label + " 공부 기록";
    $("historyRange").textContent = rangeLabel(range.start, range.end);
    $("historyTotal").textContent = brief(total);
    $("historyTotal").title = clock(total);
    $("historyAverage").textContent = brief(total / range.days.length);
    $("historyAverage").title =
      clock(total / range.days.length) +
      " · 기록 없는 날을 포함한 " +
      range.days.length +
      "일 평균";
    $("historyScope").textContent =
      (selectedIds.size === catalog.length
        ? "전체 과목"
        : selectedIds.size + "개 과목") + " · 위 그래프와 같은 기간";
    $("includeEmptyDays").checked = preferences.includeEmpty;
    historyRows = selectedIds.size
      ? all.filter(function (row) {
          return preferences.includeEmpty || row.durationMs > 0;
        })
      : [];
    historyRows.sort(function (a, b) {
      if (preferences.sort === "date-asc") return a.date.localeCompare(b.date);
      if (preferences.sort === "duration-desc")
        return b.durationMs - a.durationMs || b.date.localeCompare(a.date);
      if (preferences.sort === "duration-asc")
        return a.durationMs - b.durationMs || b.date.localeCompare(a.date);
      return b.date.localeCompare(a.date);
    });
    const pageCount = Math.max(1, Math.ceil(historyRows.length / PAGE_SIZE));
    historyPage = Math.max(1, Math.min(historyPage, pageCount));
    const offset = (historyPage - 1) * PAGE_SIZE;
    const shown = historyRows.slice(offset, offset + PAGE_SIZE);
    const today = dateKey(new Date());
    $("historyBody").innerHTML = shown.length
      ? shown
          .map(function (row) {
            const date = parseDate(row.date);
            return (
              "<tr" +
              (row.durationMs === 0 ? ' class="report-history-zero"' : "") +
              '><td class="report-history-date"><time datetime="' +
              row.date +
              '" aria-label="' +
              fullDate(row.date) +
              '"><span class="report-date-year">' +
              date.getFullYear() +
              ". </span>" +
              (date.getMonth() + 1) +
              ". " +
              date.getDate() +
              "</time><small" +
              (row.date === today
                ? ' class="report-today-tag">오늘'
                : ">" + DAY_NAMES[date.getDay()]) +
              '</small></td><td class="num report-duration-cell" aria-label="기록시간 ' +
              brief(row.durationMs) +
              '">' +
              clock(row.durationMs) +
              '</td><td class="report-subject-cell"><div class="report-subject-tags">' +
              (row.subjects.length
                ? row.subjects
                    .map(function (subject) {
                      return (
                        '<span data-color="' +
                        color(subject.color) +
                        '"><i class="report-swatch" aria-hidden="true"></i>' +
                        esc(subject.name) +
                        "</span>"
                      );
                    })
                    .join("")
                : "<span>기록 없음</span>") +
              '</div></td><td class="report-session-cell"><button class="report-record-link" type="button" data-view-date="' +
              row.date +
              '" aria-haspopup="dialog" aria-label="' +
              fullDate(row.date) +
              ' 타이머 기록 보기">' +
              row.sessions +
              "회 · 보기</button></td></tr>"
            );
          })
          .join("")
      : '<tr class="report-empty-row"><td class="report-table-empty" colspan="4"><p>' +
        (selectedIds.size
          ? "선택한 과목의 공부 기록이 없어요."
          : "조회할 과목을 선택해 주세요.") +
        '</p><a href="9_songstudy_home.html#study-timer">집중 타이머로 이동</a></td></tr>';
    applyColors($("historyBody"));
    $("historyCount").textContent = shown.length
      ? "총 " +
        historyRows.length +
        "일 중 " +
        (offset + 1) +
        "–" +
        (offset + shown.length) +
        "일 표시"
      : "공부 기록 0일";
    $("historyPage").textContent = historyPage + " / " + pageCount;
    $("historyPrevious").disabled = historyPage <= 1;
    $("historyNext").disabled = historyPage >= pageCount;
    const dateSort = preferences.sort.indexOf("date-") === 0;
    const descending = preferences.sort.endsWith("desc");
    $("dateSortHeading").setAttribute(
      "aria-sort",
      dateSort ? (descending ? "descending" : "ascending") : "none",
    );
    $("timeSortHeading").setAttribute(
      "aria-sort",
      !dateSort ? (descending ? "descending" : "ascending") : "none",
    );
    $("dateSortIcon").textContent = dateSort
      ? descending
        ? "최신순"
        : "오래된순"
      : "";
    $("timeSortIcon").textContent = !dateSort
      ? descending
        ? "많은 순"
        : "적은 순"
      : "";
    $("historySort").value = preferences.sort;
  }

  function unsettledTimer() {
    const timer = readJSON(KEYS.timer, null);
    return timer &&
      timer.version === 1 &&
      timer.running === true &&
      typeof timer.id === "string" &&
      [15, 25, 50].includes(timer.durationMinutes) &&
      timer.totalMs === timer.durationMinutes * 60000 &&
      Number.isFinite(timer.accountedAt) &&
      timer.accountedAt > 0 &&
      Number.isFinite(timer.endAt) &&
      timer.endAt >= timer.accountedAt &&
      timer.endAt - timer.accountedAt <= timer.totalMs
      ? timer
      : null;
  }

  function assertRecordsEditable() {
    const timer = unsettledTimer();
    if (timer)
      throw new Error(
        timer.endAt <= Date.now()
          ? "타이머 화면을 열어 기록 저장을 마친 뒤 다시 시도해 주세요."
          : "타이머를 일시정지한 뒤 기록을 수정하거나 삭제해 주세요.",
      );
  }

  function recordKey(record) {
    return record && typeof record === "object"
      ? JSON.stringify([record.id, record.subjectId, record.date])
      : "";
  }

  function canonicalRecords() {
    const text = localStorage.getItem(KEYS.sessions);
    const rows = text === null ? [] : JSON.parse(text);
    if (!Array.isArray(rows))
      throw new Error("기록을 읽지 못했어요. 저장된 데이터를 확인해 주세요.");
    return { text: text, rows: rows };
  }

  function storeRecordChange(key, original, replacement) {
    assertRecordsEditable();
    const current = canonicalRecords();
    const matches = current.rows
      .map(function (row, index) {
        return recordKey(row) === key ? index : -1;
      })
      .filter(function (index) {
        return index >= 0;
      });
    if (
      matches.length !== 1 ||
      JSON.stringify(current.rows[matches[0]]) !== JSON.stringify(original)
    ) {
      throw new Error(
        "다른 창에서 이 기록이 변경됐어요. 수정을 취소하고 목록을 다시 확인해 주세요.",
      );
    }
    const index = matches[0];
    if (replacement) {
      const others = current.rows.filter(function (row, position) {
        return (
          position !== index &&
          row &&
          row.date === replacement.date &&
          Number.isFinite(row.durationMs) &&
          row.durationMs > 0
        );
      });
      if (sum(others) + replacement.durationMs > 86400000)
        throw new Error("하루의 전체 기록시간이 24시간을 넘을 수 없어요.");
      current.rows[index] = replacement;
    } else current.rows.splice(index, 1);
    assertRecordsEditable();
    if (localStorage.getItem(KEYS.sessions) !== current.text)
      throw new Error(
        "다른 창에서 기록이 갱신됐어요. 잠시 후 다시 시도해 주세요.",
      );
    localStorage.setItem(KEYS.sessions, JSON.stringify(current.rows));
    return { before: original, after: replacement, index: index };
  }

  function afterRecordChange(message) {
    editSnapshot = null;
    $("recordForm").hidden = true;
    snapshotSignature = "";
    refreshData(true);
    $("recordActionStatus").textContent = message;
    $("reportAnnouncement").textContent = message;
  }

  function renderRecordUndo() {
    $("recordUndoBar").hidden = !lastUndoChange;
    $("recordUndoMessage").textContent = lastUndoMessage;
  }

  function offerRecordUndo(change, message) {
    lastUndoChange = change;
    lastUndoMessage = message;
    renderRecordUndo();
    if ($("dayDialog").open) $("recordActionStatus").textContent = "";
    if (!$("dayDialog").open)
      MyUI.toast(message, {
        actionLabel: "되돌리기",
        onAction: function () {
          undoRecordChange(change);
        },
      });
  }

  function undoRecordChange(change) {
    try {
      assertRecordsEditable();
      const current = canonicalRecords();
      if (change.after) {
        const index = current.rows.findIndex(function (row) {
          return recordKey(row) === recordKey(change.after);
        });
        if (
          index < 0 ||
          JSON.stringify(current.rows[index]) !== JSON.stringify(change.after)
        )
          throw new Error(
            "이후에 바뀐 기록이 있어 덮어쓰지 않았어요. 상세 목록을 확인해 주세요.",
          );
        const other = current.rows.some(function (row, position) {
          return (
            position !== index && recordKey(row) === recordKey(change.before)
          );
        });
        if (other) throw new Error("같은 기록이 이미 있어 되돌릴 수 없어요.");
        current.rows[index] = change.before;
      } else {
        if (
          current.rows.some(function (row) {
            return recordKey(row) === recordKey(change.before);
          })
        )
          throw new Error("같은 기록이 이미 복원되어 있어요.");
        current.rows.splice(
          Math.min(change.index, current.rows.length),
          0,
          change.before,
        );
      }
      // 이후 다른 날짜나 다른 기록에서 생긴 변경은 유지합니다.
      const dayRows = current.rows.filter(function (row) {
        return (
          row &&
          row.date === change.before.date &&
          Number.isFinite(row.durationMs) &&
          row.durationMs > 0
        );
      });
      if (sum(dayRows) > 86400000)
        throw new Error(
          "이후 추가된 기록 때문에 하루 24시간을 넘게 되어 되돌리지 않았어요.",
        );
      assertRecordsEditable();
      if (localStorage.getItem(KEYS.sessions) !== current.text)
        throw new Error("다른 창에서 기록이 갱신됐어요. 다시 시도해 주세요.");
      localStorage.setItem(KEYS.sessions, JSON.stringify(current.rows));
      lastUndoChange = null;
      lastUndoMessage = "";
      afterRecordChange("기록 변경을 되돌렸어요.");
      renderRecordUndo();
      if (!$("dayDialog").open) MyUI.toast("기록 변경을 되돌렸어요.");
    } catch (error) {
      $("recordActionStatus").textContent = error.message;
      offerRecordUndo(change, error.message);
    }
  }

  function renderDayDetails() {
    if (!detailDate) return;
    const entries = records.filter(function (record) {
      return record.date === detailDate && selectedIds.has(record.subjectId);
    });
    const timer = unsettledTimer();
    $("dayDialogTitle").textContent = fullDate(detailDate) + " 타이머 기록";
    $("dayDialogTotal").textContent =
      "타이머 " +
      usageCount(entries) +
      "회 · 개별 기록 " +
      entries.length +
      "건 · " +
      clock(sum(entries));
    $("recordLockNotice").hidden = !timer;
    if (timer)
      $("recordLockNotice").innerHTML =
        (timer.endAt <= Date.now()
          ? "타이머 기록 저장을 먼저 마쳐 주세요."
          : "타이머 진행 중에는 기록을 조회할 수 있어요. 수정·삭제는 일시정지 후 가능해요.") +
        '<a href="9_songstudy_home.html#study-timer">타이머 확인</a>';
    $("sessionList").innerHTML = entries.length
      ? entries
          .map(function (record, index) {
            const subject = catalog.find(function (item) {
              return item.id === record.subjectId;
            });
            const key = esc(recordKey(record));
            return (
              '<li class="report-record-item" data-color="' +
              color(subject ? subject.color : record.color) +
              '"><div><span class="report-record-name"><i class="report-swatch" aria-hidden="true"></i>' +
              esc(subject ? subject.name : record.subjectName || "이전 과목") +
              '</span><span class="num report-record-time">' +
              clock(record.durationMs) +
              '</span><span class="report-record-date">기록 ' +
              (index + 1) +
              (record.updatedAt ? " · 수정됨" : "") +
              '</span></div><div class="report-record-actions"><button class="btn btn-sm" type="button" data-edit-record="' +
              key +
              '"' +
              (timer ? " disabled" : "") +
              '>수정</button><button class="btn btn-sm" type="button" data-delete-record="' +
              key +
              '"' +
              (timer ? " disabled" : "") +
              ">삭제</button></div></li>"
            );
          })
          .join("")
      : '<li class="report-caption">선택한 과목의 기록이 이 날짜에는 없어요.</li>';
    applyColors($("sessionList"));
    $("recordDate").min = "1900-01-01";
    $("recordDate").max = dateKey(new Date());
    renderRecordUndo();
  }

  function openDayDetails(date) {
    detailDate = date;
    detailOpenerDate = date;
    editSnapshot = null;
    $("recordForm").hidden = true;
    $("recordActionStatus").textContent = "";
    renderDayDetails();
    $("dayDialog").showModal();
    $("closeDayDialog").focus();
  }

  function beginRecordEdit(key) {
    try {
      assertRecordsEditable();
      const row = records.find(function (record) {
        return recordKey(record) === key;
      });
      if (!row)
        throw new Error("기록이 변경됐어요. 목록을 다시 확인해 주세요.");
      editSnapshot = JSON.parse(JSON.stringify(row));
      $("recordSubject").innerHTML = catalog
        .map(function (subject) {
          return (
            '<option value="' +
            esc(subject.id) +
            '">' +
            esc(subject.name) +
            "</option>"
          );
        })
        .join("");
      $("recordSubject").value = row.subjectId;
      $("recordDate").value = row.date;
      const seconds = Math.floor(row.durationMs / 1000);
      $("recordHours").value = Math.floor(seconds / 3600);
      $("recordMinutes").value = Math.floor(seconds / 60) % 60;
      $("recordSeconds").value = seconds % 60;
      $("recordError").textContent = "";
      $("recordForm").hidden = false;
      $("recordDate").focus();
    } catch (error) {
      $("recordActionStatus").textContent = error.message;
    }
  }

  function saveRecordEdit(event) {
    event.preventDefault();
    if (!editSnapshot) return;
    try {
      const date = $("recordDate").value;
      const subject = catalog.find(function (item) {
        return item.id === $("recordSubject").value;
      });
      const hours = Number($("recordHours").value),
        minutes = Number($("recordMinutes").value),
        seconds = Number($("recordSeconds").value);
      if (!validDate(date) || date < "1900-01-01" || date > dateKey(new Date()))
        throw new Error("오늘까지의 올바른 날짜를 선택해 주세요.");
      if (!subject) throw new Error("과목을 다시 선택해 주세요.");
      if (
        ![hours, minutes, seconds].every(Number.isInteger) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59 ||
        seconds < 0 ||
        seconds > 59
      )
        throw new Error("시간·분·초를 올바르게 입력해 주세요.");
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      if (totalSeconds < 1)
        throw new Error(
          "기록시간은 1초 이상이어야 해요. 기록을 없애려면 삭제를 사용해 주세요.",
        );
      const replacement = Object.assign({}, editSnapshot, {
        date: date,
        subjectId: subject.id,
        subjectName: subject.originalName || subject.name,
        color: subject.color,
        durationMs:
          Math.floor(editSnapshot.durationMs / 1000) === totalSeconds
            ? editSnapshot.durationMs
            : totalSeconds * 1000,
        updatedAt: Date.now(),
      });
      // 날짜·과목을 옮기면 홈 타이머가 재개될 때 원래 기록에 덧붙이지 않도록 ID를 분리합니다.
      if (
        replacement.date !== editSnapshot.date ||
        replacement.subjectId !== editSnapshot.subjectId
      ) {
        replacement.id = MyStudy.uid("record-") + ":" + replacement.date;
        replacement.sourceTimerId = recordSource(editSnapshot);
      }
      const change = storeRecordChange(
        recordKey(editSnapshot),
        editSnapshot,
        replacement,
      );
      const message =
        replacement.date !== detailDate
          ? "기록을 " + fullDate(replacement.date) + "로 옮겼어요."
          : "기록을 수정했어요.";
      afterRecordChange(message);
      offerRecordUndo(change, message);
    } catch (error) {
      $("recordError").textContent = error.message;
    }
  }

  function deleteRecord(key) {
    try {
      const row = records.find(function (record) {
        return recordKey(record) === key;
      });
      if (!row)
        throw new Error("기록이 변경됐어요. 목록을 다시 확인해 주세요.");
      const change = storeRecordChange(key, row, null);
      afterRecordChange("기록을 삭제했어요.");
      offerRecordUndo(change, "기록을 삭제했어요.");
    } catch (error) {
      $("recordActionStatus").textContent = error.message;
    }
  }

  function refreshData(force) {
    if (!ready) return;
    records = readRecords();
    catalog = buildCatalog();
    const lock = unsettledTimer();
    const signature = JSON.stringify([
      dateKey(new Date()),
      records,
      catalog,
      lock ? { id: lock.id, endAt: lock.endAt } : null,
    ]);
    if (!force && signature === snapshotSignature) return;
    snapshotSignature = signature;
    updateSelection();
    const subjectsSignature = JSON.stringify(catalog);
    if (force || subjectsSignature !== catalogSignature) {
      renderFilter();
      catalogSignature = subjectsSignature;
    }
    renderMonth();
    renderSummary();
    renderTrend();
    renderHistory();
    if ($("dayDialog").open) renderDayDetails();
  }

  function scheduleRefresh() {
    if (refreshId !== null) return;
    refreshId = window.setTimeout(function () {
      refreshId = null;
      try {
        refreshData(false);
      } catch (error) {
        showError(error);
      }
    }, 500);
  }

  function pollRecords() {
    try {
      refreshData(false);
    } catch (error) {
      showError(error);
    }
    pollId = window.setTimeout(pollRecords, 5000);
  }

  function showError(error) {
    console.error("리포트 불러오기 실패:", error);
    $("reportErrorMessage").textContent =
      location.protocol === "file:"
        ? "공통 데이터를 읽으려면 프로젝트 폴더를 Live Server로 열어 주세요."
        : "학습 데이터를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
    $("reportError").hidden = false;
    $("monthContent").setAttribute("aria-busy", "false");
  }

  function loadData() {
    $("retryReport").disabled = true;
    MyStudy.init()
      .then(function () {
        ready = true;
        $("reportError").hidden = true;
        refreshData(true);
        if (pollId === null) pollRecords();
      })
      .catch(showError)
      .finally(function () {
        $("retryReport").disabled = false;
      });
  }

  function shiftMonth(offset) {
    const parts = chosenMonth.split("-").map(Number);
    const next = dateKey(new Date(parts[0], parts[1] - 1 + offset, 1)).slice(
      0,
      7,
    );
    if (next < "1900-01" || next > dateKey(new Date()).slice(0, 7)) return;
    chosenMonth = next;
    preferences.month = next;
    savePreferences();
    donutActiveId = "";
    renderMonth();
  }

  function changePeriod(period) {
    preferences.period = period;
    preferences.range = { mode: period === 30 ? "recent30" : "recent7" };
    chartIndex = -1;
    historyPage = 1;
    savePreferences();
    $("rangePanel").open = false;
    $("rangeError").textContent = "";
    renderTrend();
    renderHistory();
  }

  function viewMonthlySubject(id) {
    preferences.range = { mode: "month", month: chosenMonth };
    preferences.chartMode = "subjects";
    chartIndex = -1;
    $("rangePanel").open = false;
    applyFilter([id]);
    $("analysisPanel").scrollIntoView({ block: "start", behavior: "auto" });
    $("trendTitle").focus({ preventScroll: true });
  }

  function applyCustomRange(event) {
    event.preventDefault();
    const start = $("rangeStart").value,
      end = $("rangeEnd").value;
    if (
      !validDate(start) ||
      !validDate(end) ||
      start < "1900-01-01" ||
      end > dateKey(new Date()) ||
      start > end
    ) {
      $("rangeError").textContent =
        "시작일부터 오늘까지의 올바른 기간을 선택해 주세요.";
      return;
    }
    const days = datesBetween(start, end);
    if (days.length > 366 || days[days.length - 1] !== end) {
      $("rangeError").textContent = "한 번에 최대 366일까지 조회할 수 있어요.";
      return;
    }
    preferences.range = { mode: "custom", start: start, end: end };
    chartIndex = -1;
    historyPage = 1;
    savePreferences();
    $("rangePanel").open = false;
    $("rangeError").textContent = "";
    renderTrend();
    renderHistory();
  }

  function bindEvents() {
    window.addEventListener("resize", function () {
      const width = document.documentElement.clientWidth;
      if (ready && width !== lastViewportWidth) {
        lastViewportWidth = width;
        renderTrend();
      }
    });
    $("retryReport").addEventListener("click", loadData);
    $("previousMonth").addEventListener("click", function () {
      if (ready) shiftMonth(-1);
    });
    $("nextMonth").addEventListener("click", function () {
      if (ready) shiftMonth(1);
    });
    $("currentMonth").addEventListener("click", function () {
      if (ready) {
        chosenMonth = dateKey(new Date()).slice(0, 7);
        preferences.month = chosenMonth;
        savePreferences();
        donutActiveId = "";
        renderMonth();
      }
    });
    $("reportMonth").addEventListener("change", function () {
      if (!ready) return;
      const value = $("reportMonth").value;
      if (
        /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
        value >= "1900-01" &&
        value <= dateKey(new Date()).slice(0, 7)
      ) {
        chosenMonth = value;
        preferences.month = value;
        savePreferences();
        donutActiveId = "";
        renderMonth();
      } else {
        $("reportMonth").value = chosenMonth;
        MyUI.toast("이번 달까지의 날짜를 선택해 주세요.");
      }
    });
    ["donutWrap", "subjectLegend"].forEach(function (id) {
      const container = $(id);
      container.addEventListener("pointerover", function (event) {
        const item = event.target.closest("[data-donut-id]");
        if (item) highlightDonut(item.dataset.donutId);
      });
      container.addEventListener("pointerleave", function () {
        highlightDonut("");
      });
      container.addEventListener("focusin", function (event) {
        const item = event.target.closest("[data-donut-id]");
        if (item) highlightDonut(item.dataset.donutId);
      });
      container.addEventListener("focusout", function (event) {
        if (!container.contains(event.relatedTarget)) highlightDonut("");
      });
      container.addEventListener("click", function (event) {
        const item = event.target.closest("[data-donut-id]");
        if (item) viewMonthlySubject(item.dataset.donutId);
      });
    });
    $("subjectChoices").addEventListener("change", function () {
      updateFilterStatus(true);
    });
    $("filterPanel").addEventListener("toggle", function () {
      document.querySelector(".report-filter-trigger").textContent = $(
        "filterPanel",
      ).open
        ? "접기"
        : "변경";
    });
    $("rangeForm").addEventListener("submit", applyCustomRange);
    $("rangeForm").addEventListener("input", function () {
      $("rangeError").textContent = "";
    });
    $("resetAnalysis").addEventListener("click", function () {
      preferences.subjects = null;
      preferences.chartMode = "total";
      updateSelection();
      renderFilter();
      $("filterPanel").open = false;
      changePeriod(7);
    });
    $("selectAllSubjects").addEventListener("click", function () {
      $("subjectChoices")
        .querySelectorAll("input")
        .forEach(function (input) {
          input.checked = true;
        });
      updateFilterStatus(true);
    });
    $("clearSubjects").addEventListener("click", function () {
      $("subjectChoices")
        .querySelectorAll("input")
        .forEach(function (input) {
          input.checked = false;
        });
      updateFilterStatus(true);
    });
    $("subjectFilter").addEventListener("submit", function (event) {
      event.preventDefault();
      if (ready)
        applyFilter(
          Array.from($("subjectChoices").querySelectorAll("input:checked")).map(
            function (input) {
              return input.value;
            },
          ),
        );
    });
    $("trend7").addEventListener("click", function () {
      if (ready) changePeriod(7);
    });
    $("trend30").addEventListener("click", function () {
      if (ready) changePeriod(30);
    });
    $("chartTotal").addEventListener("click", function () {
      if (ready) {
        preferences.chartMode = "total";
        savePreferences();
        renderTrend();
      }
    });
    $("chartSubjects").addEventListener("click", function () {
      if (ready) {
        preferences.chartMode = "subjects";
        savePreferences();
        renderTrend();
      }
    });
    $("lineChart").addEventListener("pointermove", inspectChart);
    $("lineChart").addEventListener("click", inspectChart);
    $("lineInteraction").addEventListener("keydown", function (event) {
      if (!chartModel || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      let index =
        chartIndex +
        (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0);
      if (event.key === "Home") index = 0;
      if (event.key === "End") index = chartModel.dates.length - 1;
      renderReadout(index, true);
      const width = $("lineChart").getBoundingClientRect().width;
      $("lineInteraction").scrollLeft =
        (pointX(chartIndex) / chartModel.width) * width -
        $("lineInteraction").clientWidth / 2;
    });
    $("toggleChartTable").addEventListener("click", function () {
      $("chartTableWrap").hidden = !$("chartTableWrap").hidden;
      $("toggleChartTable").setAttribute(
        "aria-expanded",
        String(!$("chartTableWrap").hidden),
      );
      $("toggleChartTable").textContent = $("chartTableWrap").hidden
        ? "통계표 보기"
        : "통계표 닫기";
    });
    $("includeEmptyDays").addEventListener("change", function () {
      preferences.includeEmpty = $("includeEmptyDays").checked;
      historyPage = 1;
      savePreferences();
      renderHistory();
    });
    $("sortDate").addEventListener("click", function () {
      preferences.sort =
        preferences.sort === "date-desc" ? "date-asc" : "date-desc";
      historyPage = 1;
      savePreferences();
      renderHistory();
    });
    $("sortDuration").addEventListener("click", function () {
      preferences.sort =
        preferences.sort === "duration-desc" ? "duration-asc" : "duration-desc";
      historyPage = 1;
      savePreferences();
      renderHistory();
    });
    $("historySort").addEventListener("change", function () {
      preferences.sort = $("historySort").value;
      historyPage = 1;
      savePreferences();
      renderHistory();
    });
    $("historyPrevious").addEventListener("click", function () {
      historyPage--;
      renderHistory();
    });
    $("historyNext").addEventListener("click", function () {
      historyPage++;
      renderHistory();
    });
    $("historyBody").addEventListener("click", function (event) {
      const button = event.target.closest("[data-view-date]");
      if (button && validDate(button.dataset.viewDate))
        openDayDetails(button.dataset.viewDate);
    });
    ["closeDayDialog", "doneDayDialog"].forEach(function (id) {
      $(id).addEventListener("click", function () {
        $("dayDialog").close();
      });
    });
    $("dayDialog").addEventListener("click", function (event) {
      if (event.target === $("dayDialog")) $("dayDialog").close();
    });
    $("dayDialog").addEventListener("close", function () {
      editSnapshot = null;
      if (lastUndoChange) offerRecordUndo(lastUndoChange, lastUndoMessage);
      const opener = document.querySelector(
        '[data-view-date="' + detailOpenerDate + '"]',
      );
      if (opener) opener.focus({ preventScroll: true });
    });
    $("sessionList").addEventListener("click", function (event) {
      const edit = event.target.closest("[data-edit-record]");
      const remove = event.target.closest("[data-delete-record]");
      if (edit) beginRecordEdit(edit.dataset.editRecord);
      if (remove) deleteRecord(remove.dataset.deleteRecord);
    });
    $("recordForm").addEventListener("submit", saveRecordEdit);
    $("undoRecordButton").addEventListener("click", function () {
      if (lastUndoChange) undoRecordChange(lastUndoChange);
    });
    $("recordForm").addEventListener("input", function () {
      $("recordError").textContent = "";
    });
    $("cancelRecordEdit").addEventListener("click", function () {
      editSnapshot = null;
      $("recordForm").hidden = true;
    });
    window.addEventListener("storage", function (event) {
      if (event.key === KEYS.preferences || event.key === null) {
        preferences = readPreferences();
        chosenMonth = preferences.month;
        catalogSignature = "";
        snapshotSignature = "";
      }
      if (
        [
          KEYS.sessions,
          KEYS.timer,
          KEYS.preferences,
          MyStudy.KEYS.subjects,
          MyStudy.KEYS.tasks,
          null,
        ].includes(event.key)
      )
        scheduleRefresh();
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) scheduleRefresh();
    });
  }

  connectNavigation();
  bindEvents();
  loadData();
  if (document.fonts)
    document.fonts.ready.then(function () {
      if (ready) renderTrend();
    });
})();
