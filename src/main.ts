import {
  App,
  MarkdownPostProcessorContext,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  normalizePath,
} from "obsidian";
import {
  dashboardRecordFromProperties,
  type DashboardTaskRecord,
} from "./dashboard";
import {
  TodoistApi,
  TodoistApiError,
  type CreateTaskInput,
  type TodoistLabel,
} from "./api";
import {
  buildTaskPathMap,
  localComparable,
  makeTaskProperties,
  namePriorityToApi,
  parseTaskNote,
  remoteComparable,
  renderTaskNote,
  resolveSyncChange,
  sanitizeSegment,
  stableFingerprint,
  TASK_ACTIONS_BLOCK,
  type ComparableTask,
  type ParsedTaskNote,
  type TaskPathInfo,
  type TodoistProject,
  type TodoistTask,
} from "./core";
import {
  DashboardChild,
  ItemPickerModal,
  NewTaskModal,
  TaskActionsChild,
  formToApiInput,
  type DashboardData,
  type NewTaskModalContext,
  type NewTaskFormValue,
  type TaskNoteActionContext,
  type TaskNotesHost,
} from "./ui";

interface PluginSettings {
  rootFolder: string;
  dashboardPath: string;
  intervalMinutes: number;
  tokenSecretId: string;
}

interface TaskSyncState {
  path: string;
  fingerprint: string;
  status: "open" | "completed" | "detached";
  missingCount: number;
}

interface StoredPluginData {
  settings: PluginSettings;
  tasks: Record<string, TaskSyncState>;
  initialImportDone: boolean;
  lastSync: string | null;
  lastError: string | null;
}

interface LocalTaskFile {
  file: TFile;
  parsed: ParsedTaskNote;
}

const DEFAULT_SETTINGS: PluginSettings = {
  rootFolder: "משימות/Todoist",
  dashboardPath: "משימות/Untitled.md",
  intervalMinutes: 5,
  tokenSecretId: "swt-todoist-api-token",
};

const DEFAULT_DATA: StoredPluginData = {
  settings: DEFAULT_SETTINGS,
  tasks: {},
  initialImportDone: false,
  lastSync: null,
  lastError: null,
};

