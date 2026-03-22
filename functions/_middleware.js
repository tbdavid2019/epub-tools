// GA4 自動注入 — 所有 HTML 頁面都會加上追蹤碼
const GA_TAG = `
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TQYREKR9EV"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-TQYREKR9EV');
</script>`;

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';

  // 只處理 HTML
  if (!contentType.includes('text/html')) {
    return response;
  }

  const html = await response.text();

  // 已經有 gtag 就跳過
  if (html.includes('googletagmanager.com/gtag')) {
    return new Response(html, response);
  }

  // 注入到 <head> 後面
  const injected = html.replace('<head>', '<head>' + GA_TAG);

  return new Response(injected, {
    status: response.status,
    headers: response.headers,
  });
}
