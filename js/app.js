/* GeoFinance Globe — globe 3D temps réel + fiche économique et actualités par pays. */
(function () {
  'use strict';

  const D = window.GeoData;
  const $ = sel => document.querySelector(sel);

  /* ---------- Pays non couverts par l'index ISO (identifiés par leur nom dans world-atlas) ---------- */
  const EXTRA_BY_NAME = {
    'Kosovo': { a2: 'XK', a3: 'XKX', fr: 'Kosovo', en: 'Kosovo' },
  };
  const ANTARCTICA_ID = '010';

  const REGION_FR = {
    'Europe & Central Asia': 'Europe et Asie centrale', 'East Asia & Pacific': 'Asie de l’Est et Pacifique',
    'Latin America & Caribbean': 'Amérique latine et Caraïbes', 'Middle East & North Africa': 'Moyen-Orient et Afrique du Nord',
    'Middle East, North Africa, Afghanistan & Pakistan': 'Moyen-Orient, Afrique du Nord, Afghanistan et Pakistan',
    'North America': 'Amérique du Nord', 'South Asia': 'Asie du Sud', 'Sub-Saharan Africa': 'Afrique subsaharienne',
  };
  const INCOME_FR = {
    'High income': 'Revenu élevé', 'Upper middle income': 'Revenu intermédiaire supérieur',
    'Lower middle income': 'Revenu intermédiaire inférieur', 'Low income': 'Revenu faible', 'Not classified': 'Non classé',
  };
  const QUICK = ['US', 'CN', 'JP', 'DE', 'FR', 'GB', 'IN', 'BR'];
  const SHORT_FR = { US: 'États-Unis', GB: 'Royaume-Uni', KR: 'Corée du Sud', RU: 'Russie', IR: 'Iran', SY: 'Syrie', VE: 'Venezuela', BO: 'Bolivie', TZ: 'Tanzanie', LA: 'Laos', CD: 'RD Congo', CG: 'Congo', VN: 'Vietnam', MK: 'Macédoine du Nord', FM: 'Micronésie' };

  /* ---------- Formatage ---------- */
  const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  function fmtMoney(v) {
    const a = Math.abs(v);
    if (a >= 1e12) return nf2.format(v / 1e12) + ' T$';
    if (a >= 1e9) return nf1.format(v / 1e9) + ' Md$';
    if (a >= 1e6) return nf1.format(v / 1e6) + ' M$';
    return nf0.format(v) + ' $';
  }
  function fmtCount(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return nf2.format(v / 1e9) + ' Md';
    if (a >= 1e6) return nf1.format(v / 1e6) + ' M';
    return nf0.format(v);
  }
  function fmtPct(v, signed) { return (signed && v > 0 ? '+' : '') + nf1.format(v) + ' %'; }
  function fmtValue(ind, v) {
    if (ind.fmt === 'money') return fmtMoney(v);
    if (ind.fmt === 'count') return fmtCount(v);
    return fmtPct(v, ind.signed);
  }
  function fmtRate(v) {
    if (v >= 100) return nf2.format(v);
    if (v >= 10) return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v);
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v);
  }
  function fmtDate(s) {
    const d = new Date(s);
    if (isNaN(d)) return '';
    return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  const flagUrl = a2 => `https://flagcdn.com/w80/${a2.toLowerCase()}.png`;

  /* ---------- Géométrie ---------- */
  function ringArea(ring) { // aire signée approximative en degrés² (suffisant pour choisir le plus grand polygone)
    let s = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s / 2);
  }
  function mainPolygon(geom) {
    if (geom.type === 'Polygon') return geom.coordinates;
    let best = null, bestA = -1;
    for (const poly of geom.coordinates) {
      const a = ringArea(poly[0]);
      if (a > bestA) { bestA = a; best = poly; }
    }
    return best;
  }
  function focusOf(geom) {
    const ring = mainPolygon(geom)[0];
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    let hasEast = false, hasWest = false;
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lng > 150) hasEast = true; if (lng < -150) hasWest = true;
    }
    let lng = (minLng + maxLng) / 2;
    let lngSpan = maxLng - minLng;
    if (hasEast && hasWest) { // polygone à cheval sur l'antiméridien
      let mn = 360, mx = 0;
      for (const [l] of ring) { const w = l < 0 ? l + 360 : l; if (w < mn) mn = w; if (w > mx) mx = w; }
      lng = (mn + mx) / 2; if (lng > 180) lng -= 360;
      lngSpan = mx - mn;
    }
    const lat = (minLat + maxLat) / 2;
    const extent = Math.max(maxLat - minLat, lngSpan * Math.cos(lat * Math.PI / 180));
    const altitude = Math.min(2.5, Math.max(0.4, 0.4 + extent / 45));
    return { lat, lng, altitude };
  }
  function pointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function pointInGeom(lng, lat, geom) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) {
      if (pointInRing(lng, lat, poly[0])) {
        let inHole = false;
        for (let k = 1; k < poly.length; k++) if (pointInRing(lng, lat, poly[k])) { inHole = true; break; }
        if (!inHole) return true;
      }
    }
    return false;
  }

  /* ---------- Soleil (point subsolaire, algorithme NOAA simplifié) ---------- */
  function subsolarPoint(date) {
    const rad = Math.PI / 180;
    const start = Date.UTC(date.getUTCFullYear(), 0, 1);
    const doy = Math.floor((date - start) / 864e5) + 1;
    const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    const g = 2 * Math.PI / 365 * (doy - 1 + (hours - 12) / 24);
    const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    let lng = -(hours * 60 + eqtime - 720) / 4;
    while (lng > 180) lng -= 360; while (lng < -180) lng += 360;
    return { lat: decl / rad, lng };
  }

  /* ---------- État ---------- */
  const state = {
    features: [], byA2: {}, hovered: null, selected: null, token: 0,
    autoRotate: true, viewOffset: 0, lang: localStorage.getItem('gfg:lang') || 'fr', gnewsKey: localStorage.getItem('gfg:gnews') || '',
  };
  let globe;

  /* ---------- Chargement des pays ---------- */
  async function loadCountries() {
    const topo = await fetch('data/countries-110m.json').then(r => r.json());
    const fc = topojson.feature(topo, topo.objects.countries);
    const feats = [];
    for (const f of fc.features) {
      const id = f.id != null ? String(f.id) : null;
      if (id === ANTARCTICA_ID) continue;
      const idx = (id && window.COUNTRY_INDEX[id]) || EXTRA_BY_NAME[f.properties.name] || null;
      f.props = idx
        ? { a2: idx.a2, a3: idx.a3, fr: SHORT_FR[idx.a2] || idx.fr, en: idx.en, known: true }
        : { a2: null, a3: null, fr: f.properties.name, en: f.properties.name, known: false };
      f.focus = focusOf(f.geometry);
      feats.push(f);
      if (idx) state.byA2[idx.a2] = f;
    }
    feats.sort((a, b) => a.props.fr.localeCompare(b.props.fr, 'fr'));
    state.features = feats;
  }

  /* ---------- Globe ---------- */
  function initGlobe() {
    const el = $('#globe');
    globe = Globe()(el)
      .globeImageUrl('assets/earth-blue-marble.jpg')
      .bumpImageUrl('assets/earth-topology.png')
      .backgroundImageUrl('assets/night-sky.png')
      .showAtmosphere(true)
      .atmosphereColor('#4da3ff')
      .atmosphereAltitude(0.2)
      .polygonsData(state.features)
      .polygonAltitude(d => d === state.selected ? 0.012 : d === state.hovered ? 0.01 : 0.004)
      .polygonCapColor(d => d === state.selected ? 'rgba(255, 181, 71, 0.32)' : d === state.hovered ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.02)')
      .polygonSideColor(d => d === state.selected ? 'rgba(255, 181, 71, 0.25)' : 'rgba(0,0,0,0)')
      .polygonStrokeColor(() => 'rgba(255,255,255,0.35)')
      .polygonLabel(d => `<div class="globe-tip">${d.props.a2 ? `<img src="${flagUrl(d.props.a2)}" alt="">` : ''}<b>${esc(d.props.fr)}</b></div>`)
      .polygonsTransitionDuration(150)
      .onPolygonHover(d => { state.hovered = d; el.style.cursor = d ? 'pointer' : 'grab'; globe.polygonAltitude(globe.polygonAltitude()).polygonCapColor(globe.polygonCapColor()); })
      .onPolygonClick(d => selectCountry(d, true))
      .htmlElementsData([{ kind: 'sun', lat: 0, lng: 0 }])
      .htmlLat(d => d.lat).htmlLng(d => d.lng).htmlAltitude(0.03)
      .htmlElement(() => { const s = document.createElement('div'); s.className = 'sun-marker'; s.textContent = '☀'; s.title = 'Soleil au zénith'; return s; })
      .onZoom(onZoom);

    window.GeoGlobe = globe; // accès console / débogage
    globe.pointOfView({ lat: 25, lng: 10, altitude: 2.4 }, 0);
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.minDistance = 120;
    controls.enableDamping = true;

    // Éclairage réaliste : lumière ambiante faible + lumière directionnelle placée au point subsolaire.
    const lights = globe.lights();
    lights.forEach(l => { if (l.isAmbientLight) l.intensity = 0.9; });
    updateSun();
    setInterval(updateSun, 30000);

    window.addEventListener('resize', () => globe.width(window.innerWidth).height(window.innerHeight));
    ['pointerdown', 'wheel'].forEach(ev => el.addEventListener(ev, () => $('#hint').classList.add('fade'), { once: true }));
  }

  function updateSun() {
    const now = new Date();
    const sp = subsolarPoint(now);
    const pos = globe.getCoords(sp.lat, sp.lng, 4);
    globe.lights().forEach(l => { if (l.isDirectionalLight) { l.position.set(pos.x, pos.y, pos.z); l.intensity = 2.4; } });
    const sun = globe.htmlElementsData()[0];
    sun.lat = sp.lat; sun.lng = sp.lng;
    globe.htmlElementsData([sun]);
    $('#sun-info').textContent = `☀ ${nf1.format(Math.abs(sp.lat))}°${sp.lat >= 0 ? 'N' : 'S'} ${nf1.format(Math.abs(sp.lng))}°${sp.lng >= 0 ? 'E' : 'O'}`;
  }

  let zoomTimer = null;
  function onZoom(pov) {
    if (zoomTimer) clearTimeout(zoomTimer);
    zoomTimer = setTimeout(() => {
      if (pov.altitude > 0.75) return;
      const f = state.features.find(x => pointInGeom(pov.lng, pov.lat, x.geometry));
      if (!f || f === state.selected) return;
      // le pays sélectionné reste valide s'il est sous le point de vue corrigé du décalage du panneau
      if (state.selected && state.viewOffset && pointInGeom(pov.lng - state.viewOffset, pov.lat, state.selected.geometry)) return;
      selectCountry(f, false);
    }, 300);
  }

  /* ---------- Sélection ---------- */
  function selectCountry(f, fly) {
    if (!f) return;
    state.selected = f;
    state.token++;
    globe.controls().autoRotate = false;
    $('#btn-rotate').setAttribute('aria-pressed', 'false');
    globe.polygonAltitude(globe.polygonAltitude()).polygonCapColor(globe.polygonCapColor()).polygonSideColor(globe.polygonSideColor());
    if (fly) {
      const offset = window.innerWidth > 900 ? 6 * f.focus.altitude : 0; // décale la vue pour laisser la place au panneau
      state.viewOffset = offset;
      globe.pointOfView({ lat: f.focus.lat, lng: f.focus.lng + offset, altitude: f.focus.altitude }, 1200);
    }
    renderPanel(f, state.token);
    $('#search').value = f.props.fr;
    $('#hint').classList.add('fade');
  }

  function resetView() {
    state.selected = null;
    state.token++;
    globe.polygonAltitude(globe.polygonAltitude()).polygonCapColor(globe.polygonCapColor()).polygonSideColor(globe.polygonSideColor());
    globe.pointOfView({ lat: 25, lng: globe.pointOfView().lng, altitude: 2.4 }, 1000);
    globe.controls().autoRotate = true;
    state.autoRotate = true;
    $('#btn-rotate').setAttribute('aria-pressed', 'true');
    $('#panel').classList.add('hidden');
  }

  /* ---------- Panneau ---------- */
  function renderPanel(f, token) {
    const p = f.props;
    const panel = $('#panel');
    const body = $('#panel-body');
    panel.classList.remove('hidden');
    body.scrollTop = 0;
    body.innerHTML = `
      <div class="country-head">
        ${p.a2 ? `<img src="${flagUrl(p.a2)}" alt="Drapeau">` : ''}
        <div>
          <h2>${esc(p.fr)}</h2>
          <div class="meta" id="c-meta">${p.known ? '<span class="loading">Chargement du profil…</span>' : 'Territoire sans données Banque mondiale'}</div>
        </div>
      </div>
      <div class="tags" id="c-tags"></div>
      <section class="block"><h3>Indicateurs clés <span class="src">Banque mondiale</span></h3><div id="c-kpis"><div class="loading">Chargement des indicateurs…</div></div></section>
      <section class="block" id="c-gdp"></section>
      <section class="block" id="c-fx"></section>
      <section class="block"><h3>Actualités financières <span class="src" id="c-news-src">${state.gnewsKey ? 'GNews' : 'Google Actualités'}</span></h3><div id="c-news"><div class="loading">Recherche des dernières actualités…</div></div></section>`;

    if (!p.known) {
      $('#c-kpis').innerHTML = '<div class="muted small">Aucune donnée disponible pour ce territoire.</div>';
      $('#c-news').innerHTML = '<div class="muted small">Aucune actualité disponible.</div>';
      return;
    }
    const alive = () => token === state.token;

    D.fetchCountryProfile(p.a2).then(pr => {
      if (!alive()) return;
      const meta = [pr.capital, REGION_FR[pr.region] || pr.region].filter(Boolean).join(' · ');
      $('#c-meta').textContent = meta || '—';
      const tags = [];
      if (pr.income) tags.push(INCOME_FR[pr.income] || pr.income);
      const cur = D.CURRENCY[p.a2];
      if (cur) tags.push(`${D.CURRENCY_NAMES[cur] || cur} (${cur})`);
      tags.push(`ISO ${p.a2} / ${p.a3}`);
      $('#c-tags').innerHTML = tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');
    }).catch(() => { if (alive()) $('#c-meta').textContent = 'Profil indisponible'; });

    D.fetchIndicators(p.a2).then(ind => {
      if (!alive()) return;
      renderKpis(ind);
      renderGdpChart(ind);
    }).catch(e => { if (alive()) $('#c-kpis').innerHTML = `<div class="error">Indicateurs indisponibles (${esc(e.message)}).</div>`; });

    renderFx(p, alive);
    renderNews(p, alive);
  }

  function renderKpis(ind) {
    const cells = D.INDICATORS.map((i, idx) => {
      const d = ind[i.id];
      const latest = d && d.latest;
      let cls = '', delta = '';
      if (latest && i.signed) cls = latest.value >= 0 ? 'pos' : 'neg';
      if (latest && d.previous && i.fmt !== 'count' && !i.signed) {
        const diff = latest.value - d.previous.value;
        const good = i.invert ? diff <= 0 : (i.id === 'SL.UEM.TOTL.ZS' || i.id === 'GC.DOD.TOTL.GD.ZS') ? diff <= 0 : diff >= 0;
        const txt = i.fmt === 'pct' ? (diff > 0 ? '+' : '') + nf1.format(diff) + ' pt' : (diff > 0 ? '+' : '') + nf1.format(diff / d.previous.value * 100) + ' %';
        delta = `<span class="year ${good ? 'pos' : 'neg'}">${txt} vs ${d.previous.year}</span>`;
      }
      return `<div class="kpi ${idx === 0 ? 'wide' : ''}">
        <div class="label">${esc(i.label)}</div>
        <div class="value ${latest ? cls : 'na'}">${latest ? fmtValue(i, latest.value) + `<span class="year">${latest.year}</span>` : 'n.d.'}${delta}</div>
      </div>`;
    });
    $('#c-kpis').innerHTML = `<div class="kpi-grid">${cells.join('')}</div>`;
  }

  function renderGdpChart(ind) {
    const s = ind['NY.GDP.MKTP.CD'] && ind['NY.GDP.MKTP.CD'].series;
    if (!s || s.length < 3) return;
    const w = 380, h = 70, pad = 4;
    const vals = s.map(p => p.value);
    const min = Math.min(...vals), max = Math.max(...vals);
    const x = i => pad + i * (w - 2 * pad) / (s.length - 1);
    const y = v => h - pad - (max === min ? 0 : (v - min) / (max - min) * (h - 2 * pad));
    const pts = s.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
    const area = `M${pts[0]} L${pts.join(' L')} L${x(s.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;
    const first = s[0], last = s[s.length - 1];
    const growth = (last.value / first.value - 1) * 100;
    $('#c-gdp').innerHTML = `
      <h3>Évolution du PIB <span class="src">${first.year} – ${last.year}, USD courants</span></h3>
      <svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Évolution du PIB">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb547" stop-opacity=".45"/><stop offset="1" stop-color="#ffb547" stop-opacity="0"/></linearGradient></defs>
        <path d="${area}" fill="url(#g)"/>
        <polyline points="${pts.join(' ')}" fill="none" stroke="#ffb547" stroke-width="2" stroke-linejoin="round"/>
      </svg>
      <div class="spark-caption"><span>${first.year} : ${fmtMoney(first.value)}</span><span class="${growth >= 0 ? 'chg pos' : 'chg neg'}">${growth >= 0 ? '+' : ''}${nf0.format(growth)} % sur la période</span><span>${last.year} : ${fmtMoney(last.value)}</span></div>`;
  }

  async function renderFx(p, alive) {
    const cur = D.CURRENCY[p.a2];
    const box = $('#c-fx');
    if (!cur) { box.innerHTML = ''; return; }
    const pairs = cur === 'USD' ? [['USD', 'EUR'], ['USD', 'JPY'], ['USD', 'GBP']]
      : cur === 'EUR' ? [['EUR', 'USD'], ['EUR', 'GBP'], ['EUR', 'CHF']]
      : [['USD', cur], ['EUR', cur]];
    box.innerHTML = `<h3>Taux de change <span class="src">BCE, variation sur 30 jours</span></h3><div class="loading">Chargement des cours…</div>`;
    try {
      const rows = await Promise.all(pairs.map(([b, q]) => D.fetchFxHistory(b, q, 31).then(h => ({ b, q, h }))));
      if (!alive()) return;
      box.innerHTML = `<h3>Taux de change <span class="src">BCE, variation sur 30 jours</span></h3>` + rows.map(({ b, q, h }) => {
        if (!h.length) return '';
        const last = h[h.length - 1], first = h[0];
        const chg = (last.value / first.value - 1) * 100;
        return `<div class="fx-row"><span class="pair">1 ${b} = ${fmtRate(last.value)} ${q}</span>
          <span><span class="rate muted small">${last.date}</span><span class="chg ${chg >= 0 ? 'pos' : 'neg'}">${chg >= 0 ? '▲' : '▼'} ${nf2.format(Math.abs(chg))} %</span></span></div>`;
      }).join('');
    } catch (e) {
      if (alive()) box.innerHTML = `<h3>Taux de change</h3><div class="error">Cours indisponibles (${esc(e.message)}).</div>`;
    }
  }

  async function renderNews(p, alive) {
    const box = $('#c-news');
    const gUrl = D.googleNewsUrl(p, state.lang).replace('/rss/', '/');
    try {
      const items = await D.fetchNews(p, state.lang, state.gnewsKey);
      if (!alive()) return;
      if (!items.length) {
        box.innerHTML = `<div class="muted small">Aucune actualité récente trouvée.</div><a class="btn ghost link" target="_blank" rel="noopener" href="${gUrl}">Ouvrir Google Actualités</a>`;
        return;
      }
      box.innerHTML = `<ul class="news-list">${items.map(n => `
        <li class="news-item">
          <a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
          <div class="meta">${n.source ? `<b>${esc(n.source)}</b> · ` : ''}${fmtDate(n.date)}</div>
        </li>`).join('')}</ul>
        <a class="btn ghost link" target="_blank" rel="noopener" href="${gUrl}">Plus d’actualités</a>`;
    } catch (e) {
      if (!alive()) return;
      box.innerHTML = `<div class="error">Actualités indisponibles (${esc(e.message)}).</div>
        <div class="muted small" style="margin-top:6px">Les relais publics peuvent être saturés. Ajoutez une clé GNews.io dans ⚙ Paramètres pour une source directe.</div>
        <a class="btn ghost link" target="_blank" rel="noopener" href="${gUrl}">Ouvrir Google Actualités</a>`;
    }
  }

  /* ---------- Bandeau devises ---------- */
  async function renderTicker() {
    const track = $('#ticker-track');
    const groups = [['EUR', ['USD', 'GBP', 'JPY', 'CHF']], ['USD', ['JPY', 'CNY', 'CAD', 'INR', 'BRL', 'MXN', 'KRW', 'CHF']], ['GBP', ['USD']]];
    try {
      const out = [];
      for (const [base, syms] of groups) {
        const hist = await Promise.all(syms.map(s => D.fetchFxHistory(base, s, 8).then(h => ({ s, h })).catch(() => null)));
        for (const r of hist) {
          if (!r || r.h.length < 2) continue;
          const last = r.h[r.h.length - 1], prev = r.h[r.h.length - 2];
          const chg = (last.value / prev.value - 1) * 100;
          out.push(`<span class="item"><b>${base}/${r.s}</b>${fmtRate(last.value)} <span class="chg ${chg >= 0 ? 'pos' : 'neg'}">${chg >= 0 ? '▲' : '▼'}${nf2.format(Math.abs(chg))} %</span></span>`);
        }
      }
      if (!out.length) throw new Error('vide');
      const html = out.join('');
      track.innerHTML = html + html; // dupliqué pour un défilement continu
    } catch (e) {
      track.innerHTML = '<span class="muted">Cours de change indisponibles pour le moment.</span>';
    }
  }

  /* ---------- Interface ---------- */
  function initUi() {
    const list = $('#country-list');
    list.innerHTML = state.features.filter(f => f.props.known).map(f => `<option value="${esc(f.props.fr)}">`).join('');
    $('#search-form').addEventListener('submit', e => {
      e.preventDefault();
      const q = norm($('#search').value);
      if (!q) return;
      const f = state.features.find(x => norm(x.props.fr) === q || norm(x.props.en) === q)
        || state.features.find(x => norm(x.props.fr).startsWith(q) || norm(x.props.en).startsWith(q))
        || state.features.find(x => norm(x.props.fr).includes(q) || norm(x.props.en).includes(q));
      if (f) { selectCountry(f, true); $('#search').blur(); }
    });
    $('#search').addEventListener('change', () => $('#search-form').requestSubmit());

    $('#quick-links').innerHTML = QUICK.filter(c => state.byA2[c]).map(c => `<button class="chip" data-a2="${c}">${esc(state.byA2[c].props.fr)}</button>`).join('');
    $('#quick-links').addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      selectCountry(state.byA2[b.dataset.a2], true);
    });

    $('#panel-close').addEventListener('click', () => { $('#panel').classList.add('hidden'); state.selected = null; state.token++; globe.polygonAltitude(globe.polygonAltitude()).polygonCapColor(globe.polygonCapColor()); });
    $('#btn-reset').addEventListener('click', resetView);
    $('#btn-rotate').addEventListener('click', () => {
      state.autoRotate = !globe.controls().autoRotate;
      globe.controls().autoRotate = state.autoRotate;
      $('#btn-rotate').setAttribute('aria-pressed', String(state.autoRotate));
    });

    const dlg = $('#settings');
    $('#btn-settings').addEventListener('click', () => {
      $('#opt-lang').value = state.lang; $('#opt-gnews').value = state.gnewsKey; dlg.showModal();
    });
    $('#opt-save').addEventListener('click', () => {
      state.lang = $('#opt-lang').value; state.gnewsKey = $('#opt-gnews').value.trim();
      localStorage.setItem('gfg:lang', state.lang); localStorage.setItem('gfg:gnews', state.gnewsKey);
      if (state.selected) renderPanel(state.selected, ++state.token);
    });

    const clock = $('#clock');
    const tick = () => { clock.textContent = new Date().toISOString().slice(11, 19); };
    tick(); setInterval(tick, 1000);

    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlg.open) $('#panel').classList.add('hidden'); });
  }

  /* ---------- Démarrage ---------- */
  (async function main() {
    try {
      await loadCountries();
    } catch (e) {
      $('#panel-body').innerHTML = `<div class="error">Impossible de charger les contours des pays (${esc(e.message)}). Servez le site via HTTP (ex. <code>python3 -m http.server</code>).</div>`;
      $('#panel').classList.remove('hidden');
      return;
    }
    initGlobe();
    initUi();
    renderTicker();
    setInterval(renderTicker, 30 * 60e3);
  })();
})();
