// 주요 지수 시세를 Yahoo Finance 공개 chart API 로 수집.
// GH Actions 서버에서 실행되므로 CORS/키 노출 이슈 없음.

import { writeFile } from "node:fs/promises";

const INDICES = [
  { symbol: "^KS11", name: "코스피", short: "KOSPI", currency: "KRW" },
  { symbol: "^IXIC", name: "나스닥", short: "NASDAQ", currency: "USD" },
  { symbol: "^GSPC", name: "S&P 500", short: "S&P500", currency: "USD" },
];

const RANGE = "1mo"; // 최근 1개월
const INTERVAL = "1d";
const OUT_FILE = "indices.json";

async function fetchIndex({ symbol, name, short, currency }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${RANGE}&interval=${INTERVAL}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; FinanceSharedData/1.0)"
    }
  });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`${symbol}: empty result`);

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const meta = result.meta || {};

  const candles = timestamps.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    close: closes[i] != null ? Number(closes[i].toFixed(2)) : null
  })).filter((c) => c.close != null);

  const first = candles[0]?.close;
  const last = candles.at(-1)?.close;
  const prev = candles.at(-2)?.close;

  return {
    symbol,
    name,
    short,
    currency,
    current: last ?? null,
    previous: prev ?? null,
    dayChange: last != null && prev != null ? Number((last - prev).toFixed(2)) : null,
    dayChangePct: last != null && prev != null ? Number((((last - prev) / prev) * 100).toFixed(2)) : null,
    monthChangePct: last != null && first != null ? Number((((last - first) / first) * 100).toFixed(2)) : null,
    lastUpdated: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    candles
  };
}

async function main() {
  const results = [];
  for (const idx of INDICES) {
    try {
      const data = await fetchIndex(idx);
      results.push(data);
      console.log(`ok ${idx.short}: ${data.current} (${data.dayChangePct > 0 ? "+" : ""}${data.dayChangePct}%)`);
    } catch (e) {
      console.warn(`[error] ${idx.short}: ${e.message}`);
    }
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    indices: results
  };
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`wrote ${OUT_FILE} (${results.length} indices)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
