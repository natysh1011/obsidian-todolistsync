import {
  App,
  EditorSuggest,
  MarkdownPostProcessorContext,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
  getLanguage,
  normalizePath,
  type ButtonComponent,
  type Editor,
  type EditorPosition,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
  type SettingDefinitionItem,
} from "obsidian";
import {
  DASHBOARD_BLOCK,
  appendDashboardBlock,
  findDashboardSlashTrigger,
  hasDashboardBlock,
  normalizeDashboardNotePath,
} from "./dashboard-note";
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
  stringValue,
  TASK_ACTIONS_BLOCK,
  type ComparableTask,
  type ParsedTaskNote,
  type TaskPathInfo,
  type TodoistProject,
  type TodoistTask,
} from "./core";
import {
  LOCALE_CODES,
  createI18n,
  getLocaleOptions,
  isLanguagePreference,
  isLocaleAvailable,
  type I18n,
  type LanguagePreference,
} from "./i18n";
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
  language: LanguagePreference;
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
  language: "system",
  rootFolder: "משימות/Todoist",
  dashboardPath: "משימות/Untitled.md",
  intervalMinutes: 5,
  tokenSecretId: "swt-todoist-api-token",
};

const MANAGED_TOKEN_SECRET_ID = "todoist-task-notes-api-token";

