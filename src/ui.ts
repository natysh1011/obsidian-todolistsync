import {
  App,
  FuzzySuggestModal,
  MarkdownRenderChild,
  Modal,
  Notice,
  Setting,
  setIcon,
  type ButtonComponent,
} from "obsidian";
import type { CreateTaskInput } from "./api";
import type { I18n } from "./i18n";
import {
  calculateDashboardStats,
  calculateProjectStats,
  dueDateKey,
  getDirectChildren,
  getTaskBreadcrumb,
  type DashboardTaskRecord,
  type ProjectTaskStats,
} from "./dashboard";
import {
  apiPriorityToName,
  buildDueFields,
  buildRecurrenceExpression,
  parseDurationInput,
  type TaskPathInfo,
  type TodoistProject,
  type TodoistTask,
} from "./core";

export interface NewTaskFormValue {
  title: string;
  description: string;
  projectId: string;
  parentId: string;
  labels: string[];
  dueDate: string;
  dueTime: string;
  deadline: string;
  priority: string;
  duration: string;
  recurrenceInterval: string;
  recurrenceUnit: "minute" | "hour" | "day" | "";
}

export interface NewTaskModalContext {
  projectId?: string;
  parentId?: string;
  lockHierarchy?: boolean;
}

export interface TaskNoteActionContext {
  taskId: string;
  projectId: string;
  taskTitle: string;
  enabled: boolean;
  disabledReason: string | null;
}

export interface DashboardData {
  tasks: TodoistTask[];
  knownTasks: DashboardTaskRecord[];
  projects: TodoistProject[];
  paths: Map<string, TaskPathInfo>;
  lastSync: string | null;
  lastError: string | null;
}

export interface TaskNotesHost {
  app: App;
  getI18n(): I18n;
  getDashboardData(): DashboardData;
  getProjects(): TodoistProject[];
  getTasks(): TodoistTask[];
  syncNow(reason: string): Promise<void>;
  openNewTaskModal(context?: NewTaskModalContext): void;
  openSubtaskModal(taskId: string): void;
  getTaskNoteActionContext(path: string): TaskNoteActionContext | null;
  createTaskFromForm(form: NewTaskFormValue): Promise<void>;
  setTaskCompleted(id: string, completed: boolean): Promise<void>;
}

export class NewTaskModal extends Modal {
  private value: NewTaskFormValue;
  private parentPathIds: string[] = [];
  private parentSelectorsEl: HTMLElement | null = null;
  private readonly context: NewTaskModalContext;

