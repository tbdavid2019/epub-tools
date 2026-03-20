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

// 通用解析：從 HTML 找 bookDetail 連結 + h6 書名 或 img title
function parseBooks(html) {
  const books = [];
  const seen = new Set();

  // 策略 1：找 <a href="bookDetail.jsp?id=XXX"> 後面跟著 <h6>書名</h6>
  const h6Re = /<a[^>]*href="[^"]*bookDetail\.jsp\?id=(\d+)[^"]*"[^>]*>[\s\S]*?<h6>([\s\S]*?)<\/h6>/gi;
  let m;
  while ((m = h6Re.exec(html)) !== null) {
    const id = m[1];
    const title = decodeEntities(m[2].replace(/<[^>]*>/g, '').trim());
    if (!title || seen.has(id)) continue;
    seen.add(id);
    books.push({ id, title });
  }

  // 策略 2：找 <img title="書名"> 搭配 bookDetail id
  if (books.length === 0) {
    const imgRe = /<a[^>]*href="[^"]*bookDetail\.jsp\?id=(\d+)[^"]*"[^>]*>[\s\S]*?<img[^>]*title="([^"#]+)"[^>]*>/gi;
    while ((m = imgRe.exec(html)) !== null) {
      const id = m[1];
      const title = decodeEntities(m[2].trim());
      if (!title || seen.has(id)) continue;
      seen.add(id);
      books.push({ id, title });
    }
  }

  // 策略 3：找 <img alt="書名"> 搭配 bookDetail id
  if (books.length === 0) {
    const altRe = /<a[^>]*href="[^"]*bookDetail\.jsp\?id=(\d+)[^"]*"[^>]*>[\s\S]*?<img[^>]*alt="([^"]+)"[^>]*>/gi;
    while ((m = altRe.exec(html)) !== null) {
      const id = m[1];
      const title = decodeEntities(m[2].trim());
      if (!title || seen.has(id)) continue;
      seen.add(id);
      books.push({ id, title });
    }
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
    thumbnail: `https://webcdn2.ebook.hyread.com.tw/bookcover/${b.id}.jpg`,
  }));
}

// 解析新書上架 HTML（moccount-page.jsp）
function parseNewBooks(html) {
  return parseBooks(html).map(b => ({
    title: b.title,
    id: b.id,
    thumbnail: `https://webcdn2.ebook.hyread.com.tw/bookcover/${b.id}.jpg`,
  }));
}

// 解析搜尋結果 HTML（searchList.jsp）
function parseSearchResults(html) {
  return parseBooks(html).map(b => ({
    title: b.title,
    id: b.id,
    thumbnail: `https://webcdn2.ebook.hyread.com.tw/bookcover/${b.id}.jpg`,
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

export async function onRequest(context) {
  const url = new URL(context.request.url);

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
      // 新書上架
      const html = await fetchHyRead(
        `https://${lib}.ebook.hyread.com.tw/Template/RWD3.0/moccount-page.jsp`
      );
      const books = parseNewBooks(html);
      return jsonResponse({ library: LIBRARIES[lib], books });

    } else if (action === 'search' && lib && query) {
      // 搜尋特定圖書館
      const encoded = encodeURIComponent(query);
      const html = await fetchHyRead(
        `https://${lib}.ebook.hyread.com.tw/searchList.jsp?search_field=FullText&search_input=${encoded}`
      );
      const books = parseSearchResults(html);
      return jsonResponse({ library: LIBRARIES[lib], query, books });

    } else if (action === 'search-all' && query) {
      // 搜尋所有圖書館（平行）
      const encoded = encodeURIComponent(query);
      const results = {};

      const entries = Object.entries(LIBRARIES);
      // 分批（每批 5 間避免太猛）
      const BATCH = 5;
      for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH);
        const promises = batch.map(async ([code, name]) => {
          try {
            const html = await fetchHyRead(
              `https://${code}.ebook.hyread.com.tw/searchList.jsp?search_field=FullText&search_input=${encoded}`
            );
            const books = parseSearchResults(html);
            if (books.length > 0) {
              results[code] = { name, books };
            }
          } catch { /* 跳過失敗的館 */ }
        });
        await Promise.all(promises);
      }

      return jsonResponse({ query, results });

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
