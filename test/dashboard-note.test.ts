import { describe, expect, it } from "vitest";
import {
  DASHBOARD_BLOCK,
  appendDashboardBlock,
  findDashboardSlashTrigger,
  hasDashboardBlock,
  normalizeDashboardNotePath,
} from "../src/dashboard-note";

describe("dashboard note paths", () => {
  it("normalizes separators and adds the Markdown extension", () => {
    expect(normalizeDashboardNotePath(" Dashboards\\My tasks ")).toBe(
      "Dashboards/My tasks.md",
    );
    expect(normalizeDashboardNotePath("תקציר המשימות.md")).toBe(
      "תקציר המשימות.md",
    );
  });

  it("rejects empty and parent-traversal paths", () => {
    expect(normalizeDashboardNotePath("  ")).toBeNull();
    expect(normalizeDashboardNotePath("../Dashboard.md")).toBeNull();
    expect(normalizeDashboardNotePath("Dashboards/../Dashboard.md")).toBeNull();
  });
});

describe("dashboard block management", () => {
  it("creates the managed block in an empty note", () => {
    expect(appendDashboardBlock("")).toBe(`${DASHBOARD_BLOCK}\n`);
  });

  it("preserves user content while appending one dashboard block", () => {
    const original = "# Weekly review\n\nKeep this text.";
    const updated = appendDashboardBlock(original);

    expect(updated.startsWith(original)).toBe(true);
    expect(updated).toContain(DASHBOARD_BLOCK);
    expect(appendDashboardBlock(updated)).toBe(updated);
  });

  it("recognizes dashboard blocks that already contain configuration", () => {
    const configured = [
      "Before",
      "",
      "```todoist-task-notes",
      "dashboard: full",
      "```",
      "",
      "After",
    ].join("\n");

    expect(hasDashboardBlock(configured)).toBe(true);
    expect(appendDashboardBlock(configured)).toBe(configured);
  });
});

describe("dashboard slash command", () => {
  it.each([
    "/t",
    "/todoist",
    "/todoist:",
    "/todoist: add",
    "/todoist: add dashboard",
    "/todoist add dashboard",
    "/a",
    "/add dashboard",
    "/dashboard",
  ])(
    "matches %s at the start of an editor line",
    (value) => {
      expect(findDashboardSlashTrigger(value, value.length)).toEqual({
        startCh: 0,
        endCh: value.length,
        query: value.slice(1).trim().replace(/\s+/g, " ").toLowerCase(),
      });
    },
  );

  it("removes indentation with the slash command and ignores unrelated text", () => {
    expect(findDashboardSlashTrigger("  /add dashboard", 16)).toMatchObject({
      startCh: 0,
      endCh: 16,
      query: "add dashboard",
    });
    expect(findDashboardSlashTrigger("text /add dashboard", 19)).toBeNull();
    expect(findDashboardSlashTrigger("/add task", 9)).toBeNull();
  });
});
