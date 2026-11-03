/* Krapo Kwizz — application (aucune dépendance, aucun outil de compilation).
   Les espèces viennent de data/especes.csv : c'est ce fichier qu'on modifie
   pour ajouter un chant, une photo ou renommer une espèce. */
'use strict';

const CFG = {
  serieLength: 20,          // nombre de questions d'une série
  chronoSeconds: 60,        // durée du contre-la-montre
  lives: 3,                 // vies en mode survie
  basePoints: 100,
  hintCost: 20,
  storeKey: 'krapokwizz.v1',
  fauneGuyane: 'https://www.faune-guyane.fr',
  email: 'nicolasburnel2005@gmail.com',
  offlineMB: 30,             // taille approximative de tous les sons + photos
};

/* ---------------- utilitaires ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/\b(cf|aff)\b\.?/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const mmss = t => isFinite(t) ? Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0') : '–:––';
function sciHTML(name) { // genre/épithète en italique, « aff. », « cf. », « sp. 1 » en droit
  return esc(name).split(' ').map(t => /^(aff\.|cf\.|sp\.|\d+)$/.test(t) ? t : `<i class="sp">${t}</i>`).join(' ');
}
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({length: n + 1}, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(x => x.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
const list = s => (s || '').split('|').map(x => x.trim()).filter(Boolean);
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12.2-7.4a1 1 0 0 0 0-1.72L8.5 3.74A1 1 0 0 0 7 4.6z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.6" height="16" rx="1.3"/><rect x="13.9" y="4" width="4.6" height="16" rx="1.3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  ear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 10.5v3"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>',
};

/* ---------------- stockage local ---------------- */
const Store = {
  data: { m: {}, best: {}, last: null, totals: { games: 0, answers: 0, correct: 0 } },
  load() { try { const d = JSON.parse(localStorage.getItem(CFG.storeKey)); if (d) this.data = Object.assign(this.data, d); } catch (e) {} },
  save() { try { localStorage.setItem(CFG.storeKey, JSON.stringify(this.data)); } catch (e) {} },
  mastery(id, kind) { return (this.data.m[id] && this.data.m[id][kind]) || { n: 0, c: 0, b: 0 }; },
  record(id, kind, ok) {
    const m = this.data.m[id] || (this.data.m[id] = {}); const s = m[kind] || (m[kind] = { n: 0, c: 0, b: 0 });
    s.n++; if (ok) { s.c++; s.b = Math.min(5, s.b + 1); } else s.b = Math.max(0, s.b - 2);
    this.data.totals.answers++; if (ok) this.data.totals.correct++;
    this.save();
  },
};

/* ---------------- données ---------------- */
let SP = [], BYID = {}, FAMS = [];
async function loadData() {
  const res = await fetch('data/especes.csv', { cache: 'no-cache' });
  const rows = parseCSV(await res.text());
  SP = rows.map(r => ({
    id: r.id, name: r.nom, vern: r.nom_vernaculaire, family: r.famille, page: r.page_guide,
    sound: r.son, soundBy: r.auteur_son, photos: list(r.photos), photoBy: r.credit_photos || '', habitat: r.habitat, size: r.taille,
    crit: list(r.criteres), confNames: list(r.confusions), comment: r.commentaire, old: r.ancien_nom,
  })).filter(s => s.id && s.name);
  BYID = Object.fromEntries(SP.map(s => [s.id, s]));
  const byName = {}; SP.forEach(s => { byName[norm(s.name)] = s.id; if (s.old) byName[norm(s.old)] = s.id; });
  SP.forEach(s => { s.genus = s.name.split(' ')[0]; s.conf = s.confNames.map(n => byName[norm(n)]).filter(Boolean); });
  FAMS = [...new Set(SP.map(s => s.family))].sort((a, b) => a.localeCompare(b));
}
const hasSound = s => !!s.sound, hasPhoto = s => s.photos.length > 0;
const soundURL = s => 'sons/' + s.sound, photoURL = f => 'photos/' + f;
const pickPhoto = s => s.photos[Math.random() * s.photos.length | 0];

/* ---------------- audio + spectrogramme ---------------- */
const Audio = {
  el: null, ctx: null, an: null, buf: null, owner: null, listeners: new Set(),
  init() { this.el = $('#audio'); ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata'].forEach(ev => this.el.addEventListener(ev, () => this.listeners.forEach(f => f(ev)))); },
  graph() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this.ctx.createMediaElementSource(this.el);
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0;
      src.connect(this.an); this.an.connect(this.ctx.destination); this.buf = new Uint8Array(this.an.frequencyBinCount);
    } catch (e) { this.ctx = null; }
  },
  toggle(url, owner) {
    this.graph();
    if (this.owner === owner && this.el.dataset.src === url) { this.el.paused ? this.el.play().catch(() => {}) : this.el.pause(); return; }
    this.owner = owner; this.el.dataset.src = url; this.el.src = url; this.el.currentTime = 0; this.el.play().catch(() => {});
  },
  stop() { this.el.pause(); this.owner = null; },
  playing(owner) { return this.owner === owner && !this.el.paused; },
};
const Spec = {
  cv: null, cx: null, raf: 0,
  attach(canvas) { this.cv = canvas; this.cx = canvas.getContext('2d'); this.clear(); if (!this.raf) this.loop(); },
  clear() { if (!this.cx) return; this.cx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--spec-bg').trim() || '#0b1513'; this.cx.fillRect(0, 0, this.cv.width, this.cv.height); },
  color(v) {
    const t = v / 255, st = [[11, 21, 19], [22, 84, 74], [96, 172, 140], [159, 214, 184], [243, 210, 122], [255, 250, 230]];
    const x = t * (st.length - 1), i = Math.min(st.length - 2, x | 0), f = x - i, a = st[i], b = st[i + 1];
    return `rgb(${a[0] + (b[0] - a[0]) * f | 0},${a[1] + (b[1] - a[1]) * f | 0},${a[2] + (b[2] - a[2]) * f | 0})`;
  },
  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    if (!this.cv || !this.cv.isConnected || !Audio.an || !Audio.playing('game')) return;
    Audio.an.getByteFrequencyData(Audio.buf);
    const w = this.cv.width, h = this.cv.height, col = 3, max = Math.floor(12000 / (Audio.ctx.sampleRate / 2) * Audio.buf.length);
    this.cx.drawImage(this.cv, col, 0, w - col, h, 0, 0, w - col, h);
    for (let y = 0; y < h; y++) { this.cx.fillStyle = this.color(Audio.buf[Math.floor((1 - y / h) * max)]); this.cx.fillRect(w - col, y, col, 1); }
  },
};

