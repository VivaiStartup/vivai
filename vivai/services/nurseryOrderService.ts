export type NurseryOrderCard = {
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

export type NurseryOrderItem = {
  id: number;
  product_id: number;
  product_name_snapshot: string;
  unit_price: number;
  qty: number;
  line_total: number;
  created_at: string;
};

export type NurseryOrderDetail = {
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
  items: NurseryOrderItem[];
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || "Errore ordini vivaio");
  }

  return data as T;
}

export async function getNurseryOrders(status?: string): Promise<NurseryOrderCard[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return api<NurseryOrderCard[]>(`/api/nursery/orders${qs}`);
}

export async function getNurseryOrder(orderId: number): Promise<NurseryOrderDetail> {
  return api<NurseryOrderDetail>(`/api/nursery/orders/${orderId}`);
}

export async function updateNurseryOrderStatus(orderId: number, status: "NEW" | "READY_FOR_PICKUP" | "COMPLETED") {
  return api<{ ok: true; order: { id: number; status: string } }>(
    `/api/nursery/orders/${orderId}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }
  );
}