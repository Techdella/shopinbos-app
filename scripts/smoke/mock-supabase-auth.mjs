// Minimal stand-ins for Supabase Auth and Resend so the app can be smoke-tested against a local database.
// Supabase: only GET /auth/v1/user is implemented; every other Supabase call gets an empty 404.
// Resend (set RESEND_BASE_URL=http://127.0.0.1:54321/resend): emails are recorded, never delivered,
// and can be read back from GET /resend/__sent.
import http from "node:http";

export const SMOKE_USERS = {
  "smoke-seller": { id: "seed-seller-001", email: "chioma@shopinbos.dev", role: "seller", name: "Chioma Eze" },
  "smoke-supplier": { id: "seed-supplier-001", email: "eze.supply@shopinbos.dev", role: "supplier", name: "Eze Supply" },
  "smoke-logistics": { id: "seed-logistics-001", email: "emeka.fleet@shopinbos.dev", role: "logistics_partner", name: "Emeka Fleet" },
  // A seller with no store yet, for walking through onboarding.
  "smoke-new-seller": { id: "smoke-new-seller-001", email: "new.seller@shopinbos.dev", role: "seller", name: "Ngozi Ade" },
  "smoke-admin": { id: "smoke-admin-001", email: "admin@shopinbos.dev", role: "admin", name: "Smoke Admin" },
};

export function supabaseUser(token) {
  const user = SMOKE_USERS[token];
  if (!user) return null;
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email" },
    user_metadata: { role: user.role, name: user.name },
    created_at: "2026-01-01T00:00:00Z",
  };
}

const port = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);

const sentEmails = [];

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body ? JSON.parse(body) : null));
  });
}

http
  .createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url?.startsWith("/resend/")) {
      if (req.method === "GET" && req.url === "/resend/__sent") return res.end(JSON.stringify(sentEmails));
      const payload = await readBody(req);
      const emails = Array.isArray(payload) ? payload : [payload];
      const ids = emails.map((email) => {
        const id = `mock-${sentEmails.length + 1}`;
        sentEmails.push({ id, ...email });
        return { id };
      });
      res.end(JSON.stringify(req.url.startsWith("/resend/emails/batch") ? { data: ids } : ids[0]));
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/auth/v1/user")) {
      const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      const user = supabaseUser(token);
      res.statusCode = user ? 200 : 401;
      res.end(JSON.stringify(user ?? { code: 401, msg: "invalid token" }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  })
  .listen(port, "127.0.0.1", () => console.log(`mock supabase auth on http://127.0.0.1:${port}`));