export default class TodoistTaskNotesPlugin
  extends Plugin
  implements TaskNotesHost
{
  private data: StoredPluginData = structuredClone(DEFAULT_DATA);
  private api!: TodoistApi;
  private projects: TodoistProject[] = [];
  private tasks: TodoistTask[] = [];
  private labels: TodoistLabel[] = [];
  private paths = new Map<string, TaskPathInfo>();
  private knownTasks: DashboardTaskRecord[] = [];
  private syncPromise: Promise<void> | null = null;
  private localSyncTimer: number | null = null;
  private taskHeaderAction: HTMLElement | null = null;
  private readonly writingPaths = new Set<string>();

  async onload(): Promise<void> {
    await this.loadPluginData();
    this.api = new TodoistApi(() => this.getTodoistToken());

    this.addSettingTab(new TodoistTaskNotesSettingTab(this.app, this));
    this.addRibbonIcon("list-plus", "New Todoist task", () =>
      this.openNewTaskModal(),
    );
    this.addRibbonIcon("refresh-cw", "Sync Todoist task notes", () => {
      void this.syncNow("ribbon");
    });

    this.addCommand({
      id: "new-task",
      name: "New task",
      callback: () => this.openNewTaskModal(),
    });
    this.addCommand({
      id: "sync-now",
      name: "Sync now",
      callback: () => void this.syncNow("command"),
    });
    this.addCommand({
      id: "preview-changes",
      name: "Preview pending local changes",
      callback: () => void this.previewPendingChanges(),
    });
    this.addCommand({
      id: "reparent-current-task",
      name: "Reparent current task",
      checkCallback: (checking) => this.reparentCurrentTask(checking),
    });
    this.addCommand({
      id: "move-current-task-project",
      name: "Move current task to project",
      checkCallback: (checking) => this.moveCurrentTaskProject(checking),
    });
    this.addCommand({
      id: "detach-current-task",
      name: "Detach current task safely",
      checkCallback: (checking) => this.detachCurrentTask(checking),
    });
    this.addCommand({
      id: "open-current-in-todoist",
      name: "Open current task in Todoist",
      checkCallback: (checking) => this.openCurrentInTodoist(checking),
    });

    this.registerMarkdownCodeBlockProcessor(
      "todoist-task-notes",
      (
        _source: string,
        element: HTMLElement,
        context: MarkdownPostProcessorContext,
      ) => {
        context.addChild(new DashboardChild(element, this, context.sourcePath));
      },
    );
    this.registerMarkdownCodeBlockProcessor(
      TASK_ACTIONS_BLOCK,
      (
        _source: string,
        element: HTMLElement,
        context: MarkdownPostProcessorContext,
      ) => {
        context.addChild(
          new TaskActionsChild(element, this, context.sourcePath),
        );
      },
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => this.onVaultChange(file)),
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => this.onVaultChange(file)),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file) => this.onVaultChange(file)),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () =>
        this.refreshTaskHeaderAction(),
      ),
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () =>
        this.refreshTaskHeaderAction(),
      ),
    );

    this.registerInterval(
      window.setInterval(
        () => void this.syncNow("interval"),
        Math.max(1, this.data.settings.intervalMinutes) * 60_000,
      ),
    );

    this.app.workspace.onLayoutReady(() => {
      this.refreshTaskHeaderAction();
      void this.syncNow("startup");
    });
  }

  onunload(): void {
    if (this.localSyncTimer !== null) {
      window.clearTimeout(this.localSyncTimer);
    }
  }

  getDashboardData(): DashboardData {
    return {
      tasks: this.tasks,
      knownTasks: this.knownTasks,
      projects: this.projects,
      paths: this.paths,
      lastSync: this.data.lastSync,
      lastError: this.data.lastError,
    };
  }

  getProjects(): TodoistProject[] {
    return this.projects;
  }

  getTasks(): TodoistTask[] {
    return this.tasks;
  }

  getSettings(): PluginSettings {
    return this.data.settings;
  }

  async updateSettings(changes: Partial<PluginSettings>): Promise<void> {
    this.data.settings = { ...this.data.settings, ...changes };
    await this.savePluginData();
  }

  async testConnection(): Promise<void> {
    await this.api.validate();
    new Notice("Todoist Task Notes: API connection is working.");
  }

  openNewTaskModal(context: NewTaskModalContext = {}): void {
    if (!this.projects.length) {
      new Notice("יש לסנכרן פעם אחת לפני יצירת משימה.");
      void this.syncNow("new-task-prerequisite").then(() => {
        if (this.projects.length) {
          new NewTaskModal(this.app, this, context).open();
        }
      });
      return;
    }
    new NewTaskModal(this.app, this, context).open();
  }

  openSubtaskModal(taskId: string): void {
    const parent = this.tasks.find((task) => task.id === taskId);
    if (!parent) {
      new Notice("לא ניתן להוסיף תת־משימה למשימה שאינה פעילה.");
      return;
    }
    this.openNewTaskModal({
      projectId: parent.project_id,
      parentId: parent.id,
      lockHierarchy: true,
    });
  }

  getTaskNoteActionContext(path: string): TaskNoteActionContext | null {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return null;
    const frontmatter =
      this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (frontmatter?.type !== "todoist-task") return null;
    const taskId = String(frontmatter.todoist_id ?? "").trim();
    const projectId = String(frontmatter.project_id ?? "").trim();
    const taskTitle = String(frontmatter.title ?? file.basename);
    const status = String(frontmatter.status ?? "open");
    const syncState = String(frontmatter.sync_state ?? "");
    let disabledReason: string | null = null;
    if (!taskId || syncState === "pending-create") {
      disabledReason =
        "המשימה עדיין ממתינה ליצירה ב־Todoist; ניתן להוסיף ילדים לאחר הסנכרון.";
    } else if (status === "completed") {
      disabledReason = "לא ניתן להוסיף תת־משימה למשימה שהושלמה.";
    } else if (status === "detached" || syncState === "detached") {
      disabledReason = "הפתק מנותק מ־Todoist.";
    } else if (!this.tasks.some((task) => task.id === taskId)) {
      disabledReason = "המשימה אינה פעילה כרגע ב־Todoist.";
    }
    return {
      taskId,
      projectId,
      taskTitle,
      enabled: disabledReason === null,
      disabledReason,
    };
  }

  async createTaskFromForm(form: NewTaskFormValue): Promise<void> {
    const requestId = crypto.randomUUID();
    const input = formToApiInput(form);
    try {
      this.labels = await this.api.ensureLabels(form.labels, this.labels);
      const created = await this.api.createTask(input, requestId);
      this.tasks.push(created);
      this.paths = buildTaskPathMap(
        this.tasks,
        this.projects,
        this.data.settings.rootFolder,
      );
      const file = await this.materializeRemoteTask(
        created,
        "open",
        this.paths,
        null,
      );
      await this.refreshKnownTasks();
      await this.savePluginData();
      this.triggerDashboardUpdate();
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice("Todoist task created.");
    } catch (error) {
      const pendingFile = await this.createPendingTaskNote(
        input,
        requestId,
        form,
      );
      await this.refreshKnownTasks();
      await this.app.workspace.getLeaf(false).openFile(pendingFile);
      new Notice(
        `Saved offline as pending-create. It will retry on the next sync. ${
          error instanceof Error ? error.message : String(error)
        }`,
        8000,
      );
    }
  }

  async setTaskCompleted(
    id: string,
    completed: boolean,
  ): Promise<void> {
    if (completed) await this.api.closeTask(id);
    else await this.api.reopenTask(id);
    await this.syncNow("dashboard-completion");
  }

  async syncNow(reason: string): Promise<void> {
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.performSync(reason).finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  private async performSync(reason: string): Promise<void> {
    const pullOnly = !this.data.initialImportDone;
    try {
      const localFiles = await this.scanLocalTaskFiles();
      this.projects = await this.api.listProjects();
      this.labels = await this.api.listLabels();
      const activeTasks = await this.api.listTasks();

      if (!pullOnly) {
        const pendingCreated = await this.createPendingTasks(localFiles);
        activeTasks.push(...pendingCreated);
      }

      const completedSince = new Date(
        Math.max(
          Date.now() - 89 * 24 * 60 * 60 * 1000,
          (this.data.lastSync
            ? new Date(this.data.lastSync).getTime()
            : Date.now()) -
            24 * 60 * 60 * 1000,
        ),
      );
      const completedTasks = pullOnly
        ? []
        : await this.api.listCompletedSince(completedSince);

      const localById = new Map<string, LocalTaskFile>();
      for (const local of localFiles) {
        const id = local.parsed.properties.todoist_id;
        if (id) localById.set(String(id), local);
      }
      const activeById = new Map(activeTasks.map((task) => [task.id, task]));
      const completedById = new Map(
        completedTasks.map((task) => [task.id, task]),
      );
      const knownCompleted = completedTasks.filter(
        (task) => localById.has(task.id) || Boolean(this.data.tasks[task.id]),
      );
      const pathTasks = [
        ...activeTasks,
        ...knownCompleted.filter((task) => !activeById.has(task.id)),
      ];
      let pathMap = buildTaskPathMap(
        pathTasks,
        this.projects,
        this.data.settings.rootFolder,
      );

      const activeForDashboard: TodoistTask[] = [];
      const locallyCompleted = new Set<string>();
      const sortedActive = [...activeTasks].sort(
        (a, b) =>
          (pathMap.get(a.id)?.depth ?? 0) -
          (pathMap.get(b.id)?.depth ?? 0),
      );

      for (const remote of sortedActive) {
        const local = localById.get(remote.id) ?? null;
        if (local?.parsed.properties.sync_state === "detached") {
          this.data.tasks[remote.id] = {
            path: local.file.path,
            fingerprint: stableFingerprint(remoteComparable(remote)),
            status: "detached",
            missingCount: 0,
          };
          continue;
        }

        let effective = remote;
        const previous = this.data.tasks[remote.id]?.fingerprint;

        if (local && !pullOnly) {
          const localState = localComparable(local.parsed.properties);
          const resolution = resolveSyncChange(
            previous,
            localState,
            remoteComparable(remote),
          );

          if (resolution === "conflict") {
            await this.writeConflictCopy(local, remote);
          } else if (
            resolution === "local" &&
            localState.status === "completed"
          ) {
            await this.api.closeTask(remote.id);
            locallyCompleted.add(remote.id);
            const completed = {
              ...remote,
              completed_at: new Date().toISOString(),
            };
            await this.materializeRemoteTask(
              completed,
              "completed",
              pathMap,
              local,
            );
            continue;
          } else if (resolution === "local") {
            effective = await this.pushLocalChanges(remote, localState);
          }
        }

        await this.materializeRemoteTask(
          effective,
          "open",
          pathMap,
          local,
        );
        activeForDashboard.push(effective);
      }

      for (const completed of knownCompleted) {
        if (activeById.has(completed.id) || locallyCompleted.has(completed.id)) {
          continue;
        }
        const local = localById.get(completed.id) ?? null;
        if (local?.parsed.properties.sync_state === "detached") continue;
        if (local && !pullOnly) {
          const localState = localComparable(local.parsed.properties);
          const resolution = resolveSyncChange(
            this.data.tasks[completed.id]?.fingerprint,
            localState,
            remoteComparable(completed, "completed"),
          );
          if (resolution === "conflict") {
            await this.writeConflictCopy(local, completed);
          } else if (
            resolution === "local" &&
            localState.status === "open"
          ) {
            await this.api.reopenTask(completed.id);
            const reopened = {
              ...completed,
              checked: false,
              completed_at: null,
            };
            await this.materializeRemoteTask(
              reopened,
              "open",
              pathMap,
              local,
            );
            activeForDashboard.push(reopened);
            continue;
          }
        }
        await this.materializeRemoteTask(
          completed,
          "completed",
          pathMap,
          local,
        );
      }

      const remoteKnown = new Set([
        ...activeById.keys(),
        ...completedById.keys(),
        ...locallyCompleted,
      ]);
      for (const [id, local] of localById) {
        if (remoteKnown.has(id)) {
          if (this.data.tasks[id]) this.data.tasks[id].missingCount = 0;
          continue;
        }
        const state = this.data.tasks[id];
        if (!state || state.status !== "open") continue;
        state.missingCount = (state.missingCount ?? 0) + 1;
        if (state.missingCount >= 3) {
          await this.markDetached(
            local,
            "Remote task was deleted or is unavailable.",
          );
          state.status = "detached";
        }
      }

      this.tasks = activeForDashboard.filter(
        (task) => !locallyCompleted.has(task.id),
      );
      pathMap = buildTaskPathMap(
        this.tasks,
        this.projects,
        this.data.settings.rootFolder,
      );
      this.paths = pathMap;
      await this.refreshKnownTasks();
      this.data.initialImportDone = true;
      this.data.lastSync = new Date().toISOString();
      this.data.lastError = null;
      await this.savePluginData();
      this.triggerDashboardUpdate();
      const imported = this.tasks.length;
      if (reason !== "interval" && reason !== "file-change") {
        new Notice(
          pullOnly
            ? `Todoist Task Notes: initial pull imported ${imported} active tasks without changing Todoist.`
            : `Todoist Task Notes: sync complete (${imported} active tasks).`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.data.lastError = message;
      await this.savePluginData();
      this.triggerDashboardUpdate();
      if (reason !== "interval" && reason !== "file-change") {
        new Notice(`Todoist Task Notes sync failed: ${message}`, 10000);
      }
      throw error;
    }
  }

  private async pushLocalChanges(
    remote: TodoistTask,
    local: ComparableTask,
  ): Promise<TodoistTask> {
    const current = remoteComparable(remote);
    const changes: Record<string, unknown> = {};
    if (local.title !== current.title) changes.content = local.title;
    if (local.description !== current.description) {
      changes.description = local.description;
    }
    if (stableFingerprint(local.labels) !== stableFingerprint(current.labels)) {
      changes.labels = local.labels;
      this.labels = await this.api.ensureLabels(local.labels, this.labels);
    }
    if (local.priority !== current.priority) {
      changes.priority = namePriorityToApi(local.priority);
    }
    if (
      local.due !== current.due ||
      local.due_string !== current.due_string ||
      local.recurring !== current.recurring
    ) {
      if (local.recurring && local.due_string) {
        changes.due_string = local.due_string;
      } else if (local.due?.includes("T")) {
        changes.due_datetime = local.due;
      } else {
        changes.due_date = local.due;
      }
    }
    if (local.deadline !== current.deadline) {
      changes.deadline_date = local.deadline;
    }
    if (
      local.duration !== current.duration ||
      local.duration_unit !== current.duration_unit
    ) {
      changes.duration = local.duration;
      changes.duration_unit = local.duration_unit;
    }
    if (local.child_order !== current.child_order) {
      changes.child_order = local.child_order;
    }

    let effective =
      Object.keys(changes).length > 0
        ? await this.api.updateTask(remote.id, changes)
        : remote;

    if (
      local.parent_id !== current.parent_id ||
      local.project_id !== current.project_id
    ) {
      effective = local.parent_id
        ? await this.api.moveTask(remote.id, {
            parent_id: local.parent_id,
          })
        : await this.api.moveTask(remote.id, {
            project_id: local.project_id,
          });
    }
    return effective;
  }

  private async createPendingTasks(
    localFiles: LocalTaskFile[],
  ): Promise<TodoistTask[]> {
    const created: TodoistTask[] = [];
    for (const local of localFiles) {
      const properties = local.parsed.properties;
      if (
        properties.sync_state !== "pending-create" ||
        properties.todoist_id
      ) {
        continue;
      }
      const requestId = String(
        properties.pending_create_id ?? crypto.randomUUID(),
      );
      const localState = localComparable(properties);
      const input: CreateTaskInput = {
        content: localState.title,
        description: localState.description,
        project_id: localState.project_id || undefined,
        parent_id: localState.parent_id || undefined,
        labels: localState.labels,
        priority: namePriorityToApi(localState.priority),
        deadline_date: localState.deadline ?? undefined,
        duration: localState.duration ?? undefined,
        duration_unit:
          localState.duration_unit === "minute" ||
          localState.duration_unit === "day"
            ? localState.duration_unit
            : undefined,
      };
      if (localState.recurring && localState.due_string) {
        input.due_string = localState.due_string;
      } else if (localState.due?.includes("T")) {
        input.due_datetime = localState.due;
      } else if (localState.due) {
        input.due_date = localState.due;
      }
      this.labels = await this.api.ensureLabels(
        localState.labels,
        this.labels,
      );
      const task = await this.api.createTask(input, requestId);
      created.push(task);
      local.parsed.properties.todoist_id = task.id;
      local.parsed.properties.sync_state = "synced";
      await this.writeFile(
        local.file,
        renderTaskNote(local.parsed.properties, local.parsed.notes),
      );
    }
    return created;
  }

  private async createPendingTaskNote(
    input: CreateTaskInput,
    requestId: string,
    form: NewTaskFormValue,
  ): Promise<TFile> {
    const project =
      this.projects.find((item) => item.id === form.projectId) ??
      this.projects[0];
    const parent = this.tasks.find((task) => task.id === form.parentId);
    const parentPath = parent ? this.paths.get(parent.id)?.folder : null;
    const segment = sanitizeSegment(input.content);
    const folder = normalizePath(
      parentPath
        ? `${parentPath}/${segment}`
        : `${this.data.settings.rootFolder}/${
            sanitizeSegment(project?.name ?? "Inbox")
          }/${segment}`,
    );
    const path = normalizePath(`${folder}/${segment}.md`);
    const pseudo: TodoistTask = {
      id: "",
      content: input.content,
      description: input.description ?? "",
      project_id: form.projectId,
      parent_id: form.parentId || null,
      labels: form.labels,
      priority: input.priority ?? 1,
      due: input.due_string
        ? {
            date: form.dueDate || "",
            string: input.due_string,
            is_recurring: true,
          }
        : input.due_datetime || input.due_date
          ? { date: input.due_datetime ?? input.due_date ?? "" }
          : null,
      deadline: input.deadline_date
        ? { date: input.deadline_date }
        : null,
      duration:
        input.duration && input.duration_unit
          ? { amount: input.duration, unit: input.duration_unit }
          : null,
      child_order: 0,
    };
    const parentNote = parent ? this.paths.get(parent.id)?.note ?? null : null;
    const properties = makeTaskProperties(
      pseudo,
      project,
      parentNote,
      "open",
      "pending-create",
      requestId,
    );
    await this.ensureFolder(folder);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      const alternate = normalizePath(
        `${folder}/${segment} · ${requestId.slice(-6)}.md`,
      );
      return this.app.vault.create(
        alternate,
        renderTaskNote(properties, ""),
      );
    }
    return this.app.vault.create(path, renderTaskNote(properties, ""));
  }

  private async materializeRemoteTask(
    task: TodoistTask,
    status: "open" | "completed",
    pathMap: Map<string, TaskPathInfo>,
    local: LocalTaskFile | null,
  ): Promise<TFile> {
    const pathInfo = pathMap.get(task.id);
    if (!pathInfo) {
      throw new Error(`No note path generated for Todoist task ${task.id}`);
    }
    const project = this.projects.find(
      (item) => item.id === task.project_id,
    );
    const parentPath = task.parent_id
      ? pathMap.get(task.parent_id)?.note ?? null
      : null;
    const properties = makeTaskProperties(
      task,
      project,
      parentPath,
      status,
      "synced",
    );
    const previousLastSynced = local?.parsed.properties.last_synced;
    if (previousLastSynced) {
      properties.last_synced = previousLastSynced;
    }
    const notes = local?.parsed.notes ?? "";
    let content = renderTaskNote(properties, notes);
    await this.ensureFolder(pathInfo.folder);

    let file = local?.file ?? null;
    if (!file) {
      const statePath = this.data.tasks[task.id]?.path;
      const stateFile = statePath
        ? this.app.vault.getAbstractFileByPath(statePath)
        : null;
      if (stateFile instanceof TFile) file = stateFile;
    }
    if (file && file.path !== pathInfo.note) {
      const collision = this.app.vault.getAbstractFileByPath(pathInfo.note);
      if (collision && collision !== file) {
        throw new Error(`Task note path already exists: ${pathInfo.note}`);
      }
      this.writingPaths.add(file.path);
      this.writingPaths.add(pathInfo.note);
      await this.app.fileManager.renameFile(file, pathInfo.note);
      file = this.app.vault.getFileByPath(pathInfo.note);
    }

    if (file) {
      const existingContent = await this.app.vault.read(file);
      if (existingContent !== content) {
        properties.last_synced = new Date().toISOString();
        content = renderTaskNote(properties, notes);
        await this.writeFile(file, content);
      }
    } else {
      this.writingPaths.add(pathInfo.note);
      file = await this.app.vault.create(pathInfo.note, content);
      this.writingPaths.delete(pathInfo.note);
    }
    this.data.tasks[task.id] = {
      path: file.path,
      fingerprint: stableFingerprint(remoteComparable(task, status)),
      status,
      missingCount: 0,
    };
    return file;
  }

  private async writeConflictCopy(
    local: LocalTaskFile,
    remote: TodoistTask,
  ): Promise<void> {
    const folder = normalizePath(
      `${this.data.settings.rootFolder}/_Conflicts`,
    );
    await this.ensureFolder(folder);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = normalizePath(
      `${folder}/${timestamp} - ${sanitizeSegment(remote.content, 70)} · ${
        remote.id.slice(-6)
      }.md`,
    );
    const original = await this.app.vault.read(local.file);
    const content = [
      "# Todoist sync conflict",
      "",
      `- **Original note:** [[${local.file.path.replace(/\.md$/, "")}]]`,
      `- **Todoist task:** ${remote.id}`,
      `- **Captured:** ${new Date().toISOString()}`,
      "- **Resolution:** Todoist won; this file preserves the displaced local version.",
      "",
      "## Local version",
      "",
      "```markdown",
      original.replace(/```/g, "``\\`"),
      "```",
      "",
    ].join("\n");
    await this.app.vault.create(path, content);
  }

  private async markDetached(
    local: LocalTaskFile,
    reason: string,
  ): Promise<void> {
    const properties = {
      ...local.parsed.properties,
      status: "detached",
      sync_state: "detached",
      detached_reason: reason,
      detached_at: new Date().toISOString(),
    };
    await this.writeFile(
      local.file,
      renderTaskNote(properties, local.parsed.notes),
    );
  }

  private async scanLocalTaskFiles(): Promise<LocalTaskFile[]> {
    const prefix = `${normalizePath(this.data.settings.rootFolder)}/`;
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(prefix));
    const output: LocalTaskFile[] = [];
    for (const file of files) {
      if (file.path.includes("/_Conflicts/")) continue;
      const content = await this.app.vault.read(file);
      const parsed = parseTaskNote(content);
      if (parsed.properties.type === "todoist-task") {
        output.push({ file, parsed });
      }
    }
    return output;
  }

  private async refreshKnownTasks(): Promise<void> {
    const localFiles = await this.scanLocalTaskFiles();
    const activeById = new Map(this.tasks.map((task) => [task.id, task]));
    const records: DashboardTaskRecord[] = [];
    for (const local of localFiles) {
      const record = dashboardRecordFromProperties(local.parsed.properties);
      if (!record) continue;
      const active = activeById.get(record.task.id);
      records.push(
        active ? { task: active, status: "open" } : record,
      );
    }
    this.knownTasks = records;
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const parts = normalizePath(folderPath).split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private async writeFile(file: TFile, content: string): Promise<void> {
    this.writingPaths.add(file.path);
    await this.app.vault.modify(file, content);
    window.setTimeout(() => this.writingPaths.delete(file.path), 1000);
  }

  private onVaultChange(file: TAbstractFile): void {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    const root = `${normalizePath(this.data.settings.rootFolder)}/`;
    if (!file.path.startsWith(root) || this.writingPaths.has(file.path)) {
      return;
    }
    if (this.localSyncTimer !== null) {
      window.clearTimeout(this.localSyncTimer);
    }
    this.localSyncTimer = window.setTimeout(() => {
      this.localSyncTimer = null;
      void this.syncNow("file-change");
    }, 2500);
  }

  private async previewPendingChanges(): Promise<void> {
    const locals = await this.scanLocalTaskFiles();
    let pending = 0;
    let changed = 0;
    for (const local of locals) {
      const properties = local.parsed.properties;
      if (properties.sync_state === "pending-create") {
        pending += 1;
        continue;
      }
      const id = properties.todoist_id ? String(properties.todoist_id) : "";
      const previous = this.data.tasks[id]?.fingerprint;
      if (
        previous &&
        previous !== stableFingerprint(localComparable(properties))
      ) {
        changed += 1;
      }
    }
    new Notice(
      `Todoist Task Notes preview: ${changed} changed note(s), ${pending} pending creation(s). No remote changes were made.`,
      8000,
    );
  }

  private activeTaskFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;
    const root = `${normalizePath(this.data.settings.rootFolder)}/`;
    return file.path.startsWith(root) ? file : null;
  }

  private reparentCurrentTask(checking: boolean): boolean {
    const file = this.activeTaskFile();
    if (!file) return false;
    if (checking) return true;
    void this.app.vault.read(file).then((content) => {
      const parsed = parseTaskNote(content);
      const currentId = String(parsed.properties.todoist_id ?? "");
      const items = [
        { id: "", label: "No parent" },
        ...this.tasks
          .filter((task) => task.id !== currentId)
          .map((task) => ({
            id: task.id,
            label: task.content,
            description:
              this.projects.find((p) => p.id === task.project_id)?.name ??
              "",
          })),
      ];
      new ItemPickerModal(
        this.app,
        "Choose a parent task",
        items,
        async (item) => {
          const parent = this.tasks.find((task) => task.id === item.id);
          await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm.parent_id = parent?.id ?? null;
            fm.parent = parent
              ? `[[${this.paths
                  .get(parent.id)
                  ?.note.replace(/\.md$/, "")}]]`
              : null;
            if (parent) {
              fm.project_id = parent.project_id;
              fm.project =
                this.projects.find((p) => p.id === parent.project_id)?.name ??
                fm.project;
            }
          });
          await this.syncNow("reparent");
        },
      ).open();
    });
    return true;
  }

  private moveCurrentTaskProject(checking: boolean): boolean {
    const file = this.activeTaskFile();
    if (!file) return false;
    if (checking) return true;
    const items = this.projects.map((project) => ({
      id: project.id,
      label: project.name,
    }));
    new ItemPickerModal(
      this.app,
      "Choose a Todoist project",
      items,
      async (item) => {
        const project = this.projects.find((p) => p.id === item.id);
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          fm.project_id = item.id;
          fm.project = project?.name ?? item.label;
          fm.parent_id = null;
          fm.parent = null;
        });
        await this.syncNow("move-project");
      },
    ).open();
    return true;
  }

  private detachCurrentTask(checking: boolean): boolean {
    const file = this.activeTaskFile();
    if (!file) return false;
    if (checking) return true;
    void this.app.fileManager
      .processFrontMatter(file, (fm) => {
        fm.status = "detached";
        fm.sync_state = "detached";
        fm.detached_reason = "Detached manually in Obsidian.";
        fm.detached_at = new Date().toISOString();
      })
      .then(() => this.syncNow("detach"));
    return true;
  }

  private openCurrentInTodoist(checking: boolean): boolean {
    const file = this.activeTaskFile();
    if (!file) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    const url = cache?.frontmatter?.todoist_url;
    if (!url) return false;
    if (!checking) window.open(String(url));
    return true;
  }

  private triggerDashboardUpdate(): void {
    const workspace = this.app.workspace as unknown as {
      trigger(name: string): void;
    };
    workspace.trigger("todoist-task-notes:updated");
    this.refreshTaskHeaderAction();
  }

  private refreshTaskHeaderAction(): void {
    this.taskHeaderAction?.remove();
    this.taskHeaderAction = null;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!view || !file) return;
    const context = this.getTaskNoteActionContext(file.path);
    if (!context) return;
    const title = context.enabled
      ? "הוסף תת־משימה"
      : context.disabledReason ?? "הוספת תת־משימה אינה זמינה";
    const action = view.addAction("list-plus", title, () => {
      if (context.enabled) {
        this.openSubtaskModal(context.taskId);
      } else {
        new Notice(title);
      }
    });
    action.addClass("todoist-task-notes-view-action");
    if (!context.enabled) {
      action.addClass("is-disabled");
      action.setAttr("aria-disabled", "true");
    }
    this.taskHeaderAction = action;
  }

  private async getTodoistToken(): Promise<string> {
    let secretId = this.data.settings.tokenSecretId;
    try {
      const configPath =
        ".obsidian/plugins/todoist-sync-plugin/data.json";
      if (await this.app.vault.adapter.exists(configPath)) {
        const raw = await this.app.vault.adapter.read(configPath);
        const config = JSON.parse(raw) as {
          apiTokenSecretId?: string;
          tokenStorage?: string;
        };
        if (config.apiTokenSecretId) {
          secretId = config.apiTokenSecretId;
        }
        if (config.tokenStorage === "file") {
          const legacyPath = ".obsidian/todoist-token";
          if (await this.app.vault.adapter.exists(legacyPath)) {
            const legacyToken = (
              await this.app.vault.adapter.read(legacyPath)
            ).trim();
            if (legacyToken) return legacyToken;
          }
        }
      }
    } catch {
      // Fall through to the configured SecretStorage key.
    }
    const appWithSecrets = this.app as unknown as {
      secretStorage?: { getSecret(id: string): string | null };
    };
    const token = appWithSecrets.secretStorage?.getSecret(secretId)?.trim();
    if (!token) {
      throw new TodoistApiError(
        `Todoist API token was not found in Obsidian SecretStorage (${secretId}). Configure the existing Todoist Sync plugin first.`,
        401,
      );
    }
    return token;
  }

  private async loadPluginData(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<StoredPluginData> | null;
    this.data = {
      ...structuredClone(DEFAULT_DATA),
      ...(loaded ?? {}),
      settings: {
        ...DEFAULT_SETTINGS,
        ...(loaded?.settings ?? {}),
      },
      tasks: loaded?.tasks ?? {},
    };
  }

  private async savePluginData(): Promise<void> {
    await this.saveData(this.data);
  }
}

class TodoistTaskNotesSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: TodoistTaskNotesPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Todoist Task Notes" });
    const settings = this.plugin.getSettings();

    new Setting(containerEl)
      .setName("Task-note root folder")
      .setDesc("One nested Markdown note is created for every Todoist task.")
      .addText((text) =>
        text.setValue(settings.rootFolder).onChange(async (value) => {
          await this.plugin.updateSettings({
            rootFolder: normalizePath(value),
          });
        }),
      );

    new Setting(containerEl)
      .setName("Dashboard note")
      .addText((text) =>
        text.setValue(settings.dashboardPath).onChange(async (value) => {
          await this.plugin.updateSettings({
            dashboardPath: normalizePath(value),
          });
        }),
      );

    new Setting(containerEl)
      .setName("Automatic sync interval")
      .setDesc("Minutes while Obsidian is open. Takes effect after reload.")
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setValue(String(settings.intervalMinutes))
          .onChange(async (value) => {
            await this.plugin.updateSettings({
              intervalMinutes: Math.max(1, Number(value) || 5),
            });
          });
      });

    new Setting(containerEl)
      .setName("Shared SecretStorage key")
      .setDesc(
        "Uses the token already configured by Todoist Sync. The token itself is never saved in this plugin.",
      )
      .addText((text) =>
        text.setValue(settings.tokenSecretId).onChange(async (value) => {
          await this.plugin.updateSettings({ tokenSecretId: value.trim() });
        }),
      );

    new Setting(containerEl)
      .setName("API connection")
      .setDesc("Validates the shared token without displaying it.")
      .addButton((button) =>
        button.setButtonText("Test connection").onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.testConnection();
          } catch (error) {
            new Notice(
              `Todoist connection failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
              10000,
            );
          } finally {
            button.setDisabled(false);
          }
        }),
      );
  }
}