/* ---------------- réglages ---------------- */
const DEFAULTS = { mode: 'ecoute', format: 'noms', level: 'inter', rythme: 'serie', fams: [], spectro: true, revision: true, vern: true };
let S = {};
function loadSettings() { S = Object.assign({}, DEFAULTS, Store.data.last || {}); S.fams = (S.fams || []).filter(f => FAMS.includes(f)); }
function saveSettings() { Store.data.last = S; Store.save(); }
const LEVELS = {
  decouverte: ['Découverte', 'Propositions de familles différentes'],
  inter: ['Intermédiaire', 'Propositions de la même famille'],
  expert: ['Expert', 'Espèces confondables (liste du guide), puis même genre'],
  maitre: ['Maître', 'Aucune proposition : écris le nom exact'],
};
const FORMATS = { noms: ['4 noms', 'Choisis le bon nom'], photos: ['4 photos', 'Clique sur la bonne grenouille'], saisie: ['Saisie libre', 'Écris le nom exact'] };
const RYTHMES = { serie: ['Série', `${CFG.serieLength} questions`], chrono: ['Chrono', `${CFG.chronoSeconds} secondes`], survie: ['Survie', `${CFG.lives} vies`] };
function isFree() { return S.mode === 'ecoute' ? S.format === 'saisie' : S.level === 'maitre'; }
function poolFor(cfg = S) {
  return SP.filter(s => (!cfg.fams.length || cfg.fams.includes(s.family)) &&
    (cfg.mode === 'ecoute' ? hasSound(s) && (cfg.format !== 'photos' || hasPhoto(s)) : hasPhoto(s)));
}
function configKey(cfg = S) { return [cfg.mode, cfg.mode === 'ecoute' ? cfg.format : '', cfg.level, cfg.rythme, cfg.fams.length ? cfg.fams.slice().sort().join('+') : 'toutes'].join('/'); }
function configLabel(key) {
  const [mode, format, level, rythme, fams] = key.split('/');
  const parts = [mode === 'ecoute' ? 'Écoute' : 'Photo'];
  if (format) parts.push(FORMATS[format][0]);
  if (!(mode === 'ecoute' && format === 'saisie')) parts.push(LEVELS[level] ? LEVELS[level][0] : level);
  parts.push(RYTHMES[rythme][0]); parts.push(fams === 'toutes' ? 'toutes familles' : fams.split('+').join(', '));
  return parts.join(' · ');
}

