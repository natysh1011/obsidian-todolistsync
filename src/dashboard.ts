import {
  namePriorityToApi,
  stringValue,
  type TodoistTask,
} from "./core";

export type DashboardTaskStatus =
  | "open"
  | "completed"
  | "detached";

export interface DashboardTaskRecord {
  task: TodoistTask;
  status: DashboardTaskStatus;
}

export interface DashboardOverview {
  openCount: number;
  overdueCount: number;
  dueSoonCount: number;
  urgentCount: number;
}

export interface TaskBranchStats {
  root: DashboardTaskRecord;
  taskIds: string[];
  openCount: number;
  completedCount: number;
  totalCount: number;
  completionPercent: number;
  overdueCount: number;
  urgentCount: number;
  unscheduledCount: number;
  nextTask: TodoistTask | null;
}

export interface DashboardStats {
  overview: DashboardOverview;
  branches: TaskBranchStats[];
}

export interface ProjectTaskStats {
  projectId: string;
  taskIds: string[];
  openCount: number;
  completedCount: number;
  totalCount: number;
  completionPercent: number;
  overdueCount: number;
  urgentCount: number;
  unscheduledCount: number;
  nextTask: TodoistTask | null;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + days);
  return result;
}

export function dueDateKey(task: TodoistTask): string | null {
  const due = task.due?.date?.trim();
  if (!due) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(due);
  return match?.[1] ?? null;
}

function compareNextTasks(a: TodoistTask, b: TodoistTask): number {
  const dueComparison = (a.due?.date ?? "").localeCompare(
    b.due?.date ?? "",
  );
  if (dueComparison) return dueComparison;
  const priorityComparison = (b.priority ?? 1) - (a.priority ?? 1);
  if (priorityComparison) return priorityComparison;
  const orderComparison =
    (a.child_order ?? 0) - (b.child_order ?? 0);
  return orderComparison || a.content.localeCompare(b.content);
}

function resolveRootId(
  record: DashboardTaskRecord,
  byId: Map<string, DashboardTaskRecord>,
): string {
  let current = record;
  const visited = new Set<string>([current.task.id]);
  while (current.task.parent_id) {
    const parentId = current.task.parent_id;
    if (visited.has(parentId)) break;
    const parent = byId.get(parentId);
    if (!parent || parent.status === "detached") break;
    visited.add(parentId);
    current = parent;
  }
  return current.task.id;
}

export function calculateDashboardStats(
  records: DashboardTaskRecord[],
  now = new Date(),
): DashboardStats {
  const included = records.filter(
    ({ task, status }) => Boolean(task.id) && status !== "detached",
  );
  const byId = new Map(included.map((record) => [record.task.id, record]));
  const branchRecords = new Map<string, DashboardTaskRecord[]>();

  for (const record of included) {
    const rootId = resolveRootId(record, byId);
    const list = branchRecords.get(rootId) ?? [];
    list.push(record);
    branchRecords.set(rootId, list);
  }

  const today = localDateKey(now);
  const dueSoonEnd = localDateKey(addCalendarDays(now, 7));
  const openRecords = included.filter(({ status }) => status === "open");
  const overview: DashboardOverview = {
    openCount: openRecords.length,
    overdueCount: openRecords.filter(({ task }) => {
      const due = dueDateKey(task);
      return Boolean(due && due < today);
    }).length,
    dueSoonCount: openRecords.filter(({ task }) => {
      const due = dueDateKey(task);
      return Boolean(due && due >= today && due <= dueSoonEnd);
    }).length,
    urgentCount: openRecords.filter(
      ({ task }) => (task.priority ?? 1) >= 3,
    ).length,
  };

  const branches: TaskBranchStats[] = [];
  for (const [rootId, branch] of branchRecords) {
    const active = branch.filter(({ status }) => status === "open");
    if (!active.length) continue;
    const completedCount = branch.filter(
      ({ status }) => status === "completed",
    ).length;
    const scheduled = active
      .map(({ task }) => task)
      .filter((task) => dueDateKey(task))
      .sort(compareNextTasks);
    const root = byId.get(rootId) ?? active[0];
    branches.push({
      root,
      taskIds: branch.map(({ task }) => task.id),
      openCount: active.length,
      completedCount,
      totalCount: branch.length,
      completionPercent: branch.length
        ? Math.round((completedCount / branch.length) * 100)
        : 0,
      overdueCount: active.filter(({ task }) => {
        const due = dueDateKey(task);
        return Boolean(due && due < today);
      }).length,
      urgentCount: active.filter(
        ({ task }) => (task.priority ?? 1) >= 3,
      ).length,
      unscheduledCount: active.filter(({ task }) => !dueDateKey(task)).length,
      nextTask: scheduled[0] ?? null,
    });
  }

  branches.sort((a, b) => {
    if (a.nextTask && b.nextTask) {
      const nextComparison = compareNextTasks(a.nextTask, b.nextTask);
      if (nextComparison) return nextComparison;
    } else if (a.nextTask) {
      return -1;
    } else if (b.nextTask) {
      return 1;
    }
    return (
      (a.root.task.child_order ?? 0) -
        (b.root.task.child_order ?? 0) ||
      a.root.task.content.localeCompare(b.root.task.content)
    );
  });

  return { overview, branches };
}

