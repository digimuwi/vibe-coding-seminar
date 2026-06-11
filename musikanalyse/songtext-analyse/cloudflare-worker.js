// Mini-Vermittler (CORS-Proxy) für die Songtext-Analyse.
// Dieses Skript läuft kostenlos bei Cloudflare und holt Seiteninhalte von
// genius.com, damit der Browser sie laden darf. Aufruf:  <deine-adresse>?url=ZIEL
//
// Einrichtung siehe README.md, Abschnitt "Eigener Vermittler".

export default {
  async fetch(request) {
    const ziel = new URL(request.url).searchParams.get('url');

    // Vorab-Anfrage des Browsers (CORS preflight) beantworten.
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (!ziel) {
      return new Response('Bitte ?url=... angeben', { status: 400, headers: corsHeaders() });
    }

    try {
      const antwort = await fetch(ziel, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Songtext-Analyse, Lehrprojekt)',
          'Accept': 'text/html,application/json,*/*',
        },
      });
      const koerper = await antwort.arrayBuffer();
      const kopf = corsHeaders();
      kopf['Content-Type'] = antwort.headers.get('Content-Type') || 'text/plain; charset=utf-8';
      return new Response(koerper, { status: antwort.status, headers: kopf });
    } catch (e) {
      return new Response('Fehler beim Laden: ' + e.message, { status: 502, headers: corsHeaders() });
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
}
