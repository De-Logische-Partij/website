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
