// 하루 3회 한국 경제 매체 RSS 크롤 → news-feed.json 에 누적.
// 최근 7일 이내 기사만 유지, 그 외는 자동 삭제.

import { readFile, writeFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";

const SOURCES = [
  { source: "한국경제", category: "경제", url: "https://www.hankyung.com/feed/economy" },
  { source: "한국경제", category: "증권", url: "https://www.hankyung.com/feed/finance" },
  { source: "매일경제", category: "경제", url: "https://www.mk.co.kr/rss/30100041/" },
  { source: "매일경제", category: "증권", url: "https://www.mk.co.kr/rss/50200011/" },
  { source: "연합뉴스", category: "경제", url: "https://www.yna.co.kr/rss/economy.xml" },
];

const PER_SOURCE_LIMIT = 6;      // 소스별 최신 N개
const HISTORY_DAYS = 7;           // 보관 기간
const OUT_FILE = "news-feed.json";

async function fetchFeed({ source, category, url }) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FinanceSharedData/1.0; +https://github.com/QESG-SEOHYEON/finance-shared-data)"
      }
    });
    if (!res.ok) {
      console.warn(`[skip] ${source} ${category}: HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
    const parsed = parser.parse(xml);
    const channel = parsed?.rss?.channel;
    const items = Array.isArray(channel?.item) ? channel.item : channel?.item ? [channel.item] : [];
    return items.slice(0, PER_SOURCE_LIMIT).map((it) => normalize(it, source, category));
  } catch (e) {
    console.warn(`[error] ${source} ${category}: ${e.message}`);
    return [];
  }
}

function normalize(item, source, category) {
  const title = String(item.title || "").trim();
  const link = String(item.link || "").trim();
  const pubDate = item.pubDate || item["dc:date"] || null;
  const summary = stripHtml(String(item.description || "")).slice(0, 140);
  return {
    source,
    category,
    title,
    summary,
    link,
    publishedAt: pubDate ? new Date(pubDate).toISOString() : null
  };
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function readExisting() {
  try {
    const raw = await readFile(OUT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function main() {
  const existing = await readExisting();
  const fresh = (await Promise.all(SOURCES.map(fetchFeed))).flat();

  // 병합 + 링크 기준 dedupe (기존 우선, 신규는 없을 때만 추가)
  const byLink = new Map();
  for (const it of existing) {
    if (it.link) byLink.set(it.link, it);
  }
  for (const it of fresh) {
    if (it.link && !byLink.has(it.link)) byLink.set(it.link, it);
  }

  // 7일 이내만 유지
  const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const filtered = [...byLink.values()].filter((it) => {
    if (!it.publishedAt) return false;
    return new Date(it.publishedAt).getTime() >= cutoff;
  });

  // 최신순 정렬
  filtered.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));

  const payload = {
    updatedAt: new Date().toISOString(),
    historyDays: HISTORY_DAYS,
    count: filtered.length,
    items: filtered
  };
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`wrote ${OUT_FILE} (${filtered.length} items, kept last ${HISTORY_DAYS}d)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
