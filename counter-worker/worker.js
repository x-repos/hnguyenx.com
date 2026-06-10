// Visitor counter for hnguyenx.com
// POST /hit    -> count this visit (country from Cloudflare) and return all counts
// GET  /counts -> return all counts without counting
//
// Counts are stored as one JSON blob in KV: { "US": 12, "VN": 9, ... }
// KV is eventually consistent, so rare concurrent visits may drop a count —
// fine for a personal-site counter.

const ALLOWED_ORIGINS = [
  "https://hnguyenx.com",
  "https://www.hnguyenx.com",
  "http://localhost:8123",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const counts = JSON.parse((await env.VISITS.get("counts")) || "{}");

    if (request.method === "POST" && url.pathname === "/hit") {
      const country = request.headers.get("CF-IPCountry") || "XX";
      if (/^[A-Z]{2}$/.test(country)) {
        counts[country] = (counts[country] || 0) + 1;
        await env.VISITS.put("counts", JSON.stringify(counts));
      }
      return new Response(JSON.stringify(counts), { headers });
    }

    if (request.method === "GET" && url.pathname === "/counts") {
      return new Response(JSON.stringify(counts), { headers });
    }

    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers });
  },
};
