import { Hono } from "hono";
import db from "../db";

type Status = "concept" | "programma" | "gewijzigd" | "gerectificeerd" | "ingetrokken";

const VALID_STATUSES: Status[] = ["concept", "programma", "gewijzigd", "gerectificeerd", "ingetrokken"];

interface Standpunt {
  id: number;
  slug: string;
  titel: string;
  categorie: string;
  samenvatting: string;
  inhoud: string;
  kernwaarden: string | null;
  status: Status;
  rectificatie_tekst: string | null;
  intrekking_reden: string | null;
  cijfers: string | null;
  maatregelen: string | null;
  juridisch: string | null;
  beperkingen: string | null;
  bronnen: string | null;
  kosten_mld: number | null;
  opbrengst_mld: number | null;
  kosten_toelichting: string | null;
  opbrengst_toelichting: string | null;
  versie: number;
  created_at: string;
  updated_at: string;
}

interface HistorieRij {
  id: number;
  standpunt_id: number;
  titel: string;
  categorie: string;
  samenvatting: string;
  inhoud: string;
  versie: number;
  gewijzigd_door: string | null;
  wijziging_reden: string | null;
  created_at: string;
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

function parseJsonArray(val: string | null): any[] | null {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function formatStandpunt(row: Standpunt) {
  return {
    id: row.id,
    slug: row.slug,
    titel: row.titel,
    categorie: row.categorie,
    samenvatting: row.samenvatting,
    inhoud: row.inhoud,
    kernwaarden: parseJsonArray(row.kernwaarden) ?? [],
    status: row.status,
    rectificatie_tekst: row.rectificatie_tekst,
    intrekking_reden: row.intrekking_reden,
    cijfers: parseJsonArray(row.cijfers),
    maatregelen: parseJsonArray(row.maatregelen),
    juridisch: row.juridisch,
    beperkingen: row.beperkingen,
    bronnen: parseJsonArray(row.bronnen),
    versie: row.versie,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Publieke routes
const standpunten = new Hono();

standpunten.get("/categorieen", (c) => {
  const rows = db
    .query("SELECT DISTINCT categorie FROM standpunten ORDER BY categorie")
    .all() as { categorie: string }[];

  return c.json({ categorieen: rows.map((r) => r.categorie) });
});

standpunten.get("/", (c) => {
  const statusFilter = c.req.query("status");

  if (statusFilter) {
    if (!VALID_STATUSES.includes(statusFilter as Status)) {
      return c.json({ error: `Ongeldige status. Kies uit: ${VALID_STATUSES.join(", ")}` }, 400);
    }
    const rows = db
      .query("SELECT * FROM standpunten WHERE status = ? ORDER BY id ASC")
      .all(statusFilter) as Standpunt[];
    return c.json({ standpunten: rows.map(formatStandpunt) });
  }

  const rows = db
    .query("SELECT * FROM standpunten ORDER BY id ASC")
    .all() as Standpunt[];

  return c.json({ standpunten: rows.map(formatStandpunt) });
});

standpunten.get("/:slug", (c) => {
  const slug = c.req.param("slug");

  const row = db
    .query("SELECT * FROM standpunten WHERE slug = ?")
    .get(slug) as Standpunt | null;

  if (!row) {
    return c.json({ error: "Standpunt niet gevonden" }, 404);
  }

  return c.json(formatStandpunt(row));
});

standpunten.get("/:slug/historie", (c) => {
  const slug = c.req.param("slug");

  const standpunt = db
    .query("SELECT id, titel FROM standpunten WHERE slug = ?")
    .get(slug) as { id: number; titel: string } | null;

  if (!standpunt) {
    return c.json({ error: "Standpunt niet gevonden" }, 404);
  }

  const rows = db
    .query(
      "SELECT * FROM standpunten_historie WHERE standpunt_id = ? ORDER BY versie DESC"
    )
    .all(standpunt.id) as HistorieRij[];

  return c.json({
    standpunt: standpunt.titel,
    historie: rows.map((r) => ({
      versie: r.versie,
      titel: r.titel,
      categorie: r.categorie,
      samenvatting: r.samenvatting,
      inhoud: r.inhoud,
      gewijzigd_door: r.gewijzigd_door,
      wijziging_reden: r.wijziging_reden,
      created_at: r.created_at,
    })),
  });
});

standpunten.get("/:slug/begroting", (c) => {
  const slug = c.req.param("slug");

  const standpunt = db
    .query("SELECT id, titel FROM standpunten WHERE slug = ?")
    .get(slug) as { id: number; titel: string } | null;

  if (!standpunt) {
    return c.json({ error: "Standpunt niet gevonden" }, 404);
  }

  const rows = db
    .query("SELECT * FROM begroting_commentaar")
    .all() as {
      jaar: number;
      hoofdstuk_nummer: string;
      uitleg: string;
      dlp_mening: string;
      standpunt_slugs: string | null;
    }[];

  const linked = rows.filter((r) => {
    if (!r.standpunt_slugs) return false;
    const slugs: string[] = JSON.parse(r.standpunt_slugs);
    return slugs.includes(slug);
  });

  return c.json({
    standpunt: standpunt.titel,
    begrotingsposten: linked.map((r) => ({
      jaar: r.jaar,
      hoofdstuk_nummer: r.hoofdstuk_nummer,
      uitleg: r.uitleg,
      dlp_mening: r.dlp_mening,
    })),
  });
});

// Admin routes
const adminStandpunten = new Hono();

adminStandpunten.use("/*", requireApiKey);

adminStandpunten.post("/", async (c) => {
  const body = await c.req.json();
  const { slug, titel, categorie, samenvatting, inhoud, kernwaarden, cijfers, maatregelen, juridisch, beperkingen, bronnen } = body;

  if (!slug || !titel || !categorie || !samenvatting || !inhoud) {
    return c.json(
      { error: "Verplichte velden: slug, titel, categorie, samenvatting, inhoud" },
      400
    );
  }

  const existing = db
    .query("SELECT id FROM standpunten WHERE slug = ?")
    .get(slug);

  if (existing) {
    return c.json({ error: "Er bestaat al een standpunt met deze slug" }, 409);
  }

  const kernwaardenJson = kernwaarden ? JSON.stringify(kernwaarden) : null;
  const cijfersJson = cijfers ? JSON.stringify(cijfers) : null;
  const maatregelenJson = maatregelen ? JSON.stringify(maatregelen) : null;
  const bronnenJson = bronnen ? JSON.stringify(bronnen) : null;

  const result = db
    .query(
      `INSERT INTO standpunten (slug, titel, categorie, samenvatting, inhoud, kernwaarden, cijfers, maatregelen, juridisch, beperkingen, bronnen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(slug, titel, categorie, samenvatting, inhoud, kernwaardenJson, cijfersJson, maatregelenJson, juridisch ?? null, beperkingen ?? null, bronnenJson);

  const created = db
    .query("SELECT * FROM standpunten WHERE id = ?")
    .get(result.lastInsertRowid) as Standpunt;

  return c.json(formatStandpunt(created), 201);
});

adminStandpunten.put("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const { titel, categorie, samenvatting, inhoud, kernwaarden, cijfers, maatregelen, juridisch, beperkingen, bronnen, gewijzigd_door, wijziging_reden } = body;

  const existing = db
    .query("SELECT * FROM standpunten WHERE slug = ?")
    .get(slug) as Standpunt | null;

  if (!existing) {
    return c.json({ error: "Standpunt niet gevonden" }, 404);
  }

  db.query(
    `INSERT INTO standpunten_historie (standpunt_id, titel, categorie, samenvatting, inhoud, versie, gewijzigd_door, wijziging_reden)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    existing.id,
    existing.titel,
    existing.categorie,
    existing.samenvatting,
    existing.inhoud,
    existing.versie,
    gewijzigd_door ?? null,
    wijziging_reden ?? null
  );

  const newTitel = titel ?? existing.titel;
  const newCategorie = categorie ?? existing.categorie;
  const newSamenvatting = samenvatting ?? existing.samenvatting;
  const newInhoud = inhoud ?? existing.inhoud;
  const newKernwaarden = kernwaarden !== undefined ? JSON.stringify(kernwaarden) : existing.kernwaarden;
  const newCijfers = cijfers !== undefined ? JSON.stringify(cijfers) : existing.cijfers;
  const newMaatregelen = maatregelen !== undefined ? JSON.stringify(maatregelen) : existing.maatregelen;
  const newJuridisch = juridisch !== undefined ? juridisch : existing.juridisch;
  const newBeperkingen = beperkingen !== undefined ? beperkingen : existing.beperkingen;
  const newBronnen = bronnen !== undefined ? JSON.stringify(bronnen) : existing.bronnen;
  const newVersie = existing.versie + 1;

  const newStatus = existing.status === "programma" || existing.status === "gewijzigd"
    ? "gewijzigd"
    : existing.status;

  db.query(
    `UPDATE standpunten
     SET titel = ?, categorie = ?, samenvatting = ?, inhoud = ?, kernwaarden = ?, cijfers = ?, maatregelen = ?, juridisch = ?, beperkingen = ?, bronnen = ?, versie = ?, status = ?, updated_at = datetime('now')
     WHERE slug = ?`
  ).run(newTitel, newCategorie, newSamenvatting, newInhoud, newKernwaarden, newCijfers, newMaatregelen, newJuridisch, newBeperkingen, newBronnen, newVersie, newStatus, slug);

  const updated = db
    .query("SELECT * FROM standpunten WHERE slug = ?")
    .get(slug) as Standpunt;

  return c.json(formatStandpunt(updated));
});

adminStandpunten.put("/:slug/status", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const { status } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return c.json({ error: `Ongeldige status. Kies uit: ${VALID_STATUSES.join(", ")}` }, 400);
  }

  const existing = db
    .query("SELECT * FROM standpunten WHERE slug = ?")
    .get(slug) as Standpunt | null;

  if (!existing) {
    return c.json({ error: "Standpunt niet gevonden" }, 404);
  }

  db.query(
    "UPDATE standpunten SET status = ?, updated_at = datetime('now') WHERE slug = ?"
  ).run(status, slug);

  const updated = db
    .query("SELECT * FROM standpunten WHERE slug = ?")
    .get(slug) as Standpunt;

  return c.json(formatStandpunt(updated));
});

adminStandpunten.put("/:slug/rectificatie", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const { rectificatie_tekst, gewijzigd_door } = body;

  if (!rectificatie_tekst) {
    return c.json({ error: "Verplicht veld: rectificatie_tekst" }, 400);
  }

  const existing = db
    .query("SELECT * FROM standpunten WHERE slug = ?")
    .get(slug) as Standpunt | null;

  if (!existing) {
    return c.json({ error: "Standpunt niet gevonden" }, 404);
  }

  db.query(
    `INSERT INTO standpunten_historie (standpunt_id, titel, categorie, samenvatting, inhoud, versie, gewijzigd_door, wijziging_reden)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    existing.id,
    existing.titel,
    existing.categorie,
    existing.samenvatting,
    existing.inhoud,
    existing.versie,
    gewijzigd_door ?? null,
    "Rectificatie"
  );

  db.query(
    `UPDATE standpunten
     SET status = 'gerectificeerd', rectificatie_tekst = ?, versie = versie + 1, updated_at = datetime('now')
     WHERE slug = ?`
  ).run(rectificatie_tekst, slug);

  const updated = db
    .query("SELECT * FROM standpunten WHERE slug = ?")
    .get(slug) as Standpunt;

  return c.json(formatStandpunt(updated));
});

adminStandpunten.put("/:slug/intrekken", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const { intrekking_reden, gewijzigd_door } = body;

  if (!intrekking_reden) {
    return c.json({ error: "Verplicht veld: intrekking_reden" }, 400);
  }

  const existing = db
    .query("SELECT * FROM standpunten WHERE slug = ?")
    .get(slug) as Standpunt | null;

  if (!existing) {
    return c.json({ error: "Standpunt niet gevonden" }, 404);
  }

  db.query(
    `INSERT INTO standpunten_historie (standpunt_id, titel, categorie, samenvatting, inhoud, versie, gewijzigd_door, wijziging_reden)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    existing.id,
    existing.titel,
    existing.categorie,
    existing.samenvatting,
    existing.inhoud,
    existing.versie,
    gewijzigd_door ?? null,
    `Ingetrokken: ${intrekking_reden}`
  );

  db.query(
    `UPDATE standpunten
     SET status = 'ingetrokken', intrekking_reden = ?, versie = versie + 1, updated_at = datetime('now')
     WHERE slug = ?`
  ).run(intrekking_reden, slug);

  const updated = db
    .query("SELECT * FROM standpunten WHERE slug = ?")
    .get(slug) as Standpunt;

  return c.json(formatStandpunt(updated));
});

export { standpunten, adminStandpunten };
