// Mini-Vermittler (CORS-Proxy) für die Songtext-Analyse.
// Dieses Skript läuft kostenlos bei Cloudflare und holt Seiteninhalte von
// genius.com, damit der Browser sie laden darf. Aufruf:  <deine-adresse>?url=ZIEL
//
// Einrichtung siehe README.md, Abschnitt "Eigener Vermittler".

export default {
  async fetch(request) {
    // CORS-Header, die der Browser zum Lesen fremder Inhalte braucht.
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    // Vorab-Anfrage des Browsers (CORS preflight) beantworten.
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const ziel = new URL(request.url).searchParams.get('url');
    if (!ziel) {
      return new Response('Bitte ?url=... angeben', { status: 400, headers: cors });
    }

    try {
      const antwort = await fetch(ziel, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Songtext-Analyse, Lehrprojekt)',
          'Accept': 'text/html,application/json,*/*',
        },
      });
      const koerper = await antwort.arrayBuffer();
      return new Response(koerper, {
        status: antwort.status,
        headers: {
          ...cors,
          'Content-Type': antwort.headers.get('Content-Type') || 'text/plain; charset=utf-8',
        },
      });
    } catch (e) {
      return new Response('Fehler beim Laden: ' + String(e), { status: 502, headers: cors });
    }
  },
};
