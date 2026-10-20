// Thin wrapper around Binance USDT-M Futures public REST endpoints.
// Everything here is unauthenticated market data -- no API key involved,
// called directly from the browser (Binance sends permissive CORS
// headers on these endpoints).

const BINANCE_BASE = "https://fapi.binance.com";

async function fetchJson(path, params = {}) {
  const url = new URL(BINANCE_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`${path} -> HTTP ${resp.status}`);
  }
  return resp.json();
}

async function getCryptoSymbols() {
  // Binance Futures also lists tokenized stocks/commodities (XAUUSDT gold,
  // SOXLUSDT, SKHYNIXUSDT, ...) alongside real crypto perpetuals. Keep only
  // underlyingType === "COIN".
  const info = await fetchJson("/fapi/v1/exchangeInfo");
  const set = new Set();
  for (const s of info.symbols) {
    if (
      s.underlyingType === "COIN" &&
      s.contractType === "PERPETUAL" &&
      s.status === "TRADING"
    ) {
      set.add(s.symbol);
    }
  }
  return set;
}

async function get24hrTickers() {
  return fetchJson("/fapi/v1/ticker/24hr");
}

async function getKlines(symbol, interval, limit = 300) {
  const raw = await fetchJson("/fapi/v1/klines", { symbol, interval, limit });
  return raw.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

async function pickWatchlist(topN, quoteAsset = "USDT") {
  const [cryptoSymbols, tickers] = await Promise.all([
    getCryptoSymbols(),
    get24hrTickers(),
  ]);
  const usdtPairs = tickers.filter(
    (t) =>
      t.symbol.endsWith(quoteAsset) &&
      !t.symbol.includes("_") &&
      cryptoSymbols.has(t.symbol)
  );
  usdtPairs.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
  return usdtPairs.slice(0, topN).map((t) => t.symbol);
}
