import { api } from "./api";

/** "Delete my account": closes the seller's shop and asks the team to delete the account (POST /api/app/account/deletion). */
export const requestAccountDeletion = () => api<{ ticket: number | null }>("/api/app/account/deletion", { method: "POST", json: {} });