  constructor(
    app: App,
    private readonly host: TaskNotesHost,
    context: NewTaskModalContext = {},
  ) {
    super(app);
    this.context = context;
    const projects = host.getProjects();
    const parent = context.parentId
      ? host.getTasks().find((task) => task.id === context.parentId)
      : null;
    const projectId =
      context.projectId ?? parent?.project_id ?? projects[0]?.id ?? "";
    this.value = {
      title: "",
      description: "",
      projectId,
      parentId: context.parentId ?? "",
      labels: [],
      dueDate: "",
      dueTime: "",
      deadline: "",
      priority: "p4",
      duration: "",
      recurrenceInterval: "",
      recurrenceUnit: "",
    };
    if (context.parentId) {
      this.parentPathIds = getTaskBreadcrumb(
        host.getTasks(),
        context.parentId,
      ).map((task) => task.id);
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    const i18n = this.host.getI18n();
    contentEl.empty();
    contentEl.addClass("todoist-task-notes-modal");
    contentEl.setAttr("dir", i18n.direction);
    contentEl.setAttr("lang", i18n.locale);
    this.setTitle(
      i18n.t(
        this.context.lockHierarchy ? "modal.addSubtask" : "modal.newTask",
      ),
    );

    new Setting(contentEl)
      .setName(i18n.t("modal.title"))
      .setDesc(i18n.t("modal.required"))
      .addText((text) => {
        text.setPlaceholder(i18n.t("modal.titlePlaceholder")).onChange((value) => {
          this.value.title = value;
        });
        text.inputEl.autofocus = true;
      });

    new Setting(contentEl)
      .setName(i18n.t("modal.description"))
      .addTextArea((text) => {
        text.setPlaceholder(i18n.t("modal.descriptionPlaceholder")).onChange((value) => {
          this.value.description = value;
        });
      });

    if (this.context.lockHierarchy) {
      this.renderLockedHierarchy(contentEl);
    } else {
      this.renderHierarchyPicker(contentEl);
    }

    new Setting(contentEl)
      .setName(i18n.t("modal.labels"))
      .setDesc(i18n.t("modal.labelsDescription"))
      .addText((text) =>
        text.setPlaceholder(i18n.t("modal.labelsPlaceholder")).onChange((value) => {
          this.value.labels = value
            .split(",")
            .map((label) => label.trim())
            .filter(Boolean);
        }),
      );

    new Setting(contentEl).setName(i18n.t("modal.dueDate")).addText((text) => {
      text.inputEl.type = "date";
      text.onChange((value) => {
        this.value.dueDate = value;
      });
    });

    new Setting(contentEl).setName(i18n.t("modal.dueTime")).addText((text) => {
      text.inputEl.type = "time";
      text.onChange((value) => {
        this.value.dueTime = value;
      });
    });

    new Setting(contentEl)
      .setName(i18n.t("modal.recurrence"))
      .setDesc(i18n.t("modal.recurrenceDescription"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.step = "1";
        text.inputEl.inputMode = "numeric";
        text.setPlaceholder(i18n.t("modal.number")).onChange((value) => {
          this.value.recurrenceInterval = value;
        });
      })
      .addDropdown((dropdown) =>
        dropdown
          .addOption("", i18n.t("modal.noRecurrence"))
          .addOption("minute", i18n.t("unit.minutes"))
          .addOption("hour", i18n.t("unit.hours"))
          .addOption("day", i18n.t("unit.days"))
          .setValue("")
          .onChange((value) => {
            this.value.recurrenceUnit = value as
              | "minute"
              | "hour"
              | "day"
              | "";
          }),
      );

    new Setting(contentEl).setName(i18n.t("modal.deadline")).addText((text) => {
      text.inputEl.type = "date";
      text.onChange((value) => {
        this.value.deadline = value;
      });
    });

    new Setting(contentEl).setName(i18n.t("modal.priority")).addDropdown((dropdown) => {
      dropdown
        .addOption("p4", i18n.t("priority.normal"))
        .addOption("p3", i18n.t("priority.medium"))
        .addOption("p2", i18n.t("priority.high"))
        .addOption("p1", i18n.t("priority.urgent"))
        .setValue("p4")
        .onChange((value) => {
          this.value.priority = value;
        });
    });

    let durationAmount = "";
    let durationUnit: "minute" | "hour" | "day" = "minute";
    const updateDuration = (): void => {
      this.value.duration = durationAmount
        ? `${durationAmount} ${durationUnit}`
        : "";
    };
    new Setting(contentEl)
      .setName(i18n.t("modal.duration"))
      .setDesc(i18n.t("modal.durationDescription"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.step = "1";
        text.setPlaceholder("30").onChange((value) => {
          durationAmount = value;
          updateDuration();
        });
      })
      .addDropdown((dropdown) => {
        dropdown
          .addOption("minute", i18n.t("unit.minutes"))
          .addOption("hour", i18n.t("unit.hours"))
          .addOption("day", i18n.t("unit.days"))
          .setValue(durationUnit)
          .onChange((value) => {
            if (value === "minute" || value === "hour" || value === "day") {
              durationUnit = value;
              updateDuration();
            }
          });
      });

    const actions = new Setting(contentEl);
    actions.settingEl.addClass("todoist-task-notes-modal-actions");
    actions
      .addButton((button) =>
        button.setButtonText(i18n.t("common.cancel")).onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setButtonText(i18n.t("modal.createAndSync"))
          .setCta()
          .onClick(() => {
            void this.submitTask(button);
          }),
      );
  }

  private async submitTask(button: ButtonComponent): Promise<void> {
    const i18n = this.host.getI18n();
    if (!this.value.title.trim()) {
      new Notice(i18n.t("notice.titleRequired"));
      return;
    }
    button.setDisabled(true);
    try {
      await this.host.createTaskFromForm(this.value);
      this.close();
    } catch (error) {
      new Notice(i18n.t("notice.createFailed", {
        error: error instanceof Error ? error.message : String(error),
      }));
      button.setDisabled(false);
    }
  }

  private renderLockedHierarchy(container: HTMLElement): void {
    const i18n = this.host.getI18n();
    const project = this.host
      .getProjects()
      .find((item) => item.id === this.value.projectId);
    const path = this.parentPathIds
      .map(
        (id) =>
          this.host.getTasks().find((task) => task.id === id)?.content ?? id,
      )
      .join(" ← ");
    new Setting(container)
      .setName(i18n.t("field.project"))
      .setDesc(project?.name ?? i18n.t("common.unknownProject"));
    const setting = new Setting(container)
      .setName(i18n.t("modal.lockedParent"))
      .setDesc(path || i18n.t("common.noParent"));
    setting.settingEl.addClass("todoist-task-notes-hierarchy-locked");
  }

  private renderHierarchyPicker(container: HTMLElement): void {
    const i18n = this.host.getI18n();
    const projects = this.host.getProjects();
    new Setting(container)
      .setName(i18n.t("field.project"))
      .setDesc(i18n.t("modal.projectDescription"))
      .addDropdown((dropdown) => {
        for (const project of projects) {
          dropdown.addOption(project.id, project.name);
        }
        dropdown.setValue(this.value.projectId).onChange((value) => {
          this.value.projectId = value;
          this.value.parentId = "";
          this.parentPathIds = [];
          this.renderParentSelectors();
        });
      });
    this.parentSelectorsEl = container.createDiv(
      "todoist-task-notes-parent-selectors",
    );
    this.renderParentSelectors();
  }

  private renderParentSelectors(): void {
    if (!this.parentSelectorsEl) return;
    const i18n = this.host.getI18n();
    this.parentSelectorsEl.empty();
    const tasks = this.host.getTasks();
    let level = 0;
    let parentId: string | null = null;

    while (true) {
      const currentLevel = level;
      const options = getDirectChildren(
        tasks,
        this.value.projectId,
        parentId,
      );
      const selectedId = this.parentPathIds[currentLevel] ?? "";
      if (!options.length && !selectedId) break;

      const setting = new Setting(this.parentSelectorsEl)
        .setName(
          currentLevel === 0
            ? i18n.t("modal.mainTask")
            : i18n.t("modal.subtaskLevel", { level: currentLevel }),
        )
        .setDesc(
          currentLevel === 0
            ? i18n.t("modal.mainTaskDescription")
            : i18n.t("modal.childDescription"),
        );
      setting.addDropdown((dropdown) => {
        dropdown.addOption(
          "",
          currentLevel === 0
            ? i18n.t("modal.stopAtProject")
            : i18n.t("modal.stopAtLevel"),
        );
        for (const task of options) {
          dropdown.addOption(task.id, task.content);
        }
        dropdown.setValue(selectedId).onChange((value) => {
          this.parentPathIds = this.parentPathIds.slice(0, currentLevel);
          if (value) this.parentPathIds.push(value);
          this.value.parentId =
            this.parentPathIds[this.parentPathIds.length - 1] ?? "";
          this.renderParentSelectors();
        });
      });

      if (!selectedId) break;
      parentId = selectedId;
      level += 1;
    }

    const breadcrumb = this.parentSelectorsEl.createDiv(
      "todoist-task-notes-breadcrumb",
    );
    breadcrumb.createSpan({ text: `${i18n.t("modal.parentPath")} ` });
    const names = this.parentPathIds.map(
      (id) => tasks.find((task) => task.id === id)?.content ?? id,
    );
    breadcrumb.createEl("strong", {
      text: names.length ? names.join(" ← ") : i18n.t("modal.projectLevel"),
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function formToApiInput(
  form: NewTaskFormValue,
): CreateTaskInput {
  const duration = parseDurationInput(form.duration);
  const recurrence = buildRecurrenceExpression(
    form.recurrenceInterval,
    form.recurrenceUnit,
  );
  return {
    content: form.title.trim(),
    description: form.description.trim(),
    project_id: form.projectId || undefined,
    parent_id: form.parentId || undefined,
    labels: form.labels,
    priority: 5 - Number(form.priority.slice(1)),
    ...buildDueFields(form.dueDate, form.dueTime, recurrence),
    deadline_date: form.deadline || undefined,
    ...(duration ?? {}),
  };
}

export interface PickerItem {
  id: string;
  label: string;
  description?: string;
}

export class ItemPickerModal extends FuzzySuggestModal<PickerItem> {
  constructor(
    app: App,
    private readonly i18n: I18n,
    private readonly title: string,
    private readonly items: PickerItem[],
    private readonly onPick: (item: PickerItem) => void | Promise<void>,
  ) {
    super(app);
    this.setPlaceholder(title);
  }

  getItems(): PickerItem[] {
    return this.items;
  }

  getItemText(item: PickerItem): string {
    return item.description
      ? `${item.label} — ${item.description}`
      : item.label;
  }

  onChooseItem(item: PickerItem): void {
    void Promise.resolve(this.onPick(item)).catch((error: unknown) => {
      new Notice(this.i18n.t("notice.actionFailed", {
        error: error instanceof Error ? error.message : String(error),
      }));
    });
  }
}

export class TaskActionsChild extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    private readonly host: TaskNotesHost,
    private readonly sourcePath: string,
  ) {
    super(containerEl);
  }

  onload(): void {
    this.render();
    const workspace = this.host.app.workspace as unknown as {
      on(
        name: string,
        callback: () => void,
      ): ReturnType<App["workspace"]["on"]>;
    };
    this.registerEvent(
      workspace.on("todoist-task-notes:updated", () => this.render()),
    );
  }

  private render(): void {
    const i18n = this.host.getI18n();
    this.containerEl.empty();
    this.containerEl.addClass("todoist-task-notes-inline-actions");
    this.containerEl.setAttr("dir", i18n.direction);
    this.containerEl.setAttr("lang", i18n.locale);
    const context = this.host.getTaskNoteActionContext(this.sourcePath);
    if (!context) return;
    const button = this.containerEl.createEl("button", {
      cls: "todoist-task-notes-add-subtask",
      text: i18n.t("action.addSubtask"),
    });
    setIcon(button.createSpan(), "list-plus");
    if (context.enabled) {
      button.addEventListener("click", () =>
        this.host.openSubtaskModal(context.taskId),
      );
      return;
    }
    button.disabled = true;
    button.setAttr("aria-disabled", "true");
    button.setAttr(
      "title",
      context.disabledReason ?? i18n.t("action.unavailable"),
    );
    if (context.disabledReason) {
      this.containerEl.createSpan({
        cls: "todoist-task-notes-action-reason",
        text: context.disabledReason,
      });
    }
  }
}

export class DashboardChild extends MarkdownRenderChild {
  private readonly expandedProjectIds = new Set<string>();
  private readonly expandedTaskIds = new Set<string>();

  constructor(
    containerEl: HTMLElement,
    private readonly host: TaskNotesHost,
    private readonly sourcePath: string,
  ) {
    super(containerEl);
  }

  onload(): void {
    const workspace = this.host.app.workspace as unknown as {
      on(
        name: string,
        callback: () => void,
      ): ReturnType<App["workspace"]["on"]>;
    };
    this.registerEvent(
      workspace.on("todoist-task-notes:updated", () => this.render()),
    );
    this.render();
  }

  private render(): void {
    const i18n = this.host.getI18n();
    const data = this.host.getDashboardData();
    const stats = calculateDashboardStats(data.knownTasks);
    const projectStats = calculateProjectStats(data.knownTasks);
    const projectById = new Map(
      data.projects.map((project) => [project.id, project]),
    );
    const children = this.buildChildren(data.tasks);

    this.containerEl.empty();
    this.containerEl.addClass("todoist-task-notes-dashboard");
    this.containerEl.setAttr("dir", i18n.direction);
    this.containerEl.setAttr("lang", i18n.locale);
    this.renderToolbar(data);
    this.renderOverview(stats.overview);

    if (!projectStats.length) {
      this.containerEl.createDiv({
        cls: "todoist-task-notes-empty",
        text: i18n.t("dashboard.empty"),
      });
      return;
    }

    const statsSection = this.containerEl.createEl("section", {
      cls: "todoist-task-notes-section",
    });
    statsSection.createEl("h2", { text: i18n.t("dashboard.projectSnapshot") });
    const statsGrid = statsSection.createDiv(
      "todoist-task-notes-branch-stats-grid",
    );
    for (const project of projectStats) {
      this.renderProjectStats(
        statsGrid,
        project,
        projectById.get(project.projectId)?.name ?? i18n.t("common.unknownProject"),
      );
    }

    const treeSection = this.containerEl.createEl("section", {
      cls: "todoist-task-notes-section",
    });
    treeSection.createEl("h2", { text: i18n.t("dashboard.tasks") });
    treeSection.createEl("p", {
      cls: "todoist-task-notes-section-hint",
      text: i18n.t("dashboard.treeHint"),
    });
    const branches = treeSection.createDiv(
      "todoist-task-notes-branch-list",
    );
    for (const project of projectStats) {
      const projectName =
        projectById.get(project.projectId)?.name ?? i18n.t("common.unknownProject");
      this.renderProjectBranch(
        branches,
        project,
        projectName,
        data.tasks,
        children,
        data.paths,
      );
    }
  }

  private renderToolbar(data: DashboardData): void {
    const i18n = this.host.getI18n();
    const toolbar = this.containerEl.createDiv(
      "todoist-task-notes-toolbar",
    );
    const newButton = toolbar.createEl("button", {
      text: i18n.t("dashboard.newTask"),
    });
    setIcon(newButton.createSpan(), "plus");
    newButton.addEventListener("click", () => this.host.openNewTaskModal());
    const syncButton = toolbar.createEl("button", {
      text: i18n.t("dashboard.syncNow"),
    });
    setIcon(syncButton.createSpan(), "refresh-cw");
    syncButton.addEventListener("click", () => {
      void this.syncFromDashboard(syncButton);
    });
    const status = toolbar.createSpan("todoist-task-notes-status");
    if (data.lastError) {
      status.setText(i18n.t("dashboard.lastError", { error: data.lastError }));
    } else if (data.lastSync) {
      status.setText(
        i18n.t("dashboard.lastSync", {
          date: new Date(data.lastSync).toLocaleString(i18n.intlLocale),
        }),
      );
    } else {
      status.setText(i18n.t("dashboard.neverSynced"));
    }
  }

  private async syncFromDashboard(button: HTMLButtonElement): Promise<void> {
    button.setAttr("disabled", "true");
    try {
      await this.host.syncNow("dashboard");
    } finally {
      button.removeAttribute("disabled");
    }
  }

  private renderOverview(
    overview: ReturnType<typeof calculateDashboardStats>["overview"],
  ): void {
    const i18n = this.host.getI18n();
    const section = this.containerEl.createEl("section", {
      cls: "todoist-task-notes-section",
    });
    section.createEl("h2", { text: i18n.t("dashboard.overview") });
    const grid = section.createDiv("todoist-task-notes-overview-grid");
    const cards: Array<[string, number, string]> = [
      [i18n.t("dashboard.openTasks"), overview.openCount, "list-checks"],
      [i18n.t("dashboard.overdue"), overview.overdueCount, "alarm-clock"],
      [i18n.t("dashboard.dueSoon"), overview.dueSoonCount, "calendar-days"],
      [i18n.t("dashboard.urgentP1P2"), overview.urgentCount, "flame"],
    ];
    for (const [label, value, icon] of cards) {
      const card = grid.createDiv("todoist-task-notes-overview-card");
      const iconEl = card.createSpan("todoist-task-notes-stat-icon");
      setIcon(iconEl, icon);
      card.createEl("strong", { text: String(value) });
      card.createSpan({ text: label });
    }
  }

  private renderProjectStats(
    parent: HTMLElement,
    project: ProjectTaskStats,
    projectName: string,
  ): void {
    const i18n = this.host.getI18n();
    const card = parent.createDiv("todoist-task-notes-branch-stat-card");
    const heading = card.createDiv("todoist-task-notes-branch-stat-heading");
    heading.createEl("h3", { text: projectName });
    heading.createSpan({ text: i18n.t("dashboard.todoistProject") });
    const progressLabel = card.createDiv(
      "todoist-task-notes-progress-label",
    );
    progressLabel.createSpan({
      text: i18n.t("dashboard.remainingCompleted", {
        remaining: project.openCount,
        completed: project.completedCount,
      }),
    });
    progressLabel.createEl("strong", {
      text: `${project.completionPercent}%`,
    });
    const progress = card.createDiv("todoist-task-notes-progress");
    progress.setAttr("role", "progressbar");
    progress.setAttr(
      "aria-label",
      i18n.t("dashboard.progress", { project: projectName }),
    );
    progress.setAttr("aria-valuemin", "0");
    progress.setAttr("aria-valuemax", "100");
    progress.setAttr("aria-valuenow", String(project.completionPercent));
    progress.createDiv({
      cls: "todoist-task-notes-progress-value",
      attr: { style: `width: ${project.completionPercent}%` },
    });

    const next = card.createDiv("todoist-task-notes-next-task");
    next.createSpan({ text: i18n.t("dashboard.nextTask") });
    if (project.nextTask) {
      next.createEl("strong", { text: project.nextTask.content });
      next.createSpan({
        text: this.formatDue(project.nextTask.due?.date ?? ""),
      });
    } else {
      next.createEl("strong", { text: i18n.t("dashboard.noDatedTasks") });
    }

    const details = card.createDiv("todoist-task-notes-branch-metrics");
    this.renderMetric(details, i18n.t("dashboard.overdue"), project.overdueCount);
    this.renderMetric(details, i18n.t("dashboard.urgent"), project.urgentCount);
    this.renderMetric(details, i18n.t("dashboard.noDate"), project.unscheduledCount);
  }

  private renderMetric(parent: HTMLElement, label: string, value: number): void {
    const metric = parent.createDiv();
    metric.createEl("strong", { text: String(value) });
    metric.createSpan({ text: label });
  }

  private renderProjectBranch(
    parent: HTMLElement,
    project: ProjectTaskStats,
    projectName: string,
    tasks: TodoistTask[],
    children: Map<string, TodoistTask[]>,
    paths: Map<string, TaskPathInfo>,
  ): void {
    const card = parent.createEl("article", {
      cls: "todoist-task-notes-project-branch",
    });
    const header = card.createDiv("todoist-task-notes-project-header");
    const expanded = this.expandedProjectIds.has(project.projectId);
    const panelId = `todoist-task-notes-project-${project.projectId}`;
    this.createToggle(
      header,
      projectName,
      expanded,
      panelId,
      () => this.toggleProject(project.projectId),
    );
    header.createEl("strong", { text: projectName });
    header.createSpan({
      cls: "todoist-task-notes-remaining-badge",
      text: this.host.getI18n().plural("dashboard.taskCount", project.openCount),
    });
    if (!expanded) return;

    const panel = card.createDiv("todoist-task-notes-project-panel");
    panel.id = panelId;
    const activeIds = new Set(tasks.map((task) => task.id));
    const roots = tasks
      .filter(
        (task) =>
          task.project_id === project.projectId &&
          (!task.parent_id || !activeIds.has(task.parent_id)),
      )
      .sort(
        (a, b) =>
          (a.child_order ?? 0) - (b.child_order ?? 0) ||
          a.content.localeCompare(b.content),
      );
    for (const root of roots) {
      this.renderRootBranch(
        panel,
        root,
        this.countActiveSubtree(root, children),
        children,
        paths,
      );
    }
  }

  private renderRootBranch(
    parent: HTMLElement,
    root: TodoistTask,
    remainingCount: number,
    children: Map<string, TodoistTask[]>,
    paths: Map<string, TaskPathInfo>,
  ): void {
    const card = parent.createEl("article", {
      cls: "todoist-task-notes-root-branch",
    });
    const header = card.createDiv("todoist-task-notes-root-header");
    const expanded = this.expandedTaskIds.has(root.id);
    const panelId = `todoist-task-notes-branch-${root.id}`;
    const toggle = this.createToggle(
      header,
      root.content,
      expanded,
      panelId,
      () => this.toggleTask(root.id),
    );
    toggle.setAttr(
      "aria-label",
      this.host.getI18n().t(expanded ? "aria.collapse" : "aria.expand", {
        label: root.content,
      }),
    );
    this.createTaskLink(header, root, paths);
    header.createSpan({
      cls: "todoist-task-notes-remaining-badge",
      text: this.host
        .getI18n()
        .plural("dashboard.remainingCount", remainingCount),
    });

    if (!expanded) return;
    const panel = card.createDiv("todoist-task-notes-root-panel");
    panel.id = panelId;
    this.renderTaskControls(panel, root, paths);
    const taskChildren = children.get(root.id) ?? [];
    if (taskChildren.length) {
      const list = panel.createEl("ul", {
        cls: "todoist-task-notes-tree",
      });
      for (const child of taskChildren) {
        this.renderTask(list, child, children, paths);
      }
    } else {
      panel.createDiv({
        cls: "todoist-task-notes-empty",
        text: this.host.getI18n().t("dashboard.noActiveSubtasks"),
      });
    }
  }

  private renderTask(
    parent: HTMLUListElement,
    task: TodoistTask,
    children: Map<string, TodoistTask[]>,
    paths: Map<string, TaskPathInfo>,
  ): void {
    const item = parent.createEl("li");
    const row = item.createDiv("todoist-task-notes-row");
    const taskChildren = children.get(task.id) ?? [];
    const expanded = this.expandedTaskIds.has(task.id);
    const panelId = `todoist-task-notes-children-${task.id}`;
    if (taskChildren.length) {
      this.createToggle(
        row,
        task.content,
        expanded,
        panelId,
        () => this.toggleTask(task.id),
      );
    } else {
      row.createSpan("todoist-task-notes-toggle-spacer");
    }
    this.renderTaskControls(row, task, paths);

    if (taskChildren.length && expanded) {
      const nested = item.createEl("ul");
      nested.id = panelId;
      for (const child of taskChildren) {
        this.renderTask(nested, child, children, paths);
      }
    }
  }

  private renderTaskControls(
    parent: HTMLElement,
    task: TodoistTask,
    paths: Map<string, TaskPathInfo>,
  ): void {
    const checkbox = parent.createEl("input");
    checkbox.type = "checkbox";
    checkbox.checked = false;
    checkbox.setAttribute(
      "aria-label",
      this.host.getI18n().t("aria.markCompleted", { task: task.content }),
    );
    checkbox.addEventListener("change", () => {
      void this.updateTaskCompletion(checkbox, task);
    });
    this.createTaskLink(parent, task, paths);
    this.renderTaskMeta(parent, task);
  }

  private async updateTaskCompletion(
    checkbox: HTMLInputElement,
    task: TodoistTask,
  ): Promise<void> {
    checkbox.disabled = true;
    try {
      await this.host.setTaskCompleted(task.id, checkbox.checked);
    } catch (error) {
      checkbox.checked = !checkbox.checked;
      new Notice(this.host.getI18n().t("notice.todoistUpdateFailed", {
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      checkbox.disabled = false;
    }
  }

  private createTaskLink(
    parent: HTMLElement,
    task: TodoistTask,
    paths: Map<string, TaskPathInfo>,
  ): void {
    const path = paths.get(task.id)?.note;
    const link = parent.createEl("a", {
      text: task.content,
      cls: "internal-link todoist-task-notes-task-link",
      href: path ? path.replace(/\.md$/, "") : "#",
    });
    if (path) {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        void this.host.app.workspace.openLinkText(
          path.replace(/\.md$/, ""),
          this.sourcePath,
        );
      });
    }
  }

  private renderTaskMeta(parent: HTMLElement, task: TodoistTask): void {
    const priority = apiPriorityToName(task.priority);
    if (priority !== "p4") {
      parent.createSpan({
        cls: `todoist-task-notes-meta todoist-task-notes-priority-${priority}`,
        text: priority.toUpperCase(),
      });
    }
    if (task.due?.date) {
      parent.createSpan({
        cls: "todoist-task-notes-meta",
        text: `📅 ${this.formatDue(task.due.date)}`,
      });
    }
    if (task.labels?.length) {
      parent.createSpan({
        cls: "todoist-task-notes-meta",
        text: task.labels.map((label) => `#${label}`).join(" "),
      });
    }
  }

  private createToggle(
    parent: HTMLElement,
    label: string,
    expanded: boolean,
    controlsId: string,
    onToggle: () => void,
  ): HTMLButtonElement {
    const button = parent.createEl("button", {
      cls: "todoist-task-notes-toggle",
    });
    button.setAttr("aria-expanded", String(expanded));
    button.setAttr("aria-controls", controlsId);
    button.setAttr(
      "aria-label",
      this.host.getI18n().t(expanded ? "aria.collapse" : "aria.expand", {
        label,
      }),
    );
    setIcon(button, "chevron-down");
    if (expanded) button.addClass("is-expanded");
    button.addEventListener("click", onToggle);
    return button;
  }

  private toggleProject(projectId: string): void {
    if (this.expandedProjectIds.has(projectId)) {
      this.expandedProjectIds.delete(projectId);
    } else {
      this.expandedProjectIds.add(projectId);
    }
    this.render();
  }

  private toggleTask(taskId: string): void {
    if (this.expandedTaskIds.has(taskId)) {
      this.expandedTaskIds.delete(taskId);
    } else {
      this.expandedTaskIds.add(taskId);
    }
    this.render();
  }

  private countActiveSubtree(
    root: TodoistTask,
    children: Map<string, TodoistTask[]>,
  ): number {
    let count = 1;
    for (const child of children.get(root.id) ?? []) {
      count += this.countActiveSubtree(child, children);
    }
    return count;
  }

  private buildChildren(tasks: TodoistTask[]): Map<string, TodoistTask[]> {
    const byId = new Set(tasks.map((task) => task.id));
    const children = new Map<string, TodoistTask[]>();
    for (const task of tasks) {
      if (!task.parent_id || !byId.has(task.parent_id)) continue;
      const list = children.get(task.parent_id) ?? [];
      list.push(task);
      children.set(task.parent_id, list);
    }
    for (const list of children.values()) {
      list.sort(
        (a, b) =>
          (a.child_order ?? 0) - (b.child_order ?? 0) ||
          a.content.localeCompare(b.content),
      );
    }
    return children;
  }

  private formatDue(value: string): string {
    const key = dueDateKey({ id: "", content: "", project_id: "", due: { date: value } });
    if (!key) return value;
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(
      this.host.getI18n().intlLocale,
    );
  }
}
