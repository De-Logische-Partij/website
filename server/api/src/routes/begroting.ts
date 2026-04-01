import { Hono } from "hono";
import db from "../db";

const RIJKSFINANCIEN_BASE = "https://www.rijksfinancien.nl/open-data/api/json";
const CACHE_TTL_HOURS = 24;

interface BegrotingsRegel {
  index: string;
  jaar: number;
  fase: string;
  verantwoordelijk_minister: string;
  hoofdstuk_naam: string;
  hoofdstuk_nummer: string;
  artikel_naam: string;
  artikel_nummer: string;
  beleid_of_niet_beleid: string;
  rbv_model: string;
  artikelonderdeel_naam: string;
  artikelonderdeel_nummer: string;
  instrument_of_uitsplitsing_apparaat_naam: string;
  instrument_of_uitsplitsing_apparaat_nummer: string;
  regeling_detailniveau_naam: string;
  regeling_detailniveau_nummer: string;
  vuo: string;
  bedrag: number;
}

interface CacheRij {
  data: string;
  fetched_at: string;
}

function isCacheValid(fetchedAt: string): boolean {
  const fetched = new Date(fetchedAt + "Z").getTime();
  const now = Date.now();
  return now - fetched < CACHE_TTL_HOURS * 60 * 60 * 1000;
}

async function fetchBegrotingsData(
  jaar: number,
  vuo: string = "U",
  hoofdstuk?: string
): Promise<BegrotingsRegel[]> {
  const cacheKey = hoofdstuk ?? "__all__";

  const cached = db
    .query(
      "SELECT data, fetched_at FROM begroting_cache WHERE jaar = ? AND fase = 'OWB' AND vuo = ? AND hoofdstuk_nummer = ?"
    )
    .get(jaar, vuo, cacheKey) as CacheRij | null;

  if (cached && isCacheValid(cached.fetched_at)) {
    return JSON.parse(cached.data);
  }

  let url = `${RIJKSFINANCIEN_BASE}/budgettaire_tabellen?year=${jaar}&phase=OWB&vuo=${vuo}`;
  if (hoofdstuk) {
    url += `&chapter=${hoofdstuk}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Rijksfinancien API error: ${response.status}`);
  }

  const data = await response.json() as BegrotingsRegel[];

  db.query(
    `INSERT INTO begroting_cache (jaar, fase, vuo, hoofdstuk_nummer, data, fetched_at)
     VALUES (?, 'OWB', ?, ?, ?, datetime('now'))
     ON CONFLICT(jaar, fase, vuo, hoofdstuk_nummer)
     DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at`
  ).run(jaar, vuo, cacheKey, JSON.stringify(data));

  return data;
}

const HOOFDSTUK_NAAR_MINISTERIE: Record<string, string> = {
  I: "De Koning",
  IIA: "Staten-Generaal",
  IIB: "Hoge Colleges van Staat",
  III: "Algemene Zaken",
  IV: "Koninkrijksrelaties",
  V: "Buitenlandse Zaken",
  VI: "Justitie en Veiligheid",
  VII: "Binnenlandse Zaken en Koninkrijksrelaties",
  VIII: "Onderwijs, Cultuur en Wetenschap",
  IXA: "Nationale Schuld",
  IXB: "Financien",
  X: "Defensie",
  XII: "Infrastructuur en Waterstaat",
  XIII: "Economische Zaken en Klimaat",
  XIV: "Landbouw, Natuur en Voedselkwaliteit",
  XV: "Sociale Zaken en Werkgelegenheid",
  XVI: "Volksgezondheid, Welzijn en Sport",
  XVII: "Buitenlandse Handel en Ontwikkelingssamenwerking",
  A: "Mobiliteitsfonds",
  B: "Gemeentefonds",
  C: "Provinciefonds",
  F: "Diergezondheidsfonds",
  H: "BES-fonds",
  J: "Deltafonds",
  K: "Defensiematerieelbegrotingsfonds",
};

