// HyRead 圖書館 API Proxy
// 參考：Taiwan-Ebook-Lover (MIT)、Library-Hyread-Ebook-Searching (MIT)

const LIBRARIES = {
  klccab:      '基隆市文化局',
  ncl:         '國家圖書館',
  tpml:        '臺北市立圖書館',
  tphcc:       '新北市立圖書館',
  ntledu:      '國立臺灣圖書館',
  tycccgov:    '桃園市立圖書館',
  hcmlgov:     '新竹市圖書館',
  hchcc:       '新竹縣公共圖書館',
  miaolilib:   '苗栗縣立圖書館',
  taichunggov: '臺中市立圖書館',
  cabcygov:    '嘉義市政府文化局',
  tnml:        '臺南市立圖書館',
  ksml:        '高雄市立圖書館',
  ilccb:       '宜蘭縣政府文化局',
  hccc:        '花蓮縣文化局',
  cclttct:     '臺東縣政府文化處',
  bocach:      '南投縣公共圖書館',
  ylccb:       '雲林縣公共圖書館',
  chcedu:      '彰化雲端電子書庫',
  pthggov:     '屏東縣公共圖書館',
  kinmen:      '金門縣文化局',
  phhcc:       '澎湖縣圖書館',
  matsucc:     '連江縣公共圖書館',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// 抓 HyRead 頁面 HTML
async function fetchHyRead(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      'Cookie': 'notBot=1',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// 通用解析：從 HTML 找 bookDetail 連結 + 書名 + 封面
// HyRead 的封面和書名常在不同的 <a> 裡，所以要分兩步
function parseBooks(html) {
  const books = [];
  const seen = new Set();
  const coverMap = {};  // id -> 封面 URL
  const titleMap = {};  // id -> 書名
  const idOrder = [];   // 保留原始順序
  let m;

  // 掃描所有 <a href="bookDetail?id=XXX"> 區塊
  const blockRe = /<a[^>]*href="[^"]*bookDetail\.jsp\?id=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = blockRe.exec(html)) !== null) {
    const id = m[1];
    const block = m[2];

    // 記錄順序
    if (!idOrder.includes(id)) idOrder.push(id);

    // 抓封面圖（從 img src）
    if (!coverMap[id]) {
      const imgMatch = block.match(/<img[^>]*src="(https?:\/\/[^"]*bookcover[^"]*)"/i);
      if (imgMatch) coverMap[id] = imgMatch[1];
    }

    // 抓書名（h6 > contTxt > 純文字 > img title/alt）
    if (!titleMap[id]) {
      const h6Match = block.match(/<h6[^>]*>([\s\S]*?)<\/h6>/i);
      const contMatch = block.match(/<div[^>]*class="[^"]*contTxt[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const plainText = block.replace(/<[^>]*>/g, '').trim();
      const titleMatch = block.match(/<img[^>]*title="([^"#]+)"/i);
      const altMatch = block.match(/<img[^>]*alt="([^"]+)"/i);

      const t = (h6Match ? h6Match[1].replace(/<[^>]*>/g, '').trim() : '')
        || (contMatch ? contMatch[1].replace(/<[^>]*>/g, '').trim() : '')
        || (plainText && plainText.length < 200 ? plainText : '')
        || (titleMatch ? titleMatch[1].trim() : '')
        || (altMatch ? altMatch[1].trim() : '');

      if (t) titleMap[id] = decodeEntities(t);
    }
  }

  // 補充：從 book-title-01 裡抓書名（書店搜尋結果用）
  const btRe = /<div[^>]*class="[^"]*book-title-01[^"]*"[^>]*>\s*<a[^>]*href="[^"]*bookDetail\.jsp\?id=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = btRe.exec(html)) !== null) {
    const id = m[1];
    if (!idOrder.includes(id)) idOrder.push(id);
    if (!titleMap[id]) {
      titleMap[id] = decodeEntities(m[2].replace(/<[^>]*>/g, '').trim());
    }
  }

  // 補充：從 bookPic img src 抓封面（書店搜尋結果用）
  const bpRe = /<img[^>]*src="(https?:\/\/[^"]*bookcover\/(\d+)[^"]*)"[^>]*class="[^"]*bookPic[^"]*"/gi;
  const bpRe2 = /<img[^>]*class="[^"]*bookPic[^"]*"[^>]*src="(https?:\/\/[^"]*bookcover\/(\d+)[^"]*)"[^>]*/gi;
  for (const re of [bpRe, bpRe2]) {
    while ((m = re.exec(html)) !== null) {
      // 從封面 URL 裡提取 id（bookcover/485700978...jpg → 485700 是前 N 位）
      // 用 idOrder 裡的 id 去匹配
      for (const knownId of idOrder) {
        if (m[1].includes(`bookcover/${knownId}`)) {
          if (!coverMap[knownId]) coverMap[knownId] = m[1];
          break;
        }
      }
    }
  }

  // 組合結果
  for (const id of idOrder) {
    if (seen.has(id) || !titleMap[id]) continue;
    seen.add(id);
    books.push({
      id,
      title: titleMap[id],
      thumbnail: coverMap[id] || '',
    });
  }

  return books;
}

// 解析熱門書 HTML（topLendBook.jsp）
function parseTopBooks(html) {
  const books = parseBooks(html);
  return books.map((b, i) => ({
    rank: i + 1,
    title: b.title,
    id: b.id,
    thumbnail: b.thumbnail || '',
  }));
}

