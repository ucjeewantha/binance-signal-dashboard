// Indicator math on plain arrays of numbers (one entry per candle).
// Mirrors the Python implementation in binance-signal-analyzer/indicators.py.

function ema(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function rsi(closes, period = 14) {
  const n = closes.length;
  const gains = new Array(n).fill(0);
  const losses = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const delta = closes[i] - closes[i - 1];
    gains[i] = Math.max(delta, 0);
    losses[i] = Math.max(-delta, 0);
  }
  const avgGain = wilderSmooth(gains, period);
  const avgLoss = wilderSmooth(losses, period);
  return avgGain.map((g, i) => {
    const l = avgLoss[i] || 1e-12;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  });
}

// Wilder's smoothing == ewm(alpha=1/period) in pandas
function wilderSmooth(values, period) {
  const alpha = 1 / period;
  const out = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i] * alpha + out[i - 1] * (1 - alpha);
  }
  return out;
}

function macd(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  return { macdLine, signalLine };
}

function atr(candles, period = 14) {
  const n = candles.length;
  const tr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const { high, low, close } = candles[i];
    if (i === 0) {
      tr[i] = high - low;
    } else {
      const prevClose = candles[i - 1].close;
      tr[i] = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
    }
  }
  return wilderSmooth(tr, period);
}

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// candles: array of {open, high, low, close, volume}
function computeAll(candles) {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const { macdLine, signalLine } = macd(closes);
  return {
    emaFast: ema(closes, 20),
    emaSlow: ema(closes, 50),
    emaTrend: ema(closes, 200),
    rsi: rsi(closes),
    macdLine,
    macdSignal: signalLine,
    atr: atr(candles, 14),
    volAvg: sma(volumes, 20),
  };
}
