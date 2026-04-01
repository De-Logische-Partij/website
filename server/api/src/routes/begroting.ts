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

const begroting = new Hono();

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

export default begroting;
