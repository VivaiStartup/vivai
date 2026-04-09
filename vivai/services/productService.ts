export type ProductCard = {
  id: number;
  name: string;
  price: number;
  image: string;
};

export async function getProducts(limit = 50): Promise<ProductCard[]> {
  const res = await fetch(`/api/products?limit=${limit}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}