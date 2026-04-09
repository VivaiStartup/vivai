export type AgendaTaskCard = {
  id: number;
  user_id: number;
  user_plant_id: number;
  plant_species_id: number | null;
  task_type:
    | "CHECK_WATER"
    | "FERTILIZE"
    | "CHECK_HEALTH"
    | "TREAT"
    | "PRUNE"
    | "REPOT"
    | "MANUAL";
  title: string;
  reason: string | null;
  status: "TODO" | "DONE" | "SKIPPED" | "SNOOZED";
  priority_level: number;
  due_date: string;
  snoozed_until: string | null;
  source_type: "SPECIES_DEFAULT" | "CARE_RULE" | "MANUAL";
  source_rule_id: number | null;
  completed_event_id: number | null;
  created_at: string;
  updated_at: string;
  plant_name?: string | null;
  plant_image?: string | null;
};

export type AgendaGenerateResult = {
  period_days: number;
  created: number;
  skipped: number;
  details: Array<{
    plant_id: number;
    plant_name: string;
    created: number;
    skipped: number;
    note?: string;
  }>;
};

type AgendaContext = {
  current_temperature_c?: number | null;
  current_humidity?: number | null;
  weather_code?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Errore API");
  }

  return data as T;
}

async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Errore API");
  }

  return data as T;
}

export async function getAgendaTasks(params?: {
  scope?: "open" | "today" | "week" | "history";
  status?: "TODO" | "DONE" | "SKIPPED" | "SNOOZED";
  plant_id?: number;
  limit?: number;
}): Promise<AgendaTaskCard[]> {
  const search = new URLSearchParams();

  if (params?.scope) search.set("scope", params.scope);
  if (params?.status) search.set("status", params.status);
  if (params?.plant_id) search.set("plant_id", String(params.plant_id));
  if (params?.limit) search.set("limit", String(params.limit));

  const query = search.toString();
  return apiGet<AgendaTaskCard[]>(`/api/agenda${query ? `?${query}` : ""}`);
}

export async function generateAgendaTasks(
  periodDays: 7 | 30 | 90,
  context?: AgendaContext
): Promise<AgendaGenerateResult> {
  return apiPost<AgendaGenerateResult>("/api/agenda/generate", {
    period_days: periodDays,
    context: context ?? {},
  });
}

export async function completeAgendaTask(
  taskId: number,
  payload?: {
    resolution?: string;
    notes?: string;
    product_name?: string | null;
    event_date?: string;
  }
): Promise<{ task: AgendaTaskCard }> {
  return apiPost<{ task: AgendaTaskCard }>(
    `/api/agenda/tasks/${taskId}/complete`,
    payload ?? {}
  );
}

export async function skipAgendaTask(
  taskId: number,
  payload?: { reason?: string }
): Promise<{ task: AgendaTaskCard }> {
  return apiPost<{ task: AgendaTaskCard }>(
    `/api/agenda/tasks/${taskId}/skip`,
    payload ?? {}
  );
}

export async function snoozeAgendaTask(
  taskId: number,
  days = 2
): Promise<{ task: AgendaTaskCard }> {
  return apiPost<{ task: AgendaTaskCard }>(
    `/api/agenda/tasks/${taskId}/snooze`,
    { days }
  );
}