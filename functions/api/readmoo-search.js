// Cloudflare Pages Function: /api/readmoo-search?q=KEYWORD
// 搜尋讀墨書庫，回傳 JSON

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const CACHE_TTL = 1800;

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(context.request.url);
  const rawQuery = url.searchParams.get('q')?.trim();

  if (!rawQuery || rawQuery.length < 1 || rawQuery.length > 100) {
    return resp({ error: '請輸入 1~100 字的搜尋關鍵字' }, 400);
  }

  // 健康檢查
  if (rawQuery === '__ping__') {
    return resp({ ok: true, ts: Date.now() });
  }

  // 診斷模式：直接看 DDG 回的內容
  // 用法：?q=__diag__&t=書名
  if (rawQuery === '__diag__') {
    const t = url.searchParams.get('t') || '出社會第N年';
    return diagDdg(t);
  }

  // 讀墨搜尋不接受全形/半形標點（哈利波特：神秘的魔法石 → 0 筆）
  // 把標點換成空格，再壓掉多餘空白
  const query = stripPunctuation(rawQuery);
  if (!query) {
    return resp({ query: rawQuery, count: 0, books: [] });
  }

  try {
    // Cache（安全包裝，失敗就跳過）
    let cache = null;
    let cacheKey = null;
    try {
      cache = caches.default;
      const cacheUrl = new URL(context.request.url);
      cacheUrl.searchParams.set('_ck', query.toLowerCase());
      cacheKey = new Request(cacheUrl.toString());
      const cached = await cache.match(cacheKey);
      if (cached) {
        return new Response(cached.body, {
          headers: { ...CORS_HEADERS, 'X-Cache': 'HIT' },
        });
      }
    } catch (e) {
      // cache 不可用就跳過
    }

    const searchUrl = `https://readmoo.com/search/keyword?q=${encodeURIComponent(query)}`;
    const rmRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9',
        'Accept': 'text/html',
      },
    });

    if (!rmRes.ok) {
      return resp({ error: `Readmoo ${rmRes.status}` }, 502);
    }

    const html = await rmRes.text();
    const allBooks = parseSearchResults(html);
    // 最多回傳 20 本（減少回應大小 + 出版日期抓取時間）
    let books = allBooks.slice(0, 20);
    let fallback = false;

    // 讀墨自家搜尋只 index 部分欄位（書名很多字搜不到）
    // 0 筆時用 DuckDuckGo 搜 site:readmoo.com 當 fallback
    if (books.length === 0) {
      try {
        const fbBooks = await fallbackSearch(query);
        if (fbBooks.length > 0) {
          books = fbBooks;
          fallback = true;
        }
      } catch (e) { /* fallback 失敗就回 0 筆，不影響原流程 */ }
    }

    // 平行抓每本書的出版日期（從詳情頁）
    await fetchPublishDates(books);

    const body = JSON.stringify({ query: rawQuery, count: books.length, books, fallback });

    // 寫入 cache（失敗不影響回應）
    if (cache && cacheKey) {
      try {
        const cacheResponse = new Response(body, {
          headers: { ...CORS_HEADERS, 'Cache-Control': `public, max-age=${CACHE_TTL}` },
        });
        context.waitUntil(cache.put(cacheKey, cacheResponse.clone()));
      } catch (e) { /* 跳過 */ }
    }

    return new Response(body, {
      headers: { ...CORS_HEADERS, 'X-Cache': 'MISS' },
    });
  } catch (err) {
    return resp({ error: err.name === 'AbortError' ? '連線逾時' : err.message }, 500);
  }
}

function resp(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: CORS_HEADERS });
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-TW,zh;q=0.9',
  'Accept': 'text/html',
};

