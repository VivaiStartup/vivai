// services/cartService.ts
export type CartItem = { productId: number; qty: number; unitPrice: number; name?: string; image?: string };
export type Cart = { id: number | null; items: CartItem[]; total: number };

export async function getCart(): Promise<Cart> {
  const res = await fetch("/api/cart");
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function countCartItems(cart: Cart): number {
  return cart.items.reduce((sum, it) => sum + (it.qty ?? 0), 0);
}

export async function changeCartItem(productId: number, delta: 1 | -1) {
  const res = await fetch("/api/cart/items", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, delta }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}