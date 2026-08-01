import YAML from "yaml";

export const NOTE_TAG = "todoist-task";
export const NOTES_HEADING = "## Notes";
export const TASK_ACTIONS_BLOCK = "todoist-task-actions";

export interface TodoistDue {
  date: string;
  string?: string;
  lang?: string;
  timezone?: string | null;
  is_recurring?: boolean;
}

export interface TodoistDuration {
  amount: number;
  unit: "minute" | "day";
}

export interface TodoistDeadline {
  date: string;
  lang?: string;
}

export interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  project_id: string;
  section_id?: string | null;
  parent_id?: string | null;
  labels?: string[];
  deadline?: TodoistDeadline | null;
  duration?: TodoistDuration | null;
  due?: TodoistDue | null;
  priority?: number;
  child_order?: number;
  checked?: boolean;
  is_deleted?: boolean;
  updated_at?: string;
  completed_at?: string | null;
}

export interface TodoistProject {
  id: string;
  name: string;
  parent_id?: string | null;
  child_order?: number;
  inbox_project?: boolean;
  is_inbox_project?: boolean;
}

export interface TaskPathInfo {
  folder: string;
  note: string;
  segment: string;
  depth: number;
}

export interface ComparableTask {
  title: string;
  description: string;
  status: "open" | "completed";
  project_id: string;
  parent_id: string | null;
  labels: string[];
  due: string | null;
  due_string: string | null;
  deadline: string | null;
  priority: string;
  duration: number | null;
  duration_unit: string | null;
  recurring: boolean;
  child_order: number;
}

export interface ParsedTaskNote {
  properties: Record<string, unknown>;
  notes: string;
}

export type SyncResolution =
  | "unchanged"
  | "local"
  | "remote"
  | "conflict";

const ILLEGAL_FILENAME = /[\\/:*?"<>|\u0000-\u001f]/g;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeSegment(input: string, maxLength = 120): string {
  let value = input
    .normalize("NFC")
    .replace(ILLEGAL_FILENAME, " – ")
    .replace(/(?:\s*–\s*){2,}/g, " – ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!value) value = "Untitled task";
  if (RESERVED_NAMES.test(value)) value = `${value} task`;

  const characters = Array.from(value);
  if (characters.length > maxLength) {
    value = `${characters.slice(0, maxLength - 1).join("").trim()}…`;
  }
  return value;
}

function joinPath(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
}

function uniqueSegments(
  tasks: TodoistTask[],
): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Map<string, string>();
  for (const task of [...tasks].sort((a, b) => {
    const order = (a.child_order ?? 0) - (b.child_order ?? 0);
    return order || a.id.localeCompare(b.id);
  })) {
    const base = sanitizeSegment(task.content);
    const key = base.toLocaleLowerCase();
    if (!used.has(key)) {
      used.set(key, task.id);
      result.set(task.id, base);
      continue;
    }
    result.set(task.id, sanitizeSegment(`${base} · ${task.id.slice(-6)}`));
  }
  return result;
}

