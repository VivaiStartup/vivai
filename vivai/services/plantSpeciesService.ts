export interface PlantSpeciesOption {
  id: number;
  slug: string;
  scientificName: string;
  commonName: string | null;
  commercialName: string | null;
  family: string | null;
  genus: string | null;
  image: string | null;
}

interface RawPlantSpeciesOption {
  id: number | string;
  slug: string;
  scientific_name: string;
  common_name?: string | null;
  commercial_name?: string | null;
  family?: string | null;
  genus?: string | null;
  main_image_url?: string | null;
}

function normalizeSpecies(raw: RawPlantSpeciesOption): PlantSpeciesOption {
  return {
    id: Number(raw.id),
    slug: raw.slug,
    scientificName: raw.scientific_name,
    commonName: raw.common_name ?? null,
    commercialName: raw.commercial_name ?? null,
    family: raw.family ?? null,
    genus: raw.genus ?? null,
    image: raw.main_image_url ?? null,
  };
}

export async function searchPlantSpecies(query: string, limit = 8): Promise<PlantSpeciesOption[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({
    q,
    limit: String(limit),
  });

  const response = await fetch(`/api/nursery/plant-species/search?${params.toString()}`, {
    credentials: 'include',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error ?? `HTTP ${response.status}`);
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map(normalizeSpecies);
}
