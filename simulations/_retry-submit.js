// _retry-submit.js - stxer's origin sometimes answers a step submit with a
// Cloudflare 5xx (520) or drops the connection ("fetch failed", seen as 599) under load. A blind retry could run a transaction
// twice, so this wraps global fetch: for each session it tracks how many
// steps it holds (one GET the first time, then + steps per accepted post).
// On a 5xx it reads the session back: if the step count did NOT move, the
// post never ran and is sent again (up to `retries`, `waitMs` apart); if it
// moved, the original 5xx is returned (the harness stops, nothing hidden).
// Install AFTER installChunkedSubmit when both are used (it then wraps it).
export function installRetrySubmit({ retries = 5, waitMs = 30_000 } = {}) {
  const inner = globalThis.fetch;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const held = new Map();
  const count = async (u) => {
    const got = await inner(u, { headers: { Accept: 'application/json' } });
    if (!got.ok) return null;
    return ((await got.json()).steps || []).length;
  };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (!(init?.method === 'POST' && /\/devtools\/v2\/simulations\/[0-9a-f]+$/.test(u) && typeof init.body === 'string')) {
      // A GET has no effect: retry a dropped connection ("fetch failed").
      if (init?.method && init.method !== 'GET') return inner(url, init);
      for (let i = 0; ; i++) {
        try { return await inner(url, init); } catch (e) { if (i >= retries) throw e; console.log(`  ${e.message} on GET ${u.slice(0, 80)}, retrying`); await sleep(5_000); }
      }
    }
    let n; try { n = (JSON.parse(init.body).steps || []).length; } catch { return inner(url, init); }
    if (!held.has(u)) held.set(u, await count(u));
    for (let left = retries; ; left--) {
      let res;
      try { res = await inner(url, init); } catch (e) { res = { ok: false, status: 599, error: e }; }
      if (res.ok) { const h = held.get(u); held.set(u, h == null ? null : h + n); return res; }
      if (res.status < 500 || left <= 0 || held.get(u) == null) { if (res.error) throw res.error; return res; }
      await sleep(waitMs);
      const now = await count(u);
      if (now !== held.get(u)) { console.log(`  stxer ${res.status}: session moved ${held.get(u)} -> ${now}, not retrying`); if (res.error) throw res.error; return res; }
      console.log(`  stxer ${res.status}: post did not run (session still ${now} steps), retrying`);
    }
  };
}
