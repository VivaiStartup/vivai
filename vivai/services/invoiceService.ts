export type InvoiceFlowType = "ACQUISTO" | "VENDITA";
export type InvoiceFilterType = InvoiceFlowType | "ALL";

export interface InvoiceRecord {
  id: number;
  nursery_id: number;
  flow_type: "ACQUISTO" | "VENDITA";
  document_type: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  supplier_vat: string | null;
  customer_name: string | null;
  customer_vat: string | null;
  taxable_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  currency: string | null;
  original_filename: string | null;
  stored_path: string | null;
  mime_type: string | null;
  extraction_status: "EXTRACTED" | "REVIEW_NEEDED" | "ERROR";
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: InvoiceLineItem[];
}

export interface InvoiceLineItem {
  id?: number;
  invoice_id?: number;
  line_no: number | null;
  description: string | null;
  sku: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  vat_rate: number | null;
  line_total: number | null;
  notes: string | null;
}



interface ApiResponse<T> {
  ok?: boolean;
  data?: T;
  invoice?: T;
  message?: string;
  error?: string;
}

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export async function getInvoices(flowType: InvoiceFilterType = "ALL"): Promise<InvoiceRecord[]> {
  const qs =
    flowType && flowType !== "ALL"
      ? `?flow_type=${encodeURIComponent(flowType)}`
      : "";

  const res = await fetch(`/api/invoices${qs}`, {
    method: "GET",
    credentials: "include",
  });

  const json: ApiResponse<InvoiceRecord[]> = await parseJsonSafe(res);

  if (!res.ok) {
    throw new Error(json?.error || "Errore caricamento fatture");
  }

  // compatibile sia con json_ok([...]) sia con json_ok({data:[...]})
  if (Array.isArray(json)) return json as unknown as InvoiceRecord[];
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

export async function extractInvoice(
  file: File,
  flowType?: InvoiceFlowType
): Promise<InvoiceRecord> {
  const fd = new FormData();
  fd.append("invoice", file);

  if (flowType) {
    fd.append("flow_type", flowType);
  }

  const res = await fetch("/api/invoices/extract", {
    method: "POST",
    credentials: "include",
    body: fd,
  });

  const json: ApiResponse<InvoiceRecord> = await parseJsonSafe(res);

  if (!res.ok) {
    throw new Error(json?.error || "Errore estrazione fattura");
  }

  if (!json?.invoice) {
    throw new Error("Risposta backend incompleta");
  }

  return json.invoice;
}