interface CommentaarRij {
  id: number;
  jaar: number;
  hoofdstuk_nummer: string;
  uitleg: string;
  dlp_mening: string;
  standpunt_slugs: string | null;
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

interface Kerncijfers {
  staatsschuld_mld: number;
  staatsschuld_pct_bbp: number;
  bbp_mld: number;
  inflatie_pct: number;
  werkloosheid_pct: number;
  bevolking: number;
  bevolkingsgroei_pct: number;
  geboorten: number;
  overlijdens: number;
  immigratie: number;
  emigratie: number;
  belastingplichtigen: number;
  context: string;
  gebeurtenissen: string[];
}

const KERNCIJFERS: Record<number, Kerncijfers> = {
  2018: { staatsschuld_mld: 405, staatsschuld_pct_bbp: 52.4, bbp_mld: 773, inflatie_pct: 1.6, werkloosheid_pct: 3.8, bevolking: 17200000, bevolkingsgroei_pct: 0.6, geboorten: 169000, overlijdens: 153000, immigratie: 243000, emigratie: 154000, belastingplichtigen: 9500000, context: "Economisch stabiel jaar. Kabinet Rutte III treedt aan. Lage inflatie, dalende werkloosheid.", gebeurtenissen: ["Kabinet Rutte III start", "AVG/GDPR treedt in werking", "Dividend belasting-discussie", "Economische groei 2,6%"] },
  2019: { staatsschuld_mld: 395, staatsschuld_pct_bbp: 48.5, bbp_mld: 814, inflatie_pct: 2.7, werkloosheid_pct: 3.4, bevolking: 17300000, bevolkingsgroei_pct: 0.6, geboorten: 170000, overlijdens: 152000, immigratie: 269000, emigratie: 160000, belastingplichtigen: 9600000, context: "Laatste jaar voor de pandemie. Stikstofcrisis domineert de politiek. Staatsschuld daalt naar 48,5% BBP.", gebeurtenissen: ["Stikstofcrisis (PAS-uitspraak Raad van State)", "Klimaatakkoord ondertekend", "Boerenprotesten beginnen", "Staatsschuld daalt onder 50% BBP"] },
  2020: { staatsschuld_mld: 435, staatsschuld_pct_bbp: 54.7, bbp_mld: 796, inflatie_pct: 1.1, werkloosheid_pct: 3.8, bevolking: 17400000, bevolkingsgroei_pct: 0.5, geboorten: 169000, overlijdens: 169000, immigratie: 220000, emigratie: 133000, belastingplichtigen: 9700000, context: "Coronapandemie. Enorme steunpakketten (NOW, TVL, Tozo). BBP krimpt, staatsschuld stijgt fors. Oversterfte door COVID-19.", gebeurtenissen: ["COVID-19 pandemie begint", "Eerste lockdown (maart)", "Steunpakketten NOW/TVL/Tozo", "BBP krimpt 3,8%", "Toeslagenaffaire komt aan het licht"] },
  2021: { staatsschuld_mld: 448, staatsschuld_pct_bbp: 51.7, bbp_mld: 867, inflatie_pct: 2.8, werkloosheid_pct: 4.2, bevolking: 17500000, bevolkingsgroei_pct: 0.4, geboorten: 179000, overlijdens: 171000, immigratie: 253000, emigratie: 145000, belastingplichtigen: 9800000, context: "Herstel na corona. Vaccinatieprogramma, economie veert terug. Kabinet Rutte III valt door toeslagenaffaire. Langste formatie ooit.", gebeurtenissen: ["Kabinet valt (toeslagenaffaire)", "Vaccinatieprogramma start", "Tweede Kamerverkiezingen", "Langste kabinetsformatie ooit (299 dagen)", "Economisch herstel (+4,9%)"] },
  2022: { staatsschuld_mld: 480, staatsschuld_pct_bbp: 50.1, bbp_mld: 958, inflatie_pct: 11.6, werkloosheid_pct: 3.5, bevolking: 17600000, bevolkingsgroei_pct: 0.9, geboorten: 168000, overlijdens: 170000, immigratie: 403000, emigratie: 179000, belastingplichtigen: 9900000, context: "Inflatieschok door oorlog in Oekraine. Energiecrisis. Hoogste inflatie in 40 jaar (11,6%). Record immigratie. Kabinet Rutte IV treedt aan.", gebeurtenissen: ["Rusland valt Oekraine binnen", "Energiecrisis en prijsplafond", "Inflatie 11,6% (hoogste in 40 jaar)", "Record immigratie (403.000)", "Kabinet Rutte IV start"] },
  2023: { staatsschuld_mld: 476, staatsschuld_pct_bbp: 46.5, bbp_mld: 1024, inflatie_pct: 3.8, werkloosheid_pct: 3.6, bevolking: 17800000, bevolkingsgroei_pct: 1.0, geboorten: 164000, overlijdens: 158000, immigratie: 340000, emigratie: 189000, belastingplichtigen: 10000000, context: "Inflatie daalt maar blijft hoog. Kabinet Rutte IV valt over asielbeleid. PVV wint verkiezingen. Koopkracht onder druk.", gebeurtenissen: ["Kabinet Rutte IV valt (asielbeleid)", "Tweede Kamerverkiezingen: PVV grootste", "Inflatie daalt naar 3,8%", "BBP groeit 0,1% (bijna stilstand)", "AI-discussie domineert tech-beleid"] },
  2024: { staatsschuld_mld: 482, staatsschuld_pct_bbp: 45.8, bbp_mld: 1052, inflatie_pct: 3.1, werkloosheid_pct: 3.7, bevolking: 18000000, bevolkingsgroei_pct: 0.8, geboorten: 162000, overlijdens: 157000, immigratie: 310000, emigratie: 195000, belastingplichtigen: 10100000, context: "Kabinet Schoof treedt aan. Bezuinigingen aangekondigd. Woningcrisis houdt aan. AI wordt mainstream.", gebeurtenissen: ["Kabinet Schoof (PVV/VVD/NSC/BBB) start", "Bezuinigingsplannen gepresenteerd", "Woningtekort loopt op naar 400.000", "ChatGPT en AI worden mainstream", "Nederland passeert 18 miljoen inwoners"] },
  2025: { staatsschuld_mld: 490, staatsschuld_pct_bbp: 45.5, bbp_mld: 1078, inflatie_pct: 2.5, werkloosheid_pct: 3.8, bevolking: 18100000, bevolkingsgroei_pct: 0.6, geboorten: 160000, overlijdens: 159000, immigratie: 280000, emigratie: 190000, belastingplichtigen: 10200000, context: "Bezuinigingen raken onderwijs en zorg. Discussie over rol van AI in de overheid. Corona-belastingschulden leiden tot faillissementen.", gebeurtenissen: ["Bezuinigingen op onderwijs en zorg", "Faillissementsgolf corona-schulden", "EU AI Act treedt in werking", "Stikstofproblematiek onopgelost", "Koopkracht stabiliseert"] },
  2026: { staatsschuld_mld: 510, staatsschuld_pct_bbp: 46.2, bbp_mld: 1104, inflatie_pct: 2.1, werkloosheid_pct: 3.6, bevolking: 18200000, bevolkingsgroei_pct: 0.5, geboorten: 158000, overlijdens: 160000, immigratie: 270000, emigratie: 185000, belastingplichtigen: 10300000, context: "Begrotingsjaar met recorduitgaven (€555,6 mld). Staatsschuld stijgt. Inflatie normaliseert. Begroting onder druk door vergrijzing en defensie-uitgaven.", gebeurtenissen: ["Recordbegroting: €555,6 miljard", "Staatsschuld stijgt naar €510 mld", "Vergrijzingskosten nemen toe", "Defensie-uitgaven richting NAVO-norm", "De Logische Partij opgericht"] },
};

const begroting = new Hono();

begroting.get("/:jaar/kerncijfers", async (c) => {
  const jaar = parseInt(c.req.param("jaar"), 10);

  if (isNaN(jaar) || jaar < 2018 || jaar > 2030) {
    return c.json({ error: "Ongeldig jaar (2018-2030)" }, 400);
  }

  const cijfers = KERNCIJFERS[jaar];
  if (!cijfers) {
    return c.json({ error: `Geen kerncijfers beschikbaar voor ${jaar}` }, 404);
  }

  try {
    const uitgaven = await fetchBegrotingsData(jaar, "U");
    const ontvangsten = await fetchBegrotingsData(jaar, "O");

    const uitgavenTotaal = uitgaven.reduce((sum, r) => sum + r.bedrag, 0);
    const ontvangstenTotaal = ontvangsten.reduce((sum, r) => sum + r.bedrag, 0);

    return c.json({
      jaar,
      bron: "CBS, CPB (indicatief)",
      uitgaven_mld: parseFloat((uitgavenTotaal / 1_000_000).toFixed(1)),
      ontvangsten_mld: parseFloat((ontvangstenTotaal / 1_000_000).toFixed(1)),
      saldo_mld: parseFloat(((ontvangstenTotaal - uitgavenTotaal) / 1_000_000).toFixed(1)),
      staatsschuld_mld: cijfers.staatsschuld_mld,
      staatsschuld_pct_bbp: cijfers.staatsschuld_pct_bbp,
      bbp_mld: cijfers.bbp_mld,
      inflatie_pct: cijfers.inflatie_pct,
      werkloosheid_pct: cijfers.werkloosheid_pct,
      bevolking: cijfers.bevolking,
      bevolkingsgroei_pct: cijfers.bevolkingsgroei_pct,
      geboorten: cijfers.geboorten,
      overlijdens: cijfers.overlijdens,
      immigratie: cijfers.immigratie,
      emigratie: cijfers.emigratie,
      belastingplichtigen: cijfers.belastingplichtigen,
      context: (cijfers as any).context || null,
      gebeurtenissen: (cijfers as any).gebeurtenissen || [],
    });
  } catch (err: any) {
    return c.json({
      jaar,
      bron: "CBS, CPB (indicatief)",
      uitgaven_mld: null,
      ontvangsten_mld: null,
      saldo_mld: null,
      staatsschuld_mld: cijfers.staatsschuld_mld,
      staatsschuld_pct_bbp: cijfers.staatsschuld_pct_bbp,
      bbp_mld: cijfers.bbp_mld,
      inflatie_pct: cijfers.inflatie_pct,
      werkloosheid_pct: cijfers.werkloosheid_pct,
      bevolking: cijfers.bevolking,
      bevolkingsgroei_pct: cijfers.bevolkingsgroei_pct,
      geboorten: cijfers.geboorten,
      overlijdens: cijfers.overlijdens,
      immigratie: cijfers.immigratie,
      emigratie: cijfers.emigratie,
      belastingplichtigen: cijfers.belastingplichtigen,
      context: (cijfers as any).context || null,
      gebeurtenissen: (cijfers as any).gebeurtenissen || [],
    });
  }
});

begroting.get("/overzicht", async (c) => {
  try {
    const huidigJaar = new Date().getFullYear();
    const data = await fetchBegrotingsData(huidigJaar);

    const perMinisterie = new Map<string, { naam: string; totaal: number; artikelen: number }>();

    for (const regel of data) {
      const key = regel.hoofdstuk_nummer;
      const existing = perMinisterie.get(key);
      if (existing) {
        existing.totaal += regel.bedrag;
        existing.artikelen++;
      } else {
        perMinisterie.set(key, {
          naam: regel.hoofdstuk_naam,
          totaal: regel.bedrag,
          artikelen: 1,
        });
      }
    }

    const ministeries = Array.from(perMinisterie.entries())
      .map(([nummer, info]) => ({
        hoofdstuk_nummer: nummer,
        naam: info.naam,
        totaal_duizend_euro: info.totaal,
        totaal_miljoen_euro: Math.round(info.totaal / 1000),
        aantal_posten: info.artikelen,
      }))
      .sort((a, b) => b.totaal_duizend_euro - a.totaal_duizend_euro);

    const totaalUitgaven = data.reduce((sum, r) => sum + r.bedrag, 0);

    return c.json({
      jaar: huidigJaar,
      fase: "OWB",
      bron: "Rijksfinancien Open Data API",
      totaal_uitgaven_duizend_euro: totaalUitgaven,
      totaal_uitgaven_miljard_euro: (totaalUitgaven / 1_000_000).toFixed(1),
      aantal_begrotingsposten: data.length,
      ministeries,
    });
  } catch (err: any) {
    return c.json({ error: "Kon begrotingsdata niet ophalen", details: err.message }, 502);
  }
});

begroting.get("/:jaar", async (c) => {
  const jaar = parseInt(c.req.param("jaar"), 10);

  if (isNaN(jaar) || jaar < 2018 || jaar > 2030) {
    return c.json({ error: "Ongeldig jaar (2018-2030)" }, 400);
  }

  try {
    const uitgaven = await fetchBegrotingsData(jaar, "U");
    const ontvangsten = await fetchBegrotingsData(jaar, "O");

    const uitgavenPerHoofdstuk = new Map<string, { naam: string; totaal: number }>();
    for (const regel of uitgaven) {
      const existing = uitgavenPerHoofdstuk.get(regel.hoofdstuk_nummer);
      if (existing) {
        existing.totaal += regel.bedrag;
      } else {
        uitgavenPerHoofdstuk.set(regel.hoofdstuk_nummer, {
          naam: regel.hoofdstuk_naam,
          totaal: regel.bedrag,
        });
      }
    }

    const ontvangstenPerHoofdstuk = new Map<string, { naam: string; totaal: number }>();
    for (const regel of ontvangsten) {
      const existing = ontvangstenPerHoofdstuk.get(regel.hoofdstuk_nummer);
      if (existing) {
        existing.totaal += regel.bedrag;
      } else {
        ontvangstenPerHoofdstuk.set(regel.hoofdstuk_nummer, {
          naam: regel.hoofdstuk_naam,
          totaal: regel.bedrag,
        });
      }
    }

    const totaalUitgaven = uitgaven.reduce((sum, r) => sum + r.bedrag, 0);
    const totaalOntvangsten = ontvangsten.reduce((sum, r) => sum + r.bedrag, 0);

    const hoofdstukken = Array.from(
      new Set([...uitgavenPerHoofdstuk.keys(), ...ontvangstenPerHoofdstuk.keys()])
    )
      .map((nummer) => ({
        hoofdstuk_nummer: nummer,
        naam:
          uitgavenPerHoofdstuk.get(nummer)?.naam ??
          ontvangstenPerHoofdstuk.get(nummer)?.naam ??
          HOOFDSTUK_NAAR_MINISTERIE[nummer] ??
          nummer,
        uitgaven_duizend_euro: uitgavenPerHoofdstuk.get(nummer)?.totaal ?? 0,
        ontvangsten_duizend_euro: ontvangstenPerHoofdstuk.get(nummer)?.totaal ?? 0,
      }))
      .sort((a, b) => b.uitgaven_duizend_euro - a.uitgaven_duizend_euro);

    return c.json({
      jaar,
      fase: "OWB",
      bron: "Rijksfinancien Open Data API",
      totaal_uitgaven_duizend_euro: totaalUitgaven,
      totaal_uitgaven_miljard_euro: (totaalUitgaven / 1_000_000).toFixed(1),
      totaal_ontvangsten_duizend_euro: totaalOntvangsten,
      totaal_ontvangsten_miljard_euro: (totaalOntvangsten / 1_000_000).toFixed(1),
      saldo_duizend_euro: totaalOntvangsten - totaalUitgaven,
      hoofdstukken,
    });
  } catch (err: any) {
    return c.json({ error: "Kon begrotingsdata niet ophalen", details: err.message }, 502);
  }
});

begroting.get("/:jaar/:hoofdstuk", async (c) => {
  const jaar = parseInt(c.req.param("jaar"), 10);
  const hoofdstuk = c.req.param("hoofdstuk").toUpperCase();

  if (isNaN(jaar) || jaar < 2018 || jaar > 2030) {
    return c.json({ error: "Ongeldig jaar (2018-2030)" }, 400);
  }

  try {
    const data = await fetchBegrotingsData(jaar, "U", hoofdstuk);

    if (data.length === 0) {
      return c.json({ error: "Geen data gevonden voor dit hoofdstuk/jaar" }, 404);
    }

    const minister = data[0].verantwoordelijk_minister;
    const hoofdstukNaam = data[0].hoofdstuk_naam;

    const perArtikel = new Map<
      string,
      { naam: string; totaal: number; onderdelen: Map<string, number> }
    >();

    for (const regel of data) {
      const key = regel.artikel_nummer;
      const existing = perArtikel.get(key);
      if (existing) {
        existing.totaal += regel.bedrag;
        const onderdeel = regel.artikelonderdeel_naam || "Overig";
        existing.onderdelen.set(
          onderdeel,
          (existing.onderdelen.get(onderdeel) ?? 0) + regel.bedrag
        );
      } else {
        const onderdelen = new Map<string, number>();
        const onderdeel = regel.artikelonderdeel_naam || "Overig";
        onderdelen.set(onderdeel, regel.bedrag);
        perArtikel.set(key, {
          naam: regel.artikel_naam,
          totaal: regel.bedrag,
          onderdelen,
        });
      }
    }

    const totaal = data.reduce((sum, r) => sum + r.bedrag, 0);

    const artikelen = Array.from(perArtikel.entries())
      .map(([nummer, info]) => ({
        artikel_nummer: nummer,
        naam: info.naam,
        totaal_duizend_euro: info.totaal,
        onderdelen: Array.from(info.onderdelen.entries())
          .map(([naam, bedrag]) => ({ naam, bedrag_duizend_euro: bedrag }))
          .sort((a, b) => b.bedrag_duizend_euro - a.bedrag_duizend_euro),
      }))
      .sort((a, b) => b.totaal_duizend_euro - a.totaal_duizend_euro);

    return c.json({
      jaar,
      hoofdstuk_nummer: hoofdstuk,
      hoofdstuk_naam: hoofdstukNaam,
      verantwoordelijk_minister: minister,
      fase: "OWB",
      bron: "Rijksfinancien Open Data API",
      totaal_uitgaven_duizend_euro: totaal,
      totaal_uitgaven_miljoen_euro: Math.round(totaal / 1000),
      aantal_posten: data.length,
      artikelen,
    });
  } catch (err: any) {
    return c.json({ error: "Kon begrotingsdata niet ophalen", details: err.message }, 502);
  }
});

begroting.get("/:jaar/:hoofdstuk/commentaar", (c) => {
  const jaar = parseInt(c.req.param("jaar"), 10);
  const hoofdstuk = c.req.param("hoofdstuk").toUpperCase();

  if (isNaN(jaar) || jaar < 2018 || jaar > 2030) {
    return c.json({ error: "Ongeldig jaar (2018-2030)" }, 400);
  }

  const row = db
    .query("SELECT * FROM begroting_commentaar WHERE jaar = ? AND hoofdstuk_nummer = ?")
    .get(jaar, hoofdstuk) as CommentaarRij | null;

  if (!row) {
    return c.json({ error: "Geen commentaar gevonden voor dit hoofdstuk/jaar" }, 404);
  }

  const slugs: string[] = row.standpunt_slugs ? JSON.parse(row.standpunt_slugs) : [];

  const standpunten = slugs.length > 0
    ? db
        .query(
          `SELECT slug, titel, samenvatting FROM standpunten WHERE slug IN (${slugs.map(() => "?").join(", ")})`
        )
        .all(...slugs) as { slug: string; titel: string; samenvatting: string }[]
    : [];

  return c.json({
    jaar: row.jaar,
    hoofdstuk_nummer: row.hoofdstuk_nummer,
    hoofdstuk_naam: HOOFDSTUK_NAAR_MINISTERIE[row.hoofdstuk_nummer] ?? row.hoofdstuk_nummer,
    uitleg: row.uitleg,
    dlp_mening: row.dlp_mening,
    standpunten,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
});

const adminBegroting = new Hono();

adminBegroting.use("/*", requireApiKey);

adminBegroting.put("/commentaar", async (c) => {
  const body = await c.req.json();
  const { jaar, hoofdstuk_nummer, uitleg, dlp_mening, standpunt_slugs } = body;

  if (!jaar || !hoofdstuk_nummer || !uitleg || !dlp_mening) {
    return c.json(
      { error: "Verplichte velden: jaar, hoofdstuk_nummer, uitleg, dlp_mening" },
      400
    );
  }

  if (standpunt_slugs && Array.isArray(standpunt_slugs)) {
    for (const slug of standpunt_slugs) {
      const exists = db.query("SELECT id FROM standpunten WHERE slug = ?").get(slug);
      if (!exists) {
        return c.json({ error: `Standpunt met slug '${slug}' niet gevonden` }, 400);
      }
    }
  }

  const slugsJson = standpunt_slugs ? JSON.stringify(standpunt_slugs) : null;

  db.query(
    `INSERT INTO begroting_commentaar (jaar, hoofdstuk_nummer, uitleg, dlp_mening, standpunt_slugs)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(jaar, hoofdstuk_nummer)
     DO UPDATE SET uitleg = excluded.uitleg, dlp_mening = excluded.dlp_mening, standpunt_slugs = excluded.standpunt_slugs, updated_at = datetime('now')`
  ).run(jaar, hoofdstuk_nummer, uitleg, dlp_mening, slugsJson);

  const updated = db
    .query("SELECT * FROM begroting_commentaar WHERE jaar = ? AND hoofdstuk_nummer = ?")
    .get(jaar, hoofdstuk_nummer) as CommentaarRij;

  return c.json({
    jaar: updated.jaar,
    hoofdstuk_nummer: updated.hoofdstuk_nummer,
    uitleg: updated.uitleg,
    dlp_mening: updated.dlp_mening,
    standpunt_slugs: updated.standpunt_slugs ? JSON.parse(updated.standpunt_slugs) : [],
    created_at: updated.created_at,
    updated_at: updated.updated_at,
  });
});

export { begroting, adminBegroting };
