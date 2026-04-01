import { Hono } from "hono";
import db from "../db";

type InzendingType = "vraag" | "standpunt";
type InzendingStatus = "nieuw" | "in_behandeling" | "goedgekeurd" | "afgewezen";

const VALID_TYPES: InzendingType[] = ["vraag", "standpunt"];
const VALID_STATUSES: InzendingStatus[] = ["nieuw", "in_behandeling", "goedgekeurd", "afgewezen"];

interface Inzending {
  id: number;
  type: InzendingType;
  naam: string;
  email_hash: string;
  titel: string;
  inhoud: string;
  status: InzendingStatus;
  reactie_admin: string | null;
  created_at: string;
  updated_at: string;
}

const rateLimit = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const timestamps = (rateLimit.get(ip) ?? []).filter((t) => t > hourAgo);
  rateLimit.set(ip, timestamps);
  return timestamps.length >= 3;
}

function recordRequest(ip: string): void {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const timestamps = (rateLimit.get(ip) ?? []).filter((t) => t > hourAgo);
  timestamps.push(now);
  rateLimit.set(ip, timestamps);
}

function getClientIp(c: any): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

function hashValue(value: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(value);
  return hasher.digest("hex");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireApiKey(c: any, next: any) {
  const key = c.req.header("X-API-Key");
  const expected = process.env.DLP_ADMIN_KEY;

  if (!expected) {
    return c.json({ error: "Server configuratie onvolledig" }, 500);
  }

  if (!key || key !== expected) {
    return c.json({ error: "Ongeldige of ontbrekende API-key" }, 401);
  }

  return next();
}

// Publieke route
const inzendingen = new Hono();

inzendingen.post("/", async (c) => {
  const ip = getClientIp(c);
  if (isRateLimited(ip)) {
    return c.json({ error: "Te veel inzendingen. Probeer het later opnieuw (max 3 per uur)." }, 429);
  }

  const body = await c.req.json();
  const { type, naam, email, titel, inhoud } = body;

  if (!type || !VALID_TYPES.includes(type)) {
    return c.json({ error: `Verplicht veld: type (${VALID_TYPES.join(" of ")})` }, 400);
  }

  if (!naam || typeof naam !== "string" || naam.length < 2 || naam.length > 50) {
    return c.json({ error: "Naam moet tussen 2 en 50 tekens zijn" }, 400);
  }

  if (!email || !isValidEmail(email)) {
    return c.json({ error: "Ongeldig emailadres" }, 400);
  }

  if (!titel || typeof titel !== "string" || titel.length < 5 || titel.length > 200) {
    return c.json({ error: "Titel moet tussen 5 en 200 tekens zijn" }, 400);
  }

  if (!inhoud || typeof inhoud !== "string" || inhoud.length < 20 || inhoud.length > 5000) {
    return c.json({ error: "Inhoud moet tussen 20 en 5000 tekens zijn" }, 400);
  }

  const emailHash = hashValue(email);

  db.query(
    "INSERT INTO inzendingen (type, naam, email_hash, titel, inhoud) VALUES (?, ?, ?, ?, ?)"
  ).run(type, naam, emailHash, titel, inhoud);

  recordRequest(ip);

  return c.json({
    success: true,
    message: "Bedankt voor je inzending! We bekijken het zo snel mogelijk.",
  }, 201);
});

// Admin routes
const adminInzendingen = new Hono();

adminInzendingen.use("/*", requireApiKey);

adminInzendingen.get("/", (c) => {
  const statusFilter = c.req.query("status");

  if (statusFilter) {
    if (!VALID_STATUSES.includes(statusFilter as InzendingStatus)) {
      return c.json({ error: `Ongeldige status. Kies uit: ${VALID_STATUSES.join(", ")}` }, 400);
    }
    const rows = db
      .query("SELECT * FROM inzendingen WHERE status = ? ORDER BY created_at DESC")
      .all(statusFilter) as Inzending[];
    return c.json({ inzendingen: rows });
  }

  const rows = db
    .query("SELECT * FROM inzendingen ORDER BY created_at DESC")
    .all() as Inzending[];

  return c.json({ inzendingen: rows });
});

adminInzendingen.get("/:id", (c) => {
  const id = parseInt(c.req.param("id"), 10);

  if (isNaN(id)) {
    return c.json({ error: "Ongeldig ID" }, 400);
  }

  const row = db
    .query("SELECT * FROM inzendingen WHERE id = ?")
    .get(id) as Inzending | null;

  if (!row) {
    return c.json({ error: "Inzending niet gevonden" }, 404);
  }

  return c.json(row);
});

adminInzendingen.put("/:id/status", async (c) => {
  const id = parseInt(c.req.param("id"), 10);

  if (isNaN(id)) {
    return c.json({ error: "Ongeldig ID" }, 400);
  }

  const body = await c.req.json();
  const { status, reactie_admin } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return c.json({ error: `Ongeldige status. Kies uit: ${VALID_STATUSES.join(", ")}` }, 400);
  }

  const existing = db
    .query("SELECT id FROM inzendingen WHERE id = ?")
    .get(id);

  if (!existing) {
    return c.json({ error: "Inzending niet gevonden" }, 404);
  }

  if (reactie_admin !== undefined) {
    db.query(
      "UPDATE inzendingen SET status = ?, reactie_admin = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, reactie_admin, id);
  } else {
    db.query(
      "UPDATE inzendingen SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, id);
  }

  const updated = db
    .query("SELECT * FROM inzendingen WHERE id = ?")
    .get(id) as Inzending;

  return c.json(updated);
});

adminInzendingen.delete("/:id", (c) => {
  const id = parseInt(c.req.param("id"), 10);

  if (isNaN(id)) {
    return c.json({ error: "Ongeldig ID" }, 400);
  }

  const existing = db
    .query("SELECT id FROM inzendingen WHERE id = ?")
    .get(id);

  if (!existing) {
    return c.json({ error: "Inzending niet gevonden" }, 404);
  }

  db.query("DELETE FROM inzendingen WHERE id = ?").run(id);

  return c.json({ status: "Inzending verwijderd" });
});

export { inzendingen, adminInzendingen };
