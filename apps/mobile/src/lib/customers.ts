import { api, apiBody } from "./api";
import { customersPath, type CustomerListQuery, type CustomerPage, type CustomerProfile, type CustomerRow, type MessageBody } from "./customers-pure";

export * from "./customers-pure";

// Customers (web /home/customers): the list is GET /api/app/customers (the same search, filter, sort and paging
// as the web page), one customer is GET /api/app/customers/profile?key= (what the web drawer shows) and a message
// to them goes through POST /api/app/customers/message, into their conversation in Chats.

/** The last list loaded, so a customer's name shows at once while their details load. */
const seen = new Map<string, CustomerRow>();

export async function fetchCustomers(query: CustomerListQuery): Promise<CustomerPage> {
  const body = await apiBody<{ data: CustomerRow[]; meta: { page: number; pages: number; total: number; currency: string; stats: CustomerPage["stats"] } }>(customersPath(query));
  for (const row of body.data) seen.set(row.key, row);
  return { items: body.data, page: body.meta.page, pages: body.meta.pages, total: body.meta.total, currency: body.meta.currency, stats: body.meta.stats };
}

export const seenCustomer = (key: string) => seen.get(key) ?? null;

export const fetchCustomer = (key: string) => api<CustomerProfile>(`/api/app/customers/profile?key=${encodeURIComponent(key)}`);

export const messageCustomer = (body: MessageBody) => api<{ conversationId: string; id: string; status: string }>("/api/app/customers/message", { method: "POST", json: body });
