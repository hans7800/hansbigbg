/* Accès aux données externes : Banque mondiale (indicateurs), Frankfurter/BCE (devises),
   Google Actualités RSS ou GNews.io (actualités). Tout est mis en cache dans localStorage. */
(function () {
  'use strict';

  const WB = 'https://api.worldbank.org/v2';
  const FX = 'https://api.frankfurter.app';

  const INDICATORS = [
    { id: 'NY.GDP.MKTP.CD',    label: 'PIB (nominal)',          fmt: 'money' },
    { id: 'NY.GDP.MKTP.KD.ZG', label: 'Croissance du PIB',      fmt: 'pct', signed: true },
    { id: 'NY.GDP.PCAP.CD',    label: 'PIB par habitant',       fmt: 'money' },
    { id: 'FP.CPI.TOTL.ZG',    label: 'Inflation (IPC)',        fmt: 'pct', invert: true },
    { id: 'SL.UEM.TOTL.ZS',    label: 'Chômage',                fmt: 'pct' },
    { id: 'SP.POP.TOTL',       label: 'Population',             fmt: 'count' },
    { id: 'GC.DOD.TOTL.GD.ZS', label: 'Dette publique (% PIB)', fmt: 'pct' },
    { id: 'BN.CAB.XOKA.GD.ZS', label: 'Balance courante (% PIB)', fmt: 'pct', signed: true },
    { id: 'NE.EXP.GNFS.ZS',    label: 'Exportations (% PIB)',   fmt: 'pct' },
    { id: 'BX.KLT.DINV.WD.GD.ZS', label: 'IDE entrants (% PIB)', fmt: 'pct' },
  ];

  // Devise principale de chaque pays (codes ISO 4217), limitée aux devises cotées par la BCE.
  const EURO = ['AT','BE','CY','DE','EE','ES','FI','FR','GR','HR','IE','IT','LT','LU','LV','MT','NL','PT','SI','SK'];
  const CURRENCY = {
    US: 'USD', GB: 'GBP', JP: 'JPY', CN: 'CNY', CH: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD',
    SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN',
    IS: 'ISK', TR: 'TRY', IL: 'ILS', IN: 'INR', ID: 'IDR', KR: 'KRW', MY: 'MYR', PH: 'PHP',
    SG: 'SGD', TH: 'THB', ZA: 'ZAR', BR: 'BRL', MX: 'MXN', HK: 'HKD',
  };
  EURO.forEach(c => CURRENCY[c] = 'EUR');

  const CURRENCY_NAMES = {
    EUR: 'Euro', USD: 'Dollar américain', GBP: 'Livre sterling', JPY: 'Yen', CNY: 'Yuan', CHF: 'Franc suisse',
    CAD: 'Dollar canadien', AUD: 'Dollar australien', NZD: 'Dollar néo-zélandais', SEK: 'Couronne suédoise',
    NOK: 'Couronne norvégienne', DKK: 'Couronne danoise', PLN: 'Złoty', CZK: 'Couronne tchèque', HUF: 'Forint',
    RON: 'Leu roumain', BGN: 'Lev', ISK: 'Couronne islandaise', TRY: 'Livre turque', ILS: 'Shekel', INR: 'Roupie indienne',
    IDR: 'Roupie indonésienne', KRW: 'Won', MYR: 'Ringgit', PHP: 'Peso philippin', SGD: 'Dollar de Singapour',
    THB: 'Baht', ZAR: 'Rand', BRL: 'Réal', MXN: 'Peso mexicain', HKD: 'Dollar de Hong Kong',
  };

  /* ---------- cache ---------- */
  function cacheGet(key, maxAgeMs) {
    try {
      const raw = localStorage.getItem('gfg:' + key);
      if (!raw) return null;
      const { t, v } = JSON.parse(raw);
      if (Date.now() - t > maxAgeMs) return null;
      return v;
    } catch (e) { return null; }
  }
  function cacheSet(key, v) {
    try { localStorage.setItem('gfg:' + key, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* quota */ }
  }
  async function cached(key, maxAgeMs, fn) {
    const hit = cacheGet(key, maxAgeMs);
    if (hit) return hit;
    const v = await fn();
    cacheSet(key, v);
    return v;
  }

  function fetchWithTimeout(url, ms, opts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, Object.assign({ signal: ctrl.signal }, opts || {})).finally(() => clearTimeout(t));
  }

  /* ---------- Banque mondiale ---------- */
  async function fetchCountryProfile(iso2) {
    return cached('wb:profile:' + iso2, 7 * 864e5, async () => {
      const r = await fetchWithTimeout(`${WB}/country/${iso2}?format=json`, 15000);
      if (!r.ok) throw new Error('Banque mondiale : ' + r.status);
      const j = await r.json();
      const c = j && j[1] && j[1][0];
      if (!c) throw new Error('Pays inconnu de la Banque mondiale');
      return {
        name: c.name,
        capital: c.capitalCity || null,
        region: c.region && c.region.value,
        income: c.incomeLevel && c.incomeLevel.value,
        lat: parseFloat(c.latitude), lng: parseFloat(c.longitude),
      };
    });
  }

  async function fetchIndicators(iso2) {
    return cached('wb:ind:' + iso2, 6 * 3600e3, async () => {
      const ids = INDICATORS.map(i => i.id).join(';');
      const url = `${WB}/country/${iso2}/indicator/${ids}?source=2&format=json&mrv=25&per_page=400`;
      const r = await fetchWithTimeout(url, 20000);
      if (!r.ok) throw new Error('Banque mondiale : ' + r.status);
      const j = await r.json();
      const rows = Array.isArray(j) && Array.isArray(j[1]) ? j[1] : [];
      const out = {};
      for (const row of rows) {
        const id = row.indicator && row.indicator.id;
        if (!id) continue;
        if (!out[id]) out[id] = { series: [] };
        if (row.value !== null && row.value !== undefined) {
          out[id].series.push({ year: +row.date, value: row.value });
        }
      }
      for (const id of Object.keys(out)) {
        out[id].series.sort((a, b) => a.year - b.year);
        const last = out[id].series[out[id].series.length - 1];
        out[id].latest = last || null;
        const prev = out[id].series[out[id].series.length - 2];
        out[id].previous = prev || null;
      }
      return out;
    });
  }

  /* ---------- Devises (BCE via Frankfurter) ---------- */
  async function fetchFxLatest(base, symbols) {
    return cached(`fx:${base}:${symbols.join(',')}`, 30 * 60e3, async () => {
      const r = await fetchWithTimeout(`${FX}/latest?from=${base}&to=${symbols.join(',')}`, 12000);
      if (!r.ok) throw new Error('Frankfurter : ' + r.status);
      return r.json();
    });
  }
  async function fetchFxHistory(base, symbol, days) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 864e5);
    const f = d => d.toISOString().slice(0, 10);
    return cached(`fxh:${base}:${symbol}:${f(end)}`, 6 * 3600e3, async () => {
      const r = await fetchWithTimeout(`${FX}/${f(start)}..${f(end)}?from=${base}&to=${symbol}`, 12000);
      if (!r.ok) throw new Error('Frankfurter : ' + r.status);
      const j = await r.json();
      return Object.keys(j.rates).sort().map(d => ({ date: d, value: j.rates[d][symbol] }));
    });
  }

  /* ---------- Actualités ---------- */
  function newsQuery(country, lang) {
    if (lang === 'en') return `"${country.en}" (economy OR finance OR GDP OR "central bank" OR inflation OR markets)`;
    return `"${country.fr}" (économie OR finance OR PIB OR bourse OR inflation OR "banque centrale")`;
  }
  function googleNewsUrl(country, lang) {
    const q = encodeURIComponent(newsQuery(country, lang));
    const loc = lang === 'en' ? 'hl=en-US&gl=US&ceid=US:en' : 'hl=fr&gl=FR&ceid=FR:fr';
    return `https://news.google.com/rss/search?q=${q}&${loc}`;
  }

  // Relais CORS publics, essayés dans l'ordre.
  const PROXIES = [
    u => ({ url: 'https://api.allorigins.win/get?url=' + encodeURIComponent(u), json: true }),
    u => ({ url: 'https://corsproxy.io/?' + encodeURIComponent(u), json: false }),
    u => ({ url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u), json: false }),
  ];

  function parseRss(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Flux RSS illisible');
    const items = [...doc.querySelectorAll('item')].slice(0, 12);
    const txt = (el, sel) => { const n = el.querySelector(sel); return n ? n.textContent.trim() : ''; };
    return items.map(it => {
      let title = txt(it, 'title');
      let source = txt(it, 'source');
      const dash = title.lastIndexOf(' - ');
      if (!source && dash > 0) { source = title.slice(dash + 3); }
      if (dash > 0) title = title.slice(0, dash);
      return { title, source, link: txt(it, 'link'), date: txt(it, 'pubDate') };
    });
  }

  async function fetchRssViaProxies(rssUrl) {
    let lastErr;
    for (const p of PROXIES) {
      const { url, json } = p(rssUrl);
      try {
        const r = await fetchWithTimeout(url, 12000);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        let text;
        if (json) { const j = await r.json(); text = j.contents; } else { text = await r.text(); }
        if (!text || text.length < 50) throw new Error('Réponse vide');
        const items = parseRss(text);
        if (items.length) return items;
        return [];
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Aucun relais disponible');
  }

  async function fetchGNews(country, lang, apiKey) {
    const q = encodeURIComponent(lang === 'en'
      ? `${country.en} economy OR finance OR GDP OR inflation`
      : `${country.fr} économie OR finance OR PIB OR inflation`);
    const url = `https://gnews.io/api/v4/search?q=${q}&lang=${lang}&max=10&sortby=publishedAt&apikey=${encodeURIComponent(apiKey)}`;
    const r = await fetchWithTimeout(url, 12000);
    if (!r.ok) throw new Error('GNews : ' + r.status);
    const j = await r.json();
    return (j.articles || []).map(a => ({
      title: a.title, source: a.source && a.source.name, link: a.url, date: a.publishedAt, image: a.image,
    }));
  }

  async function fetchNews(country, lang, apiKey) {
    return cached(`news:${lang}:${country.a2}:${apiKey ? 'g' : 'r'}`, 10 * 60e3, async () => {
      if (apiKey) {
        try { return await fetchGNews(country, lang, apiKey); } catch (e) { /* on bascule sur le RSS */ }
      }
      return fetchRssViaProxies(googleNewsUrl(country, lang));
    });
  }

  window.GeoData = {
    INDICATORS, CURRENCY, CURRENCY_NAMES,
    fetchCountryProfile, fetchIndicators, fetchFxLatest, fetchFxHistory, fetchNews, googleNewsUrl,
  };
})();
