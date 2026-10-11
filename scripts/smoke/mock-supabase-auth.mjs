// Minimal stand-ins for Supabase Auth and Resend so the app can be smoke-tested against a local database.
// Supabase: GET /auth/v1/user, plus POST /auth/v1/otp and /auth/v1/verify for code sign-in (the code is always
// 123456; codes sent are listed at GET /auth/v1/__otp). Every other Supabase call gets an empty 404.
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

// Accounts created through the OTP endpoints during a run, keyed by access token.
const otpUsers = {};
const sentCodes = [];
export const MOCK_OTP_CODE = "123456";

export function supabaseUser(token) {
  const user = SMOKE_USERS[token] ?? otpUsers[token];
  if (!user) return null;
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email ?? "",
    phone: user.phone ?? "",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email" },
    user_metadata: { role: user.role, name: user.name, ...(user.metadata ?? {}) },
    created_at: "2026-01-01T00:00:00Z",
  };
}

const port = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);

const sentEmails = [];
// In-memory Supabase Storage: uploads, public reads and deletes, enough for photo/logo/document uploads.
const storedFiles = new Map();

function readRaw(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

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
    const storage = req.url?.match(/^\/storage\/v1\/object\/(public\/)?([^?]+)/);
    if (storage) {
      const key = decodeURIComponent(storage[2]);
      if (req.method === "GET" && storage[1]) {
        const file = storedFiles.get(key);
        if (!file) {
          res.statusCode = 404;
          return res.end("{}");
        }
        res.setHeader("content-type", file.type);
        return res.end(file.body);
      }
      if (req.method === "POST" || req.method === "PUT") {
        const body = await readRaw(req);
        if (req.method === "POST" && storedFiles.has(key) && req.headers["x-upsert"] !== "true") {
          res.statusCode = 400;
          return res.end(JSON.stringify({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }));
        }
        let type = req.headers["content-type"] ?? "application/octet-stream";
        let content = body;
        if (type.startsWith("multipart/form-data")) {
          // supabase-js sends File/Blob bodies as form data with the file in an unnamed field.
          const form = await new Response(body, { headers: { "content-type": type } }).formData();
          const file = [...form.values()].find((value) => typeof value !== "string");
          if (file) {
            content = Buffer.from(await file.arrayBuffer());
            type = file.type || "application/octet-stream";
          }
        }
        storedFiles.set(key, { body: content, type });
        return res.end(JSON.stringify({ Key: key, Id: key }));
      }
      if (req.method === "DELETE") {
        const bucket = key.split("/")[0];
        const { prefixes = [] } = JSON.parse((await readRaw(req)).toString() || "{}");
        for (const prefix of prefixes) storedFiles.delete(`${bucket}/${prefix}`);
        return res.end(JSON.stringify(prefixes.map((name) => ({ name }))));
      }
    }
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
    if (req.method === "GET" && req.url === "/auth/v1/__otp") return res.end(JSON.stringify(sentCodes));
    if (req.method === "POST" && req.url?.startsWith("/auth/v1/otp")) {
      const body = (await readBody(req)) ?? {};
      const key = body.phone ? `phone:${body.phone}` : `email:${String(body.email ?? "").toLowerCase()}`;
      const exists = Object.values(otpUsers).some((user) => user.key === key)
        || Object.values(SMOKE_USERS).some((user) => `email:${user.email}` === key);
      if (!exists && body.create_user === false) {
        res.statusCode = 422;
        return res.end(JSON.stringify({ code: 422, error_code: "otp_disabled", msg: "Signups not allowed for otp" }));
      }
      sentCodes.push({ key, channel: body.channel ?? "email", data: body.data ?? null });
      if (!exists) {
        const token = `otp-${Object.keys(otpUsers).length + 1}`;
        otpUsers[token] = {
          key,
          id: `otp-user-${Object.keys(otpUsers).length + 1}`,
          email: body.email ? String(body.email).toLowerCase() : null,
          phone: body.phone ? String(body.phone).replace(/^\+/, "") : null,
          role: body.data?.role ?? "seller",
          name: body.data?.full_name,
          metadata: body.data ?? {},
        };
      }
      return res.end("{}");
    }
    if (req.method === "POST" && req.url?.startsWith("/auth/v1/verify")) {
      const body = (await readBody(req)) ?? {};
      const key = body.phone ? `phone:${body.phone}` : `email:${String(body.email ?? "").toLowerCase()}`;
      const smoke = Object.entries(SMOKE_USERS).find(([, user]) => `email:${user.email}` === key);
      const entry = smoke ?? Object.entries(otpUsers).find(([, user]) => user.key === key);
      if (!entry || body.token !== MOCK_OTP_CODE) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }));
      }
      const [token] = entry;
      return res.end(JSON.stringify({
        access_token: token,
        refresh_token: `${token}-refresh`,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: supabaseUser(token),
      }));
    }
    res.statusCode = 404;
    res.end("{}");
  })
  .listen(port, "127.0.0.1", () => console.log(`mock supabase auth on http://127.0.0.1:${port}`));
