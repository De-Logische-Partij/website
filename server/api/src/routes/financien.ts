import { Hono } from "hono";
import db from "../db";
import { fetchBitcoinData, type BitcoinTransaction } from "../bitcoin";

interface Transaction {
  id: number;
  date: string;
  type: string;
  category: string;
  description: string;
  amount_cents: number;
  receipt_hash: string | null;
  receipt_url: string | null;
  created_at: string;
}

interface Summary {
  total_inkomsten: number;
  total_uitgaven: number;
  saldo: number;
}

function btcTxToTransactionRow(tx: BitcoinTransaction) {
  return {
    id: null,
    date: tx.datum,
    type: "inkomst",
    category: "Bitcoin donatie",
    description: `BTC donatie (${tx.bedrag_btc} BTC)`,
    amount_cents: null,
    amount_btc: tx.bedrag_btc,
    amount_satoshis: tx.bedrag_satoshis,
    receipt_hash: tx.txid,
    receipt_url: tx.blockchain_url,
    created_at: tx.datum,
  };
}

const financien = new Hono();

financien.get("/", async (c) => {
  const rows = db.query("SELECT * FROM transactions ORDER BY date DESC, id DESC").all() as Transaction[];

  const formatted = rows.map((row) => ({
    ...row,
    amount_eur: (row.amount_cents / 100).toFixed(2),
  }));

  const btcData = await fetchBitcoinData();
  const btcRows = btcData.transacties.map(btcTxToTransactionRow);

  return c.json({ transacties: [...btcRows, ...formatted] });
});

financien.get("/samenvatting", async (c) => {
  const row = db
    .query(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'inkomst' THEN amount_cents ELSE 0 END), 0) as total_inkomsten,
        COALESCE(SUM(CASE WHEN type = 'uitgave' THEN amount_cents ELSE 0 END), 0) as total_uitgaven,
        COALESCE(SUM(amount_cents), 0) as saldo
      FROM transactions`
    )
    .get() as Summary;

  const btcData = await fetchBitcoinData();

  return c.json({
    totaal_inkomsten_eur: (row.total_inkomsten / 100).toFixed(2),
    totaal_uitgaven_eur: (Math.abs(row.total_uitgaven) / 100).toFixed(2),
    saldo_eur: (row.saldo / 100).toFixed(2),
    bitcoin_balans_btc: btcData.balans_btc,
  });
});

financien.get("/bitcoin", async (c) => {
  const data = await fetchBitcoinData();
  return c.json(data);
});

financien.get("/export.csv", async (c) => {
  const rows = db.query("SELECT * FROM transactions ORDER BY date DESC, id DESC").all() as Transaction[];

  const btcData = await fetchBitcoinData();

  const header = "datum,type,categorie,omschrijving,bedrag_eur,bedrag_btc,bewijsstuk_hash,bewijsstuk_url";

  const eurLines = rows.map(
    (row) =>
      `${row.date},${row.type},${row.category},"${row.description}",${(row.amount_cents / 100).toFixed(2)},,${row.receipt_hash ?? ""},${row.receipt_url ?? ""}`
  );

  const btcLines = btcData.transacties.map(
    (tx) =>
      `${tx.datum},inkomst,Bitcoin donatie,"BTC donatie (${tx.bedrag_btc} BTC)",,${tx.bedrag_btc},${tx.txid},${tx.blockchain_url}`
  );

  const csv = [header, ...btcLines, ...eurLines].join("\n");

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="financien-dlp.csv"');
  return c.body(csv);
});

financien.post("/verify/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);

  const row = db.query("SELECT receipt_hash FROM transactions WHERE id = ?").get(id) as { receipt_hash: string | null } | null;

  if (!row) {
    return c.json({ error: "Transactie niet gevonden" }, 404);
  }

  if (!row.receipt_hash) {
    return c.json({ error: "Geen bewijsstuk gekoppeld aan deze transactie" }, 404);
  }

  const formData = await c.req.parseBody();
  const file = formData["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "Upload een bestand als 'file' in multipart/form-data" }, 400);
  }

  const buffer = await file.arrayBuffer();
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(new Uint8Array(buffer));
  const uploadedHash = hasher.digest("hex");

  const match = uploadedHash === row.receipt_hash;

  return c.json({
    transactie_id: id,
    uploaded_hash: uploadedHash,
    stored_hash: row.receipt_hash,
    match,
    status: match ? "Bewijsstuk komt overeen" : "Bewijsstuk komt NIET overeen",
  });
});

export default financien;