export function buildTaskPathMap(
  tasks: TodoistTask[],
  projects: TodoistProject[],
  rootFolder: string,
): Map<string, TaskPathInfo> {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const children = new Map<string, TodoistTask[]>();

  for (const task of tasks) {
    const parentKey =
      task.parent_id && taskById.has(task.parent_id)
        ? `task:${task.parent_id}`
        : `project:${task.project_id}`;
    const list = children.get(parentKey) ?? [];
    list.push(task);
    children.set(parentKey, list);
  }

  const segments = new Map<string, string>();
  for (const siblings of children.values()) {
    for (const [id, segment] of uniqueSegments(siblings)) {
      segments.set(id, segment);
    }
  }

  const result = new Map<string, TaskPathInfo>();
  const visiting = new Set<string>();

  const resolve = (task: TodoistTask): TaskPathInfo => {
    const cached = result.get(task.id);
    if (cached) return cached;

    if (visiting.has(task.id)) {
      const projectName =
        projectById.get(task.project_id)?.name ?? "Unknown project";
      const segment = segments.get(task.id) ?? sanitizeSegment(task.content);
      const folder = joinPath(
        rootFolder,
        sanitizeSegment(projectName),
        segment,
      );
      const info = {
        folder,
        note: joinPath(folder, `${segment}.md`),
        segment,
        depth: 0,
      };
      result.set(task.id, info);
      return info;
    }

    visiting.add(task.id);
    const segment = segments.get(task.id) ?? sanitizeSegment(task.content);
    const parent =
      task.parent_id && taskById.has(task.parent_id)
        ? resolve(taskById.get(task.parent_id)!)
        : null;
    const projectName =
      projectById.get(task.project_id)?.name ?? "Unknown project";
    const base = parent
      ? parent.folder
      : joinPath(rootFolder, sanitizeSegment(projectName));
    const folder = joinPath(base, segment);
    const info = {
      folder,
      note: joinPath(folder, `${segment}.md`),
      segment,
      depth: parent ? parent.depth + 1 : 0,
    };
    visiting.delete(task.id);
    result.set(task.id, info);
    return info;
  };

  for (const task of tasks) resolve(task);
  return result;
}

export function apiPriorityToName(priority = 1): string {
  const bounded = Math.min(4, Math.max(1, priority));
  return `p${5 - bounded}`;
}

export function namePriorityToApi(priority: unknown): number {
  const match = /^p([1-4])$/i.exec(String(priority ?? "p4"));
  return match ? 5 - Number(match[1]) : 1;
}

function normalizedLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function remoteComparable(
  task: TodoistTask,
  status: "open" | "completed" = "open",
): ComparableTask {
  return {
    title: task.content ?? "",
    description: task.description ?? "",
    status,
    project_id: task.project_id ?? "",
    parent_id: task.parent_id ?? null,
    labels: normalizedLabels(task.labels),
    due: task.due?.date ?? null,
    due_string: task.due?.string ?? null,
    deadline: task.deadline?.date ?? null,
    priority: apiPriorityToName(task.priority),
    duration: task.duration?.amount ?? null,
    duration_unit: task.duration?.unit ?? null,
    recurring: Boolean(task.due?.is_recurring),
    child_order: task.child_order ?? 0,
  };
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function localComparable(
  properties: Record<string, unknown>,
): ComparableTask {
  const rawStatus = String(properties.status ?? "open");
  return {
    title: String(properties.title ?? ""),
    description: String(properties.description ?? ""),
    status: rawStatus === "completed" ? "completed" : "open",
    project_id: String(properties.project_id ?? ""),
    parent_id: optionalString(properties.parent_id),
    labels: normalizedLabels(properties.labels),
    due: optionalString(properties.due),
    due_string: optionalString(properties.due_string),
    deadline: optionalString(properties.deadline),
    priority: /^p[1-4]$/i.test(String(properties.priority ?? ""))
      ? String(properties.priority).toLowerCase()
      : "p4",
    duration: optionalNumber(properties.duration),
    duration_unit: optionalString(properties.duration_unit),
    recurring:
      properties.recurring === true || properties.recurring === "true",
    child_order: Number(properties.child_order ?? 0) || 0,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

export function stableFingerprint(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function resolveSyncChange(
  previousFingerprint: string | undefined,
  local: ComparableTask,
  remote: ComparableTask,
): SyncResolution {
  if (!previousFingerprint) return "remote";
  const localChanged =
    stableFingerprint(local) !== previousFingerprint;
  const remoteChanged =
    stableFingerprint(remote) !== previousFingerprint;
  if (localChanged && remoteChanged) return "conflict";
  if (localChanged) return "local";
  if (remoteChanged) return "remote";
  return "unchanged";
}

export function parseTaskNote(content: string): ParsedTaskNote {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  let properties: Record<string, unknown> = {};
  if (match) {
    const parsed = YAML.parse(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      properties = parsed as Record<string, unknown>;
    }
  }
  const headingIndex = content.indexOf(NOTES_HEADING);
  const notes =
    headingIndex === -1
      ? ""
      : content
          .slice(headingIndex + NOTES_HEADING.length)
          .replace(/^\r?\n+/, "");
  return { properties, notes };
}

export function makeTaskProperties(
  task: TodoistTask,
  project: TodoistProject | undefined,
  parentPath: string | null,
  status: "open" | "completed",
  syncState: string,
  pendingCreateId: string | null = null,
): Record<string, unknown> {
  return {
    type: "todoist-task",
    tags: [NOTE_TAG],
    todoist_id: task.id || null,
    title: task.content,
    description: task.description ?? "",
    status,
    project: project?.name ?? "Unknown project",
    project_id: task.project_id,
    parent: parentPath ? `[[${parentPath.replace(/\.md$/, "")}]]` : null,
    parent_id: task.parent_id ?? null,
    labels: task.labels ?? [],
    due: task.due?.date ?? null,
    due_string: task.due?.string ?? null,
    deadline: task.deadline?.date ?? null,
    priority: apiPriorityToName(task.priority),
    duration: task.duration?.amount ?? null,
    duration_unit: task.duration?.unit ?? null,
    recurring: Boolean(task.due?.is_recurring),
    child_order: task.child_order ?? 0,
    todoist_url: task.id
      ? `https://app.todoist.com/app/task/${task.id}`
      : null,
    sync_state: syncState,
    pending_create_id: pendingCreateId,
    todoist_updated_at: task.updated_at ?? null,
    last_synced: new Date().toISOString(),
  };
}

function valueOrDash(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}

export function renderTaskNote(
  properties: Record<string, unknown>,
  notes: string,
): string {
  const yaml = YAML.stringify(properties, {
    lineWidth: 0,
    defaultStringType: "QUOTE_DOUBLE",
  }).trimEnd();
  const title = String(properties.title ?? "Untitled task");
  const taskUrl = optionalString(properties.todoist_url);
  const lines = [
    "---",
    yaml,
    "---",
    "",
    `# ${title}`,
    "",
    "> [!todoist] Todoist task",
    taskUrl ? `> [Open in Todoist](${taskUrl})` : "> Pending API creation",
    "",
    "## Details",
    "",
    `- **Project:** ${valueOrDash(properties.project)}`,
    `- **Parent:** ${valueOrDash(properties.parent)}`,
    `- **Status:** ${valueOrDash(properties.status)}`,
    `- **Due:** ${valueOrDash(properties.due)}`,
    `- **Deadline:** ${valueOrDash(properties.deadline)}`,
    `- **Priority:** ${valueOrDash(properties.priority)}`,
    `- **Labels:** ${valueOrDash(properties.labels)}`,
    "",
    `\`\`\`${TASK_ACTIONS_BLOCK}`,
    "```",
    "",
    NOTES_HEADING,
    "",
    notes.trimEnd(),
    "",
  ];
  return lines.join("\n");
}

export function parseDurationInput(
  input: string,
): { duration: number; duration_unit: "minute" | "day" } | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  const match = /^(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days)$/.exec(
    value,
  );
  if (!match) return null;
  const amount = Number(match[1]);
  if (amount <= 0) return null;
  const unit = match[2];
  if (unit.startsWith("d")) return { duration: amount, duration_unit: "day" };
  if (unit.startsWith("h")) {
    return { duration: amount * 60, duration_unit: "minute" };
  }
  return { duration: amount, duration_unit: "minute" };
}

export function buildRecurrenceExpression(
  intervalInput: string,
  unit: "minute" | "hour" | "day" | "",
): string {
  const interval = Number(intervalInput);
  if (!unit || !Number.isInteger(interval) || interval < 1) return "";
  const plural = interval === 1 ? unit : `${unit}s`;
  return `every ${interval} ${plural}`;
}

export function buildDueFields(
  date: string,
  time: string,
  recurrence: string,
): Record<string, string> {
  if (recurrence.trim()) return { due_string: recurrence.trim() };
  if (!date) return {};
  if (time) return { due_datetime: `${date}T${time}:00` };
  return { due_date: date };
}
