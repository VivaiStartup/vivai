export type NurseryListingType = "ALL" | "PLANT" | "PRODUCT";
export type ListingImageMode = "CUSTOM" | "SPECIES";

export interface PlantSpeciesOption {
  id: number;
  slug?: string | null;
  scientificName: string;
  commonName?: string | null;
  commercialName?: string | null;
  mainImageUrl?: string | null;
}

export interface NurseryVariantPayload {
  id?: string | number;
  sku?: string | null;
  label: string;
  price: number;
  qty: number;
  low_stock_threshold?: number;
  shortDescription?: string | null;
}

export interface NurseryListingPayload {
  type: "PLANT" | "PRODUCT";
  title: string;
  category: string;
  brand?: string | null;
  status?: "ACTIVE" | "DRAFT" | "OUT_OF_STOCK";
  mainImage?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  attributes?: Record<string, unknown> | null;
  variants: NurseryVariantPayload[];

  // New optional species linkage
  plantSpeciesId?: number | null;
  imageMode?: ListingImageMode;
}

async function parseJsonResponse(res: Response) {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data?.error || `API ${res.status}: ${text || "no body"}`;
    throw new Error(msg);
  }

  return data;
}

export async function getNurseryListings(type: NurseryListingType = "ALL") {
  const res = await fetch(`/api/nursery/listings?type=${encodeURIComponent(type)}`, {
    credentials: "include",
  });
  return parseJsonResponse(res);
}

export async function createNurseryListing(payload: NurseryListingPayload) {
  const res = await fetch("/api/nursery/listings", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(res);
}

export async function updateNurseryListing(listingId: string | number, payload: NurseryListingPayload) {
  const res = await fetch(`/api/nursery/listings/${listingId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(res);
}

export async function patchVariant(
  variantId: number,
  patch: { stock?: number; qty?: number; price?: number }
) {
  const body: Record<string, number> = {};
  if (typeof patch.price === "number") body.price = patch.price;

  // Backend speaks qty; accept stock from UI and remap it.
  if (typeof patch.qty === "number") body.qty = patch.qty;
  else if (typeof patch.stock === "number") body.qty = patch.stock;

  const res = await fetch(`/api/nursery/variants/${variantId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return parseJsonResponse(res);
}

/**
 * Reuse the existing Discover API to search plant species for the nursery modal.
 * This avoids adding a third backend file just for species search.
 */
export async function searchPlantSpeciesForCatalog(query: string, limit = 12): Promise<PlantSpeciesOption[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const res = await fetch(
    `/api/discover/plants?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`,
    { credentials: "include" }
  );

  const data = await parseJsonResponse(res);
  const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : [];

  return items.map((row: any) => ({
    id: Number(row.id),
    slug: row.slug ?? null,
    scientificName: row.scientificName ?? row.scientific_name ?? "",
    commonName: row.commonName ?? row.common_name ?? null,
    commercialName: row.commercialName ?? row.commercial_name ?? null,
    mainImageUrl: row.mainImageUrl ?? row.main_image_url ?? row.mainImage ?? row.main_image ?? null,
  })).filter((row: PlantSpeciesOption) => Number.isFinite(row.id) && !!row.scientificName);
}



export type NurseryListingStatus = "ACTIVE" | "DRAFT" | "OUT_OF_STOCK";

export async function patchNurseryListingStatus(
  listingId: string | number,
  status: NurseryListingStatus
) {
  const res = await fetch(`/api/nursery/listings/${listingId}/status`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  return parseJsonResponse(res);
}

export async function getPlantSpeciesById(id: number): Promise<PlantSpeciesOption | null> {
  if (!id) return null;

  const res = await fetch(`/api/discover/plants/${id}`, { credentials: "include" });
  const data = await parseJsonResponse(res);
  const row = data?.item ?? data?.data ?? data;

  if (!row || !row.id) return null;

  return {
    id: Number(row.id),
    slug: row.slug ?? null,
    scientificName: row.scientificName ?? row.scientific_name ?? "",
    commonName: row.commonName ?? row.common_name ?? null,
    commercialName: row.commercialName ?? row.commercial_name ?? null,
    mainImageUrl: row.mainImageUrl ?? row.main_image_url ?? row.mainImage ?? row.main_image ?? null,
  };
}