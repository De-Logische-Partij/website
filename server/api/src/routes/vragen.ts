import { Hono } from "hono";
import db from "../db";

type VraagType = "kamervraag" | "burgervraag" | "open";
type VraagStatus = "open" | "beantwoord" | "gesloten";

const VALID_TYPES: VraagType[] = ["kamervraag", "burgervraag", "open"];
const VALID_STATUSES: VraagStatus[] = ["open", "beantwoord", "gesloten"];

interface Vraag {
  id: number;
  slug: string;
  titel: string;
  type: VraagType;
  context: string;
  vraag: string;
  status: VraagStatus;
  antwoord: string | null;
  antwoord_datum: string | null;
  stemmen_eens: number;
  stemmen_oneens: number;
  created_at: string;
  updated_at: string;
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

function formatVraag(row: Vraag) {
  return {
    id: row.id,
    slug: row.slug,
    titel: row.titel,
    type: row.type,
    context: row.context,
    vraag: row.vraag,
    status: row.status,
    antwoord: row.antwoord,
    antwoord_datum: row.antwoord_datum,
    stemmen_eens: row.stemmen_eens,
    stemmen_oneens: row.stemmen_oneens,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getClientIp(c: any): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

function hashIpSlug(ip: string, slug: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(`${ip}:${slug}`);
  return hasher.digest("hex");
}

// Publieke routes
const vragen = new Hono();

vragen.get("/", (c) => {
  const typeFilter = c.req.query("type");
  const statusFilter = c.req.query("status");

  let query = "SELECT * FROM vragen WHERE 1=1";
  const params: string[] = [];

  if (typeFilter) {
    if (!VALID_TYPES.includes(typeFilter as VraagType)) {
      return c.json({ error: `Ongeldig type. Kies uit: ${VALID_TYPES.join(", ")}` }, 400);
    }
    query += " AND type = ?";
    params.push(typeFilter);
  }

  if (statusFilter) {
    if (!VALID_STATUSES.includes(statusFilter as VraagStatus)) {
      return c.json({ error: `Ongeldige status. Kies uit: ${VALID_STATUSES.join(", ")}` }, 400);
    }
    query += " AND status = ?";
    params.push(statusFilter);
  }

  query += " ORDER BY created_at DESC";

  const rows = db.query(query).all(...params) as Vraag[];
  return c.json({ vragen: rows.map(formatVraag) });
});

vragen.get("/:slug", (c) => {
  const slug = c.req.param("slug");

  const row = db
    .query("SELECT * FROM vragen WHERE slug = ?")
    .get(slug) as Vraag | null;

  if (!row) {
    return c.json({ error: "Vraag niet gevonden" }, 404);
  }

  return c.json(formatVraag(row));
});

vragen.post("/:slug/stem", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const { stem } = body;

  if (!stem || !["eens", "oneens"].includes(stem)) {
    return c.json({ error: "Verplicht veld: stem (eens of oneens)" }, 400);
  }

  const vraag = db
    .query("SELECT * FROM vragen WHERE slug = ?")
    .get(slug) as Vraag | null;

  if (!vraag) {
    return c.json({ error: "Vraag niet gevonden" }, 404);
  }

  if (vraag.type !== "burgervraag") {
    return c.json({ error: "Stemmen is alleen mogelijk op burgervragen" }, 400);
  }

  if (vraag.status === "gesloten") {
    return c.json({ error: "Deze vraag is gesloten voor stemmen" }, 400);
  }

  const ip = getClientIp(c);
  const ipSlugHash = hashIpSlug(ip, slug);

  const existing = db
    .query("SELECT id FROM vragen_stemmen WHERE ip_slug_hash = ?")
    .get(ipSlugHash);

  if (existing) {
    return c.json({ error: "Je hebt al gestemd op deze vraag" }, 409);
  }

  const kolom = stem === "eens" ? "stemmen_eens" : "stemmen_oneens";

  db.query(
    "INSERT INTO vragen_stemmen (ip_slug_hash, vraag_id) VALUES (?, ?)"
  ).run(ipSlugHash, vraag.id);

  db.query(
    `UPDATE vragen SET ${kolom} = ${kolom} + 1, updated_at = datetime('now') WHERE slug = ?`
  ).run(slug);

  const updated = db
    .query("SELECT * FROM vragen WHERE slug = ?")
    .get(slug) as Vraag;

  return c.json({
    status: "Stem geregistreerd",
    stemmen_eens: updated.stemmen_eens,
    stemmen_oneens: updated.stemmen_oneens,
  });
});

// Admin routes
const adminVragen = new Hono();

adminVragen.use("/*", requireApiKey);

adminVragen.post("/", async (c) => {
  const body = await c.req.json();
  const { slug, titel, type, context, vraag } = body;

  if (!slug || !titel || !type || !context || !vraag) {
    return c.json(
      { error: "Verplichte velden: slug, titel, type, context, vraag" },
      400
    );
  }

  if (!VALID_TYPES.includes(type)) {
    return c.json({ error: `Ongeldig type. Kies uit: ${VALID_TYPES.join(", ")}` }, 400);
  }

  const existing = db
    .query("SELECT id FROM vragen WHERE slug = ?")
    .get(slug);

  if (existing) {
    return c.json({ error: "Er bestaat al een vraag met deze slug" }, 409);
  }

  const result = db
    .query(
      "INSERT INTO vragen (slug, titel, type, context, vraag) VALUES (?, ?, ?, ?, ?)"
    )
    .run(slug, titel, type, context, vraag);

  const created = db
    .query("SELECT * FROM vragen WHERE id = ?")
    .get(result.lastInsertRowid) as Vraag;

  return c.json(formatVraag(created), 201);
});

adminVragen.put("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const { titel, type, context, vraag } = body;

  const existing = db
    .query("SELECT * FROM vragen WHERE slug = ?")
    .get(slug) as Vraag | null;

  if (!existing) {
    return c.json({ error: "Vraag niet gevonden" }, 404);
  }

  if (type && !VALID_TYPES.includes(type)) {
    return c.json({ error: `Ongeldig type. Kies uit: ${VALID_TYPES.join(", ")}` }, 400);
  }

  const newTitel = titel ?? existing.titel;
  const newType = type ?? existing.type;
  const newContext = context ?? existing.context;
  const newVraag = vraag ?? existing.vraag;

  db.query(
    `UPDATE vragen SET titel = ?, type = ?, context = ?, vraag = ?, updated_at = datetime('now') WHERE slug = ?`
  ).run(newTitel, newType, newContext, newVraag, slug);

  const updated = db
    .query("SELECT * FROM vragen WHERE slug = ?")
    .get(slug) as Vraag;

  return c.json(formatVraag(updated));
});

adminVragen.put("/:slug/antwoord", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const { antwoord } = body;

  if (!antwoord) {
    return c.json({ error: "Verplicht veld: antwoord" }, 400);
  }

  const existing = db
    .query("SELECT * FROM vragen WHERE slug = ?")
    .get(slug) as Vraag | null;

  if (!existing) {
    return c.json({ error: "Vraag niet gevonden" }, 404);
  }

  db.query(
    `UPDATE vragen SET antwoord = ?, antwoord_datum = datetime('now'), status = 'beantwoord', updated_at = datetime('now') WHERE slug = ?`
  ).run(antwoord, slug);

  const updated = db
    .query("SELECT * FROM vragen WHERE slug = ?")
    .get(slug) as Vraag;

  return c.json(formatVraag(updated));
});

adminVragen.delete("/:slug", (c) => {
  const slug = c.req.param("slug");

  const existing = db
    .query("SELECT * FROM vragen WHERE slug = ? AND status != 'gesloten'")
    .get(slug) as Vraag | null;

  if (!existing) {
    return c.json({ error: "Vraag niet gevonden of al gesloten" }, 404);
  }

  db.query(
    "UPDATE vragen SET status = 'gesloten', updated_at = datetime('now') WHERE slug = ?"
  ).run(slug);

  return c.json({ status: "Vraag gesloten" });
});

export { vragen, adminVragen };
