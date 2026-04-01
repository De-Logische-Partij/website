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
    cijfers TEXT,
    maatregelen TEXT,
    juridisch TEXT,
    beperkingen TEXT,
    bronnen TEXT,
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
    "INSERT INTO standpunten (slug, titel, categorie, samenvatting, inhoud, kernwaarden, status, cijfers, maatregelen, juridisch, beperkingen, bronnen) VALUES (?, ?, ?, ?, ?, ?, 'programma', ?, ?, ?, ?, ?)"
  );

  const seedStandpunten = db.transaction(() => {
    insertStandpunt.run(
      "vlaktaks",
      "Vlaktaks: een tarief, geen toeslagen",
      "Economie",
      "Een laag belastingtarief. Toeslagensysteem afschaffen. Iedereen begrijpt wat die betaalt.",
      "Het huidige belastingstelsel is een ondoorzichtig labyrint van tarieven, aftrekposten, heffingskortingen en toeslagen. Dit systeem maakt burgers afhankelijk, straft mensen die meer gaan verdienen en kost miljarden aan uitvoeringskosten.\n\nDLP pleit voor een vlaktaks: een laag, vlak belastingtarief voor iedereen. Het toeslagenstelsel wordt volledig afgeschaft. In plaats daarvan krijgt iedere burger een hoge belastingvrije voet, zodat lage inkomens effectief minder belasting betalen zonder dat ze afhankelijk worden van ingewikkelde toeslagregelingen.\n\nHet resultaat: een systeem dat eerlijk, begrijpelijk en uitvoerbaar is. Geen formulieren, geen terugvorderingen, geen toeslagenaffaires. Iedereen begrijpt wat die betaalt en waarom.",
      JSON.stringify(["Eenvoud", "Vrijheid"]),
      JSON.stringify(["Uitvoeringskosten toeslagenstelsel: circa 2 miljard euro per jaar", "Meer dan 10 miljoen toeslagontvangers in Nederland", "Gemiddelde marginale druk voor middeninkomens: boven 50%", "Toeslagenaffaire trof meer dan 26.000 gezinnen"]),
      JSON.stringify(["Afschaffing toeslagenstelsel", "Invoering hoge belastingvrije voet", "Een vlak belastingtarief voor alle inkomens", "Vereenvoudiging van de Belastingdienst"]),
      "Vlaktaks is juridisch mogelijk maar vereist ingrijpende wetswijzigingen in de Wet IB 2001 en afschaffing van de Algemene wet inkomensafhankelijke regelingen (Awir). EU-recht staat een vlaktaks toe; meerdere EU-landen hanteren dit systeem.",
      "Overgangsperiode van meerdere jaren nodig. Koopkrachteffecten moeten zorgvuldig worden doorgerekend door het CPB. De belastingvrije voet moet hoog genoeg zijn om lage inkomens te beschermen.",
      JSON.stringify([{"titel": "CPB: Kansrijk Belastingbeleid", "url": "https://www.cpb.nl/", "datum": "2024"}, {"titel": "Belastingdienst: Toeslagen in cijfers", "url": "https://www.belastingdienst.nl/", "datum": "2024"}, {"titel": "Parlementaire ondervragingscommissie Kinderopvangtoeslag", "url": "https://www.tweedekamer.nl/", "datum": "2020"}])
    );

    insertStandpunt.run(
      "ondernemers-bevrijden",
      "Ondernemers bevrijden",
      "Economie",
      "Minder vergunningen, minder rapportages. Geen verplichte zzp-verzekering. De overheid faciliteert.",
      "Ondernemers besteden tot 20% van hun tijd aan compliance: vergunningen aanvragen, rapportages invullen, regels naleven die niemand begrijpt. Dit remt innovatie en maakt ondernemen onnodig zwaar, vooral voor kleine bedrijven en zzp'ers.\n\nDLP wil ondernemers bevrijden van onnodige bureaucratie. Minder vergunningen, minder rapportageverplichtingen en geen verplichte zzp-verzekering. De overheid moet een faciliterende rol aannemen in plaats van een controlerende. Wie risico neemt en waarde creëert, verdient steun, geen papierwinkel.\n\nEen ondernemer moet kunnen ondernemen. Niet vergaderen met de overheid.",
      JSON.stringify(["Vrijheid", "Autonomie"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "leerrecht",
      "Leerrecht, geen leerplicht",
      "Onderwijs",
      "Vrije onderwijsvorm: thuisonderwijs, versnellen, eigen route. Het systeem past zich aan het kind aan.",
      "Het huidige onderwijssysteem stamt uit de industriele revolutie: iedereen dezelfde lesstof, hetzelfde tempo, dezelfde toetsen. Kinderen die anders denken, sneller leren of juist meer tijd nodig hebben, worden afgeremd of buitengesloten.\n\nDLP wil leerplicht vervangen door leerrecht. Ouders en kinderen krijgen de vrijheid om de onderwijsvorm te kiezen die bij hen past: regulier onderwijs, thuisonderwijs, versnellen, een eigen leerroute of een combinatie daarvan. Het systeem past zich aan het kind aan, niet andersom.\n\nDe overheid stelt kwaliteitskaders, maar schrijft niet voor hoe een kind moet leren. Talent verdient ruimte, niet een mal.",
      JSON.stringify(["Autonomie", "Vrijheid"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "digitale-soevereiniteit",
      "Digitale soevereiniteit",
      "Digitaal",
      "Geen massasurveillance. Eigen data = eigen eigendom. Open source overheid. Privacy als grondrecht.",
      "In een wereld waarin data de nieuwe olie is, heeft de burger nauwelijks controle over zijn eigen gegevens. Overheden en techbedrijven verzamelen, delen en verhandelen persoonlijke data zonder betekenisvolle toestemming. Massasurveillance wordt genormaliseerd.\n\nDLP beschouwt privacy als een grondrecht. Eigen data is eigen eigendom. Burgers moeten volledig inzicht en zeggenschap hebben over welke data de overheid en bedrijven over hen verzamelen. Massasurveillance wordt verboden. Alle overheidssoftware wordt open source, zodat burgers kunnen controleren wat er met hun gegevens gebeurt.\n\nDigitale soevereiniteit betekent dat de burger baas is over zijn eigen digitale leven, niet de staat, niet Big Tech.",
      JSON.stringify(["Vrijheid", "Autonomie"]),
      JSON.stringify(["Nederlandse overheid geeft jaarlijks meer dan 3 miljard euro uit aan ICT", "Minder dan 5% van overheidssoftware is open source", "78% van Nederlanders maakt zich zorgen over privacy online", "EU GDPR-boetes in Nederland: tientallen miljoenen euro's per jaar"]),
      JSON.stringify(["Wettelijk verbod op massasurveillance", "Eigendomsrecht op persoonlijke data vastleggen in de Grondwet", "Open source-verplichting voor alle nieuwe overheidssoftware", "Oprichting van een onafhankelijke Digitale Waakhond"]),
      "Privacy is al beschermd onder artikel 10 van de Grondwet en de AVG/GDPR. Uitbreiding naar een expliciet digitaal grondrecht vereist een grondwetswijziging (twee lezingen). Open source-verplichting is mogelijk via aanbestedingsregels.",
      "Migratie van bestaande overheidssystemen naar open source is een proces van jaren. Niet alle software kan direct vervangen worden. Internationale samenwerking (Five Eyes, EU) legt beperkingen op aan het volledig verbieden van surveillance.",
      JSON.stringify([{"titel": "Autoriteit Persoonsgegevens: Jaarverslag", "url": "https://www.autoriteitpersoonsgegevens.nl/", "datum": "2024"}, {"titel": "Rijks ICT-dashboard", "url": "https://www.rijksictdashboard.nl/", "datum": "2025"}, {"titel": "EU General Data Protection Regulation", "url": "https://gdpr.eu/", "datum": "2018"}])
    );

    insertStandpunt.run(
      "zorg",
      "Zorg zonder papierwinkel",
      "Zorg",
      "Vertrouwen in de zorgprofessional. Minder indicaties, meer zorg. GGZ-wachtlijsten halveren.",
      "Zorgprofessionals besteden een groot deel van hun tijd aan administratie: indicaties, verantwoordingen, registraties en declaraties. Dit gaat ten koste van de daadwerkelijke zorg. Ondertussen lopen de wachtlijsten in de GGZ op tot onacceptabele niveaus.\n\nDLP wil het vertrouwen in de zorgprofessional herstellen. Minder indicatieverplichtingen, minder administratieve lasten en meer ruimte om te doen waar het om draait: zorgen voor mensen. De GGZ-wachtlijsten moeten gehalveerd worden door bureaucratische drempels weg te nemen en innovatieve zorgvormen mogelijk te maken.\n\nEen arts moet genezen. Niet administreren.",
      JSON.stringify(["Eenvoud", "Logica"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "bouwen",
      "Bouwen zonder wachten",
      "Woningbouw",
      "Vergunningen binnen 30 dagen. Ruimte voor tiny houses en zelfbouw. Minder bezwaarprocedures.",
      "Nederland heeft een woningtekort, maar bouwen duurt eindeloos. Vergunningtrajecten slepen zich maanden of jaren voort. Bezwaarprocedures vertragen projecten die al goedgekeurd zijn. Innovatieve woonvormen zoals tiny houses en zelfbouw stuiten op rigide bestemmingsplannen.\n\nDLP wil dat bouwvergunningen binnen 30 dagen worden afgehandeld. Bezwaarprocedures worden vereenvoudigd zodat ze niet langer als vertragingstactiek kunnen worden ingezet. Er komt ruimte voor alternatieve woonvormen: tiny houses, zelfbouw, modulair bouwen en andere creatieve oplossingen voor het woningtekort.\n\nWie wil bouwen, moet kunnen bouwen, zonder jarenlang te wachten op toestemming.",
      JSON.stringify(["Eenvoud", "Vrijheid"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "directe-democratie",
      "Directe democratie",
      "Democratie",
      "Bindende referenda. AI-ondersteunde burgerparticipatie. Elke burger kan meedenken en meebeslissen.",
      "De huidige democratie is een vierjaarlijkse checkout: je stemt, en daarna heb je vier jaar lang geen directe invloed meer. Besluitvorming vindt plaats achter gesloten deuren en burgers voelen zich niet gehoord.\n\nDLP wil bindende referenda invoeren waarmee burgers direct invloed uitoefenen op belangrijke besluiten. AI-ondersteunde burgerparticipatie maakt het mogelijk om complexe wetsvoorstellen begrijpelijk samen te vatten en burgers geinformeerd mee te laten beslissen. Elke burger kan meedenken en meebeslissen, niet eens per vier jaar, maar doorlopend.\n\nDemocratie is geen eenmalige gebeurtenis. Het is een doorlopend gesprek.",
      JSON.stringify(["Logica", "Autonomie"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "glazen-begroting",
      "De Glazen Begroting",
      "Transparantie",
      "De rijksbegroting als real-time, interactief dashboard waar iedere burger kan zien waar elke euro naartoe gaat.",
      "De rijksbegroting is nu een onleesbaar PDF-moeras van duizenden pagina's. Niemand leest het, niemand begrijpt het, en dat is precies hoe het systeem het wil. DLP wil daar verandering in brengen.\n\nDLP pleit voor een real-time, interactief begrotingsdashboard waar iedere burger kan zien waar elke euro naartoe gaat. Machine-leesbaar, doorzoekbaar, met AI-uitleg in begrijpelijke taal. Elke overheidstransactie traceerbaar. Geen verborgen potjes, geen boekhoudkundige trucjes.\n\nTransparantie levert Nederland jaarlijks miljarden op. Het is geen kostenpost, het is een investering.",
      JSON.stringify(["Logica", "Eenvoud", "Vrijheid"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "drugsbeleid",
      "Evidence-based drugsbeleid",
      "Drugsbeleid",
      "Legalisering en regulering. Harm reduction boven criminalisering. Volwassenen behandelen als volwassenen.",
      "Het huidige drugsbeleid is gebaseerd op moraal en angst, niet op wetenschap. Het criminaliseren van drugsgebruik leidt niet tot minder gebruik, maar wel tot meer criminaliteit, onveilige producten en overbelaste rechtbanken. Het gedoogbeleid creeert een grijs gebied waar niemand bij gebaat is.\n\nDLP pleit voor een evidence-based drugsbeleid: legalisering en regulering van drugs, met strenge kwaliteitseisen en leeftijdsgrenzen. Harm reduction staat centraal, niet straf, maar hulp. Volwassenen worden behandeld als volwassenen die zelf verantwoorde keuzes kunnen maken.\n\nDe war on drugs is mislukt. Het wordt tijd voor een logische aanpak.",
      JSON.stringify(["Logica", "Vrijheid"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "energievrijheid",
      "Energievrijheid",
      "Energie",
      "Technologieneutraal beleid. Vrij opwekken, opslaan en verhandelen. Van zon tot kern, de markt kiest.",
      "Het huidige energiebeleid pikt winnaars en verliezers: sommige technologieen worden gesubsidieerd, andere worden verboden of ontmoedigd. Dit leidt tot inefficientie, hogere energieprijzen en een rem op innovatie.\n\nDLP staat voor technologieneutraal energiebeleid. Of het nu gaat om zonne-energie, windenergie, kernenergie of een technologie die nog moet worden uitgevonden, de overheid kiest niet, de markt kiest. Burgers en bedrijven moeten vrij zijn om energie op te wekken, op te slaan en te verhandelen zonder onnodige beperkingen.\n\nEnergievrijheid betekent dat iedereen toegang heeft tot betaalbare, betrouwbare energie, ongeacht welke technologie dat levert.",
      JSON.stringify(["Vrijheid", "Autonomie"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "minister-ai-technologie",
      "Minister van AI en Technologie",
      "Digitaal",
      "De digitale transformatie verdient een eigen plek aan de kabinettafel.",
      "De digitale transformatie verdient een eigen plek aan de kabinettafel. Een minister die AI, robotica, digitale infrastructuur en cyberveiligheid als kernverantwoordelijkheid heeft. Technologie is de motor van onze economie en samenleving. Het verdient een minister die daar volledig voor staat, met een eigen begroting en mandaat. Geen bijzaak bij Economische Zaken, maar topprioriteit.",
      JSON.stringify(["Logica", "Eenvoud"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "nederland-tech-hub",
      "Nederland als tech-hub van Europa",
      "Economie",
      "Een investeringsklimaat waarin startups floreren en Nederlandse tech-bedrijven wereldwijd meespelen.",
      "Nederland heeft de kennis, de infrastructuur en het talent om de tech-hub van Europa te worden. Dat vereist een beter investeringsklimaat: meer zekerheid voor durfkapitalisten, betere programma's voor startups in de groeifase, en fiscale prikkels die innovatie belonen. We willen Nederlandse AI-modellen, Nederlandse softwareplatformen die kunnen concurreren met Google en Meta, en datacenters die onze digitale soevereiniteit waarborgen. De overheid faciliteert dit met regelgeving die innovatie versnelt, niet vertraagt. Met gerichte R&D-investeringen en door barrières voor scale-ups weg te nemen.",
      JSON.stringify(["Autonomie", "Logica", "Vrijheid"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "verbinding-en-respect",
      "Verbinding in een verdeelde tijd",
      "Samenleving",
      "In een tijd van verdeeldheid zoeken wij naar wat ons verbindt, met respect voor elke achtergrond en overtuiging.",
      "Verschil van mening is gezond. Maar verdeeldheid schaadt. DLP gelooft in het zoeken naar common ground tussen verschillende perspectieven. Wij geven ruimte aan andersdenkenden, aan ieders geloof en afkomst, en aan de dialoog die nodig is om samen vooruit te komen. Respect voor elkaar is de basis van een sterke samenleving. Dat betekent luisteren, begrijpen, en samen zoeken naar oplossingen die voor iedereen werken.",
      JSON.stringify(["Autonomie", "Vrijheid"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "criminaliteit-bij-de-bron",
      "Criminaliteit bij de bron aanpakken",
      "Samenleving",
      "Investeren in de omstandigheden die criminaliteit veroorzaken, en mensen na een fout een eerlijke weg terug bieden.",
      "Straffen alleen lost niets op. De oorzaken van criminaliteit liggen vaak in armoede, uitzichtloosheid en gebrek aan kansen. DLP wil investeren in preventie: betere omstandigheden, toegang tot onderwijs en werk, en sterke sociale vangnetten. Mensen die in de fout zijn gegaan verdienen een eerlijke weg terug de samenleving in. Met begeleiding, omscholing en werk voorkomen we terugval. Decriminalisering waar dat logisch is, en een rechtssysteem dat gericht is op herstel in plaats van alleen vergelding. Zo bouwen we aan een veiligere samenleving voor iedereen.",
      JSON.stringify(["Autonomie", "Logica", "Vrijheid"]),
      null, null, null, null, null
    );

    insertStandpunt.run(
      "schone-lei-corona-ondernemers",
      "Schone lei voor corona-ondernemers",
      "Economie",
      "Circa 400.000 ondernemers kampen nog met corona-belastingschulden van in totaal 19,6 miljard euro. DLP wil kwijtschelding op basis van draagkracht, langere terugbetaaltermijnen en een snellere doorstart na faillissement.",
      "Tijdens de coronacrisis verleende de overheid massaal belastinguitstel aan ondernemers. Dat uitstel was bewust beleid om de economie draaiende te houden. Nu worden circa 400.000 ondernemers geconfronteerd met een totale schuld van 19,6 miljard euro. Naar schatting kan 20 tot 30 procent niet aan het huidige aflossingsschema voldoen. DLP stelt vier maatregelen voor: (1) Kwijtschelding op basis van draagkracht via een wettelijke regeling, met objectieve criteria en onafhankelijke toetsing. (2) Terugbetaling naar draagkracht over minimaal tien jaar, als percentage van de daadwerkelijke winst. (3) Snellere doorstart na faillissement via de WHOA, met verkorte doorstarttermijn en BKR-registratieduur. (4) Fiscale tegemoetkoming voor ondernemers die al hebben afgelost, in de vorm van investeringsaftrek. Deze regeling geldt uitsluitend voor belastingschulden uit het bijzonder uitstel tijdens corona (maart 2020 tot oktober 2022). Een ondernemer die weer op de been komt, creëert banen en betaalt belasting. De kosten van kwijtschelding worden op termijn terugverdiend.",
      JSON.stringify(["Logica", "Vrijheid", "Autonomie"]),
      JSON.stringify(["19,6 miljard euro totale corona-belastingschuld", "Circa 400.000 getroffen ondernemers", "20-30% kan niet aan aflossingsschema voldoen", "Huidige regeling loopt tot 2029"]),
      JSON.stringify(["Kwijtschelding op basis van draagkracht via onafhankelijke commissie", "Terugbetaling over minimaal 10 jaar als percentage van winst", "Snellere doorstart via WHOA, doorstarttermijn naar 12 maanden", "Fiscale tegemoetkoming (investeringsaftrek) voor ondernemers die al hebben afgelost"]),
      "Past binnen EU de-minimisverordening voor schulden tot 300.000 euro. Grotere bedragen vereisen EU-notificatie. Wetswijziging nodig.",
      "Geldt uitsluitend voor belastingschulden uit bijzonder uitstel (maart 2020 tot oktober 2022). Eenmalig, schept geen precedent.",
      JSON.stringify([{"titel": "Belastingdienst: Bijzonder uitstel van betaling", "url": "https://www.belastingdienst.nl/", "datum": "2024"}, {"titel": "CBS: Bedrijvendynamiek", "url": "https://www.cbs.nl/", "datum": "2025"}, {"titel": "WHOA (Wet homologatie underhands akkoord)", "url": "https://wetten.overheid.nl/", "datum": "2021"}])
    );
  });

  seedStandpunten();
}

db.exec(`
  CREATE TABLE IF NOT EXISTS vragen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    titel TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('kamervraag', 'burgervraag', 'open')),
    context TEXT NOT NULL,
    vraag TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'beantwoord', 'gesloten')),
    antwoord TEXT,
    antwoord_datum TEXT,
    stemmen_eens INTEGER DEFAULT 0,
    stemmen_oneens INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS vragen_stemmen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_slug_hash TEXT NOT NULL UNIQUE,
    vraag_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (vraag_id) REFERENCES vragen(id)
  )
`);

const vragenCount = db.query("SELECT COUNT(*) as n FROM vragen").get() as { n: number };

if (vragenCount.n === 0) {
  const insertVraag = db.prepare(
    "INSERT INTO vragen (slug, titel, type, context, vraag) VALUES (?, ?, ?, ?, ?)"
  );

  const seedVragen = db.transaction(() => {
    insertVraag.run(
      "minister-van-technologie",
      "Waarom heeft Nederland nog geen Minister van Technologie?",
      "kamervraag",
      "Nederland loopt achter in de digitale transformatie. Andere landen hebben al een dedicated minister of staatssecretaris voor digitale zaken. Ondertussen valt technologiebeleid in Nederland onder Economische Zaken, waar het concurreert met tientallen andere dossiers om aandacht en budget.",
      "Waarom heeft Nederland nog geen Minister van Technologie, terwijl AI, cyberveiligheid en digitale infrastructuur steeds bepalender worden voor onze economie en veiligheid?"
    );

    insertVraag.run(
      "investeren-in-nederlandse-ai",
      "Moet de overheid investeren in Nederlandse AI-modellen?",
      "burgervraag",
      "Nederland is voor AI-technologie vrijwel volledig afhankelijk van Amerikaanse techbedrijven zoals Google, Microsoft en OpenAI. Dit betekent dat onze data, onze taal en onze waarden worden verwerkt door systemen waar we geen controle over hebben. Een eigen Nederlands of Europees AI-model zou digitale soevereiniteit versterken, maar vereist forse publieke investeringen.",
      "Moet de Nederlandse overheid investeren in de ontwikkeling van eigen AI-modellen, of laten we dit over aan de markt?"
    );

    insertVraag.run(
      "belastingaangifte-begrijpelijk",
      "Hoe maken we de belastingaangifte begrijpelijk voor iedereen?",
      "open",
      "Elk jaar worstelen miljoenen Nederlanders met hun belastingaangifte. Het formulier is complex, de terminologie is ondoorgrondelijk, en fouten leiden tot boetes of misgelopen toeslagen. Dit raakt vooral mensen met een laag inkomen of beperkte digitale vaardigheden het hardst.",
      "Hoe kunnen we de belastingaangifte zo vereenvoudigen dat iedere Nederlander het zonder hulp kan invullen?"
    );
  });

  seedVragen();
}

db.exec(`
  CREATE TABLE IF NOT EXISTS discussies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    context_type TEXT NOT NULL,
    context_slug TEXT NOT NULL,
    parent_id INTEGER,
    naam TEXT NOT NULL,
    email_hash TEXT NOT NULL,
    inhoud TEXT NOT NULL,
    stemmen_op INTEGER DEFAULT 0,
    stemmen_neer INTEGER DEFAULT 0,
    zichtbaar INTEGER DEFAULT 1,
    verberg_reden TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES discussies(id)
  )
`);

db.exec("CREATE INDEX IF NOT EXISTS idx_discussies_context ON discussies(context_type, context_slug)");

db.exec(`
  CREATE TABLE IF NOT EXISTS discussie_stemmen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discussie_id INTEGER NOT NULL,
    ip_hash TEXT NOT NULL,
    stem TEXT NOT NULL CHECK(stem IN ('op', 'neer')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(discussie_id, ip_hash),
    FOREIGN KEY (discussie_id) REFERENCES discussies(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS inzendingen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('vraag', 'standpunt')),
    naam TEXT NOT NULL,
    email_hash TEXT NOT NULL,
    titel TEXT NOT NULL,
    inhoud TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'nieuw' CHECK(status IN ('nieuw', 'in_behandeling', 'goedgekeurd', 'afgewezen')),
    reactie_admin TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS begroting_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jaar INTEGER NOT NULL,
    fase TEXT NOT NULL,
    vuo TEXT NOT NULL,
    hoofdstuk_nummer TEXT,
    data TEXT NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now')),
    UNIQUE(jaar, fase, vuo, hoofdstuk_nummer)
  )
`);

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