export function calculateProjectStats(
  records: DashboardTaskRecord[],
  now = new Date(),
): ProjectTaskStats[] {
  const included = records.filter(
    ({ task, status }) => Boolean(task.id) && status !== "detached",
  );
  const byProject = new Map<string, DashboardTaskRecord[]>();
  for (const record of included) {
    const list = byProject.get(record.task.project_id) ?? [];
    list.push(record);
    byProject.set(record.task.project_id, list);
  }

  const today = localDateKey(now);
  const projects: ProjectTaskStats[] = [];
  for (const [projectId, recordsInProject] of byProject) {
    const active = recordsInProject.filter(
      ({ status }) => status === "open",
    );
    if (!active.length) continue;
    const completedCount = recordsInProject.length - active.length;
    const scheduled = active
      .map(({ task }) => task)
      .filter((task) => dueDateKey(task))
      .sort(compareNextTasks);
    projects.push({
      projectId,
      taskIds: recordsInProject.map(({ task }) => task.id),
      openCount: active.length,
      completedCount,
      totalCount: recordsInProject.length,
      completionPercent: recordsInProject.length
        ? Math.round((completedCount / recordsInProject.length) * 100)
        : 0,
      overdueCount: active.filter(({ task }) => {
        const due = dueDateKey(task);
        return Boolean(due && due < today);
      }).length,
      urgentCount: active.filter(
        ({ task }) => (task.priority ?? 1) >= 3,
      ).length,
      unscheduledCount: active.filter(
        ({ task }) => !dueDateKey(task),
      ).length,
      nextTask: scheduled[0] ?? null,
    });
  }

  projects.sort((a, b) => {
    if (a.nextTask && b.nextTask) {
      return compareNextTasks(a.nextTask, b.nextTask);
    }
    if (a.nextTask) return -1;
    if (b.nextTask) return 1;
    return a.projectId.localeCompare(b.projectId);
  });
  return projects;
}

export function getDirectChildren(
  tasks: TodoistTask[],
  projectId: string,
  parentId: string | null,
): TodoistTask[] {
  return tasks
    .filter(
      (task) =>
        task.project_id === projectId &&
        (task.parent_id ?? null) === parentId,
    )
    .sort(
      (a, b) =>
        (a.child_order ?? 0) - (b.child_order ?? 0) ||
        a.content.localeCompare(b.content),
    );
}

export function getTaskBreadcrumb(
  tasks: TodoistTask[],
  taskId: string,
): TodoistTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const result: TodoistTask[] = [];
  const visited = new Set<string>();
  let current = byId.get(taskId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.unshift(current);
    current = current.parent_id
      ? byId.get(current.parent_id)
      : undefined;
  }
  return result;
}

export function dashboardRecordFromProperties(
  properties: Record<string, unknown>,
): DashboardTaskRecord | null {
  const id = stringValue(properties.todoist_id).trim();
  if (!id) return null;
  const rawStatus = stringValue(properties.status, "open");
  const status: DashboardTaskStatus =
    rawStatus === "completed"
      ? "completed"
      : rawStatus === "detached"
        ? "detached"
        : "open";
  const labels = Array.isArray(properties.labels)
    ? properties.labels.map((label) => stringValue(label)).filter(Boolean)
    : [];
  const due = stringValue(properties.due).trim();
  const dueString = stringValue(properties.due_string).trim();
  const deadline = stringValue(properties.deadline).trim();
  const duration = Number(properties.duration);
  const durationUnit = stringValue(properties.duration_unit);
  const parentId = stringValue(properties.parent_id).trim();
  return {
    status,
    task: {
      id,
      content: stringValue(properties.title),
      description: stringValue(properties.description),
      project_id: stringValue(properties.project_id),
      parent_id: parentId || null,
      labels,
      priority: namePriorityToApi(properties.priority),
      child_order: Number(properties.child_order ?? 0) || 0,
      due:
        due || dueString
          ? {
              date: due,
              string: dueString || undefined,
              is_recurring:
                properties.recurring === true ||
                properties.recurring === "true",
            }
          : null,
      deadline: deadline ? { date: deadline } : null,
      duration:
        Number.isFinite(duration) &&
        duration > 0 &&
        (durationUnit === "minute" || durationUnit === "day")
          ? {
              amount: duration,
              unit: durationUnit,
            }
          : null,
      completed_at:
        status === "completed"
          ? stringValue(properties.todoist_updated_at) || null
          : null,
    },
  };
}
