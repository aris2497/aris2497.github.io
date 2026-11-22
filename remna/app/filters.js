// Remna: logika filtrów, zapytań i pamięci (bez interfejsu, testowana w tests/).
// Działa w przeglądarce (window.Remna) i w Node (require) do testów.
(function (root) {
  'use strict';

  const FIBERS = [
    { id: 'silk', pl: 'Jedwab', en: 'Silk' },
    { id: 'wool', pl: 'Wełna', en: 'Wool' },
    { id: 'cashmere', pl: 'Kaszmir', en: 'Cashmere' },
    { id: 'cotton', pl: 'Bawełna', en: 'Cotton' },
    { id: 'linen', pl: 'Len', en: 'Linen' },
    { id: 'viscose', pl: 'Wiskoza', en: 'Viscose' },
    { id: 'cupro', pl: 'Cupro', en: 'Cupro' },
    { id: 'acetate', pl: 'Acetat', en: 'Acetate' },
    { id: 'polyester', pl: 'Poliester', en: 'Polyester' },
    { id: 'polyamide', pl: 'Poliamid', en: 'Polyamide' },
    { id: 'elastane', pl: 'Elastan', en: 'Elastane' },
    { id: 'mohair', pl: 'Moher', en: 'Mohair' },
    { id: 'alpaca', pl: 'Alpaka', en: 'Alpaca' },
    { id: 'hemp', pl: 'Konopie', en: 'Hemp' },
    { id: 'acrylic', pl: 'Akryl', en: 'Acrylic' },
    { id: 'metallic', pl: 'Lureks', en: 'Metallic' },
    { id: 'leather', pl: 'Skóra', en: 'Leather' },
  ];

  const COLORS = [
    { id: 'black', pl: 'Czarny', en: 'Black', hex: '#1c1c1e' },
    { id: 'white', pl: 'Biały', en: 'White', hex: '#ffffff' },
    { id: 'cream', pl: 'Kremowy', en: 'Cream', hex: '#efe6d2' },
    { id: 'beige', pl: 'Beżowy', en: 'Beige', hex: '#cdb491' },
    { id: 'brown', pl: 'Brązowy', en: 'Brown', hex: '#7a5134' },
    { id: 'grey', pl: 'Szary', en: 'Grey', hex: '#8e9196' },
    { id: 'blue', pl: 'Niebieski', en: 'Blue', hex: '#2f5fb3' },
    { id: 'green', pl: 'Zielony', en: 'Green', hex: '#3f7f4f' },
    { id: 'red', pl: 'Czerwony', en: 'Red', hex: '#b8312f' },
    { id: 'pink', pl: 'Różowy', en: 'Pink', hex: '#e48aa6' },
    { id: 'purple', pl: 'Fioletowy', en: 'Purple', hex: '#6d4b9a' },
    { id: 'yellow', pl: 'Żółty', en: 'Yellow', hex: '#e8c23a' },
    { id: 'orange', pl: 'Pomarańczowy', en: 'Orange', hex: '#e07a2e' },
    { id: 'gold', pl: 'Złoty', en: 'Gold', hex: '#c9a24a' },
    { id: 'silver', pl: 'Srebrny', en: 'Silver', hex: '#bfc3c7' },
  ];

  const MAX_PRICE_STEPS = [10, 20, 40, 80, 150];   // €/m
  const MIN_WIDTH_STEPS = [110, 140, 150];        // cm
  const SORTS = ['newest', 'price_asc', 'price_desc'];
  // Filtr składu: minimalny udział wybranego włókna (%) i „bez syntetyków” (najwyżej 5%, np. elastanu)
  const PURITY_STEPS = [50, 80, 100];
  const SYNTHETIC = ['polyester', 'polyamide', 'acrylic', 'elastane', 'metallic'];
  const MAX_SYNTHETIC_PCT = 5;
  // Ile metrów potrzebujesz: ukrywamy oferty, o których wiemy, że zostało mniej
  const MIN_STOCK_STEPS = [2, 3, 5, 10, 20];
  const PAGE_SIZE = 30;

  function defaultFilters() {
    return {
      q: '', kind: 'all', fibers: [], colors: [], maxPrice: null, minWidth: null,
      countries: [], shops: [], newDays: null, sort: 'newest',
      purity: null, noSynthetic: false, minStock: null, stockKnown: false,
    };
  }

  function normalizeFilters(f) {
    const d = defaultFilters();
    const out = Object.assign({}, d, f || {});
    out.q = String(out.q || '').trim().slice(0, 80);
    if (!['all', 'fabric', 'leather'].includes(out.kind)) out.kind = 'all';
    for (const k of ['fibers', 'colors', 'countries', 'shops']) {
      out[k] = Array.isArray(out[k]) ? Array.from(new Set(out[k].map(String))).sort() : [];
    }
    out.fibers = out.fibers.filter((x) => FIBERS.some((f2) => f2.id === x));
    out.colors = out.colors.filter((x) => COLORS.some((c) => c.id === x));
    out.maxPrice = MAX_PRICE_STEPS.includes(out.maxPrice) ? out.maxPrice : null;
    out.minWidth = MIN_WIDTH_STEPS.includes(out.minWidth) ? out.minWidth : null;
    out.newDays = [1, 7, 30].includes(out.newDays) ? out.newDays : null;
    // Udział ma sens tylko z wybranym materiałem
    out.purity = PURITY_STEPS.includes(out.purity) && out.fibers.length ? out.purity : null;
    out.noSynthetic = out.noSynthetic === true;
    out.minStock = MIN_STOCK_STEPS.includes(out.minStock) ? out.minStock : null;
    out.stockKnown = out.stockKnown === true;
    if (!SORTS.includes(out.sort)) out.sort = 'newest';
    return out;
  }

  /** Liczba ustawionych filtrów (bez wyszukiwanego tekstu i sortowania). */
  function countActive(f) {
    const n = normalizeFilters(f);
    return (n.kind !== 'all' ? 1 : 0) + n.fibers.length + n.colors.length + (n.maxPrice ? 1 : 0) +
      (n.minWidth ? 1 : 0) + n.countries.length + n.shops.length + (n.newDays ? 1 : 0) +
      (n.purity ? 1 : 0) + (n.noSynthetic ? 1 : 0) + (n.minStock ? 1 : 0) + (n.stockKnown ? 1 : 0);
  }

  /** Klucz porównawczy filtrów (do alertów i pamięci podręcznej). */
  function filtersKey(f) {
    const n = normalizeFilters(f);
    delete n.sort;
    return JSON.stringify(n);
  }

  // --- Wyszukiwanie tekstowe ------------------------------------------------
  // Słowa w różnych językach, które zamieniamy na nazwy wspólne (jak w bazie).
  const WORD_ALIASES = (() => {
    const map = {};
    const add = (canon, words) => words.forEach((w) => { map[w] = canon; });
    add('silk', ['jedwab', 'jedwabna', 'jedwabny', 'seta', 'soie', 'seide', 'zijde', 'seda']);
    add('wool', ['wełna', 'welna', 'wełniana', 'welniana', 'wełniany', 'lana', 'laine', 'wolle', 'wol']);
    add('cashmere', ['kaszmir', 'cachemire', 'kaschmir']);
    add('cotton', ['bawełna', 'bawelna', 'bawełniana', 'cotone', 'coton', 'baumwolle', 'katoen', 'algodon']);
    add('linen', ['len', 'lniana', 'lniany', 'lino', 'leinen', 'linnen']);
    add('viscose', ['wiskoza', 'viscosa', 'viskose', 'rayon']);
    add('leather', ['skóra', 'skora', 'skórzana', 'pelle', 'cuir', 'leder']);
    add('polyester', ['poliester']);
    add('elastane', ['elastan', 'lycra', 'spandex']);
    for (const c of COLORS) add(c.id, [c.pl.toLowerCase()]);
    add('black', ['czarna', 'czarne']);
    add('white', ['biała', 'biale', 'białe']);
    add('blue', ['granatowy', 'granat', 'navy', 'niebieska']);
    add('green', ['zielona', 'oliwkowy', 'khaki']);
    add('red', ['czerwona', 'bordowy', 'bordo']);
    add('pink', ['różowa', 'rozowy']);
    add('grey', ['szara', 'gray', 'popielaty']);
    return map;
  })();


  // Rodzaje tkanin i wzory w wielu językach: wpisanie dowolnego słowa z grupy szuka wszystkich naraz
  // (PL, EN, FR, IT, DE, NL, ES, PT). „=słowo” = tylko całe słowo (krótkie, łatwo o fałszywe trafienia);
  // kilka słów = wyrażenie (słowa obok siebie), np. „velours côtelé” (samo „côtelé” to też dzianina w prążek).
  const TERM_GROUPS = [
    ['sztruks', 'corduroy', 'velours côtelé', 'velours cotele', 'milleraies', 'mille raies', '1000 raies', 'velluto a coste', 'millerighe', 'cordsamt', 'feincord', 'babycord', 'needlecord', 'ribfluweel', 'bombazina'],
    ['aksamit', 'welur', 'velvet', 'velours', 'velluto', 'samt', 'fluweel', 'terciopelo', 'veludo'],
    ['plusz', 'plush', 'peluche', 'plüsch', 'pluche', 'minky'],
    ['dżins', 'dzins', 'jeans', 'denim'],
    ['tiul', 'tulle', 'tüll', 'tule'],
    ['koronka', 'koronkowy', 'lace', 'dentelle', 'pizzo', 'spitze', '=kant', 'encaje', 'renda', 'guipure', 'gipiura'],
    ['szyfon', 'chiffon', 'mousseline', 'chifón'],
    ['krepa', 'crepe', 'crêpe', 'crespo', 'krepp', 'crep'],
    ['satyna', 'satin', 'raso', 'satijn', 'cetim', 'charmeuse'],
    ['tafta', 'taffeta', 'taffetas', 'taft', 'tafetán', 'tafetá'],
    ['organza', 'organdi', 'organdy'],
    ['żakard', 'zakard', 'jacquard'],
    ['tweed'],
    ['flanela', 'flannel', 'flanelle', 'flanella', 'flanell', 'franela'],
    ['dzianina', 'jersey', 'knit', 'maille', 'tricot', 'maglia', 'strick', 'tricô', 'punto'],
    ['popelina', 'poplin', 'popeline', 'popelin', 'popelín'],
    ['gabardyna', 'gabardine', 'gabardina'],
    ['muślin', 'muslin', 'mussola', 'musselin', 'muselina'],
    ['batyst', 'batiste', 'batista', 'cambric'],
    ['płótno', 'plotno', 'canvas', 'toile', '=tela', 'leinwand', 'lona'],
    ['diagonal', 'twill', 'sergé', 'serge', 'saia', 'köper', 'keper', 'sarga'],
    ['boucle', 'bouclé'],
    ['frotte', 'frotté', 'terry', 'éponge', 'eponge', 'spugna', 'frottee', 'badstof', 'rizo', 'atoalhado'],
    ['polar', 'fleece', 'polaire', 'fleecestoff'],
    ['podszewka', 'lining', 'doublure', 'fodera', 'futter', 'voering', 'forro'],
    ['filc', 'felt', 'feutre', 'feltro', 'filz', 'vilt', 'fieltro'],
    ['zamsz', 'suede', 'suède', 'daim', 'scamosciato', 'wildleder', 'camurça'],
    ['brokat', 'brocade', 'brocart', 'broccato', 'brokaat', 'brocado'],
    ['gaza', 'gauze', '=gaze', 'garza', 'gasa'],
    ['cekiny', 'sequin', 'paillette', 'paillettes', 'paillettato', 'pailletten', 'lentejuelas'],
    ['loden'],
    ['softshell'],
    ['neopren', 'neoprene', 'néoprène', 'scuba'],
    ['kratka', 'krata', 'check', 'tartan', 'carreaux', 'quadri', 'quadretti', '=karo', 'kariert', 'ruit', 'cuadros', 'xadrez', 'plaid', 'vichy', 'gingham'],
    ['paski', 'paseczki', 'stripe', 'stripes', 'rayure', 'rayures', 'righe', 'rigato', 'streifen', 'streep', 'rayas', 'riscas', 'pinstripe', 'gessato'],
    ['kwiaty', 'kwiatowy', 'kwiatki', 'floral', 'flower', 'fleurs', 'fleuri', 'fiori', 'floreale', 'blumen', 'bloemen', 'flores'],
    ['kropki', 'groszki', 'grochy', 'dots', 'polka', '=pois', 'punkte', 'stippen', 'lunares', 'bolinhas'],
    ['pepitka', 'houndstooth', 'pied-de-poule', 'pepita', 'hahnentritt'],
    ['jodełka', 'jodelka', 'herringbone', 'chevron', 'spina', 'fischgrat', 'visgraat', 'espiga'],
    ['haft', 'haftowany', 'embroidered', 'embroidery', 'brodé', 'broderie', 'ricamato', 'ricamo', 'bestickt', 'geborduurd', 'bordado'],
    ['nadruk', 'drukowany', 'printed', 'imprimé', 'stampato', 'stampa', 'bedruckt', 'bedrukt', 'estampado'],
    ['siatka', 'mesh', 'filet', 'netz', 'malla'],
    ['wodoodporny', 'waterproof', 'imperméable', 'impermeabile', 'wasserdicht', 'waterdicht', 'impermeable'],
  ];
  const GROUP_OF = (() => {
    const m = new Map();
    TERM_GROUPS.forEach((g, i) => g.forEach((t) => m.set(t.replace(/^=/, ''), i)));
    return m;
  })();
  /** Grupa słów dla wpisanego słowa: dokładnie albo z polską/obcą końcówką (np. „sztruksowa”, „velvets”). */
  function termGroup(word) {
    if (GROUP_OF.has(word)) return TERM_GROUPS[GROUP_OF.get(word)];
    if (word.length < 5) return null;
    let best = null, bestLen = 0;
    for (const [t, i] of GROUP_OF) {
      if (t.length >= 4 && word.startsWith(t) && t.length > bestLen && !TERM_GROUPS[i].includes('=' + t)) { best = i; bestLen = t.length; }
    }
    return best == null ? null : TERM_GROUPS[best];
  }
  const _tsSafe = (w) => w.replace(/[^\p{L}\p{N}]/gu, '');
  /** Słowo z grupy -> fragment to_tsquery: „=cord” -> cord, „velours côtelé” -> (velours <-> côtelé:*), „tulle” -> tulle:* */
  function _tsTerm(t) {
    if (t.startsWith('=')) return _tsSafe(t.slice(1));
    const words = t.split(/\s+/).map(_tsSafe).filter(Boolean);
    if (!words.length) return '';
    if (words.length === 1) return words[0] + ':*';
    return '(' + words.slice(0, -1).join(' <-> ') + ' <-> ' + words[words.length - 1] + ':*)';
  }

  // Polskie odmiany kolorów i materiałów: rdzeń słowa -> nazwa w bazie („brązowa”, „wełniany”, „jedwabne”)
  const STEM_ALIASES = [
    ['brązow', 'brown'], ['brazow', 'brown'], ['czarn', 'black'], ['biał', 'white'], ['bial', 'white'],
    ['kremow', 'cream'], ['ecru', 'cream'], ['beżow', 'beige'], ['bezow', 'beige'], ['szar', 'grey'], ['popiel', 'grey'],
    ['niebiesk', 'blue'], ['granatow', 'blue'], ['błękit', 'blue'], ['blekit', 'blue'], ['turkusow', 'blue'],
    ['zielon', 'green'], ['oliwkow', 'green'], ['butelkow', 'green'], ['czerwon', 'red'], ['bordow', 'red'], ['burgund', 'red'],
    ['różow', 'pink'], ['rozow', 'pink'], ['łososiow', 'pink'], ['fioletow', 'purple'], ['liliow', 'purple'], ['śliwkow', 'purple'],
    ['żółt', 'yellow'], ['zolt', 'yellow'], ['musztardow', 'yellow'], ['pomarańczow', 'orange'], ['pomaranczow', 'orange'],
    ['rdzaw', 'orange'], ['złot', 'gold'], ['zlot', 'gold'], ['srebrn', 'silver'],
    ['wełnian', 'wool'], ['welnian', 'wool'], ['bawełnian', 'cotton'], ['bawelnian', 'cotton'], ['jedwabn', 'silk'],
    ['lnian', 'linen'], ['wiskozow', 'viscose'], ['kaszmirow', 'cashmere'], ['poliestrow', 'polyester'], ['skórzan', 'leather'],
    ['skorzan', 'leather'], ['moherow', 'mohair'], ['alpak', 'alpaca'], ['konopn', 'hemp'],
  ];
  function aliasWord(w) {
    if (WORD_ALIASES[w]) return WORD_ALIASES[w];
    if (w.length >= 4) for (const [stem, canon] of STEM_ALIASES) if (w.startsWith(stem)) return canon;
    return w;
  }

  function searchWords(q) {
    return String(q || '').toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/).filter((w) => w.length >= 2).slice(0, 6)
      .map(aliasWord);
  }

  /** Czy szukane słowa są w nazwie oferty (do kolejności „najpierw trafienia w nazwie”). */
  function titleMatches(p, q) {
    const words = searchWords(q);
    if (!words.length) return false;
    const tokens = String(p.title || '').toLowerCase().split(/[^\p{L}\p{N}]+/u);
    const hit = (v) => tokens.some((_, i) => v.words.every((vw, k) => {
      const t = tokens[i + k] || '';
      return v.exact || k < v.words.length - 1 ? t === vw : t.startsWith(vw);
    }));
    return words.every((w) => wordVariants(w).some(hit));
  }

  /** Warianty słowa do dopasowania lokalnie (tryb podglądu): całe grupy tłumaczeń. */
  function wordVariants(w) {
    const g = termGroup(w);
    return g ? g.map((t) => ({ t: t.replace(/^=/, ''), exact: t.startsWith('='), words: t.replace(/^=/, '').split(/\s+/) }))
      : [{ t: w, exact: false, words: [w] }];
  }

  /** Zapytanie Postgres to_tsquery: każde słowo jako przedrostek, wszystkie naraz. */
  function tsQuery(q) {
    const parts = searchWords(q).map((w) => {
      const g = termGroup(w);
      if (!g) { const t = _tsSafe(w); return t ? t + ':*' : ''; }
      const alts = [...new Set(g.map(_tsTerm).filter(Boolean))];
      return alts.length > 1 ? '(' + alts.join(' | ') + ')' : alts[0];
    }).filter(Boolean);
    return parts.join(' & ');
  }

  // --- Zapytanie do bazy (Supabase / PostgREST) -------------------------------
  const LIST_FIELDS = 'id,shop_id,title,url,image_url,kind,currency,price_min,price_unit,price_per_m,price_per_m_eur,' +
    'piece_length_m,stock_m,composition,fibers,colors,width_cm,weight_gsm,available,first_seen_at';

  function sinceIso(days, now) {
    return new Date((now || Date.now()) - days * 86400000).toISOString();
  }

  function restParams(f, opts) {
    const n = normalizeFilters(f);
    const o = Object.assign({ page: 0, now: Date.now(), shopsByCountry: {}, since: null, select: LIST_FIELDS }, opts || {});
    const p = [];
    p.push(['select', o.select]);
    p.push(['removed_at', 'is.null']);
    p.push(['available', 'eq.true']);   // „eq”, nie „is”: tak pasuje do częściowego indeksu products_live_idx
    if (n.kind === 'all') p.push(['kind', 'in.(fabric,leather)']);
    else p.push(['kind', 'eq.' + n.kind]);
    if (n.fibers.length && n.purity) {
      // Włókno z udziałem ≥ 50% jest zawsze włóknem głównym, więc wystarczą main_fiber i main_pct.
      p.push(['main_fiber', 'in.(' + n.fibers.join(',') + ')']);
      p.push(['main_pct', 'gte.' + n.purity]);
    } else if (n.fibers.length) p.push(['fibers', 'ov.{' + n.fibers.join(',') + '}']);
    if (n.noSynthetic) p.push(['synthetic_pct', 'lte.' + MAX_SYNTHETIC_PCT]);
    if (n.stockKnown) p.push(['stock_m', 'gte.' + (n.minStock || 0.01)]);
    else if (n.minStock) p.push(['or', '(stock_m.is.null,stock_m.gte.' + n.minStock + ')']);
    if (n.colors.length) p.push(['colors', 'ov.{' + n.colors.join(',') + '}']);
    if (n.maxPrice) p.push(['price_per_m_eur', 'lte.' + n.maxPrice]);
    if (n.minWidth) p.push(['width_cm', 'gte.' + n.minWidth]);
    const shopIds = allowedShops(n, o.shopsByCountry);
    if (shopIds) p.push(['shop_id', 'in.(' + shopIds.join(',') + ')']);
    const since = o.since || (n.newDays ? sinceIso(n.newDays, o.now) : null);
    if (since) p.push(['first_seen_at', 'gt.' + since]);
    const ts = tsQuery(n.q);
    if (ts) p.push(['search', 'fts(simple).' + ts]);
    // Kolejność „najtrafniejsze”: najpierw oferty z szukanym słowem w nazwie (o.title = 'only'), potem reszta ('exclude')
    if (ts && o.title === 'only') p.push(['title_fts', 'fts(simple).' + ts]);
    if (ts && o.title === 'exclude') p.push(['title_fts', 'not.fts(simple).' + ts]);
    if (n.sort === 'price_asc') p.push(['order', 'price_per_m_eur.asc.nullslast,first_seen_at.desc']);
    else if (n.sort === 'price_desc') p.push(['order', 'price_per_m_eur.desc.nullslast,first_seen_at.desc']);
    else p.push(['order', 'first_seen_at.desc,id.asc']);
    p.push(['limit', String(PAGE_SIZE)]);
    p.push(['offset', String(o.page * PAGE_SIZE)]);
    return p;
  }

  /** Sklepy dopuszczone przez filtry sklepów i krajów; null = wszystkie. */
  function allowedShops(n, shopsByCountry) {
    let ids = null;
    if (n.countries.length) {
      ids = [];
      for (const c of n.countries) ids.push(...(shopsByCountry[c] || []));
      if (!ids.length) ids = ['__none__'];
    }
    if (n.shops.length) ids = ids ? ids.filter((x) => n.shops.includes(x)) : n.shops.slice();
    if (ids && !ids.length) ids = ['__none__'];
    return ids ? Array.from(new Set(ids)).sort() : null;
  }

  function toQueryString(params) {
    return params.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  }

  // --- To samo filtrowanie lokalnie (tryb podglądu bez bazy) -----------------
  function matchLocal(p, f, opts) {
    const n = normalizeFilters(f);
    const o = Object.assign({ now: Date.now(), shopsByCountry: {}, since: null }, opts || {});
    if (p.removed_at || !p.available) return false;
    if (n.kind === 'all' ? !['fabric', 'leather'].includes(p.kind) : p.kind !== n.kind) return false;
    if (n.fibers.length && !(p.fibers || []).some((x) => n.fibers.includes(x))) return false;
    const comp = p.composition && Object.keys(p.composition).length ? p.composition : null;
    if (n.purity && !(comp && n.fibers.some((x) => (comp[x] || 0) >= n.purity))) return false;
    if (n.noSynthetic && !(comp && syntheticShare(comp) <= MAX_SYNTHETIC_PCT)) return false;
    const stock = p.stock_m == null ? null : Number(p.stock_m);
    if (n.stockKnown && stock == null) return false;
    if (n.minStock && stock != null && stock < n.minStock) return false;
    if (n.colors.length && !(p.colors || []).some((x) => n.colors.includes(x))) return false;
    if (n.maxPrice && !(p.price_per_m_eur != null && p.price_per_m_eur <= n.maxPrice)) return false;
    if (n.minWidth && !(p.width_cm != null && p.width_cm >= n.minWidth)) return false;
    const shopIds = allowedShops(n, o.shopsByCountry);
    if (shopIds && !shopIds.includes(p.shop_id)) return false;
    const since = o.since || (n.newDays ? sinceIso(n.newDays, o.now) : null);
    if (since && !(p.first_seen_at && p.first_seen_at > since)) return false;
    const words = searchWords(n.q);
    if (words.length) {
      const hay = ((p.search_text || p.title || '') + ' ' + (p.fibers || []).join(' ') + ' ' + (p.colors || []).join(' ')).toLowerCase();
      const tokens = hay.split(/[^\p{L}\p{N}]+/u);
      const hit = (v) => tokens.some((_, i) => v.words.every((vw, k) => {
        const t = tokens[i + k] || '';
        return v.exact || k < v.words.length - 1 ? t === vw : t.startsWith(vw);
      }));
      if (!words.every((w) => wordVariants(w).some(hit))) return false;
    }
    return true;
  }

  /** Suma udziałów włókien syntetycznych w składzie (%). */
  function syntheticShare(comp) {
    return SYNTHETIC.reduce((sum, k) => sum + (Number(comp[k]) || 0), 0);
  }

  function sortLocal(list, sort) {
    const byNew = (a, b) => (b.first_seen_at || '').localeCompare(a.first_seen_at || '') || a.id.localeCompare(b.id);
    const price = (x) => (x.price_per_m_eur == null ? null : x.price_per_m_eur);
    const arr = list.slice();
    if (sort === 'price_asc' || sort === 'price_desc') {
      const dir = sort === 'price_asc' ? 1 : -1;
      arr.sort((a, b) => {
        const pa = price(a), pb = price(b);
        if (pa == null && pb == null) return byNew(a, b);
        if (pa == null) return 1;
        if (pb == null) return -1;
        return (pa - pb) * dir || byNew(a, b);
      });
    } else arr.sort(byNew);
    return arr;
  }

  // --- Ceny i opisy -----------------------------------------------------------
  const CURRENCY_SIGN = { EUR: '€', GBP: '£', CHF: 'CHF', SEK: 'kr', DKK: 'kr', PLN: 'zł', USD: '$' };

  function money(value, currency, lang) {
    if (value == null || isNaN(value)) return '';
    const locale = lang === 'pl' ? 'pl-PL' : 'en-GB';
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'EUR', currencyDisplay: 'narrowSymbol', maximumFractionDigits: value < 100 ? 2 : 0 }).format(value);
    } catch (e) {
      return value.toFixed(2) + ' ' + (CURRENCY_SIGN[currency] || currency || '');
    }
  }

  /** Najważniejsza cena na karcie: za metr, jeśli ją znamy. */
  function priceParts(p, lang) {
    const cur = p.currency || 'EUR';
    if (p.price_per_m != null) {
      const main = money(p.price_per_m, cur, lang);
      const eur = cur !== 'EUR' && p.price_per_m_eur != null ? money(p.price_per_m_eur, 'EUR', lang) : null;
      return { main, unit: 'per_m', eur, piece: p.price_unit === 'piece' ? p.piece_length_m : null, total: p.price_unit === 'piece' ? money(p.price_min, cur, lang) : null };
    }
    return { main: money(p.price_min, cur, lang), unit: p.kind === 'leather' ? 'leather' : 'unknown', eur: null, piece: null, total: null };
  }

  function compositionText(p, lang) {
    const names = Object.fromEntries(FIBERS.map((f) => [f.id, lang === 'pl' ? f.pl : f.en]));
    if (p.composition && Object.keys(p.composition).length) {
      return Object.entries(p.composition)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${Math.round(v * 10) / 10}% ${(names[k] || k).toLowerCase()}`)
        .join(', ');
    }
    if (p.fibers && p.fibers.length) return p.fibers.map((k) => names[k] || k).join(', ');
    return '';
  }

  function imageUrl(url, width) {
    if (!url) return '';
    if (/cdn\.shopify\.com|\/cdn\/shop\//.test(url)) {
      return url + (url.includes('?') ? '&' : '?') + 'width=' + (width || 480);
    }
    return url;
  }

  // --- Pamięć na telefonie: ulubione i alerty ---------------------------------
  function readJson(storage, key, fallback) {
    try {
      const v = JSON.parse(storage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function writeJson(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch (e) { /* pełna pamięć: pomijamy */ }
  }

  function makeFavorites(storage) {
    const KEY = 'remna-ulubione';
    let items = readJson(storage, KEY, []);   // [{id, ...podgląd, savedAt}]
    if (!Array.isArray(items)) items = [];
    const save = () => writeJson(storage, KEY, items);
    return {
      list: () => items.slice(),
      has: (id) => items.some((x) => x.id === id),
      toggle(product) {
        if (items.some((x) => x.id === product.id)) items = items.filter((x) => x.id !== product.id);
        else items.unshift(Object.assign({}, product, { savedAt: new Date().toISOString() }));
        save();
        return items.some((x) => x.id === product.id);
      },
      update(product) {   // świeże dane (cena, dostępność) z bazy
        const i = items.findIndex((x) => x.id === product.id);
        if (i >= 0) { items[i] = Object.assign({}, items[i], product); save(); }
      },
    };
  }

  const MAX_ALERTS = 20;

  function makeAlerts(storage, now) {
    const KEY = 'remna-alerty';
    const clock = now || (() => Date.now());
    let items = readJson(storage, KEY, []);   // [{id, name, filters, createdAt, seenAt, newCount}]
    if (!Array.isArray(items)) items = [];
    const save = () => writeJson(storage, KEY, items);
    return {
      list: () => items.slice(),
      find: (filters) => items.find((a) => filtersKey(a.filters) === filtersKey(filters)) || null,
      add(name, filters) {
        const existing = this.find(filters);
        if (existing) return existing;
        if (items.length >= MAX_ALERTS) return null;
        const iso = new Date(clock()).toISOString();
        const a = { id: 'a' + clock().toString(36) + Math.random().toString(36).slice(2, 6), name: String(name || '').slice(0, 60), filters: normalizeFilters(filters), createdAt: iso, seenAt: iso, newCount: 0 };
        items.unshift(a);
        save();
        return a;
      },
      remove(id) { items = items.filter((a) => a.id !== id); save(); },
      rename(id, name) { const a = items.find((x) => x.id === id); if (a) { a.name = String(name).slice(0, 60); save(); } },
      setNewCount(id, n) { const a = items.find((x) => x.id === id); if (a && a.newCount !== n) { a.newCount = n; save(); } },
      markSeen(id) { const a = items.find((x) => x.id === id); if (a) { a.seenAt = new Date(clock()).toISOString(); a.newCount = 0; save(); } },
      totalNew: () => items.reduce((s, a) => s + (a.newCount || 0), 0),
    };
  }

  /** Domyślna nazwa alertu z ustawionych filtrów, np. „Jedwab, niebieski, do 40 €/m”. */
  function describeFilters(f, lang, shopsById) {
    const n = normalizeFilters(f);
    const L = lang === 'pl' ? 'pl' : 'en';
    const parts = [];
    if (n.q) parts.push('„' + n.q + '”');
    if (n.kind === 'leather') parts.push(L === 'pl' ? 'skóry' : 'leather');
    const fiberNames = n.fibers.map((id) => FIBERS.find((f2) => f2.id === id)).filter(Boolean).map((x) => x[L].toLowerCase());
    if (n.purity && fiberNames.length) {
      const joined = fiberNames.join(L === 'pl' ? ' lub ' : ' or ');
      parts.push(n.purity === 100 ? '100% ' + joined : (L === 'pl' ? 'min. ' : 'min. ') + n.purity + '% ' + joined);
    } else parts.push(...fiberNames);
    if (n.noSynthetic) parts.push(L === 'pl' ? 'bez syntetyków' : 'no synthetics');
    if (n.minStock) parts.push((L === 'pl' ? 'min. ' : 'min. ') + n.minStock + ' m');
    for (const id of n.colors) { const x = COLORS.find((c) => c.id === id); if (x) parts.push(x[L].toLowerCase()); }
    if (n.maxPrice) parts.push((L === 'pl' ? 'do ' : 'up to ') + n.maxPrice + ' €/m');
    if (n.minWidth) parts.push((L === 'pl' ? 'szer. od ' : 'width from ') + n.minWidth + ' cm');
    if (n.countries.length) parts.push(n.countries.join(', '));
    if (n.shops.length) parts.push(n.shops.map((s) => (shopsById && shopsById[s] ? shopsById[s].name : s)).join(', '));
    const text = parts.join(', ');
    if (!text) return L === 'pl' ? 'Wszystkie nowe tkaniny' : 'All new fabrics';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // --- Sprawdzanie dostępności w sklepie (z telefonu, jedno zapytanie na otwarcie oferty) ---
  /** Adres, pod którym sklep Shopify podaje dane jednego produktu (z dostępnością). */
  function liveCheckUrl(url) {
    const m = /^(https:\/\/[^/?#]+\/products\/[^/?#]+)/.exec(String(url || ''));
    return m ? m[1] + '.js' : null;
  }

  /**
   * Odpowiedź sklepu → 'available' | 'soldout' | 'gone' | null (nie wiadomo).
   * Ceny nie porównujemy: Shopify potrafi pokazać ją w walucie kraju telefonu.
   */
  function readLiveCheck(status, body) {
    if (status === 404 || status === 410) return 'gone';
    if (status !== 200 || !body || typeof body !== 'object') return null;
    if (typeof body.available === 'boolean') return body.available ? 'available' : 'soldout';
    if (Array.isArray(body.variants) && body.variants.length) {
      return body.variants.some((v) => v && v.available) ? 'available' : 'soldout';
    }
    return null;
  }

  const api = {
    FIBERS, COLORS, MAX_PRICE_STEPS, MIN_WIDTH_STEPS, SORTS, PAGE_SIZE, LIST_FIELDS,
    PURITY_STEPS, SYNTHETIC, MAX_SYNTHETIC_PCT, syntheticShare, MIN_STOCK_STEPS,
    defaultFilters, normalizeFilters, countActive, filtersKey, searchWords, tsQuery, termGroup, titleMatches,
    restParams, toQueryString, allowedShops, matchLocal, sortLocal,
    money, priceParts, compositionText, imageUrl,
    makeFavorites, makeAlerts, describeFilters, MAX_ALERTS,
    liveCheckUrl, readLiveCheck,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Remna = api;
})(typeof window !== 'undefined' ? window : globalThis);
