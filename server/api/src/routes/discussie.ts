import { Hono } from "hono";
import db from "../db";

const VALID_CONTEXT_TYPES = ["standpunt", "vraag"];

interface DiscussieRij {
  id: number;
  context_type: string;
  context_slug: string;
  parent_id: number | null;
  naam: string;
  email_hash: string;
  inhoud: string;
  stemmen_op: number;
  stemmen_neer: number;
  zichtbaar: number;
  verberg_reden: string | null;
  created_at: string;
}

interface FormattedReactie {
  id: number;
  naam: string;
  inhoud: string | null;
  verborgen: boolean;
  verberg_reden: string | null;
  stemmen_op: number;
  stemmen_neer: number;
  created_at: string;
  children: FormattedReactie[];
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

function formatReactie(row: DiscussieRij): FormattedReactie {
  const verborgen = row.zichtbaar === 0;
  return {
    id: row.id,
    naam: verborgen ? "Verborgen" : row.naam,
    inhoud: verborgen ? null : row.inhoud,
    verborgen,
    verberg_reden: verborgen ? row.verberg_reden : null,
    stemmen_op: row.stemmen_op,
    stemmen_neer: row.stemmen_neer,
    created_at: row.created_at,
    children: [],
  };
}

function buildTree(rows: DiscussieRij[], sort: string): FormattedReactie[] {
  const topLevel: FormattedReactie[] = [];
  const childrenMap = new Map<number, FormattedReactie[]>();

  for (const row of rows) {
    const formatted = formatReactie(row);
    if (row.parent_id === null) {
      topLevel.push(formatted);
    } else {
      const existing = childrenMap.get(row.parent_id) ?? [];
      existing.push(formatted);
      childrenMap.set(row.parent_id, existing);
    }
  }

  for (const parent of topLevel) {
    parent.children = childrenMap.get(parent.id) ?? [];
    sortReacties(parent.children, sort);
  }

  sortReacties(topLevel, sort);
  return topLevel;
}

function sortReacties(arr: FormattedReactie[], sort: string): void {
  if (sort === "nieuwste") {
    arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else {
    arr.sort((a, b) => b.stemmen_op - a.stemmen_op);
  }
}

// Publieke routes
const discussie = new Hono();

discussie.get("/:context_type/:context_slug", (c) => {
  const contextType = c.req.param("context_type");
  const contextSlug = c.req.param("context_slug");
  const sort = c.req.query("sort") ?? "stemmen";

  if (!VALID_CONTEXT_TYPES.includes(contextType)) {
    return c.json({ error: `Ongeldig context_type. Kies uit: ${VALID_CONTEXT_TYPES.join(", ")}` }, 400);
  }

  const rows = db
    .query(
      "SELECT * FROM discussies WHERE context_type = ? AND context_slug = ?"
    )
    .all(contextType, contextSlug) as DiscussieRij[];

  const tree = buildTree(rows, sort);

  return c.json({ discussie: tree });
});

discussie.post("/:context_type/:context_slug", async (c) => {
  const contextType = c.req.param("context_type");
  const contextSlug = c.req.param("context_slug");

  if (!VALID_CONTEXT_TYPES.includes(contextType)) {
    return c.json({ error: `Ongeldig context_type. Kies uit: ${VALID_CONTEXT_TYPES.join(", ")}` }, 400);
  }

  const ip = getClientIp(c);
  if (isRateLimited(ip)) {
    return c.json({ error: "Te veel reacties. Probeer het later opnieuw (max 3 per uur)." }, 429);
  }

  const body = await c.req.json();
  const { naam, email, inhoud, parent_id } = body;

  if (!naam || typeof naam !== "string" || naam.length < 2 || naam.length > 50) {
    return c.json({ error: "Naam moet tussen 2 en 50 tekens zijn" }, 400);
  }

  if (!email || !isValidEmail(email)) {
    return c.json({ error: "Ongeldig emailadres" }, 400);
  }

  if (!inhoud || typeof inhoud !== "string" || inhoud.length < 10 || inhoud.length > 2000) {
    return c.json({ error: "Inhoud moet tussen 10 en 2000 tekens zijn" }, 400);
  }

  let effectiveParentId: number | null = null;

  if (parent_id !== undefined && parent_id !== null) {
    const parent = db
      .query("SELECT id, parent_id, context_type, context_slug FROM discussies WHERE id = ?")
      .get(parent_id) as { id: number; parent_id: number | null; context_type: string; context_slug: string } | null;

    if (!parent) {
      return c.json({ error: "Parent reactie niet gevonden" }, 404);
    }

    if (parent.context_type !== contextType || parent.context_slug !== contextSlug) {
      return c.json({ error: "Parent reactie hoort bij een andere context" }, 400);
    }

    if (parent.parent_id !== null) {
      effectiveParentId = parent.parent_id;
    } else {
      effectiveParentId = parent.id;
    }
  }

  const emailHash = hashValue(email);

  const result = db
    .query(
      `INSERT INTO discussies (context_type, context_slug, parent_id, naam, email_hash, inhoud)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(contextType, contextSlug, effectiveParentId, naam, emailHash, inhoud);

  recordRequest(ip);

  const created = db
    .query("SELECT * FROM discussies WHERE id = ?")
    .get(result.lastInsertRowid) as DiscussieRij;

  return c.json(formatReactie(created), 201);
});

discussie.post("/:context_type/:context_slug/:id/stem", async (c) => {
  const id = parseInt(c.req.param("id"), 10);

  if (isNaN(id)) {
    return c.json({ error: "Ongeldig reactie ID" }, 400);
  }

  const body = await c.req.json();
  const { stem } = body;

  if (!stem || !["op", "neer"].includes(stem)) {
    return c.json({ error: "Verplicht veld: stem (op of neer)" }, 400);
  }

  const reactie = db
    .query("SELECT id FROM discussies WHERE id = ?")
    .get(id);

  if (!reactie) {
    return c.json({ error: "Reactie niet gevonden" }, 404);
  }

  const ip = getClientIp(c);
  const ipHash = hashValue(ip);

  const existing = db
    .query("SELECT id FROM discussie_stemmen WHERE discussie_id = ? AND ip_hash = ?")
    .get(id, ipHash);

  if (existing) {
    return c.json({ error: "Je hebt al gestemd op deze reactie" }, 409);
  }

  const kolom = stem === "op" ? "stemmen_op" : "stemmen_neer";

  db.query(
    "INSERT INTO discussie_stemmen (discussie_id, ip_hash, stem) VALUES (?, ?, ?)"
  ).run(id, ipHash, stem);

  db.query(
    `UPDATE discussies SET ${kolom} = ${kolom} + 1 WHERE id = ?`
  ).run(id);

  const updated = db
    .query("SELECT stemmen_op, stemmen_neer FROM discussies WHERE id = ?")
    .get(id) as { stemmen_op: number; stemmen_neer: number };

  return c.json({
    status: "Stem geregistreerd",
    stemmen_op: updated.stemmen_op,
    stemmen_neer: updated.stemmen_neer,
  });
});

// Admin routes
const adminDiscussie = new Hono();

adminDiscussie.use("/*", requireApiKey);

adminDiscussie.put("/:id/modereer", async (c) => {
  const id = parseInt(c.req.param("id"), 10);

  if (isNaN(id)) {
    return c.json({ error: "Ongeldig reactie ID" }, 400);
  }

  const body = await c.req.json();
  const { zichtbaar, verberg_reden } = body;

  if (zichtbaar === undefined) {
    return c.json({ error: "Verplicht veld: zichtbaar (true of false)" }, 400);
  }

  if (zichtbaar === false && !verberg_reden) {
    return c.json({ error: "Verplicht veld bij verbergen: verberg_reden" }, 400);
  }

  const existing = db
    .query("SELECT id FROM discussies WHERE id = ?")
    .get(id);

  if (!existing) {
    return c.json({ error: "Reactie niet gevonden" }, 404);
  }

  db.query(
    "UPDATE discussies SET zichtbaar = ?, verberg_reden = ? WHERE id = ?"
  ).run(zichtbaar ? 1 : 0, zichtbaar ? null : verberg_reden, id);

  const updated = db
    .query("SELECT * FROM discussies WHERE id = ?")
    .get(id) as DiscussieRij;

  return c.json({
    id: updated.id,
    zichtbaar: updated.zichtbaar === 1,
    verberg_reden: updated.verberg_reden,
  });
});

adminDiscussie.delete("/:id", (c) => {
  const id = parseInt(c.req.param("id"), 10);

  if (isNaN(id)) {
    return c.json({ error: "Ongeldig reactie ID" }, 400);
  }

  const existing = db
    .query("SELECT id FROM discussies WHERE id = ?")
    .get(id);

  if (!existing) {
    return c.json({ error: "Reactie niet gevonden" }, 404);
  }

  db.query("DELETE FROM discussie_stemmen WHERE discussie_id = ?").run(id);
  db.query("UPDATE discussies SET parent_id = NULL WHERE parent_id = ?").run(id);
  db.query("DELETE FROM discussies WHERE id = ?").run(id);

  return c.json({ status: "Reactie verwijderd" });
});

export { discussie, adminDiscussie };
