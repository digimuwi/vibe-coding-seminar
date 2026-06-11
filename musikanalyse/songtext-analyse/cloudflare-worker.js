// Mini-Vermittler (CORS-Proxy) für die Songtext-Analyse.
// Läuft kostenlos bei Cloudflare und holt Seiteninhalte von genius.com,
// damit der Browser sie laden darf. Aufruf:  <deine-adresse>?url=ZIEL

export default {
  /** @param {Request} request */
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const ziel = new URL(request.url).searchParams.get("url");
    if (!ziel) {
      return new Response("Bitte ?url=... angeben", { status: 400, headers: cors });
    }

    const antwort = await fetch(ziel, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Songtext-Analyse, Lehrprojekt)",
        "Accept": "text/html,application/json,*/*",
      },
    });

    return new Response(antwort.body, {
      status: antwort.status,
      headers: {
        ...cors,
        "Content-Type": antwort.headers.get("Content-Type") || "text/plain; charset=utf-8",
      },
    });
  },
};
