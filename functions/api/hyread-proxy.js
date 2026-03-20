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

// 解析熱門書 HTML（topLendBook.jsp）
function parseTopBooks(html) {
  const books = [];
  // 每本書在 <li> 裡，書名在 .bookPicArea 的 title 或 .book-title
  const bookPattern = /<li[^>]*class="[^"]*bookItem[^"]*"[^>]*>[\s\S]*?<\/li>/gi;
  const items = html.match(bookPattern) || [];

  // 備用：用更寬鬆的 pattern 抓書名和封面
  const titlePattern = /<div[^>]*class="[^"]*bookTitle[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi;
  const imgPattern = /<img[^>]*class="[^"]*bookPic[^"]*"[^>]*src="([^"]*)"[^>]*>/gi;
  const linkPattern = /bookDetail\.jsp\?id=(\d+)/g;

  // 用 all-in-one 方式：找所有書名連結
  const allTitles = [];
  const titleRe = /<a[^>]*href="[^"]*bookDetail\.jsp\?id=(\d+)[^"]*"[^>]*title="([^"]*)"[^>]*>/gi;
  let m;
  while ((m = titleRe.exec(html)) !== null) {
    allTitles.push({ id: m[1], title: decodeEntities(m[2]) });
  }

  // 去重（同一個 id 可能出現多次）
  const seen = new Set();
  for (const item of allTitles) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    books.push({
      rank: books.length + 1,
      title: item.title,
      id: item.id,
      thumbnail: `https://webcdn2.ebook.hyread.com.tw/bookcover/${item.id}.jpg`,
    });
  }

  return books;
}

// 解析新書上架 HTML（moccount-page.jsp）
function parseNewBooks(html) {
  const books = [];
  const titleRe = /<a[^>]*href="[^"]*bookDetail\.jsp\?id=(\d+)[^"]*"[^>]*title="([^"]*)"[^>]*>/gi;
  let m;
  const seen = new Set();
  while ((m = titleRe.exec(html)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    books.push({
      title: decodeEntities(m[2]),
      id: m[1],
      thumbnail: `https://webcdn2.ebook.hyread.com.tw/bookcover/${m[1]}.jpg`,
    });
  }
  return books;
}

// 解析搜尋結果 HTML（searchList.jsp）
function parseSearchResults(html) {
  const books = [];
  const titleRe = /<a[^>]*href="[^"]*bookDetail\.jsp\?id=(\d+)[^"]*"[^>]*title="([^"]*)"[^>]*>/gi;
  let m;
  const seen = new Set();
  while ((m = titleRe.exec(html)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    books.push({
      title: decodeEntities(m[2]),
      id: m[1],
      thumbnail: `https://webcdn2.ebook.hyread.com.tw/bookcover/${m[1]}.jpg`,
    });
  }
  return books;
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