function stripPunctuation(s) {
  return s
    .replace(/[：，。、？！「」『』（）〈〉《》【】〔〕——…・·~～\-—‧'"'']/g, ' ')
    .replace(/[:,.?!"'`()\[\]{}<>~\-—|/\\;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function diagDdg(t) {
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent('site:readmoo.com ' + t)}`;
  try {
    const r = await fetch(ddgUrl, { headers: FETCH_HEADERS });
    const html = await r.text();
    const shareIds = [];
    const re = /share\.readmoo\.com%2Fbook%2F(\d+)/g;
    let m;
    while ((m = re.exec(html)) !== null) shareIds.push(m[1]);
    return resp({
      ddgStatus: r.status,
      ddgSize: html.length,
      shareIds: [...new Set(shareIds)].slice(0, 10),
      first200: html.substring(0, 200),
      hasBlocked: html.includes('Anomaly') || html.includes('blocked') || html.includes('captcha'),
    });
  } catch (e) {
    return resp({ error: e.message, name: e.name });
  }
}

// 讀墨自家搜尋找不到時的備援：
// 1. DuckDuckGo HTML 版搜 site:readmoo.com → 抓 share.readmoo.com/book/XXX
// 2. 進 share 頁從 Base64 share URL 解出真正的 13 位數 book ID
// 3. 抓正規詳情頁取得書名/作者/封面/價格
async function fallbackSearch(query) {
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent('site:readmoo.com ' + query)}`;
  const ddgRes = await fetch(ddgUrl, { headers: FETCH_HEADERS });
  if (!ddgRes.ok) return [];
  const ddgHtml = await ddgRes.text();

  // 抓 share.readmoo.com/book/XXX 候選（去重，最多 5 個避免打太多 request）
  const shareIds = new Set();
  const sharePattern = /share\.readmoo\.com%2Fbook%2F(\d+)/g;
  let m;
  while ((m = sharePattern.exec(ddgHtml)) !== null) {
    shareIds.add(m[1]);
    if (shareIds.size >= 5) break;
  }

  if (shareIds.size === 0) return [];

  // 平行：share 頁 → 真正 ID → 詳情頁
  const results = await Promise.allSettled(
    Array.from(shareIds).map(async (shareId) => {
      // share 頁
      const shareRes = await fetch(`https://share.readmoo.com/book/${shareId}`, { headers: FETCH_HEADERS });
      if (!shareRes.ok) return null;
      const shareHtml = await shareRes.text();

      // 從 Base64 編碼的 share URL 解出 13 位數正規 ID
      let realId = null;
      const b64Match = shareHtml.match(/\/ap\/target\/share\?url=([A-Za-z0-9+/=]+)/);
      if (b64Match) {
        try {
          const decoded = atob(b64Match[1]);
          const idMatch = decoded.match(/\/book\/(\d{13,})/);
          if (idMatch) realId = idMatch[1];
        } catch (e) { /* 解碼失敗 */ }
      }
      // 退而求其次：從 HTML 內文找 13+ 位數 ID
      if (!realId) {
        const idMatch = shareHtml.match(/[^\d](2\d{14})[^\d]/);
        if (idMatch) realId = idMatch[1];
      }
      if (!realId) return null;

      // 抓正規詳情頁
      const bookRes = await fetch(`https://readmoo.com/book/${realId}`, { headers: FETCH_HEADERS });
      if (!bookRes.ok) return null;
      const bookHtml = await bookRes.text();

      const title = (bookHtml.match(/<h1[^>]*class="book-detail-title"[^>]*>([^<]+)<\/h1>/) || [])[1] || '';
      if (!title) return null;

      // 作者：itemprop="author" 或從 og:title 結尾的「- 作者」
      let author = '';
      const authorMatch = bookHtml.match(/<a[^>]*itemprop="author"[^>]*>([^<]+)<\/a>/);
      if (authorMatch) {
        author = authorMatch[1].trim();
      } else {
        const ogTitle = (bookHtml.match(/property="og:title"\s+content="([^"]+)"/) || [])[1] || '';
        const dashIdx = ogTitle.lastIndexOf(' - ');
        const pipeIdx = ogTitle.indexOf(' | ');
        if (dashIdx > 0 && pipeIdx > dashIdx) {
          author = ogTitle.substring(dashIdx + 3, pipeIdx).trim();
        }
      }

      const cover = (bookHtml.match(/property="og:image"\s+content="([^"]+)"/) || [])[1] || '';
      const publisher = (bookHtml.match(/<a[^>]*itemprop="publisher"[^>]*>([^<]+)<\/a>/) || [])[1]?.trim() || '';
      const priceStr = (bookHtml.match(/itemprop="price"[^>]*content="([0-9.]+)"/) || [])[1]
                    || (bookHtml.match(/"price":\s*"?([0-9.]+)"?/) || [])[1] || '';
      const price = priceStr ? parseFloat(priceStr) : 0;
      const pubdate = (bookHtml.match(/出版日期：(\d{4}-\d{2}-\d{2})/) || [])[1] || '';

      return {
        id: realId,
        title: title.trim(),
        author,
        publisher,
        price,
        cover,
        pubdate,
        url: `https://readmoo.com/book/${realId}`,
      };
    })
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}

function parseSearchResults(html) {
  const books = [];

  // Strategy 1: 從嵌入的 JS 變數抓書籍資料
  const itemsMatch = html.match(/const\s+items\s*=\s*(\[[\s\S]*?\]);/);
  let itemsMap = {};
  if (itemsMatch) {
    try {
      const items = JSON.parse(itemsMatch[1]);
      items.forEach(item => {
        itemsMap[item.item_id] = {
          id: item.item_id,
          title: item.item_name,
          price: item.price,
          publisher: item.item_brand,
        };
      });
    } catch (e) { /* 跳過 */ }
  }

  // Strategy 2: 從 HTML 抓封面 + 作者
  const coverPattern = /<a\s+href="https?:\/\/readmoo\.com\/book\/(\d+)"[^>]*class="book-cover product-link"[^>]*aria-label="([^"]*)"[^>]*>[\s\S]*?data-lazy-original="([^"]*)"[^>]*>/g;
  let match;
  const coverMap = {};
  while ((match = coverPattern.exec(html)) !== null) {
    coverMap[match[1]] = { title: match[2], cover: match[3] };
  }

  const authorPattern = /<a\s+href="https?:\/\/readmoo\.com\/contributor\/\d+"[^>]*aria-label="作者\s+([^"]*)"[^>]*>/g;
  const authors = [];
  while ((match = authorPattern.exec(html)) !== null) {
    authors.push(match[1]);
  }

  // 合併
  const ids = Object.keys(itemsMap);
  if (ids.length > 0) {
    ids.forEach((id, index) => {
      const item = itemsMap[id];
      const cover = coverMap[id];
      books.push({
        id: item.id, title: item.title, price: item.price,
        publisher: item.publisher, author: authors[index] || '',
        cover: cover?.cover || '',
        url: `https://readmoo.com/book/${item.id}`,
      });
    });
  } else {
    Object.entries(coverMap).forEach(([id, data], index) => {
      books.push({
        id, title: data.title, price: 0, publisher: '',
        author: authors[index] || '', cover: data.cover,
        url: `https://readmoo.com/book/${id}`,
      });
    });
  }

  return books;
}

// 平行抓出版日期（每本書打一次詳情頁，最多 10 本）
async function fetchPublishDates(books) {
  // 最多抓前 10 本，避免打太多 request
  const targets = books.slice(0, 10);

  const results = await Promise.allSettled(
    targets.map(async (book) => {
      try {
        const res = await fetch(book.url, { headers: FETCH_HEADERS });
        if (!res.ok) return;
        const html = await res.text();
        // 格式：<span>出版日期：2024-02-21</span>
        const match = html.match(/出版日期：(\d{4}-\d{2}-\d{2})/);
        if (match) {
          book.pubdate = match[1];
        }
      } catch (e) {
        // 單本抓不到就跳過，不影響其他
      }
    })
  );
}
