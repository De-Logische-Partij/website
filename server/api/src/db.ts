import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = join(import.meta.dir, "..", "data", "financien.db");

const db = new Database(DB_PATH, { create: true });

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('inkomst', 'uitgave')),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    receipt_hash TEXT,
    receipt_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_hash TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS standpunten (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    titel TEXT NOT NULL,
    categorie TEXT NOT NULL,
    samenvatting TEXT NOT NULL,
    inhoud TEXT NOT NULL,
    kernwaarden TEXT,
    status TEXT NOT NULL DEFAULT 'concept' CHECK(status IN ('concept', 'programma', 'gewijzigd', 'gerectificeerd', 'ingetrokken')),
    rectificatie_tekst TEXT,
    intrekking_reden TEXT,
    versie INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS standpunten_historie (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    standpunt_id INTEGER NOT NULL,
    titel TEXT NOT NULL,
    categorie TEXT NOT NULL,
    samenvatting TEXT NOT NULL,
    inhoud TEXT NOT NULL,
    versie INTEGER NOT NULL,
    gewijzigd_door TEXT,
    wijziging_reden TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (standpunt_id) REFERENCES standpunten(id)
  )
`);

const standpuntenCount = db.query("SELECT COUNT(*) as n FROM standpunten").get() as { n: number };

if (standpuntenCount.n === 0) {
  const insertStandpunt = db.prepare(
    "INSERT INTO standpunten (slug, titel, categorie, samenvatting, inhoud, kernwaarden, status) VALUES (?, ?, ?, ?, ?, ?, 'programma')"
  );

  const seedStandpunten = db.transaction(() => {
    insertStandpunt.run(
      "vlaktaks",
      "Vlaktaks: een tarief, geen toeslagen",
      "Economie",
      "Een laag belastingtarief. Toeslagensysteem afschaffen. Iedereen begrijpt wat die betaalt.",
      "Het huidige belastingstelsel is een ondoorzichtig labyrint van tarieven, aftrekposten, heffingskortingen en toeslagen. Dit systeem maakt burgers afhankelijk, straft mensen die meer gaan verdienen en kost miljarden aan uitvoeringskosten.\n\nDLP pleit voor een vlaktaks: een laag, vlak belastingtarief voor iedereen. Het toeslagenstelsel wordt volledig afgeschaft. In plaats daarvan krijgt iedere burger een hoge belastingvrije voet, zodat lage inkomens effectief minder belasting betalen zonder dat ze afhankelijk worden van ingewikkelde toeslagregelingen.\n\nHet resultaat: een systeem dat eerlijk, begrijpelijk en uitvoerbaar is. Geen formulieren, geen terugvorderingen, geen toeslagenaffaires. Iedereen begrijpt wat die betaalt en waarom.",
      JSON.stringify(["Eenvoud", "Vrijheid"])
    );

    insertStandpunt.run(
      "ondernemers-bevrijden",
      "Ondernemers bevrijden",
      "Economie",
      "Minder vergunningen, minder rapportages. Geen verplichte zzp-verzekering. De overheid faciliteert.",
      "Ondernemers besteden tot 20% van hun tijd aan compliance: vergunningen aanvragen, rapportages invullen, regels naleven die niemand begrijpt. Dit remt innovatie en maakt ondernemen onnodig zwaar, vooral voor kleine bedrijven en zzp'ers.\n\nDLP wil ondernemers bevrijden van onnodige bureaucratie. Minder vergunningen, minder rapportageverplichtingen en geen verplichte zzp-verzekering. De overheid moet een faciliterende rol aannemen in plaats van een controlerende. Wie risico neemt en waarde creëert, verdient steun, geen papierwinkel.\n\nEen ondernemer moet kunnen ondernemen. Niet vergaderen met de overheid.",
      JSON.stringify(["Vrijheid", "Autonomie"])
    );

    insertStandpunt.run(
      "leerrecht",
      "Leerrecht, geen leerplicht",
      "Onderwijs",
      "Vrije onderwijsvorm: thuisonderwijs, versnellen, eigen route. Het systeem past zich aan het kind aan.",
      "Het huidige onderwijssysteem stamt uit de industriele revolutie: iedereen dezelfde lesstof, hetzelfde tempo, dezelfde toetsen. Kinderen die anders denken, sneller leren of juist meer tijd nodig hebben, worden afgeremd of buitengesloten.\n\nDLP wil leerplicht vervangen door leerrecht. Ouders en kinderen krijgen de vrijheid om de onderwijsvorm te kiezen die bij hen past: regulier onderwijs, thuisonderwijs, versnellen, een eigen leerroute of een combinatie daarvan. Het systeem past zich aan het kind aan, niet andersom.\n\nDe overheid stelt kwaliteitskaders, maar schrijft niet voor hoe een kind moet leren. Talent verdient ruimte, niet een mal.",
      JSON.stringify(["Autonomie", "Vrijheid"])
    );

    insertStandpunt.run(
      "digitale-soevereiniteit",
      "Digitale soevereiniteit",
      "Digitaal",
      "Geen massasurveillance. Eigen data = eigen eigendom. Open source overheid. Privacy als grondrecht.",
      "In een wereld waarin data de nieuwe olie is, heeft de burger nauwelijks controle over zijn eigen gegevens. Overheden en techbedrijven verzamelen, delen en verhandelen persoonlijke data zonder betekenisvolle toestemming. Massasurveillance wordt genormaliseerd.\n\nDLP beschouwt privacy als een grondrecht. Eigen data is eigen eigendom. Burgers moeten volledig inzicht en zeggenschap hebben over welke data de overheid en bedrijven over hen verzamelen. Massasurveillance wordt verboden. Alle overheidssoftware wordt open source, zodat burgers kunnen controleren wat er met hun gegevens gebeurt.\n\nDigitale soevereiniteit betekent dat de burger baas is over zijn eigen digitale leven, niet de staat, niet Big Tech.",
      JSON.stringify(["Vrijheid", "Autonomie"])
    );

    insertStandpunt.run(
      "zorg",
      "Zorg zonder papierwinkel",
      "Zorg",
      "Vertrouwen in de zorgprofessional. Minder indicaties, meer zorg. GGZ-wachtlijsten halveren.",
      "Zorgprofessionals besteden een groot deel van hun tijd aan administratie: indicaties, verantwoordingen, registraties en declaraties. Dit gaat ten koste van de daadwerkelijke zorg. Ondertussen lopen de wachtlijsten in de GGZ op tot onacceptabele niveaus.\n\nDLP wil het vertrouwen in de zorgprofessional herstellen. Minder indicatieverplichtingen, minder administratieve lasten en meer ruimte om te doen waar het om draait: zorgen voor mensen. De GGZ-wachtlijsten moeten gehalveerd worden door bureaucratische drempels weg te nemen en innovatieve zorgvormen mogelijk te maken.\n\nEen arts moet genezen. Niet administreren.",
      JSON.stringify(["Eenvoud", "Logica"])
    );

    insertStandpunt.run(
      "bouwen",
      "Bouwen zonder wachten",
      "Woningbouw",
      "Vergunningen binnen 30 dagen. Ruimte voor tiny houses en zelfbouw. Minder bezwaarprocedures.",
      "Nederland heeft een woningtekort, maar bouwen duurt eindeloos. Vergunningtrajecten slepen zich maanden of jaren voort. Bezwaarprocedures vertragen projecten die al goedgekeurd zijn. Innovatieve woonvormen zoals tiny houses en zelfbouw stuiten op rigide bestemmingsplannen.\n\nDLP wil dat bouwvergunningen binnen 30 dagen worden afgehandeld. Bezwaarprocedures worden vereenvoudigd zodat ze niet langer als vertragingstactiek kunnen worden ingezet. Er komt ruimte voor alternatieve woonvormen: tiny houses, zelfbouw, modulair bouwen en andere creatieve oplossingen voor het woningtekort.\n\nWie wil bouwen, moet kunnen bouwen, zonder jarenlang te wachten op toestemming.",
      JSON.stringify(["Eenvoud", "Vrijheid"])
    );

    insertStandpunt.run(
      "directe-democratie",
      "Directe democratie",
      "Democratie",
      "Bindende referenda. AI-ondersteunde burgerparticipatie. Elke burger kan meedenken en meebeslissen.",
      "De huidige democratie is een vierjaarlijkse checkout: je stemt, en daarna heb je vier jaar lang geen directe invloed meer. Besluitvorming vindt plaats achter gesloten deuren en burgers voelen zich niet gehoord.\n\nDLP wil bindende referenda invoeren waarmee burgers direct invloed uitoefenen op belangrijke besluiten. AI-ondersteunde burgerparticipatie maakt het mogelijk om complexe wetsvoorstellen begrijpelijk samen te vatten en burgers geinformeerd mee te laten beslissen. Elke burger kan meedenken en meebeslissen, niet eens per vier jaar, maar doorlopend.\n\nDemocratie is geen eenmalige gebeurtenis. Het is een doorlopend gesprek.",
      JSON.stringify(["Logica", "Autonomie"])
    );

    insertStandpunt.run(
      "glazen-begroting",
      "De Glazen Begroting",
      "Transparantie",
      "De rijksbegroting als real-time, interactief dashboard waar iedere burger kan zien waar elke euro naartoe gaat.",
      "De rijksbegroting is nu een onleesbaar PDF-moeras van duizenden pagina's. Niemand leest het, niemand begrijpt het, en dat is precies hoe het systeem het wil. DLP wil daar verandering in brengen.\n\nDLP pleit voor een real-time, interactief begrotingsdashboard waar iedere burger kan zien waar elke euro naartoe gaat. Machine-leesbaar, doorzoekbaar, met AI-uitleg in begrijpelijke taal. Elke overheidstransactie traceerbaar. Geen verborgen potjes, geen boekhoudkundige trucjes.\n\nTransparantie levert Nederland jaarlijks miljarden op. Het is geen kostenpost, het is een investering.",
      JSON.stringify(["Logica", "Eenvoud", "Vrijheid"])
    );

    insertStandpunt.run(
      "drugsbeleid",
      "Evidence-based drugsbeleid",
      "Drugsbeleid",
      "Legalisering en regulering. Harm reduction boven criminalisering. Volwassenen behandelen als volwassenen.",
      "Het huidige drugsbeleid is gebaseerd op moraal en angst, niet op wetenschap. Het criminaliseren van drugsgebruik leidt niet tot minder gebruik, maar wel tot meer criminaliteit, onveilige producten en overbelaste rechtbanken. Het gedoogbeleid creeert een grijs gebied waar niemand bij gebaat is.\n\nDLP pleit voor een evidence-based drugsbeleid: legalisering en regulering van drugs, met strenge kwaliteitseisen en leeftijdsgrenzen. Harm reduction staat centraal, niet straf, maar hulp. Volwassenen worden behandeld als volwassenen die zelf verantwoorde keuzes kunnen maken.\n\nDe war on drugs is mislukt. Het wordt tijd voor een logische aanpak.",
      JSON.stringify(["Logica", "Vrijheid"])
    );

    insertStandpunt.run(
      "energievrijheid",
      "Energievrijheid",
      "Energie",
      "Technologieneutraal beleid. Vrij opwekken, opslaan en verhandelen. Van zon tot kern, de markt kiest.",
      "Het huidige energiebeleid pikt winnaars en verliezers: sommige technologieen worden gesubsidieerd, andere worden verboden of ontmoedigd. Dit leidt tot inefficientie, hogere energieprijzen en een rem op innovatie.\n\nDLP staat voor technologieneutraal energiebeleid. Of het nu gaat om zonne-energie, windenergie, kernenergie of een technologie die nog moet worden uitgevonden, de overheid kiest niet, de markt kiest. Burgers en bedrijven moeten vrij zijn om energie op te wekken, op te slaan en te verhandelen zonder onnodige beperkingen.\n\nEnergievrijheid betekent dat iedereen toegang heeft tot betaalbare, betrouwbare energie, ongeacht welke technologie dat levert.",
      JSON.stringify(["Vrijheid", "Autonomie"])
    );
  });

  seedStandpunten();
}

const FACTUUR_5884_HASH = "16b5df41a611cd90450ab1c57382b809936f75ff50f92bf4cb21462c4a5e3fae";
const FACTUUR_5884_URL = "/receipts/Factuur-5884.pdf";

const count = db.query("SELECT COUNT(*) as n FROM transactions").get() as { n: number };

if (count.n === 0) {
  const insert = db.prepare(
    "INSERT INTO transactions (date, type, category, description, amount_cents, receipt_hash, receipt_url) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  const seed = db.transaction(() => {
    insert.run("2026-04-01", "inkomst", "Lening", "Renteloze lening Joris Slagter Holding B.V. voor opstartkosten", 1019, null, null);
    insert.run("2026-04-01", "uitgave", "Domein", "delogischepartij.nl (1 jaar)", -45, FACTUUR_5884_HASH, FACTUUR_5884_URL);
    insert.run("2026-04-01", "uitgave", "Domein", "delogischepartij.eu (1 jaar)", -199, FACTUUR_5884_HASH, FACTUUR_5884_URL);
    insert.run("2026-04-01", "uitgave", "Domein", "stemdlp.nl (1 jaar)", -399, FACTUUR_5884_HASH, FACTUUR_5884_URL);
    insert.run("2026-04-01", "uitgave", "Domein", "stemdlp.eu (1 jaar)", -199, FACTUUR_5884_HASH, FACTUUR_5884_URL);
    insert.run("2026-04-01", "uitgave", "BTW", "21% BTW domeinregistraties (Factuur #5884)", -177, FACTUUR_5884_HASH, FACTUUR_5884_URL);
  });

  seed();
}

export default db;