type TokenStatus = "managed" | "shared" | "missing";

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
  private i18n: I18n = createI18n("system", "en");

  async onload(): Promise<void> {
    await this.loadPluginData();
    this.i18n = createI18n(this.data.settings.language, getLanguage());
    this.api = new TodoistApi(() => this.getTodoistToken());

    this.addSettingTab(new TodoistTaskNotesSettingTab(this.app, this));
    this.addRibbonIcon("list-plus", this.i18n.t("ribbon.newTask"), () =>
      this.openNewTaskModal(),
    );
    this.addRibbonIcon("refresh-cw", this.i18n.t("ribbon.sync"), () => {
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
      id: "add-dashboard",
      name: "Todoist: Add dashboard",
      editorCallback: (editor) => {
        this.addDashboardToEditor(editor);
      },
    });
    this.registerEditorSuggest(new DashboardSlashSuggest(this.app, this));
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
      name: "Open current task online",
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

  getI18n(): I18n {
    return this.i18n;
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
    if (changes.language && isLanguagePreference(changes.language)) {
      this.i18n = createI18n(changes.language, getLanguage());
      this.triggerDashboardUpdate();
    }
    await this.savePluginData();
  }

  async setDashboardPath(value: string): Promise<string> {
    const path = normalizeDashboardNotePath(value);
    if (!path) return this.data.settings.dashboardPath;

    await this.ensureDashboardNoteAtPath(path);
    this.data.settings = { ...this.data.settings, dashboardPath: path };
    await this.savePluginData();
    this.triggerDashboardUpdate();
    return path;
  }

  addDashboardToEditor(
    editor: Editor,
    from?: EditorPosition,
    to?: EditorPosition,
  ): boolean {
    if (hasDashboardBlock(editor.getValue())) {
      if (from) editor.replaceRange("", from, to ?? from);
      return false;
    }

    if (from) {
      editor.replaceRange(DASHBOARD_BLOCK, from, to ?? from);
      return true;
    }

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const textBeforeCursor = line.slice(0, cursor.ch);
    const textAfterCursor = line.slice(cursor.ch);
    const leading = textBeforeCursor.trim() ? "\n\n" : "";
    const trailing = textAfterCursor.trim() ? "\n\n" : "";
    editor.replaceRange(
      `${leading}${DASHBOARD_BLOCK}${trailing}`,
      cursor,
      cursor,
    );
    return true;
  }

  async testConnection(): Promise<void> {
    await this.api.validate();
    new Notice(this.i18n.t("notice.connectionWorking"));
  }

  async getTokenStatus(): Promise<TokenStatus> {
    if (this.getManagedTodoistToken()) return "managed";
    return (await this.getSharedTodoistToken()) ? "shared" : "missing";
  }

  saveTodoistToken(token: string): void {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new Error(this.i18n.t("notice.tokenRequired"));
    }
    this.app.secretStorage.setSecret(MANAGED_TOKEN_SECRET_ID, trimmed);
  }

  removeTodoistToken(): void {
    this.app.secretStorage.setSecret(MANAGED_TOKEN_SECRET_ID, "");
  }

  openNewTaskModal(context: NewTaskModalContext = {}): void {
    if (!this.projects.length) {
      new Notice(this.i18n.t("notice.syncBeforeCreate"));
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
      new Notice(this.i18n.t("notice.inactiveSubtask"));
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
      disabledReason = this.i18n.t("action.pendingReason");
    } else if (status === "completed") {
      disabledReason = this.i18n.t("action.completedReason");
    } else if (status === "detached" || syncState === "detached") {
      disabledReason = this.i18n.t("action.detachedReason");
    } else if (!this.tasks.some((task) => task.id === taskId)) {
      disabledReason = this.i18n.t("action.inactiveReason");
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
      new Notice(this.i18n.t("notice.taskCreated"));
    } catch (error) {
      const pendingFile = await this.createPendingTaskNote(
        input,
        requestId,
        form,
      );
      await this.refreshKnownTasks();
      await this.app.workspace.getLeaf(false).openFile(pendingFile);
      new Notice(this.i18n.t("notice.savedOffline", {
        error: error instanceof Error ? error.message : String(error),
      }), 8000);
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
      await this.ensureDashboardNoteAtPath(this.data.settings.dashboardPath);
      const localFiles = await this.scanLocalTaskFiles();
      this.projects = await this.api.listProjects();
      this.labels = await this.api.listLabels();
      const activeTasks = await this.api.listTasks();

      if (!pullOnly) {
        const pendingCreated = await this.createPendingTasks(localFiles);
        activeTasks.push(...pendingCreated);
      }

      const localById = new Map<string, LocalTaskFile>();
      for (const local of localFiles) {
        const id = stringValue(local.parsed.properties.todoist_id).trim();
        if (id) localById.set(id, local);
      }
      const activeById = new Map(activeTasks.map((task) => [task.id, task]));
      let pathMap = buildTaskPathMap(
        activeTasks,
        this.projects,
        this.data.settings.rootFolder,
      );

      const activeForDashboard: TodoistTask[] = [];
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
            await this.trashInactiveTaskNote(local, remote.id);
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

      for (const [id, local] of localById) {
        if (activeById.has(id)) continue;
        await this.trashInactiveTaskNote(local, id);
      }
      await this.pruneEmptyManagedFolders();

      this.tasks = activeForDashboard;
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
        new Notice(pullOnly
          ? this.i18n.t("notice.initialPull", { count: imported })
          : this.i18n.t("notice.syncComplete", { count: imported }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.data.lastError = message;
      await this.savePluginData();
      this.triggerDashboardUpdate();
      if (reason !== "interval" && reason !== "file-change") {
        new Notice(this.i18n.t("notice.syncFailed", { error: message }), 10000);
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
      const requestId = stringValue(
        properties.pending_create_id,
        crypto.randomUUID(),
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
        renderTaskNote(local.parsed.properties, local.parsed.notes, this.i18n),
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
    const containerFolder = normalizePath(
      parentPath
        ? parentPath
        : `${this.data.settings.rootFolder}/${
            sanitizeSegment(project?.name ?? "Inbox")
          }`,
    );
    const path = normalizePath(`${containerFolder}/${segment}.md`);
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
      this.i18n,
    );
    await this.ensureFolder(containerFolder);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      const alternate = normalizePath(
        `${containerFolder}/${segment} · ${requestId.slice(-6)}.md`,
      );
      return this.app.vault.create(
        alternate,
        renderTaskNote(properties, "", this.i18n),
      );
    }
    return this.app.vault.create(
      path,
      renderTaskNote(properties, "", this.i18n),
    );
  }

  private async materializeRemoteTask(
    task: TodoistTask,
    status: "open" | "completed",
    pathMap: Map<string, TaskPathInfo>,
    local: LocalTaskFile | null,
  ): Promise<TFile> {
    const pathInfo = pathMap.get(task.id);
    if (!pathInfo) {
      throw new Error(this.i18n.t("error.noTaskPath", { taskId: task.id }));
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
      null,
      this.i18n,
    );
    const previousLastSynced = local?.parsed.properties.last_synced;
    if (previousLastSynced) {
      properties.last_synced = previousLastSynced;
    }
    const notes = local?.parsed.notes ?? "";
    let content = renderTaskNote(properties, notes, this.i18n);
    const noteFolder = pathInfo.note.slice(0, pathInfo.note.lastIndexOf("/"));
    await this.ensureFolder(noteFolder);

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
        throw new Error(this.i18n.t("error.pathCollision", {
          path: pathInfo.note,
        }));
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
        content = renderTaskNote(properties, notes, this.i18n);
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
      `# ${this.i18n.t("conflict.title")}`,
      "",
      `- **${this.i18n.t("conflict.originalNote")}:** [[${local.file.path.replace(/\.md$/, "")}]]`,
      `- **${this.i18n.t("conflict.todoistTask")}:** ${remote.id}`,
      `- **${this.i18n.t("conflict.captured")}:** ${new Date().toISOString()}`,
      `- **${this.i18n.t("conflict.resolution")}:** ${this.i18n.t("conflict.resolutionText")}`,
      "",
      `## ${this.i18n.t("conflict.localVersion")}`,
      "",
      "```markdown",
      original.replace(/```/g, "``\\`"),
      "```",
      "",
    ].join("\n");
    await this.app.vault.create(path, content);
  }

  private async trashInactiveTaskNote(
    local: LocalTaskFile,
    id: string,
  ): Promise<void> {
    this.writingPaths.add(local.file.path);
    await this.app.fileManager.trashFile(local.file);
    window.setTimeout(() => this.writingPaths.delete(local.file.path), 1000);

    const previous = this.data.tasks[id];
    this.data.tasks[id] = {
      path: local.file.path,
      fingerprint:
        previous?.fingerprint ??
        stableFingerprint(localComparable(local.parsed.properties)),
      status: "detached",
      missingCount: Math.max(1, previous?.missingCount ?? 0),
    };
  }

  private async pruneEmptyManagedFolders(): Promise<void> {
    const root = normalizePath(this.data.settings.rootFolder);
    const folders = this.app.vault
      .getAllLoadedFiles()
      .filter(
        (file): file is TFolder =>
          file instanceof TFolder &&
          file.path.startsWith(`${root}/`),
      )
      .sort((a, b) => b.path.split("/").length - a.path.split("/").length);

    for (const folder of folders) {
      if (folder.children.length === 0) {
        await this.app.fileManager.trashFile(folder);
      }
    }
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

  private async ensureDashboardNoteAtPath(pathValue: string): Promise<TFile> {
    const path = normalizeDashboardNotePath(pathValue);
    if (!path) throw new Error("Invalid dashboard note path");

    const slash = path.lastIndexOf("/");
    if (slash > 0) await this.ensureFolder(path.slice(0, slash));

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing && !(existing instanceof TFile)) {
      throw new Error(`Dashboard note path is not a file: ${path}`);
    }
    if (existing instanceof TFile) {
      const content = await this.app.vault.read(existing);
      const updated = appendDashboardBlock(content);
      if (updated !== content) await this.writeFile(existing, updated);
      return existing;
    }

    this.writingPaths.add(path);
    try {
      return await this.app.vault.create(path, `${DASHBOARD_BLOCK}\n`);
    } finally {
      window.setTimeout(() => this.writingPaths.delete(path), 1000);
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
      const id = stringValue(properties.todoist_id).trim();
      const previous = this.data.tasks[id]?.fingerprint;
      if (
        previous &&
        previous !== stableFingerprint(localComparable(properties))
      ) {
        changed += 1;
      }
    }
    new Notice(this.i18n.t("notice.preview", { changed, pending }), 8000);
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
      const currentId = stringValue(parsed.properties.todoist_id).trim();
      const items = [
        { id: "", label: this.i18n.t("picker.noParent") },
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
        this.i18n,
        this.i18n.t("picker.chooseParent"),
        items,
        async (item) => {
          const parent = this.tasks.find((task) => task.id === item.id);
          await this.app.fileManager.processFrontMatter(file, (fm) => {
            const frontmatter = fm as Record<string, unknown>;
            frontmatter.parent_id = parent?.id ?? null;
            frontmatter.parent = parent
              ? `[[${this.paths
                  .get(parent.id)
                  ?.note.replace(/\.md$/, "")}]]`
              : null;
            if (parent) {
              frontmatter.project_id = parent.project_id;
              frontmatter.project =
                this.projects.find((p) => p.id === parent.project_id)?.name ??
                stringValue(frontmatter.project);
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
      this.i18n,
      this.i18n.t("picker.chooseProject"),
      items,
      async (item) => {
        const project = this.projects.find((p) => p.id === item.id);
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          const frontmatter = fm as Record<string, unknown>;
          frontmatter.project_id = item.id;
          frontmatter.project = project?.name ?? item.label;
          frontmatter.parent_id = null;
          frontmatter.parent = null;
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
        const frontmatter = fm as Record<string, unknown>;
        frontmatter.status = "detached";
        frontmatter.sync_state = "detached";
        frontmatter.detached_reason = this.i18n.t("sync.detachedManual");
        frontmatter.detached_at = new Date().toISOString();
      })
      .then(() => this.syncNow("detach"));
    return true;
  }

  private openCurrentInTodoist(checking: boolean): boolean {
    const file = this.activeTaskFile();
    if (!file) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter: unknown = cache?.frontmatter;
    const url =
      frontmatter && typeof frontmatter === "object"
        ? (frontmatter as Record<string, unknown>).todoist_url
        : null;
    if (typeof url !== "string" || !url) return false;
    if (!checking) window.open(url);
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
      ? this.i18n.t("action.addSubtask")
      : context.disabledReason ?? this.i18n.t("action.addSubtaskUnavailable");
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
    const managedToken = this.getManagedTodoistToken();
    if (managedToken) return managedToken;

    const sharedToken = await this.getSharedTodoistToken();
    if (sharedToken) return sharedToken;

    throw new TodoistApiError(this.i18n.t("error.tokenMissing"), 401);
  }

  private getManagedTodoistToken(): string | null {
    return (
      this.app.secretStorage.getSecret(MANAGED_TOKEN_SECRET_ID)?.trim() || null
    );
  }

  private async getSharedTodoistToken(): Promise<string | null> {
    const candidateSecretIds = new Set<string>([
      this.data.settings.tokenSecretId,
      DEFAULT_SETTINGS.tokenSecretId,
    ]);
    try {
      const configDir = this.app.vault.configDir;
      const configPath = normalizePath(
        `${configDir}/plugins/todoist-sync-plugin/data.json`,
      );
      if (await this.app.vault.adapter.exists(configPath)) {
        const raw = await this.app.vault.adapter.read(configPath);
        const parsed: unknown = JSON.parse(raw);
        const config =
          parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : {};
        if (typeof config.apiTokenSecretId === "string") {
          candidateSecretIds.add(config.apiTokenSecretId);
        }
        if (config.tokenStorage === "file") {
          const legacyPath = normalizePath(`${configDir}/todoist-token`);
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
    for (const secretId of candidateSecretIds) {
      if (!secretId) continue;
      const token = this.app.secretStorage.getSecret(secretId)?.trim();
      if (token) return token;
    }
    return null;
  }

  private async loadPluginData(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<StoredPluginData> | null;
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(loaded?.settings ?? {}),
    };
    if (!isLanguagePreference(settings.language)) {
      settings.language = "system";
    }
    this.data = {
      ...structuredClone(DEFAULT_DATA),
      ...(loaded ?? {}),
      settings,
      tasks: loaded?.tasks ?? {},
    };
  }

  private async savePluginData(): Promise<void> {
    await this.saveData(this.data);
  }
}

interface DashboardSuggestion {
  readonly label: string;
}

class DashboardSlashSuggest extends EditorSuggest<DashboardSuggestion> {
  constructor(
    app: App,
    private readonly plugin: TodoistTaskNotesPlugin,
  ) {
    super(app);
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null,
  ): EditorSuggestTriggerInfo | null {
    if (!file) return null;
    const trigger = findDashboardSlashTrigger(
      editor.getLine(cursor.line),
      cursor.ch,
    );
    if (!trigger) return null;
    return {
      start: { line: cursor.line, ch: trigger.startCh },
      end: { line: cursor.line, ch: trigger.endCh },
      query: trigger.query,
    };
  }

  getSuggestions(
    _context: EditorSuggestContext,
  ): DashboardSuggestion[] {
    return [{ label: "Todoist: Add dashboard" }];
  }

  renderSuggestion(item: DashboardSuggestion, element: HTMLElement): void {
    element.createDiv({ text: item.label });
    element.createEl("small", { text: "/todoist: add dashboard" });
  }

  selectSuggestion(
    _item: DashboardSuggestion,
    _event: MouseEvent | KeyboardEvent,
  ): void {
    const context = this.context;
    if (!context) return;
    this.plugin.addDashboardToEditor(
      context.editor,
      context.start,
      context.end,
    );
    this.close();
  }
}

class TodoistTaskNotesSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: TodoistTaskNotesPlugin,
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const settings = this.plugin.getSettings();

    return [
      {
        type: "group",
        heading: this.plugin.getI18n().t("settings.heading"),
        items: [
          {
            name: this.plugin.getI18n().t("settings.language"),
            desc: this.plugin.getI18n().t("settings.languageDescription"),
            render: (setting) => this.addLanguageSetting(setting, settings),
          },
          {
            name: this.plugin.getI18n().t("settings.rootFolder"),
            desc: this.plugin.getI18n().t("settings.rootFolderDescription"),
            render: (setting) => this.addRootFolderSetting(setting, settings),
          },
          {
            name: this.plugin.getI18n().t("settings.dashboardNote"),
            render: (setting) => this.addDashboardPathSetting(setting, settings),
          },
          {
            name: this.plugin.getI18n().t("settings.interval"),
            desc: this.plugin.getI18n().t("settings.intervalDescription"),
            render: (setting) => this.addIntervalSetting(setting, settings),
          },
          {
            name: this.plugin.getI18n().t("settings.token"),
            desc: this.plugin.getI18n().t("settings.tokenDescription"),
            render: (setting) => this.addTokenSetting(setting),
          },
          {
            name: this.plugin.getI18n().t("settings.connection"),
            desc: this.plugin.getI18n().t("settings.connectionDescription"),
            render: (setting) => this.addConnectionSetting(setting),
          },
        ],
      },
    ];
  }

  display(): void {
    this.renderSettings();
  }

  private renderSettings(): void {
    const { containerEl } = this;
    const settings = this.plugin.getSettings();
    containerEl.empty();
    new Setting(containerEl)
      .setName(this.plugin.getI18n().t("settings.heading"))
      .setHeading();
    this.addLanguageSetting(new Setting(containerEl), settings);
    this.addRootFolderSetting(new Setting(containerEl), settings);
    this.addDashboardPathSetting(new Setting(containerEl), settings);
    this.addIntervalSetting(new Setting(containerEl), settings);
    this.addTokenSetting(new Setting(containerEl));
    this.addConnectionSetting(new Setting(containerEl));
  }

  private addLanguageSetting(
    setting: Setting,
    settings: PluginSettings,
  ): void {
    const i18n = this.plugin.getI18n();
    setting
      .setName(i18n.t("settings.language"))
      .setDesc(i18n.t("settings.languageDescription"))
      .addDropdown((dropdown) => {
        dropdown.addOption("system", i18n.t("language.system"));
        for (const locale of getLocaleOptions()) {
          const suffix = locale.available
            ? ""
            : ` — ${i18n.t("language.unavailable")}`;
          dropdown.addOption(
            locale.code,
            `${locale.nativeName} (${locale.code})${suffix}`,
          );
        }
        dropdown.setValue(settings.language);
        for (const option of Array.from(dropdown.selectEl.options)) {
          if (
            option.value !== "system" &&
            !isLocaleAvailable(option.value as (typeof LOCALE_CODES)[number])
          ) {
            option.disabled = true;
          }
        }
        dropdown.onChange((value) => {
          if (!isLanguagePreference(value)) return;
          void this.plugin.updateSettings({ language: value }).then(() => {
            this.renderSettings();
          });
        });
      });
  }

  private addRootFolderSetting(
    setting: Setting,
    settings: PluginSettings,
  ): void {
    setting
      .setName(this.plugin.getI18n().t("settings.rootFolder"))
      .setDesc(this.plugin.getI18n().t("settings.rootFolderDescription"))
      .addText((text) =>
        text.setValue(settings.rootFolder).onChange((value) => {
          void this.plugin.updateSettings({
            rootFolder: normalizePath(value),
          });
        }),
      );
  }

  private addDashboardPathSetting(
    setting: Setting,
    settings: PluginSettings,
  ): void {
    setting
      .setName(this.plugin.getI18n().t("settings.dashboardNote"))
      .addText((text) => {
        text.setValue(settings.dashboardPath);
        text.inputEl.addEventListener("change", () => {
          const entered = text.getValue();
          void this.plugin
            .setDashboardPath(entered)
            .then((savedPath) => {
              if (text.getValue() === entered) text.setValue(savedPath);
            })
            .catch((error: unknown) => {
              text.setValue(this.plugin.getSettings().dashboardPath);
              new Notice(
                this.plugin.getI18n().t("notice.actionFailed", {
                  error:
                    error instanceof Error ? error.message : String(error),
                }),
              );
            });
        });
      });
  }

  private addIntervalSetting(
    setting: Setting,
    settings: PluginSettings,
  ): void {
    setting
      .setName(this.plugin.getI18n().t("settings.interval"))
      .setDesc(this.plugin.getI18n().t("settings.intervalDescription"))
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setValue(String(settings.intervalMinutes))
          .onChange((value) => {
            void this.plugin.updateSettings({
              intervalMinutes: Math.max(1, Number(value) || 5),
            });
          });
      });
  }

  private addTokenSetting(setting: Setting): void {
    const i18n = this.plugin.getI18n();
    const description = createFragment();
    description.append(i18n.t("settings.tokenDescription"));
    description.createEl("br");
    const statusEl = description.createSpan();
    statusEl.addClass("todoist-task-notes-token-status");
    statusEl.textContent = i18n.t("settings.tokenStatusChecking");
    description.append(statusEl);

    let inputEl: HTMLInputElement | null = null;
    let saveButton: ButtonComponent | null = null;
    let removeButton: ButtonComponent | null = null;

    const updateStatus = async (): Promise<void> => {
      const status = await this.plugin.getTokenStatus();
      const statusKey = `settings.tokenStatus${
        status === "managed"
          ? "Managed"
          : status === "shared"
            ? "Shared"
            : "Missing"
      }` as const;
      statusEl.textContent = i18n.t(statusKey);
      statusEl.toggleClass("is-missing", status === "missing");
      if (inputEl) {
        inputEl.placeholder = i18n.t(
          status === "managed"
            ? "settings.tokenPlaceholderSaved"
            : "settings.tokenPlaceholderEmpty",
        );
      }
      saveButton?.setButtonText(
        i18n.t(
          status === "managed" ? "settings.replaceToken" : "settings.saveToken",
        ),
      );
      removeButton?.setDisabled(status !== "managed");
    };

    const saveToken = (): void => {
      const value = inputEl?.value ?? "";
      if (!value.trim()) {
        new Notice(i18n.t("notice.tokenRequired"));
        return;
      }
      try {
        this.plugin.saveTodoistToken(value);
        if (inputEl) inputEl.value = "";
        saveButton?.setDisabled(true);
        new Notice(i18n.t("notice.tokenSaved"));
        void updateStatus();
      } catch (error) {
        new Notice(
          i18n.t("notice.tokenSaveFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
          10000,
        );
      }
    };

    setting
      .setName(i18n.t("settings.token"))
      .setDesc(description)
      .addText((text) => {
        inputEl = text.inputEl;
        inputEl.type = "password";
        inputEl.autocomplete = "off";
        inputEl.spellcheck = false;
        inputEl.setAttr("aria-label", i18n.t("settings.token"));
        text.setPlaceholder(i18n.t("settings.tokenPlaceholderEmpty"));
        text.onChange((value) => {
          saveButton?.setDisabled(!value.trim());
        });
        inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            saveToken();
          }
        });
      })
      .addButton((button) => {
        saveButton = button;
        button
          .setButtonText(i18n.t("settings.saveToken"))
          .setCta()
          .setDisabled(true)
          .onClick(saveToken);
      })
      .addButton((button) => {
        removeButton = button;
        button.buttonEl.addClass("mod-warning");
        button
          .setButtonText(i18n.t("settings.removeToken"))
          .setDisabled(true)
          .onClick(() => {
            new ConfirmTokenRemovalModal(this.app, i18n, () => {
              this.plugin.removeTodoistToken();
              new Notice(i18n.t("notice.tokenRemoved"));
              void updateStatus();
            }).open();
          });
      });

    void updateStatus();
  }

  private addConnectionSetting(setting: Setting): void {
    setting
      .setName(this.plugin.getI18n().t("settings.connection"))
      .setDesc(this.plugin.getI18n().t("settings.connectionDescription"))
      .addButton((button) =>
        button.setButtonText(this.plugin.getI18n().t("settings.testConnection")).onClick(() => {
          void this.testConnection(button);
        }),
      );
  }

  private async testConnection(
    button: { setDisabled(disabled: boolean): unknown },
  ): Promise<void> {
    button.setDisabled(true);
    try {
      await this.plugin.testConnection();
    } catch (error) {
      new Notice(this.plugin.getI18n().t("notice.connectionFailed", {
        error: error instanceof Error ? error.message : String(error),
      }), 10000);
    } finally {
      button.setDisabled(false);
    }
  }
}

class ConfirmTokenRemovalModal extends Modal {
  constructor(
    app: App,
    private readonly i18n: I18n,
    private readonly confirmRemoval: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.setAttr("dir", this.i18n.direction);
    this.modalEl.setAttr("lang", this.i18n.locale);
    this.setTitle(this.i18n.t("settings.removeTokenTitle"));
    this.contentEl.createEl("p", {
      text: this.i18n.t("settings.removeTokenDescription"),
    });
    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass("todoist-task-notes-modal-actions");
    actions
      .addButton((button) =>
        button
          .setButtonText(this.i18n.t("common.cancel"))
          .onClick(() => this.close()),
      )
      .addButton((button) => {
        button.buttonEl.addClass("mod-warning");
        button
          .setButtonText(this.i18n.t("settings.removeToken"))
          .setCta()
          .onClick(() => {
            this.confirmRemoval();
            this.close();
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
