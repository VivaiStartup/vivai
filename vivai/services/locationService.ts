export type LocationCard = { id: string; name: string; icon: string };

export async function getLocations(): Promise<LocationCard[]> {
  const res = await fetch("/api/locations");
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}