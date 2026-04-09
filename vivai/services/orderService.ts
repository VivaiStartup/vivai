export type OrderCard = {
  id: number;
  public_code: string;
  status: string;
  fulfillment_method: string;
  payment_method: string;
  payment_status: string;
  customer_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  notes: string | null;
  total_amount: number;
  created_at: string;
  items_count: number;
};

export type OrderItemCard = {
  id: number;
  product_id: number;
  product_name_snapshot: string;
  unit_price: number;
  qty: number;
  line_total: number;
  created_at: string;
};

export type OrderDetailCard = {
  id: number;
  public_code: string;
  id_vivaio: number;
  user_id: number | null;
  status: string;
  fulfillment_method: string;
  payment_method: string;
  payment_status: string;
  customer_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  notes: string | null;
  total_amount: number;
  created_at: string;
  updated_at: string;
  items: OrderItemCard[];
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || 'Errore ordini');
  }

  return data as T;
}

export async function getMyOrders(): Promise<OrderCard[]> {
  return api<OrderCard[]>('/api/orders/my');
}

export async function getMyOrder(orderId: number): Promise<OrderDetailCard> {
  return api<OrderDetailCard>(`/api/orders/my/${orderId}`);
}