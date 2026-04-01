import { Hono } from "hono";
import db from "../db";

interface Transaction {
  id: number;
  date: string;
  type: string;
  category: string;
  description: string;
  amount_cents: number;
  created_at: string;
}

interface Summary {
  total_inkomsten: number;
  total_uitgaven: number;
  saldo: number;
}

const financien = new Hono();

financien.get("/", (c) => {
  const rows = db.query("SELECT * FROM transactions ORDER BY date DESC, id DESC").all() as Transaction[];

  const formatted = rows.map((row) => ({
    ...row,
    amount_eur: (row.amount_cents / 100).toFixed(2),
  }));

  return c.json({ transacties: formatted });
});

financien.get("/samenvatting", (c) => {
  const row = db
    .query(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'inkomst' THEN amount_cents ELSE 0 END), 0) as total_inkomsten,
        COALESCE(SUM(CASE WHEN type = 'uitgave' THEN amount_cents ELSE 0 END), 0) as total_uitgaven,
        COALESCE(SUM(amount_cents), 0) as saldo
      FROM transactions`
    )
    .get() as Summary;

  return c.json({
    totaal_inkomsten_eur: (row.total_inkomsten / 100).toFixed(2),
    totaal_uitgaven_eur: (Math.abs(row.total_uitgaven) / 100).toFixed(2),
    saldo_eur: (row.saldo / 100).toFixed(2),
  });
});

financien.get("/export.csv", (c) => {
  const rows = db.query("SELECT * FROM transactions ORDER BY date DESC, id DESC").all() as Transaction[];

  const header = "datum,type,categorie,omschrijving,bedrag_eur";
  const lines = rows.map(
    (row) =>
      `${row.date},${row.type},${row.category},"${row.description}",${(row.amount_cents / 100).toFixed(2)}`
  );

  const csv = [header, ...lines].join("\n");

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="financien-dlp.csv"');
  return c.body(csv);
});

export default financien;
