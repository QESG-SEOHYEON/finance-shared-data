# finance-shared-data

세 자산관리 앱(`seohyeon`, `finance-GH`, `finance-MS`)이 공유하는 정적 데이터 허브.

## 제공 파일

- `news-feed.json` — 한국 주요 경제 매체(한국경제·매일경제·연합뉴스) 최신 기사 20건. 매일 KST 07:00 업데이트.

## 퍼블릭 URL

```
https://qesg-seohyeon.github.io/finance-shared-data/news-feed.json
```

CORS 허용됨 (`*`). 클라이언트 fetch 가능.

## 로컬 실행

```bash
npm install
npm run fetch-news
```
