export interface DiscoverCategory {
  id: number;
  slug: string;
  name: string;
  icon?: string | null;
  categoryType?: string | null;
  sortOrder?: number;
}

export interface DiscoverPlant {
  id: number;
  slug: string;
  scientificName: string;
  commonName: string | null;
  commercialName: string | null;
  genus: string | null;
  family: string | null;
  shortDescription: string | null;
  longDescription?: string | null;
  indoorOutdoor: 'INDOOR' | 'OUTDOOR' | 'BOTH';
  plantType: string | null;
  growthHabit: string | null;
  lightMin: number | null;
  lightMax: number | null;
  careLevel: number | null;
  sizeLevel: number | null;
  petSafe: boolean;
  toxicityNote: string | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  wateringLevel: number | null;
  humidityLevel: number | null;
  maintenanceLevel: number | null;
  flowering: boolean;
  evergreen: boolean;
  seasonalityNote: string | null;
  image: string | null;
  status: string;
  categories: string[];
}

export interface DiscoverBreakdown {
  label: string;
  status: 'OK' | 'WARN' | 'BAD';
  hint?: string;
}

export interface DiscoverMatch {
  entry: DiscoverPlant;
  score: number;
  label: string;
  leaves: number;
  note: string;
  breakdown: DiscoverBreakdown[];
}

interface RawDiscoverCategory {
  id: number | string;
  slug: string;
  name: string;
  icon?: string | null;
  category_type?: string | null;
  sort_order?: number | string | null;
}

interface RawDiscoverPlant {
  id: number | string;
  slug: string;
  scientific_name: string;
  common_name?: string | null;
  commercial_name?: string | null;
  genus?: string | null;
  family?: string | null;
  short_description?: string | null;
  long_description?: string | null;
  indoor_outdoor?: 'INDOOR' | 'OUTDOOR' | 'BOTH';
  plant_type?: string | null;
  growth_habit?: string | null;
  light_min?: number | string | null;
  light_max?: number | string | null;
  care_level?: number | string | null;
  size_level?: number | string | null;
  pet_safe?: boolean | number | string | null;
  toxicity_note?: string | null;
  temperature_min_c?: number | string | null;
  temperature_max_c?: number | string | null;
  watering_level?: number | string | null;
  humidity_level?: number | string | null;
  maintenance_level?: number | string | null;
  flowering?: boolean | number | string | null;
  evergreen?: boolean | number | string | null;
  seasonality_note?: string | null;
  main_image_url?: string | null;
  status?: string | null;
  categories?: string[] | string | null;
}

interface RawDiscoverMatch {
  entry: RawDiscoverPlant;
  score: number | string;
  label: string;
  leaves: number | string;
  note: string;
  breakdown: DiscoverBreakdown[];
}

interface GetDiscoverPlantsParams {
  q?: string;
  categorySlug?: string;
  limit?: number;
  offset?: number;
}

const jsonHeaders = {
  'Content-Type': 'application/json',
};

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error ?? `HTTP ${response.status}`);
  }

  return data as T;
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error ?? `HTTP ${response.status}`);
  }

  return data as T;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function normalizeCategories(value: RawDiscoverPlant['categories']): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizePlant(raw: RawDiscoverPlant): DiscoverPlant {
  return {
    id: Number(raw.id),
    slug: raw.slug,
    scientificName: raw.scientific_name,
    commonName: raw.common_name ?? null,
    commercialName: raw.commercial_name ?? null,
    genus: raw.genus ?? null,
    family: raw.family ?? null,
    shortDescription: raw.short_description ?? null,
    longDescription: raw.long_description ?? null,
    indoorOutdoor: raw.indoor_outdoor ?? 'INDOOR',
    plantType: raw.plant_type ?? null,
    growthHabit: raw.growth_habit ?? null,
    lightMin: toNumber(raw.light_min),
    lightMax: toNumber(raw.light_max),
    careLevel: toNumber(raw.care_level),
    sizeLevel: toNumber(raw.size_level),
    petSafe: toBoolean(raw.pet_safe),
    toxicityNote: raw.toxicity_note ?? null,
    temperatureMinC: toNumber(raw.temperature_min_c),
    temperatureMaxC: toNumber(raw.temperature_max_c),
    wateringLevel: toNumber(raw.watering_level),
    humidityLevel: toNumber(raw.humidity_level),
    maintenanceLevel: toNumber(raw.maintenance_level),
    flowering: toBoolean(raw.flowering),
    evergreen: toBoolean(raw.evergreen),
    seasonalityNote: raw.seasonality_note ?? null,
    image: raw.main_image_url ?? null,
    status: raw.status ?? 'DRAFT',
    categories: normalizeCategories(raw.categories),
  };
}

function normalizeCategory(raw: RawDiscoverCategory): DiscoverCategory {
  return {
    id: Number(raw.id),
    slug: raw.slug,
    name: raw.name,
    icon: raw.icon ?? null,
    categoryType: raw.category_type ?? null,
    sortOrder: raw.sort_order != null ? Number(raw.sort_order) : undefined,
  };
}

function normalizeMatch(raw: RawDiscoverMatch): DiscoverMatch {
  return {
    entry: normalizePlant(raw.entry),
    score: Number(raw.score),
    label: raw.label,
    leaves: Number(raw.leaves),
    note: raw.note,
    breakdown: raw.breakdown ?? [],
  };
}

export async function getDiscoverCategories(): Promise<DiscoverCategory[]> {
  const data = await apiGet<RawDiscoverCategory[]>('/api/discover/categories');
  return data.map(normalizeCategory);
}

export async function getDiscoverPlants(params: GetDiscoverPlantsParams = {}): Promise<DiscoverPlant[]> {
  const query = new URLSearchParams();

  if (params.q) query.set('q', params.q);
  if (params.categorySlug) query.set('category_slug', params.categorySlug);
  if (typeof params.limit === 'number') query.set('limit', String(params.limit));
  if (typeof params.offset === 'number') query.set('offset', String(params.offset));

  const qs = query.toString();
  const data = await apiGet<RawDiscoverPlant[]>(`/api/discover/plants${qs ? `?${qs}` : ''}`);
  return data.map(normalizePlant);
}

export async function getDiscoverPlant(id: number | string): Promise<DiscoverPlant> {
  const data = await apiGet<RawDiscoverPlant>(`/api/discover/plants/${id}`);
  return normalizePlant(data);
}

export async function getScenarioMatches(scenario: unknown, limit = 8): Promise<DiscoverMatch[]> {
  const data = await apiPost<RawDiscoverMatch[]>('/api/discover/match', {
    scenario,
    limit,
  });

  return data.map(normalizeMatch);
}
