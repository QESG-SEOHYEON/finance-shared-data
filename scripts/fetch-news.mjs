// 하루 1회 한국 경제 매체 RSS를 크롤 → news-feed.json 에 통합.
// GitHub Actions 환경 (Node 20+) 에서 실행.

import { writeFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";

const SOURCES = [
  { source: "한국경제", category: "경제", url: "https://www.hankyung.com/feed/economy" },
  { source: "한국경제", category: "증권", url: "https://www.hankyung.com/feed/finance" },
  { source: "매일경제", category: "경제", url: "https://www.mk.co.kr/rss/30100041/" },
  { source: "매일경제", category: "증권", url: "https://www.mk.co.kr/rss/50200011/" },
  { source: "연합뉴스", category: "경제", url: "https://www.yna.co.kr/rss/economy.xml" },
];

const PER_SOURCE_LIMIT = 4;    // 소스별 최신 N개
const TOTAL_LIMIT = 20;        // 최종 합치고 N개만 남김

async function fetchFeed({ source, category, url }) {
  try {
    const res = await fetch(url, {
      headers: {
        // 일부 매체는 UA 필수
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
  const rawTitle = String(item.title || "").trim();
  const rawLink = String(item.link || "").trim();
  const pubDate = item.pubDate || item["dc:date"] || null;
  const description = stripHtml(String(item.description || "")).slice(0, 140);
  return {
    source,
    category,
    title: rawTitle,
    summary: description,
    link: rawLink,
    publishedAt: pubDate ? new Date(pubDate).toISOString() : null
  };
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function main() {
  const all = (await Promise.all(SOURCES.map(fetchFeed))).flat();
  // 중복 제거 (링크 기준)
  const seen = new Set();
  const deduped = [];
  for (const it of all) {
    if (!it.link || seen.has(it.link)) continue;
    seen.add(it.link);
    deduped.push(it);
  }
  // 최신순 정렬
  deduped.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  const top = deduped.slice(0, TOTAL_LIMIT);

  const payload = {
    updatedAt: new Date().toISOString(),
    count: top.length,
    items: top
  };
  await writeFile("news-feed.json", JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`wrote news-feed.json (${top.length} items)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
