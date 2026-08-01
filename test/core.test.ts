import { describe, expect, it } from "vitest";
import {
  apiPriorityToName,
  buildDueFields,
  buildRecurrenceExpression,
  buildTaskPathMap,
  localComparable,
  makeTaskProperties,
  namePriorityToApi,
  parseDurationInput,
  parseTaskNote,
  remoteComparable,
  renderTaskNote,
  resolveSyncChange,
  sanitizeSegment,
  stableFingerprint,
  type TodoistProject,
  type TodoistTask,
} from "../src/core";

const project: TodoistProject = {
  id: "project-1",
  name: "לימודים",
};

function task(
  id: string,
  content: string,
  parentId: string | null = null,
  order = 0,
): TodoistTask {
  return {
    id,
    content,
    description: "",
    project_id: project.id,
    parent_id: parentId,
    labels: [],
    priority: 1,
    child_order: order,
  };
}

describe("sanitizeSegment", () => {
  it("preserves Hebrew while replacing illegal path characters", () => {
    expect(sanitizeSegment('משימה: "חשובה" / היום')).toBe(
      "משימה – חשובה – היום",
    );
  });

  it("uses a safe fallback and truncates long titles", () => {
    expect(sanitizeSegment("...")).toBe("Untitled task");
    expect(Array.from(sanitizeSegment("a".repeat(200))).length).toBe(120);
  });
});

describe("buildTaskPathMap", () => {
  it("creates main/subtask/subtask folders with one note per item", () => {
    const tasks = [
      task("main", "משימה ראשית"),
      task("child", "משימת משנה", "main"),
      task("grandchild", "פרט נוסף", "child"),
    ];
    const paths = buildTaskPathMap(tasks, [project], "משימות/Todoist");

    expect(paths.get("main")?.note).toBe(
      "משימות/Todoist/לימודים/משימה ראשית/משימה ראשית.md",
    );
    expect(paths.get("child")?.note).toBe(
      "משימות/Todoist/לימודים/משימה ראשית/משימת משנה/משימת משנה.md",
    );
    expect(paths.get("grandchild")?.note).toBe(
      "משימות/Todoist/לימודים/משימה ראשית/משימת משנה/פרט נוסף/פרט נוסף.md",
    );
    expect(paths.get("grandchild")?.depth).toBe(2);
  });

  it("adds a stable suffix only when sibling titles collide", () => {
    const tasks = [
      task("abcdef111111", "Same"),
      task("abcdef222222", "Same"),
    ];
    const paths = buildTaskPathMap(tasks, [project], "Tasks");
    expect(paths.get("abcdef111111")?.segment).toBe("Same");
    expect(paths.get("abcdef222222")?.segment).toBe("Same · 222222");
  });

  it("breaks an invalid parent cycle without recursing forever", () => {
    const tasks = [task("a", "A", "b"), task("b", "B", "a")];
    const paths = buildTaskPathMap(tasks, [project], "Tasks");
    expect(paths.get("a")?.note).toMatch(/^Tasks\/לימודים\//);
    expect(paths.get("b")?.note).toContain("/B/B.md");
  });
});

describe("task normalization", () => {
  it("maps Todoist priority numbers to user-facing names and back", () => {
    expect(apiPriorityToName(4)).toBe("p1");
    expect(apiPriorityToName(1)).toBe("p4");
    expect(namePriorityToApi("p1")).toBe(4);
    expect(namePriorityToApi("p4")).toBe(1);
  });

  it("produces the same fingerprint from matching remote and local data", () => {
    const remote: TodoistTask = {
      ...task("1", "Write report"),
      description: "Details",
      labels: ["work", "urgent"],
      due: {
        date: "2026-08-13",
        string: "Aug 13",
        is_recurring: false,
      },
      deadline: { date: "2026-08-12" },
      duration: { amount: 30, unit: "minute" },
      priority: 4,
      child_order: 3,
    };
    const properties = {
      title: "Write report",
      description: "Details",
      status: "open",
      project_id: project.id,
      parent_id: null,
      labels: ["urgent", "work"],
      due: "2026-08-13",
      due_string: "Aug 13",
      deadline: "2026-08-12",
      priority: "p1",
      duration: 30,
      duration_unit: "minute",
      recurring: false,
      child_order: 3,
    };
    expect(stableFingerprint(remoteComparable(remote))).toBe(
      stableFingerprint(localComparable(properties)),
    );
  });
});

describe("resolveSyncChange", () => {
  const remote = remoteComparable(task("1", "Task"));
  const previous = stableFingerprint(remote);

  it("detects an unchanged task", () => {
    expect(resolveSyncChange(previous, remote, remote)).toBe("unchanged");
  });

  it("allows a local-only completion or reopening change", () => {
    expect(
      resolveSyncChange(
        previous,
        { ...remote, status: "completed" },
        remote,
      ),
    ).toBe("local");
  });

  it("lets Todoist win when both sides changed", () => {
    expect(
      resolveSyncChange(
        previous,
        { ...remote, status: "completed" },
        { ...remote, title: "Changed in Todoist" },
      ),
    ).toBe("conflict");
  });

  it("treats an untracked note as remote-owned", () => {
    expect(resolveSyncChange(undefined, remote, remote)).toBe("remote");
  });
});

describe("task notes", () => {
  it("round-trips editable properties and preserves the Notes section", () => {
    const remote = {
      ...task("abc", "לכתוב סיכום"),
      description: "תיאור ארוך\nבשתי שורות",
      labels: ["study"],
      due: { date: "2026-08-13" },
    };
    const properties = makeTaskProperties(
      remote,
      project,
      null,
      "open",
      "synced",
    );
    const markdown = renderTaskNote(
      properties,
      "טקסט אישי שלא יימחק.\n\n- קישור שימושי",
    );
    const parsed = parseTaskNote(markdown);

    expect(parsed.properties.todoist_id).toBe("abc");
    expect(parsed.properties.description).toBe("תיאור ארוך\nבשתי שורות");
    expect(parsed.properties.labels).toEqual(["study"]);
    expect(markdown).toContain("```todoist-task-actions\n```");
    expect(parsed.notes).toContain("טקסט אישי שלא יימחק.");
    expect(renderTaskNote(parsed.properties, parsed.notes)).toContain(
      "- קישור שימושי",
    );
  });
});

describe("creation field parsing", () => {
  it.each([
    ["30m", { duration: 30, duration_unit: "minute" }],
    ["2h", { duration: 120, duration_unit: "minute" }],
    ["3 days", { duration: 3, duration_unit: "day" }],
    ["", null],
    ["nonsense", null],
  ])("parses duration %s", (input, expected) => {
    expect(parseDurationInput(input)).toEqual(expected);
  });

  it("prefers recurrence, then datetime, then date", () => {
    expect(buildDueFields("2026-08-13", "14:30", "every Monday")).toEqual({
      due_string: "every Monday",
    });
    expect(buildDueFields("2026-08-13", "14:30", "")).toEqual({
      due_datetime: "2026-08-13T14:30:00",
    });
    expect(buildDueFields("2026-08-13", "", "")).toEqual({
      due_date: "2026-08-13",
    });
  });

  it.each([
    ["1", "minute", "every 1 minute"],
    ["15", "minute", "every 15 minutes"],
    ["2", "hour", "every 2 hours"],
    ["3", "day", "every 3 days"],
    ["0", "day", ""],
    ["2.5", "hour", ""],
    ["3", "", ""],
  ] as const)(
    "builds recurrence from %s %s",
    (interval, unit, expected) => {
      expect(buildRecurrenceExpression(interval, unit)).toBe(expected);
    },
  );
});