/* ---------------- routeur ---------------- */
let Game = null;
function route() {
  const h = location.hash.replace(/^#/, '') || 'jouer';
  const [view, arg] = h.split('/');
  if (Game && view !== 'partie') endGame(true);
  document.body.classList.toggle('in-game', view === 'partie');
  $$('.nav a').forEach(a => { if (a.dataset.nav === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  closeSheet();
  if (view === 'especes') viewSpecies(arg);
  else if (view === 'progres') viewProgress();
  else if (view === 'apropos') viewAbout();
  else if (view === 'partie' && Game) {/* déjà affiché */}
  else viewHome();
  window.scrollTo(0, 0);
}

/* ---------------- accueil / réglages ---------------- */
function segHTML(id, opts, cur, cls = '') {
  return `<div class="seg ${cls}" id="${id}">` + Object.entries(opts).map(([k, [t, d]]) => `<button type="button" data-v="${k}" aria-pressed="${k === cur}">${t}${d && cls.includes('withsub') ? `<small>${d}</small>` : ''}</button>`).join('') + '</div>';
}
function viewHome() {
  Audio.stop();
  const app = $('#app');
  const levelOpts = S.mode === 'photo' ? LEVELS : { decouverte: LEVELS.decouverte, inter: LEVELS.inter, expert: LEVELS.expert };
  if (S.mode === 'ecoute' && S.level === 'maitre') S.level = 'expert';
  const n = poolFor().length, best = Store.data.best[configKey()];
  app.innerHTML = `
  <section class="hero">
    <span class="eyebrow">Amphibiens de Guyane</span>
    <h1 class="display">Krapo Kwizz</h1>
    <p class="lede">Apprends à reconnaître les grenouilles et crapauds de Guyane à l'oreille et à l'œil, avant d'aller les écouter en forêt.</p>
    <div class="with"><img src="assets/logo-cerato-${matchMedia('(prefers-color-scheme: light)').matches ? 'noir' : 'blanc'}.png" alt="">avec Cerato, association herpétologique de Guyane</div>
  </section>
  <div class="modes" role="group" aria-label="Type de jeu">
    <button type="button" class="mode" data-mode="ecoute" aria-pressed="${S.mode === 'ecoute'}"><span class="ico">${ICON.ear}</span><b>Écoute</b><span>Un chant, à toi de trouver qui chante.</span></button>
    <button type="button" class="mode" data-mode="photo" aria-pressed="${S.mode === 'photo'}"><span class="ico">${ICON.eye}</span><b>Photo</b><span>Une photo, à toi de nommer l'espèce.</span></button>
  </div>
  <section class="setup" aria-label="Réglages de la partie">
    ${S.mode === 'ecoute' ? `<div class="opt"><span class="lbl">Réponse</span>${segHTML('seg-format', FORMATS, S.format)}<p class="desc">${FORMATS[S.format][1]}.</p></div>` : ''}
    ${!(S.mode === 'ecoute' && S.format === 'saisie') ? `<div class="opt"><span class="lbl">Difficulté</span>${segHTML('seg-level', levelOpts, S.level, Object.keys(levelOpts).length === 4 ? 'wrap4' : '')}<p class="desc">${LEVELS[S.level][1]}.</p></div>` : ''}
    <div class="opt"><span class="lbl">Rythme</span>${segHTML('seg-rythme', RYTHMES, S.rythme, 'withsub')}</div>
    <div class="opt"><details class="fams"${S.fams.length ? ' open' : ''}><summary><span class="lbl" style="font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)">Familles</span><span class="muted" style="font-weight:600;font-size:.9rem;margin-left:auto">${S.fams.length ? S.fams.length + ' sélectionnée(s)' : 'Toutes'}</span></summary>
      <div class="chips" id="famchips">${FAMS.map(f => { const c = poolFor({ ...S, fams: [f] }).length; return c ? `<button type="button" class="chip" data-f="${esc(f)}" aria-pressed="${S.fams.includes(f)}">${esc(f)}<span class="n">${c}</span></button>` : ''; }).join('')}</div>
      ${S.fams.length ? '<div style="margin-top:8px"><button type="button" class="btn ghost" id="famreset">Toutes les familles</button></div>' : ''}
    </details></div>
    <div class="toggles">
      ${S.mode === 'ecoute' ? `<label class="toggle"><span>Spectrogramme<small>Voir le chant défiler pendant l'écoute</small></span><input type="checkbox" class="switch" id="t-spectro"${S.spectro ? ' checked' : ''}></label>` : ''}
      ${!isFree() && !(S.mode === 'ecoute' && S.format === 'photos') ? `<label class="toggle"><span>Noms vernaculaires<small>Afficher « Rainette ponctuée » sous le nom scientifique</small></span><input type="checkbox" class="switch" id="t-vern"${S.vern ? ' checked' : ''}></label>` : ''}
      <label class="toggle"><span>Révision ciblée<small>Les espèces que tu rates reviennent plus souvent</small></span><input type="checkbox" class="switch" id="t-rev"${S.revision ? ' checked' : ''}></label>
    </div>
    <div class="start"><div><div class="count">${n} espèce${n > 1 ? 's' : ''} dans cette partie</div>${best ? `<div class="best">Record : ${best} pts</div>` : ''}</div>
      <button type="button" class="btn primary big" id="go"${n < 4 && !isFree() ? ' disabled' : ''}>Jouer</button></div>
    ${n < 4 && !isFree() ? '<p class="desc">Choisis au moins une famille de plus : il faut 4 espèces pour les propositions.</p>' : ''}
  </section>`;
  $$('.mode', app).forEach(b => b.onclick = () => { S.mode = b.dataset.mode; if (S.mode === 'photo' && S.format === 'saisie') S.level = 'maitre'; saveSettings(); viewHome(); });
  const seg = (id, key) => { const el = $('#' + id); if (el) el.onclick = e => { const b = e.target.closest('button'); if (!b) return; S[key] = b.dataset.v; saveSettings(); viewHome(); }; };
  seg('seg-format', 'format'); seg('seg-level', 'level'); seg('seg-rythme', 'rythme');
  $('#famchips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; const f = b.dataset.f; S.fams = S.fams.includes(f) ? S.fams.filter(x => x !== f) : [...S.fams, f]; saveSettings(); viewHome(); $('details.fams').open = true; };
  const fr = $('#famreset'); if (fr) fr.onclick = () => { S.fams = []; saveSettings(); viewHome(); };
  const tg = (id, key) => { const el = $('#' + id); if (el) el.onchange = () => { S[key] = el.checked; saveSettings(); }; };
  tg('t-spectro', 'spectro'); tg('t-vern', 'vern'); tg('t-rev', 'revision');
  $('#go').onclick = () => startGame();
}

/* ---------------- moteur de jeu ---------------- */
function weight(s) { if (!S.revision) return 1; const m = Store.mastery(s.id, S.mode === 'ecoute' ? 'e' : 'p'); return 6 - m.b; }
function weightedPick(pool, avoid) {
  const cand = pool.filter(s => !avoid.has(s.id)); const arr = cand.length ? cand : pool;
  let tot = arr.reduce((a, s) => a + weight(s), 0), r = Math.random() * tot;
  for (const s of arr) { r -= weight(s); if (r <= 0) return s; } return arr[arr.length - 1];
}
function buildDeck(pool, n) {
  const deck = [], used = new Set(); n = Math.min(n, pool.length);
  while (deck.length < n) { const s = weightedPick(pool, used); used.add(s.id); deck.push(s.id); }
  return deck;
}
function distractors(cur, pool) {
  const others = pool.filter(s => s.id !== cur.id);
  let order;
  if (S.level === 'decouverte') order = [shuffle(others.filter(s => s.family !== cur.family)), shuffle(others.filter(s => s.family === cur.family))];
  else if (S.level === 'inter') order = [shuffle(others.filter(s => s.family === cur.family)), shuffle(others.filter(s => s.family !== cur.family))];
  else order = [shuffle(others.filter(s => cur.conf.includes(s.id))), shuffle(others.filter(s => s.genus === cur.genus && !cur.conf.includes(s.id))),
    shuffle(others.filter(s => s.family === cur.family && s.genus !== cur.genus && !cur.conf.includes(s.id))), shuffle(others.filter(s => s.family !== cur.family))];
  const out = []; for (const g of order) for (const s of g) { if (out.length >= 3) break; if (!out.includes(s)) out.push(s); }
  return shuffle([cur, ...out]);
}
function startGame(onlyIds) {
  const full = poolFor();
  const pool = onlyIds ? full.filter(s => onlyIds.includes(s.id)) : full;
  if (!pool.length) return toast('Aucune espèce ne correspond à ces réglages.');
  Game = {
    cfg: { ...S }, key: configKey(), pool, distractPool: S.mode === 'ecoute' && S.format === 'photos' ? SP.filter(s => hasSound(s) && hasPhoto(s)) : (S.mode === 'ecoute' ? SP.filter(hasSound) : SP.filter(hasPhoto)),
    deck: S.rythme === 'serie' ? buildDeck(pool, onlyIds ? pool.length : CFG.serieLength) : [], idx: -1, recent: [],
    score: 0, streak: 0, bestStreak: 0, correct: 0, answered: 0, lives: CFG.lives, misses: [], done: false,
    t0: 0, timer: 0, cur: null, choices: [], hints: 0, locked: false, photo: null, revisit: onlyIds ? true : false,
  };
  Store.data.totals.games++; Store.save();
  if (location.hash !== '#partie') { history.pushState(null, '', '#partie'); }
  document.body.classList.add('in-game');
  $$('.nav a').forEach(a => a.removeAttribute('aria-current'));
  renderGameShell();
  if (S.rythme === 'chrono') { Game.t0 = performance.now(); Game.timer = setInterval(tick, 200); }
  nextQuestion();
}
function tick() {
  if (!Game) return;
  const left = Math.max(0, CFG.chronoSeconds - (performance.now() - Game.t0) / 1000);
  const bar = $('#gbar'); if (bar) bar.style.width = (left / CFG.chronoSeconds * 100) + '%';
  const m = $('#gleft'); if (m) m.textContent = Math.ceil(left) + ' s';
  if (left <= 0) finish();
}
function renderGameShell() {
  const g = Game, mode = g.cfg.mode;
  $('#app').innerHTML = `<section class="game">
    <div class="ghead">
      <button class="quit" type="button" id="quit" aria-label="Quitter la partie">${ICON.close}</button>
      <div class="gprog">
        <div class="bar${g.cfg.rythme === 'chrono' ? ' timer' : ''}"><div id="gbar" style="width:${g.cfg.rythme === 'chrono' ? 100 : 0}%"></div></div>
        <div class="meta"><span id="gcount"></span><span id="gleft"></span></div>
      </div>
      <div><div class="score" id="gscore">0</div><div class="combo" id="gcombo"></div></div>
    </div>
    <div class="stage" id="stage"></div>
    <div id="answers"></div>
    <div id="fb"></div>
    <p class="keys"><kbd>1</kbd>–<kbd>4</kbd> répondre · ${mode === 'ecoute' ? '<kbd>Espace</kbd> écouter · ' : ''}<kbd>H</kbd> indice · <kbd>Entrée</kbd> suivant</p>
  </section>`;
  $('#quit').onclick = () => finish();
}
function updateHUD() {
  const g = Game;
  $('#gscore').textContent = g.score;
  $('#gcombo').textContent = g.streak >= 3 ? `Série ×${g.streak}` : '';
  if (g.cfg.rythme === 'serie') { $('#gcount').textContent = `Question ${Math.min(g.idx + 1, g.deck.length)} / ${g.deck.length}`; $('#gbar').style.width = (g.idx / g.deck.length * 100) + '%'; }
  else if (g.cfg.rythme === 'survie') { $('#gcount').innerHTML = `<span class="lives">${Array.from({ length: CFG.lives }, (_, i) => ICON.heart.replace('<svg', `<svg class="${i < g.lives ? '' : 'off'}"`)).join('')}</span>`; $('#gleft').textContent = `${g.correct} bonne${g.correct > 1 ? 's' : ''} réponse${g.correct > 1 ? 's' : ''}`; $('#gbar').style.width = (g.lives / CFG.lives * 100) + '%'; }
  else { $('#gcount').textContent = `${g.correct} bonne${g.correct > 1 ? 's' : ''} réponse${g.correct > 1 ? 's' : ''}`; }
}
function nextQuestion() {
  const g = Game; if (!g || g.done) return;
  g.idx++;
  let cur;
  if (g.cfg.rythme === 'serie') { if (g.idx >= g.deck.length) return finish(); cur = BYID[g.deck[g.idx]]; }
  else { cur = weightedPick(g.pool, new Set(g.recent)); g.recent.push(cur.id); if (g.recent.length > Math.min(12, g.pool.length - 1)) g.recent.shift(); }
  g.cur = cur; g.hints = 0; g.locked = false; g.photo = hasPhoto(cur) ? pickPhoto(cur) : null;
  if (!g.dpool) { const r = g.distractPool.filter(s => g.cfg.fams.includes(s.family)); g.dpool = g.cfg.fams.length && r.length >= 4 ? r : g.distractPool; }
  g.choices = isFreeG() ? [] : distractors(cur, g.dpool);
  updateHUD(); renderStage(); renderAnswers(); $('#fb').innerHTML = '';
  if (g.cfg.mode === 'ecoute') Audio.toggle(soundURL(cur), 'game');
}
function isFreeG() { const c = Game.cfg; return c.mode === 'ecoute' ? c.format === 'saisie' : c.level === 'maitre'; }
function renderStage() {
  const g = Game, cur = g.cur, st = $('#stage');
  if (g.cfg.mode === 'ecoute') {
    st.innerHTML = `<div class="listen"><button class="playbig" id="gplay" type="button" aria-label="Écouter le chant">${ICON.play}</button>
      <div class="spec">${g.cfg.spectro ? `<canvas id="spec" width="900" height="220" aria-label="Spectrogramme"></canvas><div class="ax"><span>12 kHz</span><span>6</span><span>0</span></div>` : `<div class="wave" id="wave">${'<i></i>'.repeat(18)}</div>`}
      <div class="time"><span id="tcur">0:00</span><span id="tdur">–:––</span></div></div></div>` + hintBarHTML();
    $('#gplay').onclick = () => Audio.toggle(soundURL(g.cur), 'game');
    if (g.cfg.spectro) Spec.attach($('#spec'));
  } else {
    st.innerHTML = `<div class="pic"><img src="${photoURL(g.photo)}" alt="Photo de l'espèce à trouver">${cur.photos.length > 1 ? '<button type="button" class="other" id="other">Autre photo</button>' : ''}</div>` + hintBarHTML();
    const o = $('#other'); if (o) o.onclick = () => { const others = cur.photos.filter(p => p !== g.photo); g.photo = others[Math.random() * others.length | 0]; $('.pic img').src = photoURL(g.photo); };
  }
  $('#hintbtn').onclick = useHint; syncPlay();
}
function hintList(s) {
  const h = [['Famille', s.family]];
  if (s.habitat || s.size) h.push(['Milieu', [s.habitat, s.size].filter(Boolean).join(' · ')]);
  if (Game.cfg.mode === 'photo' && s.crit.length) h.push(['Critère', s.crit[0]]);
  if (Game.cfg.mode === 'ecoute' && s.comment) h.push(['Écologie', s.comment.replace(new RegExp(s.vern, 'gi'), '…')]);
  h.push(['Genre', `<i class="sp">${esc(s.genus)}</i>`]);
  return h;
}
function hintBarHTML() {
  const g = Game, hl = hintList(g.cur);
  return `<div class="hintbar"><button type="button" class="hint-btn" id="hintbtn"${g.hints >= hl.length || g.locked ? ' disabled' : ''}>Indice${g.hints < hl.length ? ` (−${CFG.hintCost} pts)` : ''}</button>
    <div class="hints">${hl.slice(0, g.hints).map(([k, v]) => `<div><b>${k}</b>${k === 'Genre' ? v : esc(v)}</div>`).join('')}</div></div>`;
}
function useHint() {
  const g = Game; if (g.locked) return; const hl = hintList(g.cur); if (g.hints >= hl.length) return;
  g.hints++; const bar = $('.hintbar'); bar.outerHTML = hintBarHTML(); $('#hintbtn').onclick = useHint;
}
function renderAnswers() {
  const g = Game, box = $('#answers');
  if (isFreeG()) {
    box.innerHTML = `<form class="free" id="freef" autocomplete="off"><input id="freein" list="kk-names" placeholder="Nom scientifique (ou vernaculaire)" aria-label="Ta réponse" autocapitalize="off" spellcheck="false"><button class="btn primary" type="submit">Valider</button><button class="btn ghost" type="button" id="pass">Je ne sais pas</button></form>`;
    $('#freef').onsubmit = e => { e.preventDefault(); const v = $('#freein').value; if (v.trim()) answerFree(v); };
    $('#pass').onclick = () => answer(null);
    setTimeout(() => { const i = $('#freein'); if (i && matchMedia('(hover:hover)').matches) i.focus(); }, 30);
    return;
  }
  const pics = g.cfg.mode === 'ecoute' && g.cfg.format === 'photos';
  box.innerHTML = `<div class="choices ${pics ? 'pics' : 'names'}">` + g.choices.map((s, i) => pics
    ? `<button type="button" class="choice" data-id="${s.id}"><span class="ph"><img src="${photoURL(s.photos[0])}" alt="Proposition ${i + 1}"><span class="k">${i + 1}</span></span><span class="cap"></span></button>`
    : `<button type="button" class="choice" data-id="${s.id}"><span class="k">${i + 1}</span><span><span class="nm">${sciHTML(s.name)}</span>${g.cfg.vern ? `<span class="vn">${esc(s.vern)}</span>` : ''}</span></button>`).join('') + '</div>';
  box.onclick = e => { const b = e.target.closest('.choice'); if (b && !g.locked) answer(b.dataset.id); };
}
function answerFree(txt) {
  const c = Game.cur, t = norm(txt);
  const targets = [c.name, c.old, c.vern].filter(Boolean).map(norm);
  if (targets.includes(t)) return answer(c.id, { exact: true });
  const close = targets.slice(0, 2).some(x => x.length > 8 && lev(x, t) <= 2);
  if (close) return answer(c.id, { typo: txt });
  if (norm(c.genus) === t.split(' ')[0] && t.split(' ').length >= 1) return answer('__genus', { typed: txt });
  answer('__free', { typed: txt });
}
function answer(pick, info = {}) {
  const g = Game; if (!g || g.locked) return; g.locked = true;
  const c = g.cur, ok = pick === c.id, half = pick === '__genus';
  g.answered++;
  Store.record(c.id, g.cfg.mode === 'ecoute' ? 'e' : 'p', ok);
  let pts = 0;
  if (ok || half) {
    const base = Math.max(20, CFG.basePoints - g.hints * CFG.hintCost) * (half ? .5 : 1);
    if (ok) { g.streak++; g.bestStreak = Math.max(g.bestStreak, g.streak); g.correct++; }
    pts = Math.round(base * (1 + Math.min(g.streak, 10) * .1));
    g.score += pts;
  }
  if (!ok) {
    g.streak = 0; if (!g.misses.includes(c.id)) g.misses.push(c.id);
    if (g.cfg.rythme === 'survie' && !half) g.lives--;
    if (g.cfg.rythme === 'serie' && !g.revisit) { const at = Math.min(g.deck.length, g.idx + 3 + (Math.random() * 3 | 0)); g.deck.splice(at, 0, c.id); }
  }
  updateHUD();
  $$('.choice').forEach(b => {
    b.disabled = true;
    if (b.dataset.id === c.id) b.classList.add('right'); else if (b.dataset.id === pick) b.classList.add('wrong'); else b.classList.add('dim');
    const cap = $('.cap', b); if (cap) { const s = BYID[b.dataset.id]; cap.innerHTML = `<span class="nm">${sciHTML(s.name)}</span><span class="vn">${esc(s.vern)}</span>`; }
  });
  const fi = $('#freein'); if (fi) { fi.disabled = true; $$('#freef button').forEach(b => b.disabled = true); }
  const hb = $('#hintbtn'); if (hb) hb.disabled = true;
  showFeedback(ok, half, pick, info, pts);
  const fast = g.cfg.rythme === 'chrono';
  if (g.cfg.rythme === 'survie' && g.lives <= 0) { setTimeout(finish, 1600); return; }
  if (fast) setTimeout(() => { if (Game === g && !g.done) nextQuestion(); }, ok ? 700 : 1700);
}
function showFeedback(ok, half, pick, info, pts) {
  const g = Game, c = g.cur;
  let verdict = ok ? (info.typo ? 'Correct, attention à l\'orthographe' : ['Bien vu !', 'Exact !', 'Bravo !', 'C\'est ça !'][Math.random() * 4 | 0]) : half ? 'Le genre est bon !' : 'Raté…';
  let detail = '';
  if (!ok && pick && BYID[pick]) detail = `Tu as répondu ${sciHTML(BYID[pick].name)}.`;
  else if (!ok && info.typed) detail = `Ta réponse : « ${esc(info.typed)} ».`;
  else if (pick === null) detail = '';
  if (info.typo) detail = `Tu as écrit « ${esc(info.typo)} ».`;
  const showImg = g.cfg.mode === 'ecoute' && c.photos.length;
  $('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : half ? 'mid' : 'ko'}">
    <span class="verdict">${verdict}${pts ? ` +${pts}` : ''}</span>
    <div class="who">${showImg ? `<img src="${photoURL(c.photos[0])}" alt="">` : ''}<div>
      <div class="big">${sciHTML(c.name)}</div><div class="sub">${esc(c.vern)} · ${esc(c.family)}</div>
      ${c.old ? `<div class="sub" style="color:var(--glow)">Ancien nom : ${sciHTML(c.old)}</div>` : ''}
      ${detail ? `<div class="sub">${detail}</div>` : ''}</div></div>
    ${g.cfg.rythme === 'chrono' ? '' : `<div class="row">
      <button type="button" class="btn primary" id="next">${g.cfg.rythme === 'survie' && g.lives <= 0 ? 'Voir le résultat' : 'Suivant'}</button>
      ${g.cfg.mode === 'photo' && hasSound(c) ? `<button type="button" class="btn" id="hear">${ICON.play} Écouter son chant</button>` : ''}
      ${!ok && pick && BYID[pick] && g.cfg.mode === 'ecoute' ? `<button type="button" class="btn" id="cmp">${ICON.play} Chant de ${sciHTML(BYID[pick].name)}</button>` : ''}
      <button type="button" class="btn ghost" id="fiche">Fiche</button></div>`}
  </div>`;
  const n = $('#next'); if (n) { n.onclick = () => nextQuestion(); if (matchMedia('(hover:hover)').matches) n.focus({ preventScroll: true }); }
  const h = $('#hear'); if (h) h.onclick = () => Audio.toggle(soundURL(c), 'game');
  const cp = $('#cmp'); if (cp) cp.onclick = () => Audio.toggle(soundURL(BYID[pick]), 'game');
  const f = $('#fiche'); if (f) f.onclick = () => openSheet(c.id);
  if (matchMedia('(max-width:720px)').matches) $('#fb').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function finish() {
  const g = Game; if (!g || g.done) return; g.done = true; clearInterval(g.timer); Audio.stop();
  const prev = Store.data.best[g.key] || 0, record = g.score > prev && g.score > 0 && !g.revisit;
  if (record) { Store.data.best[g.key] = g.score; Store.save(); }
  const pct = g.answered ? Math.round(g.correct / g.answered * 100) : 0;
  $('#app').innerHTML = `<section class="end">
    <span class="eyebrow">${configLabel(g.key)}</span>
    <div class="scorebig">${g.score}</div><div>points</div>
    ${record ? '<div class="record">Nouveau record !</div>' : prev ? `<div class="muted">Record : ${prev} pts</div>` : ''}
    <div class="stats3"><div><b>${g.correct}/${g.answered}</b><span>bonnes réponses</span></div><div><b>${pct} %</b><span>réussite</span></div><div><b>${g.bestStreak}</b><span>meilleure série</span></div></div>
    ${g.misses.length ? `<h2 style="text-align:left;margin-top:8px">À revoir</h2><div class="misslist">${g.misses.map(id => missRow(BYID[id])).join('')}</div>` : (g.answered ? '<p class="muted">Aucune erreur, chapeau.</p>' : '')}
    <div class="row" style="justify-content:center">
      ${g.misses.length ? '<button type="button" class="btn primary" id="redo">Rejouer mes erreurs</button>' : ''}
      <button type="button" class="btn${g.misses.length ? '' : ' primary'}" id="again">Rejouer</button>
      <a class="btn ghost" href="#jouer">Changer de jeu</a>
    </div></section>`;
  const misses = g.misses.slice();
  Game = null; document.body.classList.remove('in-game');
  const r = $('#redo'); if (r) r.onclick = () => { const keep = S.rythme; S.rythme = 'serie'; startGame(misses); S.rythme = keep; };
  $('#again').onclick = () => startGame();
  bindRows($('#app'));
}
function endGame(silent) { if (!Game) return; clearInterval(Game.timer); Game.done = true; Game = null; Audio.stop(); document.body.classList.remove('in-game'); }
function missRow(s) {
  return `<div class="missrow">${s.photos.length ? `<img src="${photoURL(s.photos[0])}" alt="">` : ''}<div class="t"><b>${sciHTML(s.name)}</b><span>${esc(s.vern)}</span></div>
    ${hasSound(s) ? `<button type="button" class="mini" data-play="${s.id}" aria-label="Écouter ${esc(s.name)}">${ICON.play}</button>` : ''}
    <button type="button" class="btn ghost" data-sheet="${s.id}" style="min-height:40px;padding:6px 14px">Fiche</button></div>`;
}
function bindRows(root) {
  root.addEventListener('click', e => {
    const p = e.target.closest('[data-play]'); if (p) { Audio.toggle(soundURL(BYID[p.dataset.play]), 'row:' + p.dataset.play); return; }
    const s = e.target.closest('[data-sheet]'); if (s) openSheet(s.dataset.sheet);
  });
}
function syncPlay() {
  const b = $('#gplay'); if (b) { const on = Audio.playing('game'); b.innerHTML = on ? ICON.pause : ICON.play; b.classList.toggle('on', on); const w = $('#wave'); if (w) w.classList.toggle('on', on); }
  $$('[data-play]').forEach(m => { const on = Audio.playing('row:' + m.dataset.play) || Audio.playing('sheet:' + m.dataset.play); m.classList.toggle('on', on); m.innerHTML = on ? ICON.pause : ICON.play; });
  if (Audio.owner === 'game') { const tc = $('#tcur'), td = $('#tdur'); if (tc) tc.textContent = mmss(Audio.el.currentTime); if (td) td.textContent = mmss(Audio.el.duration); }
  const sb = $('#sheetbar'); if (sb && Audio.owner && Audio.owner.startsWith('sheet:')) sb.style.width = (Audio.el.currentTime / (Audio.el.duration || 1) * 100) + '%';
}
document.addEventListener('keydown', e => {
  if (!Game || Game.done || e.target.tagName === 'INPUT' || $('.sheet-back')) return;
  if (e.key === ' ' && Game.cfg.mode === 'ecoute') { e.preventDefault(); Audio.toggle(soundURL(Game.cur), 'game'); }
  else if (/^[1-4]$/.test(e.key) && !Game.locked && Game.choices.length) answer(Game.choices[+e.key - 1].id);
  else if (e.key === 'Enter' && Game.locked && $('#next')) { e.preventDefault(); nextQuestion(); }
  else if ((e.key === 'h' || e.key === 'H') && !Game.locked) useHint();
});

/* ---------------- espèces ---------------- */
let libQ = '', libF = '';
function viewSpecies(openId) {
  Audio.stop();
  $('#app').innerHTML = `<span class="eyebrow">${SP.length} espèces · ${SP.filter(hasSound).length} chants</span>
    <h1 class="display" style="font-size:clamp(2.2rem,8vw,3.4rem)">Espèces</h1>
    <p class="lede">Les fiches du guide, les photos et les chants de la sonothèque, avec les noms à jour.</p>
    <div class="toolbar"><input type="search" id="q" placeholder="Nom, genre, page du guide…" aria-label="Chercher une espèce" value="${esc(libQ)}">
    <select id="fsel" aria-label="Famille"><option value="">Toutes les familles</option>${FAMS.map(f => `<option${f === libF ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
    <div id="lib"></div>`;
  $('#q').oninput = e => { libQ = e.target.value; renderLib(); };
  $('#fsel').onchange = e => { libF = e.target.value; renderLib(); };
  renderLib(); bindRows($('#app'));
  if (openId && BYID[openId]) openSheet(openId, true);
}
function renderLib() {
  const q = norm(libQ);
  const L = SP.filter(s => (!libF || s.family === libF) && (!q || [s.name, s.old, s.vern, s.family, 'p' + s.page, s.page].some(x => x && norm(String(x)).includes(q))));
  const fams = [...new Set(L.map(s => s.family))].sort((a, b) => a.localeCompare(b));
  $('#lib').innerHTML = fams.length ? fams.map(f => { const ss = L.filter(s => s.family === f).sort((a, b) => (+a.page - +b.page) || a.name.localeCompare(b.name));
    return `<section class="famblock"><h2>${esc(f)}<span>${ss.length} espèce${ss.length > 1 ? 's' : ''}</span></h2><div class="grid">${ss.map(s => `
      <button type="button" class="card" data-sheet="${s.id}">
        <span class="ph${s.photos.length ? '' : ' none'}">${s.photos.length ? `<img src="${photoURL(s.photos[0])}" alt="" loading="lazy">` : 'Pas de photo'}</span>
        <span class="t"><b>${sciHTML(s.name)}</b><span>${esc(s.vern)}</span></span>
        <span class="tags"><span class="tag${hasSound(s) ? '' : ' off'}">${hasSound(s) ? 'Chant' : 'Sans chant'}</span>${s.page ? `<span class="tag off">p. ${esc(s.page)}</span>` : ''}</span>
      </button>`).join('')}</div></section>`; }).join('') : '<p class="muted" style="padding:24px 0">Aucune espèce ne correspond à cette recherche.</p>';
}
function openSheet(id, fromRoute) {
  const s = BYID[id]; if (!s) return; closeSheet();
  const back = document.createElement('div'); back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(s.name)}">
    <div class="gal">${s.photos.length ? `<div class="main"><img id="galimg" src="${photoURL(s.photos[0])}" alt="${esc(s.name)}"></div>
      ${s.photos.length > 1 ? `<div class="thumbs">${s.photos.map((p, i) => `<button type="button" data-ph="${esc(p)}" aria-pressed="${i === 0}" aria-label="Photo ${i + 1}"><img src="${photoURL(p)}" alt=""></button>`).join('')}</div>` : ''}` : '<div class="main" style="aspect-ratio:3/1;color:#6d7f76">Pas de photo dans le guide</div>'}
      <button type="button" class="close" id="sclose" aria-label="Fermer">${ICON.close}</button></div>
    <div class="body">
      <div class="title"><span class="eyebrow">${esc(s.family)}</span><h2>${sciHTML(s.name)}</h2><span class="vn">${esc(s.vern)}</span>${s.old ? `<span class="old">Nom dans le guide 2023 : ${sciHTML(s.old)}</span>` : ''}</div>
      ${hasSound(s) ? `<div class="player"><button type="button" class="mini" data-play="${s.id}" aria-label="Écouter">${ICON.play}</button><div class="pt"><b>Chant</b><span>Enregistrement : ${esc(s.soundBy)}</span><div class="pbar"><div id="sheetbar"></div></div></div></div>` : '<p class="muted" style="margin:0">Pas de chant dans la sonothèque pour cette espèce.</p>'}
      ${s.photoBy ? `<p class="small" style="margin:0">Photos : ${esc(s.photoBy)}</p>` : ''}
      <dl class="facts">${s.habitat ? `<dt>Habitat</dt><dd>${esc(s.habitat)}</dd>` : ''}${s.size ? `<dt>Taille</dt><dd>${esc(s.size)}</dd>` : ''}${s.page ? `<dt>Guide</dt><dd>page ${esc(s.page)}</dd>` : ''}</dl>
      ${s.crit.length ? `<div><b>Critères d'identification</b><ul class="crit">${s.crit.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      ${s.conf.length ? `<div><b>Confusions possibles</b><div class="conf" style="margin-top:6px">${s.conf.map(c => `<button type="button" data-goto="${c}">${sciHTML(BYID[c].name)}</button>`).join('')}</div></div>` : ''}
      ${s.comment ? `<p style="margin:0">${esc(s.comment)}</p>` : ''}
    </div></div>`;
  document.body.appendChild(back);
  const close = () => { closeSheet(); if (location.hash.startsWith('#especes/')) history.replaceState(null, '', '#especes'); };
  back.onclick = e => {
    if (e.target === back || e.target.closest('#sclose')) return close();
    const ph = e.target.closest('[data-ph]'); if (ph) { $('#galimg').src = photoURL(ph.dataset.ph); $$('[data-ph]', back).forEach(b => b.setAttribute('aria-pressed', b === ph)); }
    const pl = e.target.closest('[data-play]'); if (pl) Audio.toggle(soundURL(s), 'sheet:' + s.id);
    const go = e.target.closest('[data-goto]'); if (go) openSheet(go.dataset.goto);
  };
  back.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $('#sclose').focus();
  if (!Game && location.hash.split('/')[0] === '#especes') history.replaceState(null, '', '#especes/' + id);
}
function closeSheet() { const b = $('.sheet-back'); if (b) { b.remove(); if (Audio.owner && Audio.owner.startsWith('sheet:')) Audio.stop(); } }

/* ---------------- progrès ---------------- */
function viewProgress() {
  Audio.stop();
  const sE = SP.filter(hasSound), sP = SP.filter(hasPhoto);
  const mast = (arr, k) => arr.filter(s => Store.mastery(s.id, k).b >= 3).length;
  const t = Store.data.totals, pct = t.answers ? Math.round(t.correct / t.answers * 100) : 0;
  const recs = Object.entries(Store.data.best).sort((a, b) => b[1] - a[1]).slice(0, 10);
  $('#app').innerHTML = `<span class="eyebrow">Sur cet appareil</span><h1 class="display" style="font-size:clamp(2.2rem,8vw,3.4rem)">Mes progrès</h1>
    <p class="lede">Une espèce est maîtrisée quand tu l'as reconnue plusieurs fois de suite. Rien n'est envoyé en ligne : tout reste sur ton téléphone ou ton ordinateur.</p>
    <div class="kpis">
      <div class="kpi"><b>${mast(sE, 'e')}<small style="font-size:1rem;color:var(--muted)"> / ${sE.length}</small></b><span>chants maîtrisés</span></div>
      <div class="kpi"><b>${mast(sP, 'p')}<small style="font-size:1rem;color:var(--muted)"> / ${sP.length}</small></b><span>espèces reconnues en photo</span></div>
      <div class="kpi"><b>${t.answers}</b><span>réponses données</span></div>
      <div class="kpi"><b>${pct} %</b><span>de bonnes réponses</span></div>
    </div>
    <div class="famprog"><div class="fp head"><span>Famille</span><span>Écoute</span><span>Photo</span></div>
      ${FAMS.map(f => { const e = sE.filter(s => s.family === f), p = sP.filter(s => s.family === f);
        const pe = e.length ? mast(e, 'e') / e.length * 100 : 0, pp = p.length ? mast(p, 'p') / p.length * 100 : 0;
        return `<div class="fp"><span>${esc(f)}</span><span title="${mast(e, 'e')} / ${e.length}">${e.length ? `<span class="meter"><div style="width:${pe}%"></div></span>` : '<span class="muted small">–</span>'}</span><span title="${mast(p, 'p')} / ${p.length}">${p.length ? `<span class="meter p"><div style="width:${pp}%"></div></span>` : '<span class="muted small">–</span>'}</span></div>`; }).join('')}
    </div>
    ${recs.length ? `<h2 style="margin-top:26px">Records</h2><div class="records">${recs.map(([k, v]) => `<div class="rec"><span>${esc(configLabel(k))}</span><b>${v}</b></div>`).join('')}</div>` : ''}
    ${weakList()}
    <div class="row" style="margin-top:26px"><button type="button" class="btn ghost" id="reset">Effacer mes progrès</button><span class="small" id="resetmsg"></span></div>`;
  bindRows($('#app'));
  const r = $('#reset'); let armed = false;
  r.onclick = () => { if (!armed) { armed = true; r.textContent = 'Confirmer l\'effacement'; $('#resetmsg').textContent = 'Clique encore pour tout effacer.'; return; }
    Store.data = { m: {}, best: {}, last: Store.data.last, totals: { games: 0, answers: 0, correct: 0 } }; Store.save(); viewProgress(); toast('Progrès effacés'); };
  const w = $('#weakgo'); if (w) w.onclick = () => { const keep = { ...S }; S.mode = 'ecoute'; S.rythme = 'serie'; S.fams = []; startGame(JSON.parse(w.dataset.ids)); S = keep; };
}
function weakList() {
  const rows = [];
  for (const s of SP) for (const k of ['e', 'p']) { const m = Store.mastery(s.id, k); if (m.n && m.c < m.n) rows.push({ s, k, r: m.c / m.n, n: m.n, c: m.c }); }
  rows.sort((a, b) => a.r - b.r || b.n - a.n);
  const top = rows.slice(0, 10); if (!top.length) return '';
  const eIds = top.filter(x => x.k === 'e').map(x => x.s.id);
  return `<h2 style="margin-top:26px">Espèces à retravailler</h2><div class="misslist" style="margin-top:10px">${top.map(x => missRow(x.s).replace('<div class="t">', `<div class="t"><span class="tag${x.k === 'e' ? '' : ' off'}" style="float:right">${x.k === 'e' ? 'Écoute' : 'Photo'} ${x.c}/${x.n}</span>`)).join('')}</div>
    ${eIds.length >= 1 ? `<div class="row" style="margin-top:10px"><button type="button" class="btn" id="weakgo" data-mode="ecoute" data-ids='${JSON.stringify(eIds)}'>Réviser ces chants</button></div>` : ''}`;
}

/* ---------------- à propos ---------------- */
function viewAbout() {
  Audio.stop();
  const light = matchMedia('(prefers-color-scheme: light)').matches;
  const authors = [...new Set(SP.map(s => s.soundBy).filter(Boolean).flatMap(a => a.split(/ & |, /)))].sort((a, b) => a.split(' ').pop().localeCompare(b.split(' ').pop()));
  $('#app').innerHTML = `<article class="prose">
    <div class="about-hero"><img src="assets/logo-cerato-${light ? 'noir' : 'blanc'}.png" alt="Logo de Cerato, association herpétologique de Guyane"><div><span class="eyebrow">À propos</span><h1 class="display" style="font-size:clamp(2.2rem,8vw,3.2rem)">Pourquoi Krapo Kwizz</h1></div></div>
    <p>Je m'appelle Nicolas Burnel, j'ai 21 ans et je suis herpétologue en Guyane. Quand j'ai commencé, reconnaître les espèces m'a donné du fil à retordre. La nuit, au bord d'une mare, des dizaines de chants se superposent, et on ne sait pas par où commencer. À la lampe, certaines rainettes se ressemblent tellement qu'on hésite à chaque fois. J'aurais adoré avoir un outil comme celui-ci pour m'entraîner chez moi, à mon rythme, avant de partir sur le terrain.</p>
    <p>Krapo Kwizz est né de cette envie. L'idée est simple : partager la connaissance avec le plus de monde possible, gratuitement, et donner envie d'aller en forêt écouter les grenouilles et crapauds de Guyane. Que tu sois naturaliste confirmé, étudiant, guide, curieux ou simplement amoureux de la forêt, chaque chant reconnu est une porte d'entrée vers ce monde incroyablement riche.</p>
    <h2>Partage tes observations</h2>
    <p>Apprendre à reconnaître les espèces, c'est aussi pouvoir contribuer à leur connaissance. En Guyane, beaucoup d'espèces restent mal connues : leur répartition, leur période de reproduction, l'état de leurs populations. Les bases de données de science participative sont essentielles pour combler ces lacunes, et chaque observation compte, même d'une espèce commune.</p>
    <p><a href="${CFG.fauneGuyane}" target="_blank" rel="noopener">Faune-Guyane</a> est la base de données naturaliste participative de référence en Guyane. Tu peux y saisir tes observations, et aussi ce que tu as entendu : un chant identifié à l'oreille est une donnée précieuse. Ces données servent directement à la connaissance et à la protection des espèces.</p>
    <div class="callout"><b>Un chant reconnu en forêt ?</b> Note l'espèce, le lieu et la date, et saisis-les sur <a href="${CFG.fauneGuyane}" target="_blank" rel="noopener">faune-guyane.fr</a>.</div>
    <h2>Une première version</h2>
    <p>Krapo Kwizz n'en est qu'à ses débuts. Si tu repères une erreur, un chant mal attribué, un bug, ou si tu as une idée pour améliorer le jeu, écris-moi, toutes les suggestions sont les bienvenues :</p>
    <p class="mail">${CFG.email}</p>
    <h2>Installer l'appli et jouer hors connexion</h2>
    <p>Sur téléphone, ouvre le menu du navigateur et choisis « Ajouter à l'écran d'accueil » : Krapo Kwizz s'ouvre alors comme une appli. Pour jouer sans réseau, en forêt par exemple, télécharge une fois tous les sons et photos (environ ${CFG.offlineMB} Mo) :</p>
    <div class="offline"><div class="row"><button type="button" class="btn" id="dl">Tout télécharger pour le hors-ligne</button><span class="small" id="dlmsg"></span></div><div class="meter" id="dlbar" hidden><div style="width:0"></div></div></div>
    <h2>Crédits</h2>
    <p><b>Chants :</b> sonothèque de l'Atlas des amphibiens de Guyane. Enregistrements de ${authors.map(esc).join(', ')}. L'auteur de chaque chant est indiqué sur la fiche de l'espèce.</p>
    <p><b>Photos, textes et critères d'identification :</b> <i>Guide d'identification des Amphibiens de Guyane</i>, Elven Remérand & Quentin Uriot (2023), et ses photographes : Antoine Fouquet, Augustin Bussac, Arnaud Aury, Axel Marchelie, Benoit Villette, Daniel Baudain, Élodie Courtoie, Elven Remérand, Florent Pouzet, Hugo Foxonet, Maël Dewynter, Philippe Gaucher, Pierre Visquesnel, Quentin Uriot, Sylvain Uriot, Vincent Prémel, Xavier Rufray, ainsi que des photographes du FRAG.</p>
    ${(() => { const extra = [...new Set(SP.map(s => s.photoBy).filter(c => c && !c.startsWith('Guide')).flatMap(c => c.split(/ & |, /)))]; return extra.length ? `<p><b>Autres photos :</b> ${extra.map(esc).join(', ')}. Le crédit de chaque photo est indiqué sur la fiche de l'espèce.</p>` : ''; })()}
    <p><b>Taxonomie :</b> noms mis à jour en 2026, dont <i>Pristimantis flavus</i> et <i>P. fouqueti</i> (Mônico et al. 2025), <i>P. grandoculis</i>, <i>Scinax</i> cf. <i>cruentomma</i> et <i>Otophryne</i> aff. <i>robusta</i>.</p>
    <p><b>Licence :</b> les contenus (sons, photos, textes) sont partagés sous licence <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.fr" target="_blank" rel="noopener">Creative Commons BY-NC 4.0</a>. Tu peux les réutiliser en citant leurs auteurs, sans usage commercial.</p>
    <p class="small">Krapo Kwizz est publié avec Cerato, association herpétologique de Guyane. Conception : Nicolas Burnel.</p>
  </article>`;
  $('#dl').onclick = downloadAll;
}
async function downloadAll() {
  const urls = [...SP.filter(hasSound).map(soundURL), ...SP.flatMap(s => s.photos.map(photoURL))];
  const bar = $('#dlbar'), msg = $('#dlmsg'); bar.hidden = false; let n = 0, fail = 0;
  if (!('caches' in window)) { msg.textContent = 'Ton navigateur ne permet pas le hors-ligne.'; return; }
  const cache = await caches.open('kk-media-v1');
  const queue = urls.slice();
  async function worker() { while (queue.length) { const u = queue.shift(); try { if (!(await cache.match(u))) { const r = await fetch(u); if (r.ok) await cache.put(u, r); else fail++; } } catch (e) { fail++; } n++; bar.firstElementChild.style.width = (n / urls.length * 100) + '%'; msg.textContent = `${n} / ${urls.length}`; } }
  await Promise.all([worker(), worker(), worker(), worker()]);
  msg.textContent = fail ? `Terminé, ${fail} fichier(s) n'ont pas pu être téléchargés. Réessaie avec une meilleure connexion.` : 'Tout est prêt : tu peux jouer sans connexion.';
}

/* ---------------- démarrage ---------------- */
(async function boot() {
  Store.load(); Audio.init();
  Audio.listeners.add(syncPlay);
  try { await loadData(); }
  catch (e) { $('#app').innerHTML = '<p class="loading">Impossible de charger les espèces. Vérifie ta connexion puis recharge la page.</p>'; return; }
  loadSettings();
  const dl = document.createElement('datalist'); dl.id = 'kk-names';
  dl.innerHTML = [...new Set(SP.flatMap(s => [s.name]))].sort().map(n => `<option value="${esc(n)}">`).join(''); document.body.appendChild(dl);
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', () => { if (Game && location.hash !== '#partie') endGame(); });
  if (location.hash === '#partie') history.replaceState(null, '', '#jouer');
  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
