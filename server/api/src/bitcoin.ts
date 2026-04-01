const BTC_ADDRESS = "bc1q905urh523ly6snup6mwvjmkllhupuxkmmd8a6t";
const BLOCKSTREAM_API = "https://blockstream.info/api";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface BlockstreamVout {
  scriptpubkey_address?: string;
  value: number;
}

interface BlockstreamTx {
  txid: string;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
  vout: BlockstreamVout[];
}

interface BlockstreamAddressInfo {
  chain_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
  mempool_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
}

export interface BitcoinTransaction {
  txid: string;
  datum: string;
  bedrag_satoshis: number;
  bedrag_btc: string;
  bevestigingen: number;
  blockchain_url: string;
}

export interface BitcoinData {
  adres: string;
  balans_satoshis: number;
  balans_btc: string;
  transacties: BitcoinTransaction[];
}

let cache: { data: BitcoinData; timestamp: number } | null = null;

async function fetchCurrentBlockHeight(): Promise<number> {
  const res = await fetch(`${BLOCKSTREAM_API}/blocks/tip/height`);
  if (!res.ok) return 0;
  return parseInt(await res.text(), 10);
}

function formatDate(unixTimestamp: number): string {
  const d = new Date(unixTimestamp * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function satoshisToBtc(satoshis: number): string {
  return (satoshis / 1e8).toFixed(8);
}

export async function fetchBitcoinData(): Promise<BitcoinData> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  const [addressRes, txsRes, tipHeight] = await Promise.all([
    fetch(`${BLOCKSTREAM_API}/address/${BTC_ADDRESS}`),
    fetch(`${BLOCKSTREAM_API}/address/${BTC_ADDRESS}/txs`),
    fetchCurrentBlockHeight(),
  ]);

  if (!addressRes.ok || !txsRes.ok) {
    if (cache) return cache.data;
    return { adres: BTC_ADDRESS, balans_satoshis: 0, balans_btc: "0.00000000", transacties: [] };
  }

  const addressInfo = (await addressRes.json()) as BlockstreamAddressInfo;
  const txs = (await txsRes.json()) as BlockstreamTx[];

  const balans_satoshis =
    addressInfo.chain_stats.funded_txo_sum -
    addressInfo.chain_stats.spent_txo_sum +
    addressInfo.mempool_stats.funded_txo_sum -
    addressInfo.mempool_stats.spent_txo_sum;

  const transacties: BitcoinTransaction[] = txs.map((tx) => {
    const received = tx.vout
      .filter((out) => out.scriptpubkey_address === BTC_ADDRESS)
      .reduce((sum, out) => sum + out.value, 0);

    const bevestigingen =
      tx.status.confirmed && tx.status.block_height ? tipHeight - tx.status.block_height + 1 : 0;

    return {
      txid: tx.txid,
      datum: tx.status.block_time ? formatDate(tx.status.block_time) : "pending",
      bedrag_satoshis: received,
      bedrag_btc: satoshisToBtc(received),
      bevestigingen,
      blockchain_url: `https://blockstream.info/tx/${tx.txid}`,
    };
  });

  const data: BitcoinData = {
    adres: BTC_ADDRESS,
    balans_satoshis,
    balans_btc: satoshisToBtc(balans_satoshis),
    transacties,
  };

  cache = { data, timestamp: Date.now() };
  return data;
}
