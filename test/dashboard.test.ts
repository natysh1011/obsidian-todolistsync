import { describe, expect, it } from "vitest";
import {
  calculateDashboardStats,
  calculateProjectStats,
  dashboardRecordFromProperties,
  getDirectChildren,
  getTaskBreadcrumb,
  type DashboardTaskRecord,
} from "../src/dashboard";
import type { TodoistTask } from "../src/core";

function task(
  id: string,
  content: string,
  options: Partial<TodoistTask> = {},
): TodoistTask {
  return {
    id,
    content,
    project_id: "project",
    parent_id: null,
    priority: 1,
    child_order: 0,
    labels: [],
    ...options,
  };
}

function record(
  taskValue: TodoistTask,
  status: DashboardTaskRecord["status"] = "open",
): DashboardTaskRecord {
  return { task: taskValue, status };
}

describe("calculateDashboardStats", () => {
  it("groups every descendant under its root and includes the root count", () => {
    const records = [
      record(task("root-a", "ממ״ן 12", { due: { date: "2026-08-13" } })),
      record(task("a-1", "Child", { parent_id: "root-a" })),
      record(task("a-2", "Grandchild", { parent_id: "a-1" })),
      record(task("root-b", "ממ״ן 13")),
    ];
    const stats = calculateDashboardStats(
      records,
      new Date("2026-07-29T12:00:00"),
    );

    expect(stats.overview.openCount).toBe(4);
    expect(stats.branches.map((branch) => branch.openCount)).toEqual([3, 1]);
    expect(stats.branches[0].root.task.id).toBe("root-a");
  });

  it("calculates overdue, seven-day, urgent, unscheduled and progress data", () => {
    const records = [
      record(
        task("root", "Root", {
          due: { date: "2026-07-28" },
          priority: 4,
        }),
      ),
      record(
        task("soon", "Soon", {
          parent_id: "root",
          due: { date: "2026-08-05" },
          priority: 3,
        }),
      ),
      record(task("none", "No date", { parent_id: "root" })),
      record(
        task("done", "Done", { parent_id: "root" }),
        "completed",
      ),
      record(task("detached", "Detached"), "detached"),
    ];
    const stats = calculateDashboardStats(
      records,
      new Date("2026-07-29T12:00:00"),
    );
    const branch = stats.branches[0];

    expect(stats.overview).toEqual({
      openCount: 3,
      overdueCount: 1,
      dueSoonCount: 1,
      urgentCount: 2,
    });
    expect(branch).toMatchObject({
      openCount: 3,
      completedCount: 1,
      totalCount: 4,
      completionPercent: 25,
      overdueCount: 1,
      urgentCount: 2,
      unscheduledCount: 1,
    });
  });

  it("chooses the earliest task and breaks ties by priority then Todoist order", () => {
    const records = [
      record(task("root", "Root")),
      record(
        task("low", "Low", {
          parent_id: "root",
          due: { date: "2026-08-01" },
          priority: 1,
          child_order: 0,
        }),
      ),
      record(
        task("urgent-later-order", "Urgent later", {
          parent_id: "root",
          due: { date: "2026-08-01" },
          priority: 4,
          child_order: 2,
        }),
      ),
      record(
        task("urgent-first-order", "Urgent first", {
          parent_id: "root",
          due: { date: "2026-08-01" },
          priority: 4,
          child_order: 1,
        }),
      ),
    ];
    const stats = calculateDashboardStats(records);
    expect(stats.branches[0].nextTask?.id).toBe("urgent-first-order");
  });

  it("hides a fully completed branch", () => {
    const stats = calculateDashboardStats([
      record(task("root", "Done root"), "completed"),
      record(
        task("child", "Done child", { parent_id: "root" }),
        "completed",
      ),
    ]);
    expect(stats.branches).toEqual([]);
  });
});

describe("calculateProjectStats", () => {
  it("groups by the real Todoist project rather than by root task", () => {
    const records = [
      record(task("root-12", "ממ״ן 12")),
      record(task("child-12", "Child", { parent_id: "root-12" })),
      record(task("root-13", "ממ״ן 13")),
      record(
        task("other", "Other project", { project_id: "other" }),
      ),
    ];

    const projects = calculateProjectStats(records);

    expect(projects).toHaveLength(2);
    expect(
      projects.find(({ projectId }) => projectId === "project"),
    ).toMatchObject({
      openCount: 3,
      totalCount: 3,
    });
    expect(
      projects.find(({ projectId }) => projectId === "other"),
    ).toMatchObject({
      openCount: 1,
    });
  });

  it("includes known completions and excludes detached tasks", () => {
    const projects = calculateProjectStats([
      record(
        task("open", "Open", {
          due: { date: "2026-07-28" },
          priority: 4,
        }),
      ),
      record(task("done", "Done"), "completed"),
      record(task("detached", "Detached"), "detached"),
    ], new Date("2026-07-29T12:00:00"));

    expect(projects[0]).toMatchObject({
      openCount: 1,
      completedCount: 1,
      totalCount: 2,
      completionPercent: 50,
      overdueCount: 1,
      urgentCount: 1,
      unscheduledCount: 0,
    });
  });
});

describe("hierarchical task selection", () => {
  const tasks = [
    task("root-a", "Root A", { child_order: 2 }),
    task("root-b", "Root B", { child_order: 1 }),
    task("child", "Child", { parent_id: "root-b" }),
    task("grandchild", "Grandchild", { parent_id: "child" }),
    task("other-project", "Other", { project_id: "other" }),
  ];

  it("returns only direct siblings in the selected project", () => {
    expect(
      getDirectChildren(tasks, "project", null).map(({ id }) => id),
    ).toEqual(["root-b", "root-a"]);
    expect(
      getDirectChildren(tasks, "project", "root-b").map(({ id }) => id),
    ).toEqual(["child"]);
    expect(getDirectChildren(tasks, "other", null)[0].id).toBe(
      "other-project",
    );
  });

  it("builds the selected parent breadcrumb", () => {
    expect(
      getTaskBreadcrumb(tasks, "grandchild").map(({ id }) => id),
    ).toEqual(["root-b", "child", "grandchild"]);
  });
});

describe("dashboardRecordFromProperties", () => {
  it("creates a completed record from task-note properties", () => {
    const result = dashboardRecordFromProperties({
      todoist_id: "task-id",
      title: "משימה",
      project_id: "project",
      parent_id: "parent",
      labels: ["study"],
      priority: "p1",
      due: "2026-08-13",
      deadline: "2026-08-12",
      duration: 30,
      duration_unit: "minute",
      status: "completed",
    });

    expect(result).toMatchObject({
      status: "completed",
      task: {
        id: "task-id",
        parent_id: "parent",
        priority: 4,
        due: { date: "2026-08-13" },
        duration: { amount: 30, unit: "minute" },
      },
    });
  });

  it("ignores a pending note without a Todoist ID", () => {
    expect(
      dashboardRecordFromProperties({
        title: "Pending",
        sync_state: "pending-create",
      }),
    ).toBeNull();
  });
});
