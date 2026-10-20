// Confluence-based long/short signal generation + position sizing.
// Mirrors binance-signal-analyzer/signal_engine.py.
// A rules-based filter, not a prediction -- no win rate is guaranteed.

const EMA_TREND_PERIOD = 200;
const ATR_STOP_MULTIPLE = 1.5;
const ATR_TARGET_MULTIPLE = 3.0; // ~1:2 risk:reward

function trendBias(trendIndicators) {
  const i = trendIndicators.emaFast.length - 1;
  const fast = trendIndicators.emaFast[i];
  const trend = trendIndicators.emaTrend[i];
  if (fast > trend) return "UP";
  if (fast < trend) return "DOWN";
  return "FLAT";
}

function evaluatePair(symbol, entryCandles, trendCandles, minScore) {
  if (entryCandles.length < EMA_TREND_PERIOD || trendCandles.length < EMA_TREND_PERIOD) {
    return null; // not enough history yet
  }

  const entryInd = computeAll(entryCandles);
  const trendInd = computeAll(trendCandles);
  const i = entryCandles.length - 1;
  const last = entryCandles[i];
  const bias = trendBias(trendInd);

  const close = last.close;
  const emaFast = entryInd.emaFast[i];
  const emaSlow = entryInd.emaSlow[i];
  const rsiVal = entryInd.rsi[i];
  const macdLine = entryInd.macdLine[i];
  const macdSignal = entryInd.macdSignal[i];
  const volume = last.volume;
  const volAvg = entryInd.volAvg[i];

  const longChecks = [
    close > emaSlow,
    emaFast > emaSlow,
    rsiVal >= 45 && rsiVal <= 65,
    macdLine > macdSignal,
    bias === "UP",
    volAvg != null && volume > volAvg,
  ];
  const shortChecks = [
    close < emaSlow,
    emaFast < emaSlow,
    rsiVal >= 35 && rsiVal <= 55,
    macdLine < macdSignal,
    bias === "DOWN",
    volAvg != null && volume > volAvg,
  ];

  const longScore = longChecks.filter(Boolean).length;
  const shortScore = shortChecks.filter(Boolean).length;
  const direction = longScore >= shortScore ? "LONG" : "SHORT";
  const score = Math.max(longScore, shortScore);

  if (score < minScore) return null;

  const atrVal = entryInd.atr[i];
  if (!atrVal || atrVal <= 0) return null;

  const entry = close;
  let stopLoss, takeProfit;
  if (direction === "LONG") {
    stopLoss = entry - ATR_STOP_MULTIPLE * atrVal;
    takeProfit = entry + ATR_TARGET_MULTIPLE * atrVal;
  } else {
    stopLoss = entry + ATR_STOP_MULTIPLE * atrVal;
    takeProfit = entry - ATR_TARGET_MULTIPLE * atrVal;
  }

  return { symbol, direction, score, entry, stopLoss, takeProfit, atr: atrVal };
}

// Returns { leverage, marginUsdt, positionSizeUsdt, stopPct, liqWarning }
function sizePosition(signal, walletBalance, maxLeverage, riskPct) {
  const stopPct = Math.abs(signal.entry - signal.stopLoss) / signal.entry;

  let leverage = maxLeverage;
  while (leverage > 1) {
    const approxLiqPct = 1 / leverage;
    if (stopPct <= 0.5 * approxLiqPct) break;
    leverage -= 1;
  }

  let liqWarning = null;
  if (leverage === 1 && stopPct > 0.5) {
    liqWarning =
      "Stop-loss distance is wide relative to price; even 1x leverage gives little cushion. Consider skipping this pair.";
  }

  const marginUsdt = walletBalance != null ? walletBalance * (riskPct / 100) : null;
  const positionSizeUsdt = marginUsdt != null ? marginUsdt * leverage : null;

  return { leverage, marginUsdt, positionSizeUsdt, stopPct, liqWarning };
}