// 解析新書上架 HTML（moccount-page.jsp）
function parseNewBooks(html) {
  return parseBooks(html).map(b => ({
    title: b.title,
    id: b.id,
    thumbnail: b.thumbnail || '',
  }));
}

// 解析搜尋結果 HTML（searchList.jsp）
function parseSearchResults(html) {
  return parseBooks(html).map(b => ({
    title: b.title,
    id: b.id,
    thumbnail: b.thumbnail || '',
  }));
}

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// KV 記錄新書首次出現的日期
async function recordFirstSeen(kv, lib, books) {
  if (!kv) return books;
  const key = `firstseen:${lib}`;
  let record = {};
  try {
    const raw = await kv.get(key);
    if (raw) record = JSON.parse(raw);
  } catch { /* ignore */ }

  const today = new Date().toISOString().slice(0, 10);
  let changed = false;

  for (const book of books) {
    if (!record[book.id]) {
      record[book.id] = today;
      changed = true;
    }
    book.firstSeen = record[book.id];
  }

  if (changed) {
    await kv.put(key, JSON.stringify(record), { expirationTtl: 86400 * 90 }); // 保留 90 天
  }

  return books;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const kv = context.env.LIBRARY_CACHE || null;

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const action = url.searchParams.get('action');
  const lib = url.searchParams.get('lib');
  const query = url.searchParams.get('q');

  // 回傳圖書館列表
  if (action === 'libraries') {
    return jsonResponse({ libraries: LIBRARIES });
  }

  // 驗證圖書館代碼
  if (lib && !LIBRARIES[lib]) {
    return jsonResponse({ error: '不支援的圖書館代碼' }, 400);
  }

  try {
    if (action === 'top' && lib) {
      // 熱門排行
      const html = await fetchHyRead(
        `https://${lib}.ebook.hyread.com.tw/Template/RWD3.0/topLendBook.jsp`
      );
      const books = parseTopBooks(html);
      return jsonResponse({ library: LIBRARIES[lib], books });

    } else if (action === 'new' && lib) {
      // 新書上架（KV 記錄首次出現日期）
      const html = await fetchHyRead(
        `https://${lib}.ebook.hyread.com.tw/Template/RWD3.0/moccount-page.jsp`
      );
      const books = parseNewBooks(html);
      await recordFirstSeen(kv, lib, books);
      return jsonResponse({ library: LIBRARIES[lib], books });

    } else if (action === 'bestseller') {
      // HyRead 書店暢銷榜（要花錢買的書）
      const html = await fetchHyRead(
        'https://ebook.hyread.com.tw/Template/RWD3.0/topSaleBook.jsp'
      );
      const books = parseBooks(html);
      return jsonResponse({ books: books.map((b, i) => ({ rank: i + 1, ...b })) });

    } else if (action === 'free-hits' && lib) {
      // 圖書館新書 vs 書店暢銷榜 交叉比對
      const [newHtml, bestHtml] = await Promise.all([
        fetchHyRead(`https://${lib}.ebook.hyread.com.tw/Template/RWD3.0/moccount-page.jsp`),
        fetchHyRead('https://ebook.hyread.com.tw/Template/RWD3.0/topSaleBook.jsp'),
      ]);
      const newBooks = parseNewBooks(newHtml);
      const bestBooks = parseBooks(bestHtml);

      // 用 normalizeTitle 比對
      const normalize = (t) => (t || '').toLowerCase().replace(/\s+/g, '')
        .replace(/[（(）)【】\[\]：:，,。.、！!？?～~「」『』""''《》〈〉\-—─·・]/g, '');
      const bestSet = new Set(bestBooks.map(b => normalize(b.title)));
      const bestMap = {};
      bestBooks.forEach((b, i) => { bestMap[normalize(b.title)] = i + 1; });

      const hits = newBooks.filter(b => bestSet.has(normalize(b.title)))
        .map(b => ({ ...b, bestsellerRank: bestMap[normalize(b.title)] || 0 }));

      return jsonResponse({
        library: LIBRARIES[lib],
        hits,
        totalNew: newBooks.length,
        totalBestseller: bestBooks.length,
      });

    } else if (action === 'search' && query) {
      // 搜尋 HyRead 書店（靜態 HTML，能抓到結果）
      // 圖書館子站搜尋是 AJAX 加密，無法直接抓
      const encoded = encodeURIComponent(query);
      const html = await fetchHyRead(
        `https://ebook.hyread.com.tw/searchList.jsp?search_field=FullText&MZAD=0&search_input=${encoded}`
      );
      const books = parseSearchResults(html);
      return jsonResponse({ query, books, source: 'HyRead 書店' });

    } else if (action === 'search-all' && query) {
      // 搜尋 HyRead 書店（同 search，保留 search-all 相容）
      const encoded = encodeURIComponent(query);
      const html = await fetchHyRead(
        `https://ebook.hyread.com.tw/searchList.jsp?search_field=FullText&MZAD=0&search_input=${encoded}`
      );
      const books = parseSearchResults(html);
      return jsonResponse({ query, books, source: 'HyRead 書店' });

    } else {
      return jsonResponse({
        error: '缺少參數',
        usage: {
          libraries: '?action=libraries',
          top: '?action=top&lib=tpml',
          new: '?action=new&lib=tpml',
          search: '?action=search&lib=tpml&q=原子習慣',
          searchAll: '?action=search-all&q=原子習慣',
        }
      }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}
