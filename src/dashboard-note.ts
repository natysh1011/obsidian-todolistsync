export const DASHBOARD_BLOCK_LANGUAGE = "todoist-task-notes";
export const DASHBOARD_BLOCK = `\`\`\`${DASHBOARD_BLOCK_LANGUAGE}\n\`\`\``;

const dashboardBlockPattern =
  /(^|\r?\n)[ \t]*```todoist-task-notes(?:[ \t]+[^\r\n]*)?\r?\n[\s\S]*?[ \t]*```(?=\r?\n|$)/;

export function hasDashboardBlock(content: string): boolean {
  return dashboardBlockPattern.test(content);
}

export function appendDashboardBlock(content: string): string {
  if (hasDashboardBlock(content)) return content;
  if (!content) return `${DASHBOARD_BLOCK}\n`;

  const separator = content.endsWith("\n\n")
    ? ""
    : content.endsWith("\n")
      ? "\n"
      : "\n\n";
  return `${content}${separator}${DASHBOARD_BLOCK}\n`;
}

export function normalizeDashboardNotePath(value: string): string | null {
  let path = value
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!path) return null;

  const segments = path.split("/");
  if (
    segments.some(
      (segment) => !segment || segment === "." || segment === "..",
    )
  ) {
    return null;
  }
  if (!/\.md$/i.test(path)) path += ".md";
  return path;
}

export interface DashboardSlashTrigger {
  readonly startCh: number;
  readonly endCh: number;
  readonly query: string;
}

export function findDashboardSlashTrigger(
  line: string,
  cursorCh: number,
): DashboardSlashTrigger | null {
  const prefix = line.slice(0, Math.max(0, cursorCh));
  const match = /^(\s*)\/(.*)$/.exec(prefix);
  if (!match) return null;

  const query = match[2].trim().replace(/\s+/g, " ").toLowerCase();
  if (!query) return null;
  const commands = [
    "todoist: add dashboard",
    "todoist add dashboard",
    "add dashboard",
    "dashboard",
  ];
  if (!commands.some((command) => command.startsWith(query))) return null;

  return {
    startCh: 0,
    endCh: cursorCh,
    query,
  };
}
