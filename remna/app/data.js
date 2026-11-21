// Remna: skąd aplikacja bierze oferty.
// Tryb "live": baza Supabase (REST, klucz publiczny tylko do odczytu).
// Tryb "demo": zapisana próbka ofert (data/demo.json), gdy baza nie działa albo nie ma internetu.
(function (root) {
  'use strict';

  function makeSource(config, deps) {
    const R = deps.Remna;
    const fetchFn = deps.fetch;
    const base = String(config.supabaseUrl || '').replace(/\/$/, '') + '/rest/v1';
    const headers = { apikey: config.supabaseKey, Authorization: 'Bearer ' + config.supabaseKey };

    let mode = null;            // 'live' | 'demo'
    let reason = null;          // 'not-ready' | 'offline' (dla trybu demo)
    let shops = [];
    let demo = null;            // {generatedAt, shops, products}
    let shopsByCountry = {};
    let updatedAt = null;

    async function getJson(path, extraHeaders) {
      const r = await fetchFn(base + path, { headers: Object.assign({}, headers, extraHeaders || {}) });
      if (!r.ok) {
        const err = new Error('HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      return { body: await r.json(), headers: r.headers };
    }

    function indexShops(list) {
      shops = list.slice().sort((a, b) => a.name.localeCompare(b.name));
      shopsByCountry = {};
      for (const s of shops) {
        if (!s.country) continue;
        (shopsByCountry[s.country] = shopsByCountry[s.country] || []).push(s.id);
      }
    }

    async function loadDemo(why) {
      if (!demo) {
        const r = await fetchFn(config.demoUrl || 'data/demo.json');
        demo = await r.json();
      }
      mode = 'demo';
      reason = why;
      updatedAt = demo.generatedAt || null;
      indexShops(demo.shops || []);
    }

    async function init() {
      if (config.supabaseUrl && config.supabaseKey) {
        try {
          const { body } = await getJson('/shops?select=id,name,domain,country,city,currency,product_count,last_success_at&order=name.asc');
          if (Array.isArray(body) && body.length) {
            mode = 'live';
            reason = null;
            indexShops(body);
            updatedAt = body.map((s) => s.last_success_at).filter(Boolean).sort().pop() || null;
            return mode;
          }
          await loadDemo('not-ready');
          return mode;
        } catch (e) {
          // 404/401 = tabel jeszcze nie ma; brak odpowiedzi = brak internetu
          await loadDemo(e && e.status ? 'not-ready' : 'offline');
          return mode;
        }
      }
      await loadDemo('not-ready');
      return mode;
    }

    function parseTotal(h) {
      const range = h && h.get && h.get('content-range');
      if (!range) return null;
      const total = range.split('/')[1];
      return total && total !== '*' ? Number(total) : null;
    }

    /** Wyniki wyszukiwania: {items, total, approx}. */
    async function search(filters, page, since) {
      if (mode === 'live') {
        const qs = R.toQueryString(R.restParams(filters, { page: page || 0, shopsByCountry, since }));
        try {
          const { body, headers: h } = await getJson('/products?' + qs, { Prefer: 'count=exact' });
          return { items: body, total: parseTotal(h), approx: false };
        } catch (e) {
          // Liczenie bywa wolne przy szerokich wyszukiwaniach: pokazujemy wyniki bez licznika.
          if (!e.status) throw e;
          const { body } = await getJson('/products?' + qs);
          return { items: body, total: null, approx: false };
        }
      }
      const all = demo.products.filter((p) => R.matchLocal(p, filters, { shopsByCountry, since }));
      const sorted = R.sortLocal(all, R.normalizeFilters(filters).sort);
      const start = (page || 0) * R.PAGE_SIZE;
      return { items: sorted.slice(start, start + R.PAGE_SIZE), total: sorted.length, approx: false };
    }

    /** Ile ofert pasuje do filtrów i pojawiło się po dacie `since`. */
    async function countNew(filters, since) {
      if (mode === 'live') {
        const params = R.restParams(filters, { page: 0, shopsByCountry, since, select: 'id' })
          .filter(([k]) => k !== 'order' && k !== 'limit' && k !== 'offset');
        params.push(['limit', '1']);
        const { headers: h } = await getJson('/products?' + R.toQueryString(params), { Prefer: 'count=exact' });
        return parseTotal(h) || 0;
      }
      return demo.products.filter((p) => R.matchLocal(p, filters, { shopsByCountry, since })).length;
    }

    /** Świeże dane ofert o podanych id (do ulubionych). */
    async function byIds(ids) {
      if (!ids.length) return [];
      if (mode === 'live') {
        const out = [];
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50).map((x) => '"' + x.replace(/"/g, '') + '"').join(',');
          const qs = 'select=' + encodeURIComponent(R.LIST_FIELDS + ',removed_at') + '&id=in.(' + encodeURIComponent(chunk) + ')';
          const { body } = await getJson('/products?' + qs);
          out.push(...body);
        }
        return out;
      }
      const set = new Set(ids);
      return demo.products.filter((p) => set.has(p.id));
    }

    /** Pełne dane jednej oferty (z opisem). */
    async function details(id) {
      if (mode === 'live') {
        const qs = 'select=*&id=eq.' + encodeURIComponent(id);
        const { body } = await getJson('/products?' + qs);
        return body[0] || null;
      }
      return demo.products.find((p) => p.id === id) || null;
    }

    /** Pyta sklep, czy oferta jest jeszcze dostępna: 'available' | 'soldout' | 'gone' | null. */
    async function checkLive(product, timeoutMs) {
      const url = R.liveCheckUrl(product && product.url);
      if (!url) return null;
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 6000) : null;
      try {
        const r = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined });
        let body = null;
        if (r.status === 200) { try { body = await r.json(); } catch (e) { body = null; } }
        return R.readLiveCheck(r.status, body);
      } catch (e) {
        return null;   // brak internetu, blokada albo za długo: zostają dane z bazy
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    return {
      init, search, countNew, byIds, details, checkLive,
      get mode() { return mode; },
      get reason() { return reason; },
      get shops() { return shops; },
      get shopsByCountry() { return shopsByCountry; },
      get updatedAt() { return updatedAt; },
      shopById(id) { return shops.find((s) => s.id === id) || null; },
    };
  }

  const api = { makeSource };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RemnaData = api;
})(typeof window !== 'undefined' ? window : globalThis);
