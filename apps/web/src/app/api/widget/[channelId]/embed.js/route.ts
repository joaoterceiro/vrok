import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Serves an embeddable JS snippet that injects an iframe pointing to
 * `/widget/[channelId]`. Customers paste:
 *   <script src="https://yourdomain.com/api/widget/CHANNEL_ID/embed.js" defer></script>
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const url = new URL(req.url);
  const origin = url.origin;
  const iframeSrc = `${origin}/widget/${encodeURIComponent(channelId)}`;

  const js = `(function(){
  if (window.__zoraWidgetMounted) return;
  window.__zoraWidgetMounted = true;
  var iframe = document.createElement('iframe');
  iframe.src = ${JSON.stringify(iframeSrc)};
  iframe.style.cssText = [
    'position:fixed','bottom:0','right:0','width:380px','height:600px',
    'max-width:100vw','max-height:100vh','border:0','z-index:2147483646',
    'border-radius:14px 14px 0 0','box-shadow:0 12px 40px rgba(0,0,0,.32)',
    'background:transparent'
  ].join(';');
  iframe.setAttribute('allow', 'clipboard-write; microphone');
  iframe.setAttribute('title', 'Atendimento');
  document.documentElement.appendChild(iframe);
})();`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
