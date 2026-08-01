import { requestUrl, RequestUrlParam } from "obsidian";
import type {
  TodoistProject,
  TodoistTask,
} from "./core";

const API_ROOT = "https://api.todoist.com/api/v1";

interface Page<T> {
  results?: T[];
  items?: T[];
  next_cursor?: string | null;
}

export interface TodoistLabel {
  id: string;
  name: string;
}

export interface CreateTaskInput {
  content: string;
  description?: string;
  project_id?: string;
  parent_id?: string;
  labels?: string[];
  priority?: number;
  due_string?: string;
  due_date?: string;
  due_datetime?: string;
  deadline_date?: string;
  duration?: number;
  duration_unit?: "minute" | "day";
}

export class TodoistApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export class TodoistApi {
  constructor(private readonly tokenProvider: () => Promise<string>) {}

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const token = await this.tokenProvider();
    const request: RequestUrlParam = {
      url: `${API_ROOT}${path}`,
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      throw: false,
    };
    if (options.body !== undefined) {
      request.body = JSON.stringify(options.body);
    }

    const response = await requestUrl(request);
    if (response.status < 200 || response.status >= 300) {
      let detail = response.text;
      try {
        const json = response.json as Record<string, unknown>;
        detail = String(
          json.error ??
            json.error_tag ??
            json.message ??
            response.text ??
            "Unknown API error",
        );
      } catch {
        // The text response is already useful.
      }
      throw new TodoistApiError(
        `Todoist API ${response.status}: ${detail}`,
        response.status,
      );
    }
    if (response.status === 204 || !response.text) {
      return undefined as T;
    }
    return response.json as T;
  }

  private async paginate<T>(
    path: string,
    collection: "results" | "items" = "results",
  ): Promise<T[]> {
    const output: T[] = [];
    let cursor: string | null = null;
    do {
      const separator = path.includes("?") ? "&" : "?";
      const cursorPart: string = cursor
        ? `${separator}cursor=${encodeURIComponent(cursor)}`
        : "";
      const page: Page<T> = await this.request<Page<T>>(
        `${path}${cursorPart}`,
      );
      output.push(...(page[collection] ?? []));
      cursor = page.next_cursor ?? null;
    } while (cursor);
    return output;
  }

  async validate(): Promise<void> {
    await this.request<Page<TodoistProject>>("/projects?limit=1");
  }

  async listProjects(): Promise<TodoistProject[]> {
    return this.paginate<TodoistProject>("/projects?limit=200");
  }

  async listTasks(): Promise<TodoistTask[]> {
    return this.paginate<TodoistTask>("/tasks?limit=200");
  }

  async listLabels(): Promise<TodoistLabel[]> {
    return this.paginate<TodoistLabel>("/labels?limit=200");
  }

  async listCompletedSince(
    since: Date,
    until = new Date(),
  ): Promise<TodoistTask[]> {
    const sinceIso = encodeURIComponent(since.toISOString());
    const untilIso = encodeURIComponent(until.toISOString());
    return this.paginate<TodoistTask>(
      `/tasks/completed/by_completion_date?since=${sinceIso}&until=${untilIso}&limit=200`,
      "items",
    );
  }

  async createLabel(name: string): Promise<TodoistLabel> {
    return this.request<TodoistLabel>("/labels", {
      method: "POST",
      body: { name },
    });
  }

  async ensureLabels(
    names: string[],
    knownLabels: TodoistLabel[],
  ): Promise<TodoistLabel[]> {
    const existing = new Map(
      knownLabels.map((label) => [label.name.toLocaleLowerCase(), label]),
    );
    for (const name of names) {
      const key = name.toLocaleLowerCase();
      if (!existing.has(key)) {
        const created = await this.createLabel(name);
        existing.set(key, created);
      }
    }
    return [...existing.values()];
  }

  async createTask(
    input: CreateTaskInput,
    requestId: string,
  ): Promise<TodoistTask> {
    return this.request<TodoistTask>("/tasks", {
      method: "POST",
      body: input,
      headers: { "X-Request-Id": requestId },
    });
  }

  async updateTask(
    id: string,
    changes: Record<string, unknown>,
  ): Promise<TodoistTask> {
    return this.request<TodoistTask>(`/tasks/${encodeURIComponent(id)}`, {
      method: "POST",
      body: changes,
    });
  }

  async moveTask(
    id: string,
    destination: {
      project_id?: string;
      parent_id?: string;
      section_id?: string;
    },
  ): Promise<TodoistTask> {
    return this.request<TodoistTask>(
      `/tasks/${encodeURIComponent(id)}/move`,
      { method: "POST", body: destination },
    );
  }

  async closeTask(id: string): Promise<void> {
    await this.request<void>(`/tasks/${encodeURIComponent(id)}/close`, {
      method: "POST",
    });
  }

  async reopenTask(id: string): Promise<void> {
    await this.request<void>(`/tasks/${encodeURIComponent(id)}/reopen`, {
      method: "POST",
    });
  }
}
