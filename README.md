# Binance Futures Signal Dashboard

A static web dashboard that scans the top 15 USDT-M futures pairs by
volume (real crypto coins only -- Binance's tokenized stocks/commodities
like XAUUSDT, SOXLUSDT are filtered out), runs a confluence-based
technical filter in your browser, and shows any qualifying setups:
direction, leverage, margin mode, entry, stop-loss, take-profit, sized
against a wallet balance you type in.

It polls Binance's public market-data API directly from your browser
every 30-300s (your choice) while the tab is open. **No API key is ever
requested, stored, or sent anywhere** -- wallet balance is typed in
manually each session, so there's no secret for a public page to leak.
It never places an order.

**No win rate is guaranteed.** This is a rules-based filter (EMA trend,
RSI, MACD, ATR, volume confluence), not a prediction. Treat every signal
as an input to your own judgement.

## Run locally

No build step, no dependencies. Any static server works:

```bash
python3 -m http.server 8765
# open http://localhost:8765
```

(Opening `index.html` directly via `file://` also works in most
browsers, since Binance's public endpoints send permissive CORS headers.)

## Deploy to GitHub Pages

1. Create a new **empty** repository on GitHub (no README/license), e.g.
   `binance-signal-dashboard`.
2. Push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin git@github.com:<your-username>/binance-signal-dashboard.git
   git push -u origin main
   ```
3. On GitHub: **Settings -> Pages -> Build and deployment -> Source ->
   "GitHub Actions"**. The included workflow
   (`.github/workflows/deploy.yml`) will build and publish on every push
   to `main`.
4. After the first run finishes (check the **Actions** tab), your
   dashboard is live at:
   `https://<your-username>.github.io/binance-signal-dashboard/`

Anyone with that URL can open the page -- it's a public static site.
That's fine here since it holds no credentials and shows no personal
account data; your typed-in wallet balance only ever lives in your own
browser's local storage, never sent to GitHub or anywhere but Binance's
public API.

## Tuning

All controls are in the page itself (risk %, max leverage, confluence
strictness, refresh interval) and persist in your browser via
`localStorage`. The underlying confluence logic lives in `signals.js` if
you want to change the strategy itself.

## Files

- `index.html` / `styles.css` -- layout and dark dashboard theme
- `binance.js` -- Binance Futures public REST wrapper (fetch-based)
- `indicators.js` -- EMA/RSI/MACD/ATR math
- `signals.js` -- confluence scoring + position sizing
- `app.js` -- UI wiring + polling loop
- `.github/workflows/deploy.yml` -- GitHub Pages auto-deploy on push
