
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
        const safeError = error.replace(/[<>"'&]/g, (c: string) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));
        return new NextResponse(`<html><body><h1>Auth Failed</h1><p>${safeError}</p></body></html>`, { headers: { 'Content-Type': 'text/html' } });
    }

    if (!code) {
        return new NextResponse(`<html><body><h1>Missing Code</h1></body></html>`, { headers: { 'Content-Type': 'text/html' } });
    }

    // Return HTML that posts the code back to the opener
    const html = `
    <html>
      <body>
        <h1>Authenticating...</h1>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'WHOOP_CODE', code: ${JSON.stringify(code)}, state: ${JSON.stringify(state || '')} }, window.location.origin);
            window.close();
          } else {
            document.body.innerHTML = '<h1>Error: Please close this window and try again.</h1>';
          }
        </script>
      </body>
    </html>
    `;

    return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html' },
    });
}
