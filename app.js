// Wires the UI controls to the Binance client + signal engine, and runs
// a polling loop so the page updates "live" while it stays open.

const TOP_N_PAIRS = 15;
const ENTRY_TIMEFRAME = "1h";
const TREND_TIMEFRAME = "4h";
const KLINE_LOOKBACK = 300;
const STAGGER_MS = 150; // be polite to the API between symbol requests

const els = {
  liveDot: document.getElementById("live-dot"),
  status: document.getElementById("status-line"),
  walletBalance: document.getElementById("wallet-balance"),
  riskPct: document.getElementById("risk-pct"),
  maxLeverage: document.getElementById("max-leverage"),
  minScore: document.getElementById("min-score"),
  refreshInterval: document.getElementById("refresh-interval"),
  scanNow: document.getElementById("scan-now"),
  summary: document.getElementById("summary"),
  results: document.getElementById("results"),
};

const STORAGE_KEY = "binance-signal-dashboard:settings";

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.walletBalance != null) els.walletBalance.value = s.walletBalance;
    if (s.riskPct != null) els.riskPct.value = s.riskPct;
    if (s.maxLeverage != null) els.maxLeverage.value = s.maxLeverage;
    if (s.minScore != null) els.minScore.value = s.minScore;
    if (s.refreshInterval != null) els.refreshInterval.value = s.refreshInterval;
  } catch (_) {
    // ignore corrupt/blocked storage
  }
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        walletBalance: els.walletBalance.value,
        riskPct: els.riskPct.value,
        maxLeverage: els.maxLeverage.value,
        minScore: els.minScore.value,
        refreshInterval: els.refreshInterval.value,
      })
    );
  } catch (_) {
    // localStorage may be unavailable (private mode, blocked) -- fine to skip
  }
}

function fmt(n, digits = 6) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, { maximumSignificantDigits: digits });
}

function renderCard(signal, sizing) {
  const dirClass = signal.direction === "LONG" ? "long" : "short";
  const dirLabel = signal.direction === "LONG" ? "OPEN LONG" : "OPEN SHORT";

  const marginRow =
    sizing.marginUsdt != null
      ? `<dt>Margin to use</dt><dd>${sizing.marginUsdt.toFixed(2)} USDT</dd>
         <dt>Position size</dt><dd>${sizing.positionSizeUsdt.toFixed(2)} USDT</dd>`
      : `<dt>Margin to use</dt><dd>enter wallet balance above</dd>`;

  return `
    <div class="card ${dirClass}">
      <div class="card-head">
        <span class="symbol">${signal.symbol}</span>
        <span class="direction ${dirClass}">${dirLabel}</span>
      </div>
      <dl>
        <dt>Confluence</dt><dd>${signal.score}/6</dd>
        <dt>Margin mode</dt><dd>ISOLATED</dd>
        <dt>Leverage</dt><dd>${sizing.leverage}x</dd>
        ${marginRow}
        <dt>Entry (mark)</dt><dd>${fmt(signal.entry)}</dd>
        <dt>Stop loss</dt><dd>${fmt(signal.stopLoss)}</dd>
        <dt>Take profit</dt><dd>${fmt(signal.takeProfit)}</dd>
      </dl>
      ${sizing.liqWarning ? `<div class="warning">⚠ ${sizing.liqWarning}</div>` : ""}
    </div>
  `;
}

function readControls() {
  const walletBalanceRaw = els.walletBalance.value.trim();
  return {
    walletBalance: walletBalanceRaw === "" ? null : parseFloat(walletBalanceRaw),
    riskPct: parseFloat(els.riskPct.value) || 1,
    maxLeverage: parseInt(els.maxLeverage.value, 10) || 10,
    minScore: parseInt(els.minScore.value, 10),
    refreshInterval: parseInt(els.refreshInterval.value, 10) * 1000,
  };
}

let scanToken = 0; // guards against overlapping scans

async function runScan() {
  const myToken = ++scanToken;
  const settings = readControls();
  saveSettings();

  els.scanNow.disabled = true;
  els.liveDot.classList.remove("live");
  els.status.textContent = "Fetching watchlist…";
  els.summary.textContent = "";

  let watchlist;
  try {
    watchlist = await pickWatchlist(TOP_N_PAIRS);
  } catch (err) {
    els.status.textContent = "Error fetching watchlist";
    els.results.innerHTML = `<div class="error-state">Failed to reach Binance: ${err.message}</div>`;
    els.scanNow.disabled = false;
    return;
  }

  if (myToken !== scanToken) return; // a newer scan started

  els.results.innerHTML = "";
  let scanned = 0;
  let qualified = 0;

  for (const symbol of watchlist) {
    if (myToken !== scanToken) return;
    els.status.textContent = `Scanning ${symbol}… (${scanned}/${watchlist.length})`;

    try {
      const [entryCandles, trendCandles] = await Promise.all([
        getKlines(symbol, ENTRY_TIMEFRAME, KLINE_LOOKBACK),
        getKlines(symbol, TREND_TIMEFRAME, KLINE_LOOKBACK),
      ]);

      const signal = evaluatePair(symbol, entryCandles, trendCandles, settings.minScore);
      scanned++;

      if (signal) {
        qualified++;
        const sizing = sizePosition(
          signal,
          settings.walletBalance,
          settings.maxLeverage,
          settings.riskPct
        );
        els.results.insertAdjacentHTML("beforeend", renderCard(signal, sizing));
      }
    } catch (err) {
      console.warn(`skip ${symbol}:`, err.message);
    }

    await new Promise((r) => setTimeout(r, STAGGER_MS));
  }

  if (myToken !== scanToken) return;

  if (qualified === 0) {
    els.results.innerHTML = `<div class="empty-state">No pairs met the confluence threshold right now (min ${settings.minScore}/6). No signal is also a valid, often correct, outcome.</div>`;
  }

  const now = new Date().toLocaleTimeString();
  els.summary.textContent = `${scanned} pairs scanned, ${qualified} qualified at confluence >= ${settings.minScore}/6. Last updated ${now}.`;
  els.status.textContent = `Watching ${watchlist.length} pairs`;
  els.liveDot.classList.add("live");
  els.scanNow.disabled = false;
}

let pollTimer = null;
function scheduleNextScan() {
  if (pollTimer) clearTimeout(pollTimer);
  const { refreshInterval } = readControls();
  pollTimer = setTimeout(async () => {
    await runScan();
    scheduleNextScan();
  }, refreshInterval);
}

els.scanNow.addEventListener("click", async () => {
  await runScan();
  scheduleNextScan();
});

[els.riskPct, els.maxLeverage, els.minScore, els.walletBalance].forEach((el) =>
  el.addEventListener("change", saveSettings)
);
els.refreshInterval.addEventListener("change", scheduleNextScan);

loadSettings();
runScan().then(scheduleNextScan);
