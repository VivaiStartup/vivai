export type PlantEventCard = {
  id: number;
  user_id: number;
  user_plant_id: number;
  agenda_task_id: number | null;
  event_type:
    | "WATERED"
    | "FERTILIZED"
    | "CHECKED"
    | "TREATED"
    | "PRUNED"
    | "REPOTTED"
    | "SKIPPED_TASK";
  event_date: string;
  product_name: string | null;
  notes: string | null;
  created_at: string;
  plant_name?: string | null;
  plant_image?: string | null;
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

export async function getRecentPlantEvents(
  limit = 50,
  options?: {
    onlyAgenda?: boolean;
    plantId?: number;
    eventType?:
      | "WATERED"
      | "FERTILIZED"
      | "CHECKED"
      | "TREATED"
      | "PRUNED"
      | "REPOTTED"
      | "SKIPPED_TASK";
  }
): Promise<PlantEventCard[]> {
  const search = new URLSearchParams();
  search.set("limit", String(limit));

  if (options?.onlyAgenda) {
    search.set("only_agenda", "1");
  }

  if (options?.plantId) {
    search.set("plant_id", String(options.plantId));
  }

  if (options?.eventType) {
    search.set("event_type", options.eventType);
  }

  return apiGet<PlantEventCard[]>(`/api/events?${search.toString()}`);
}