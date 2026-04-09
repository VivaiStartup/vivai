export type PlantCard = {
  id: number;
  nickname: string;
  image: string;
  user_id?: number;
  plant_species_id?: number | null;
  location_id?: number | null;
  location_name?: string | null;
  location_icon?: string | null;
  indoor_outdoor?: "INDOOR" | "OUTDOOR" | null;
  pot_diameter_cm?: number | null;
  status?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
};

export type PlantDetailCard = {
  id: number;
  nickname: string;
  image: string | null;
  user_id: number;
  plant_species_id: number | null;
  location_id: number | null;
  indoor_outdoor: "INDOOR" | "OUTDOOR" | null;
  pot_diameter_cm: number | null;
  purchase_date: string | null;
  last_repot_date: string | null;
  status: string | null;
  user_notes: string | null;
  last_watered_at: string | null;
  last_fertilized_at: string | null;
  last_checked_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  location: {
    id: number;
    name: string;
    icon: string;
  } | null;
  species: {
    id: number;
    common_name: string | null;
    scientific_name: string | null;
    commercial_name: string | null;
    family: string | null;
    genus: string | null;
    short_description: string | null;
    indoor_outdoor: string | null;
    light_min: number | null;
    light_max: number | null;
    temperature_min_c: number | null;
    temperature_max_c: number | null;
    watering_strategy: string | null;
    watering_trigger_note: string | null;
    watering_warning_note: string | null;
    fertilizing_enabled: boolean | null;
    fertilizing_month_start: number | null;
    fertilizing_month_end: number | null;
    fertilizing_type_note: string | null;
    fertilizing_warning_note: string | null;
    health_check_frequency_days: number | null;
    common_issue_note: string | null;
    seasonal_attention_note: string | null;
  } | null;
};

export type CreateMyPlantPayload = {
  plant_species_id: number;
  nickname: string;
  location_id: number;
  indoor_outdoor: 'INDOOR' | 'OUTDOOR';
  pot_diameter_cm?: number | null;
  purchase_date?: string | null;
  user_notes?: string | null;
};

export async function createMyPlant(payload: CreateMyPlantPayload) {
  const res = await fetch('/api/my-plants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || 'Errore salvataggio pianta');
  }

  return data;
}

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

export async function getMyPlants(limit = 6): Promise<PlantCard[]> {
  return apiGet<PlantCard[]>(`/api/my-plants?limit=${limit}`);
}

export async function getMyPlantDetail(id: number): Promise<PlantDetailCard> {
  return apiGet<PlantDetailCard>(`/api/my-plants/${id}`);
}