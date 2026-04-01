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
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const count = db.query("SELECT COUNT(*) as n FROM transactions").get() as { n: number };

if (count.n === 0) {
  const insert = db.prepare(
    "INSERT INTO transactions (date, type, category, description, amount_cents) VALUES (?, ?, ?, ?, ?)"
  );

  const seed = db.transaction(() => {
    insert.run("2026-04-01", "uitgave", "Hosting", "VPS server 12 maanden", -7200);
    insert.run("2026-04-01", "uitgave", "Domein", "delogischepartij.nl registratie", -1195);
    insert.run("2026-04-01", "uitgave", "Domein", "delogischepartij.eu registratie", -895);
  });

  seed();
}

export default db;
