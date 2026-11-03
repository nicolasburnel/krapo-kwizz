/* Krapo Kwizz — comptes facultatifs, carnets partagés, classements, battles et parties en direct.
   Service en ligne : Firebase (Authentication + Firestore), projet « krapo-kwizz ».
   Le jeu fonctionne entièrement sans compte : ce fichier n'ajoute que les fonctions en ligne. */
'use strict';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAgZg1leBhO06QzrQCP-vXVul298y7yocg',
  authDomain: 'krapo-kwizz.firebaseapp.com',
  projectId: 'krapo-kwizz',
  storageBucket: 'krapo-kwizz.firebasestorage.app',
  messagingSenderId: '438813192180',
  appId: '1:438813192180:web:1457608364acf49813d3a1',
};
const LIVE = { questions: 10, seconds: 20, revealMs: 4000 };
const BAD_WORDS = ['con', 'conne', 'connard', 'connasse', 'pute', 'putain', 'salope', 'encule', 'enculé', 'merde', 'bite', 'couille', 'nique', 'niquer', 'pd', 'pede', 'pédé', 'tapette', 'negro', 'negre', 'nègre', 'bougnoule', 'youpin', 'nazi', 'hitler', 'fuck', 'shit', 'bitch', 'cunt', 'dick', 'nigger', 'nigga', 'fag', 'whore', 'sex', 'porn', 'admin', 'moderateur', 'krapokwizz'];

/* ---------------- couche Firebase ---------------- */
const Cloud = window.KK_MOCK_CLOUD || {
  ready: null, auth: null, db: null, user: null, listeners: new Set(),
  load() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = 'js/vendor/firebase-kk.js';
      s.onload = () => {
        try {
          const app = FB.initializeApp(FIREBASE_CONFIG);
          this.auth = FB.getAuth(app); this.db = FB.initializeFirestore(app, {});
          let first = true;
          FB.onAuthStateChanged(this.auth, u => { this.user = u; this.listeners.forEach(f => f(u)); if (first) { first = false; resolve(); } });
        } catch (e) { reject(e); }
      };
      s.onerror = () => reject(new Error('Impossible de charger le service en ligne.'));
      document.head.appendChild(s);
    });
    return this.ready;
  },
  onUser(f) { this.listeners.add(f); },
  uid() { return this.user && this.user.uid; },
  isAnon() { return !!(this.user && this.user.isAnonymous); },
  email() { return this.user && this.user.email; },
  async signInAnon() { await FB.signInAnonymously(this.auth); },
  async sendLink(email) { await FB.sendSignInLinkToEmail(this.auth, email, { url: siteURL() + '?connexion=1', handleCodeInApp: true }); },
  isLink(url) { return this.auth && FB.isSignInWithEmailLink(this.auth, url); },
  async completeLink(email, url) {
    if (this.user && this.user.isAnonymous) {
      try { await FB.linkWithCredential(this.user, FB.EmailAuthProvider.credentialWithLink(email, url)); return 'linked'; }
      catch (e) { if (!/credential-already-in-use|email-already-in-use/.test(e.code || '')) throw e; }
    }
    await FB.signInWithEmailLink(this.auth, email, url); return 'signed';
  },
  async signOut() { await FB.signOut(this.auth); },
  async deleteUser() { await FB.deleteUser(this.user); },
  ref(path) { return FB.doc(this.db, path); },
  async get(path) { const s = await FB.getDoc(this.ref(path)); return s.exists() ? s.data() : null; },
  async set(path, data, merge = false) { await FB.setDoc(this.ref(path), data, { merge }); },
  async update(path, data) { await FB.updateDoc(this.ref(path), data); },
  async del(path) { await FB.deleteDoc(this.ref(path)); },
  async reserve(pseudoMin, uid, profile) {
    await FB.runTransaction(this.db, async tx => {
      const p = await tx.get(this.ref('pseudos/' + pseudoMin));
      if (p.exists() && p.data().uid !== uid) throw new Error('pseudo-pris');
      if (!p.exists()) tx.set(this.ref('pseudos/' + pseudoMin), { uid });
      tx.set(this.ref('profils/' + uid), profile, { merge: true });
    });
  },
  async top(col, field, n) { const s = await FB.getDocs(FB.query(FB.collection(this.db, col), FB.orderBy(field, 'desc'), FB.limit(n))); return s.docs.map(d => ({ id: d.id, ...d.data() })); },
  async all(col) { const s = await FB.getDocs(FB.collection(this.db, col)); return s.docs.map(d => ({ id: d.id, ...d.data() })); },
  listen(path, cb) { return FB.onSnapshot(this.ref(path), s => cb(s.exists() ? s.data() : null), () => cb(null)); },
  listenCol(col, cb, whereField, whereVal) {
    const q = whereField ? FB.query(FB.collection(this.db, col), FB.where(whereField, '==', whereVal)) : FB.collection(this.db, col);
    return FB.onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => cb([]));
  },
  inc(n) { return FB.increment(n); },
  now() { return FB.serverTimestamp(); },
};

/* ---------------- utilitaires ---------------- */
const pseudoMin = p => norm(p).replace(/\s+/g, '-');
function pseudoProblem(p) {
  p = (p || '').trim();
  if (p.length < 3 || p.length > 20) return 'Entre 3 et 20 caractères.';
  if (!/^[\p{L}\p{N}_\- .]+$/u.test(p)) return 'Lettres, chiffres, espaces, tirets et points seulement.';
  const n = ' ' + norm(p).replace(/[^a-z0-9]+/g, ' ') + ' ', flat = norm(p).replace(/[^a-z0-9]/g, '');
  if (BAD_WORDS.some(w => { const b = norm(w); return n.includes(' ' + b + ' ') || (b.length >= 5 && flat.includes(b)); })) return 'Ce pseudo n\'est pas accepté.';
  return '';
}
const randCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join('');
const randId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const modeId = key => key.replace(/\//g, '_').replace(/[^a-zA-Z0-9_+-]/g, '');
function errMsg(e) {
  const c = (e && (e.code || e.message)) || '';
  if (/pseudo-pris/.test(c)) return 'Ce pseudo est déjà pris, choisis-en un autre.';
  if (/network|unavailable|offline|Impossible de charger/.test(c)) return 'Pas de connexion au service en ligne. Vérifie ton réseau et réessaie.';
  if (/permission/.test(c)) return `Action refusée par le serveur (${c}).`;
  if (/operation-not-allowed|admin-restricted|configuration-not-found/.test(c)) return `Connexion désactivée dans Firebase (${c}).`;
  if (/invalid-email/.test(c)) return 'Adresse e-mail invalide.';
  if (/requires-recent-login/.test(c)) return 'Par sécurité, reconnecte-toi avec le lien e-mail puis recommence.';
  if (/invalid-action-code|expired-action-code/.test(c)) return 'Ce lien de connexion a expiré ou a déjà servi. Demande-en un nouveau.';
  console.error('Krapo Kwizz', e);
  return `Une erreur est survenue (${String(c).slice(0, 80)}). Réessaie dans un instant.`;
}
const LS = { get(k) { try { return localStorage.getItem('kk.' + k); } catch (e) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem('kk.' + k) : localStorage.setItem('kk.' + k, v); } catch (e) {} } };
const dateFr = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
const MODE_LABEL = { ecoute: 'Écoute', photo: 'Photo', mixte: 'Écoute + photo' };
const LEVEL_LABEL = { decouverte: 'Découverte', inter: 'Intermédiaire', expert: 'Expert' };
const LEADERBOARDS = [
  ['ecoute/noms/inter/serie/toutes', 'Écoute · 4 noms · Intermédiaire'],
  ['ecoute/noms/expert/serie/toutes', 'Écoute · 4 noms · Expert'],
  ['ecoute/photos/inter/serie/toutes', 'Écoute · 4 photos'],
  ['ecoute/saisie/inter/serie/toutes', 'Écoute · saisie libre'],
  ['photo//inter/serie/toutes', 'Photo · Intermédiaire'],
  ['photo//expert/serie/toutes', 'Photo · Expert'],
  ['photo//maitre/serie/toutes', 'Photo · Maître'],
  ['ecoute/noms/inter/chrono/toutes', 'Chrono · Écoute'],
  ['photo//inter/chrono/toutes', 'Chrono · Photo'],
  ['ecoute/noms/inter/survie/toutes', 'Survie · Écoute'],
  ['mare/inter/random', 'Ambiance mare · Intermédiaire'],
  ['mare/expert/random', 'Ambiance mare · Expert'],
];

/* ---------------- état du compte ---------------- */
const Social = window.Social = {
  started: false, profile: null, busy: false, syncTimer: 0, salonUnsubs: [], hostTimer: 0, salon: null,

  async start() {
    if (this.started) return this.ready; this.started = true;
    this.ready = (async () => {
      try { await Cloud.load(); } catch (e) { this.offline = true; return; }
      Cloud.onUser(() => this.loadProfile());
      await this.loadProfile();
      if (Cloud.isLink(location.href)) await this.finishEmailLink();
    })();
    this.ready.then(() => { this.loaded = true; this.refreshViews(); });
    return this.ready;
  },
  async ensure() { await this.start(); if (this.offline) throw new Error('offline'); },
  signedIn() { return !!(Cloud.uid() && this.profile); },
  async loadProfile() {
    const uid = Cloud.uid(); if (!uid) { this.profile = null; this.refreshViews(); return; }
    try { this.profile = await Cloud.get('profils/' + uid); } catch (e) { this.profile = null; }
    if (this.profile) { LS.set('account', '1'); this.mergeRemote(this.profile); }
    this.refreshViews();
  },
  refreshViews() {
    const h = location.hash.split('/')[0];
    if (h === '#progres') { const c = $('#account'); if (c) { c.outerHTML = this.accountCardHTML(); this.bindAccountCard(); } }
    if (h === '#ensemble' && !Game) this.viewEnsemble();
  },
  mergeRemote(p) {
    let changed = false;
    for (const [id, st] of Object.entries(p.carnet || {})) { const cur = Store.data.carnet[id]; if (!cur || (cur.s === 'entendu' && st === 'vu')) { Store.data.carnet[id] = { s: st, d: todayStr() }; changed = true; } }
    for (const b of p.badges || []) if (!Store.data.badges[b]) { Store.data.badges[b] = todayStr(); changed = true; }
    if (changed) { try { localStorage.setItem(CFG.storeKey, JSON.stringify(Store.data)); } catch (e) {} }
  },
  snapshot() {
    const sE = SP.filter(hasSound), sP = SP.filter(hasPhoto);
    const carnet = Object.fromEntries(Object.entries(Store.data.carnet).map(([id, v]) => [id, v.s]));
    return { carnet, badges: Object.keys(Store.data.badges), nE: mastered('e', sE), nP: mastered('p', sP), nVu: carnetCount('vu'), nEnt: carnetCount('entendu'),
      reponses: Store.data.totals.answers, bonnes: Store.data.totals.correct, maj: Cloud.now() };
  },
  queueSync() { if (!this.signedIn()) return; clearTimeout(this.syncTimer); this.syncTimer = setTimeout(() => this.sync(), 3000); },
  async sync() { if (!this.signedIn()) return; try { await Cloud.set('profils/' + Cloud.uid(), this.snapshot(), true); } catch (e) {} },

  async createProfile(pseudo) {
    pseudo = pseudo.trim(); const pb = pseudoProblem(pseudo); if (pb) throw new Error(pb);
    await this.ensure();
    if (!Cloud.uid()) await Cloud.signInAnon();
    const uid = Cloud.uid(), min = pseudoMin(pseudo);
    const prof = { pseudo, pseudoMin: min, cree: Cloud.now(), jours: [], battles: [], modes: [], ...this.snapshot() };
    await Cloud.reserve(min, uid, prof);
    this.profile = await Cloud.get('profils/' + uid); LS.set('account', '1');
    const d = todayStr(); if (Store.data.daily[d]) this.onDaily(d, Store.data.daily[d]);
    for (const [k] of LEADERBOARDS) if (Store.data.best[k]) this.onScore(k, Store.data.best[k]);
  },
  async onDaily(date, res) {
    if (!this.signedIn()) return;
    try {
      await Cloud.set(`defis/${date}/scores/${Cloud.uid()}`, { pseudo: this.profile.pseudo, score: res.score | 0, correct: res.correct | 0, n: res.n | 0, grid: res.grid.join(''), t: Cloud.now() });
      const jours = [...new Set([...(this.profile.jours || []), date])].slice(-60); this.profile.jours = jours;
      await Cloud.update('profils/' + Cloud.uid(), { jours });
    } catch (e) {}
  },
  async onScore(key, score) {
    if (!this.signedIn() || !LEADERBOARDS.some(l => l[0] === key)) return;
    if (score < (Store.data.best[key] || 0)) return;
    const m = modeId(key);
    try {
      await Cloud.set(`classements/${m}/scores/${Cloud.uid()}`, { pseudo: this.profile.pseudo, score: score | 0, t: Cloud.now() });
      if (!(this.profile.modes || []).includes(m)) { this.profile.modes = [...(this.profile.modes || []), m]; await Cloud.update('profils/' + Cloud.uid(), { modes: this.profile.modes }); }
    } catch (e) {}
  },
  async sendLink(email, mode) {
    await this.ensure(); await Cloud.sendLink(email); LS.set('email', email); LS.set('linkmode', mode);
  },
  async finishEmailLink() {
    let email = LS.get('email');
    if (!email) { email = await askEmail(); if (!email) return; }
    try {
      const r = await Cloud.completeLink(email, location.href);
      LS.set('email', null); LS.set('linkmode', null);
      history.replaceState(null, '', siteURL() + '#progres');
      await this.loadProfile();
      toast(r === 'linked' ? 'Ton e-mail est relié à ton compte.' : this.profile ? `Bon retour, ${this.profile.pseudo} !` : 'Connecté. Choisis maintenant ton pseudo.');
      route();
    } catch (e) { toast(errMsg(e)); history.replaceState(null, '', siteURL() + '#progres'); }
  },
  async signOut() { await Cloud.signOut(); this.profile = null; LS.set('account', null); toast('Déconnecté.'); this.refreshViews(); },
  async deleteAccount() {
    const uid = Cloud.uid(), p = this.profile || {};
    const tasks = [];
    (p.jours || []).forEach(d => tasks.push(Cloud.del(`defis/${d}/scores/${uid}`)));
    (p.modes || []).forEach(m => tasks.push(Cloud.del(`classements/${m}/scores/${uid}`)));
    (p.battles || []).forEach(b => tasks.push(Cloud.del(`battles/${b}/resultats/${uid}`)));
    await Promise.allSettled(tasks);
    if (p.pseudoMin) await Cloud.del('pseudos/' + p.pseudoMin).catch(() => {});
    await Cloud.del('profils/' + uid);
    try { await Cloud.deleteUser(); } catch (e) { await Cloud.signOut().catch(() => {}); }
    this.profile = null; LS.set('account', null);
  },

  /* ---------- carte « compte » (page Profil) ---------- */
  accountCardHTML() {
    if (!this.started) this.start();
    if (!this.loaded && !this.offline) return `<section class="account" id="account"><p class="small" style="margin:0">Connexion au compte…</p></section>`;
    if (this.offline) return `<section class="account" id="account"><b>Compte en ligne</b><p class="small" style="margin:4px 0 0">Le service en ligne n'est pas joignable pour l'instant. Le jeu fonctionne normalement sans compte.</p></section>`;
    if (this.signedIn()) {
      const p = this.profile, anon = Cloud.isAnon();
      return `<section class="account on" id="account">
        <div class="acc-head"><span class="avatar">${esc(p.pseudo.slice(0, 1).toUpperCase())}</span><div><span class="eyebrow">Connecté</span><b class="acc-name">${esc(p.pseudo)}</b>${Cloud.email() ? `<span class="small">${esc(Cloud.email())}</span>` : ''}</div></div>
        ${anon ? `<div class="acc-box"><b>Sauvegarde ton compte</b><p class="small">Ajoute ton e-mail pour retrouver ton pseudo, ton carnet et tes scores sur un autre appareil. Il ne sera jamais affiché ni utilisé pour autre chose.</p>
          <form class="free" id="acc-link"><input type="email" id="acc-email" placeholder="ton@email.fr" autocomplete="email" aria-label="Adresse e-mail" required><button class="btn" type="submit">Recevoir le lien</button></form></div>` : ''}
        <div class="row"><a class="btn" href="#joueur/${encodeURIComponent(p.pseudoMin)}">Mon profil public</a><button type="button" class="btn ghost" id="acc-out">Se déconnecter</button><button type="button" class="btn ghost danger" id="acc-del">Supprimer mon compte</button></div>
        <p class="small" id="acc-msg"></p></section>`;
    }
    return `<section class="account" id="account">
      <span class="eyebrow">Facultatif</span><b class="acc-title">Crée ton profil de joueur</b>
      <p class="small" style="margin:2px 0 10px">Un simple pseudo pour comparer ton carnet avec tes amis, apparaître dans les classements, lancer des battles et jouer en direct. Aucune donnée personnelle n'est demandée. <a href="#confidentialite">Confidentialité</a></p>
      <form class="free" id="acc-create"><input id="acc-pseudo" maxlength="20" placeholder="Ton pseudo" autocomplete="nickname" aria-label="Pseudo" required><button class="btn primary" type="submit">Créer mon profil</button></form>
      <details class="acc-more"><summary>J'ai déjà un compte sur un autre appareil</summary>
        <p class="small">Si tu as relié ton e-mail à ton compte, reçois un lien de connexion :</p>
        <form class="free" id="acc-signin"><input type="email" id="acc-email2" placeholder="ton@email.fr" autocomplete="email" aria-label="Adresse e-mail" required><button class="btn" type="submit">Recevoir le lien</button></form></details>
      <p class="small" id="acc-msg"></p></section>`;
  },
  bindAccountCard() {
    const msg = t => { const m = $('#acc-msg'); if (m) m.textContent = t; };
    const busy = (f, b) => async e => { e && e.preventDefault(); if (this.busy) return; this.busy = true; if (b) b.disabled = true; try { await f(); } catch (err) { msg(err.message && !err.code && !/offline/.test(err.message) ? err.message : errMsg(err)); } this.busy = false; if (b) b.disabled = false; };
    const c = $('#acc-create'); if (c) c.onsubmit = busy(async () => { msg('Création…'); await this.createProfile($('#acc-pseudo').value); toast(`Bienvenue ${this.profile.pseudo} !`); this.refreshViews(); }, $('#acc-create button'));
    const s = $('#acc-signin'); if (s) s.onsubmit = busy(async () => { await this.sendLink($('#acc-email2').value.trim(), 'signin'); msg('Lien envoyé ! Ouvre l\'e-mail sur cet appareil et clique dessus (pense à regarder les spams).'); }, $('#acc-signin button'));
    const l = $('#acc-link'); if (l) l.onsubmit = busy(async () => { await this.sendLink($('#acc-email').value.trim(), 'link'); msg('Lien envoyé ! Clique dessus depuis cet appareil pour relier ton e-mail (pense à regarder les spams).'); }, $('#acc-link button'));
    const o = $('#acc-out'); if (o) o.onclick = () => {
      if (Cloud.isAnon() && o.dataset.armed !== '1') { o.dataset.armed = '1'; o.textContent = 'Confirmer'; msg('Sans e-mail relié, tu ne pourras plus retrouver ce compte après la déconnexion.'); return; }
      busy(() => this.signOut(), o)();
    };
    const d = $('#acc-del'); if (d) d.onclick = () => {
      if (d.dataset.armed !== '1') { d.dataset.armed = '1'; d.textContent = 'Confirmer la suppression'; msg('Ton pseudo, ton carnet en ligne, tes scores et tes résultats de battles seront effacés du serveur. Tes données sur cet appareil sont conservées.'); return; }
      busy(async () => { await this.deleteAccount(); toast('Compte supprimé.'); this.refreshViews(); }, d)();
    };
  },
  requireAccountHTML(what) {
    return `<div class="account" id="account">${this.offline ? '<p class="small">Le service en ligne n\'est pas joignable pour l\'instant.</p>' : `<b class="acc-title">Il te faut un pseudo pour ${what}</b>
      <form class="free" id="acc-create" style="margin-top:8px"><input id="acc-pseudo" maxlength="20" placeholder="Ton pseudo" aria-label="Pseudo" required><button class="btn primary" type="submit">C'est parti</button></form>
      <p class="small">Aucune donnée personnelle n'est demandée. <a href="#confidentialite">Confidentialité</a> · Déjà un compte ? <a href="#progres">Connexion</a></p><p class="small" id="acc-msg"></p>`}</div>`;
  },

  /* ---------- page Ensemble ---------- */
  async viewEnsemble() {
    Audio.stop();
    const app = $('#app');
    app.innerHTML = `<span class="eyebrow">Jouer à plusieurs</span><h1 class="display" style="font-size:clamp(2.2rem,8vw,3.4rem)">Ensemble</h1>
      <p class="lede">Défie tes amis, joue en direct, compare vos carnets et grimpe dans les classements.</p><div id="ens"><p class="loading">Connexion…</p></div>`;
    await this.start();
    if (location.hash.split('/')[0] !== '#ensemble') return;
    const box = $('#ens');
    if (!this.signedIn()) { box.innerHTML = this.requireAccountHTML('jouer avec les autres'); this.bindAccountCard(); return; }
    const p = this.profile;
    box.innerHTML = `
      <section class="ens-card"><div class="ens-h"><span class="ico">${ICON.ear}</span><div><b>Partie en direct</b><span>Même question au même moment pour tout le monde. Le plus rapide marque le plus.</span></div></div>
        ${this.cfgHTML('live')}
        <div class="row"><button type="button" class="btn primary" id="live-new">Créer un salon</button></div>
        <form class="free" id="live-join" style="margin-top:10px"><input id="live-code" maxlength="4" placeholder="Code (ex. KWZA)" aria-label="Code du salon" autocapitalize="characters" style="text-transform:uppercase"><button class="btn" type="submit">Rejoindre</button></form></section>
      <section class="ens-card"><div class="ens-h"><span class="ico">${ICON.share}</span><div><b>Battle à distance</b><span>Joue 10 questions, puis envoie le lien : tes amis jouent les mêmes quand ils veulent.</span></div></div>
        ${this.cfgHTML('battle')}
        <div class="row"><button type="button" class="btn primary" id="battle-new">Créer une battle et jouer</button></div>
        ${(p.battles || []).length ? `<p class="small" style="margin:10px 0 4px">Mes battles récentes :</p><div class="chips">${(p.battles || []).slice(-8).reverse().map(b => `<a class="chip" href="#battle/${b}">${b}</a>`).join('')}</div>` : ''}</section>
      <section class="ens-card"><div class="ens-h"><span class="ico">${ICON.eye}</span><div><b>Comparer les carnets</b><span>Cherche un joueur par son pseudo pour voir ses observations à côté des tiennes.</span></div></div>
        <form class="free" id="find"><input id="find-q" placeholder="Pseudo d'un joueur" aria-label="Pseudo à chercher"><button class="btn" type="submit">Voir</button></form><p class="small" id="find-msg"></p></section>
      <section class="ens-card"><div class="ens-h"><span class="ico">${ICON.sun}</span><div><b>Classements</b><span>Le défi du jour et les meilleurs scores par mode.</span></div></div>
        <select id="lb-sel" aria-label="Classement"><option value="daily">Défi du jour · ${dateFr(todayStr())}</option>${LEADERBOARDS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <div id="lb"><p class="loading">Chargement…</p></div></section>`;
    for (const k of ['live', 'battle']) this.bindCfg(k);
    $('#live-new').onclick = () => this.createSalon();
    $('#live-join').onsubmit = e => { e.preventDefault(); const c = $('#live-code').value.trim().toUpperCase(); if (c.length === 4) location.hash = '#salon/' + c; };
    $('#battle-new').onclick = () => this.createBattle();
    $('#find').onsubmit = async e => { e.preventDefault(); const q = $('#find-q').value.trim(); if (!q) return; const min = pseudoMin(q); const ok = await Cloud.get('pseudos/' + min).catch(() => null);
      if (ok) location.hash = '#joueur/' + encodeURIComponent(min); else $('#find-msg').textContent = 'Aucun joueur avec ce pseudo.'; };
    $('#lb-sel').onchange = () => this.loadBoard($('#lb-sel').value);
    this.loadBoard('daily');
  },
  cfg: { live: { mode: 'ecoute', level: 'inter' }, battle: { mode: 'mixte', level: 'inter' } },
  cfgHTML(k) {
    const c = this.cfg[k];
    return `<div class="ens-cfg">${segHTML('seg-' + k + '-mode', { ecoute: ['Écoute', ''], photo: ['Photo', ''], mixte: ['Mixte', ''] }, c.mode)}${segHTML('seg-' + k + '-level', { decouverte: ['Découverte', ''], inter: ['Intermédiaire', ''], expert: ['Expert', ''] }, c.level)}</div>`;
  },
  bindCfg(k) {
    for (const f of ['mode', 'level']) { const el = $(`#seg-${k}-${f}`); el.onclick = e => { const b = e.target.closest('button'); if (!b) return; this.cfg[k][f] = b.dataset.v; $$('button', el).forEach(x => x.setAttribute('aria-pressed', x === b)); }; }
  },
  async loadBoard(key) {
    const box = $('#lb'); box.innerHTML = '<p class="loading">Chargement…</p>';
    try {
      const rows = key === 'daily' ? await Cloud.top(`defis/${todayStr()}/scores`, 'score', 30) : await Cloud.top(`classements/${modeId(key)}/scores`, 'score', 30);
      const me = Cloud.uid();
      box.innerHTML = rows.length ? `<ol class="board">${rows.map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span class="rk">${i + 1}</span><a href="#joueur/${encodeURIComponent(pseudoMin(r.pseudo))}">${esc(r.pseudo)}</a>${r.grid ? `<span class="gr">${esc(r.grid)}</span>` : ''}<b>${r.score}</b></li>`).join('')}</ol>`
        : `<p class="small">${key === 'daily' ? 'Personne n\'a encore relevé le défi du jour. Sois le premier !' : 'Pas encore de score dans ce classement.'}</p>`;
    } catch (e) { box.innerHTML = `<p class="small">${errMsg(e)}</p>`; }
  },

  /* ---------- profil public et comparaison ---------- */
  async viewJoueur(min) {
    Audio.stop();
    $('#app').innerHTML = '<p class="loading">Chargement du profil…</p>';
    try {
      await this.ensure();
      const ps = await Cloud.get('pseudos/' + min); const prof = ps && await Cloud.get('profils/' + ps.uid);
      if (!prof) { $('#app').innerHTML = '<p class="loading">Ce joueur n\'existe pas ou a supprimé son compte.</p><a class="btn" href="#ensemble">Retour</a>'; return; }
      const mine = Object.fromEntries(Object.entries(Store.data.carnet).map(([id, v]) => [id, v.s])), his = prof.carnet || {};
      const isMe = ps.uid === Cloud.uid();
      const both = SP.filter(s => mine[s.id] && his[s.id]), onlyHim = SP.filter(s => his[s.id] && !mine[s.id]), onlyMe = SP.filter(s => mine[s.id] && !his[s.id]);
      const item = (s, st) => `<button type="button" class="cmp-it" data-sheet="${s.id}">${s.photos.length ? `<img src="${photoURL(s.photos[0])}" alt="" loading="lazy">` : '<span class="noimg"></span>'}<span><span class="nm">${sciHTML(s.name)}</span><span class="vn">${st === 'vu' ? 'vue' : st === 'entendu' ? 'entendue' : ''}</span></span></button>`;
      const col = (title, arr, who) => `<section class="cmp-col"><h3>${title} <span>${arr.length}</span></h3><div>${arr.length ? arr.map(s => item(s, who === 'him' ? his[s.id] : mine[s.id])).join('') : '<p class="small">Aucune</p>'}</div></section>`;
      $('#app').innerHTML = `<div class="acc-head" style="margin-bottom:8px"><span class="avatar big">${esc(prof.pseudo.slice(0, 1).toUpperCase())}</span><div><span class="eyebrow">Profil de joueur</span><h1 class="display" style="font-size:clamp(2rem,7vw,3rem)">${esc(prof.pseudo)}</h1></div></div>
        <div class="kpis"><div class="kpi"><b>${prof.nVu || 0}</b><span>espèces vues</span></div><div class="kpi"><b>${prof.nEnt || 0}</b><span>entendues seulement</span></div><div class="kpi"><b>${prof.nE || 0}</b><span>chants maîtrisés</span></div><div class="kpi"><b>${(prof.badges || []).length}</b><span>badges</span></div></div>
        ${isMe ? '<p class="small" style="margin-top:14px">C\'est ton profil public : voici ce que les autres joueurs voient.</p>' : `<h2 style="margin-top:24px">Vos carnets</h2><div class="cmp">${col('Vous deux', both, 'me')}${col(`Seulement ${esc(prof.pseudo)}`, onlyHim, 'him')}${col('Seulement toi', onlyMe, 'me')}</div>`}
        <div class="row" style="margin-top:22px"><a class="btn" href="#ensemble">Retour</a></div>`;
      bindRows($('#app'));
    } catch (e) { $('#app').innerHTML = `<p class="loading">${errMsg(e)}</p><a class="btn" href="#ensemble">Retour</a>`; }
  },

  /* ---------- battles ---------- */
  async createBattle() {
    const c = this.cfg.battle, id = randId();
    const questions = buildFixed(c.mode, c.level, 10, hashStr(id));
    const label = `Battle · ${MODE_LABEL[c.mode]} · ${LEVEL_LABEL[c.level]}`;
    try {
      await Cloud.set('battles/' + id, { par: { uid: Cloud.uid(), pseudo: this.profile.pseudo }, mode: c.mode, level: c.level, label, questions, cree: Cloud.now() });
      this.profile.battles = [...(this.profile.battles || []), id].slice(-30); await Cloud.update('profils/' + Cloud.uid(), { battles: this.profile.battles });
    } catch (e) { return toast(errMsg(e)); }
    this.playBattle(id, questions, label);
  },
  playBattle(id, questions, label) {
    startFixed(questions, { key: 'battle', label: 'Battle', onFinish: async g => {
      document.body.classList.remove('in-game'); Game = null; Audio.stop();
      $('#app').innerHTML = '<p class="loading">Envoi du résultat…</p>';
      try {
        await Cloud.set(`battles/${id}/resultats/${Cloud.uid()}`, { pseudo: this.profile.pseudo, score: g.score | 0, correct: g.correct | 0, n: questions.length, grid: g.grid.join(''), t: Cloud.now() });
        if (!(this.profile.battles || []).includes(id)) { this.profile.battles = [...(this.profile.battles || []), id].slice(-30); await Cloud.update('profils/' + Cloud.uid(), { battles: this.profile.battles }); }
      } catch (e) { toast(errMsg(e)); }
      history.replaceState(null, '', '#battle/' + id); this.viewBattle(id, true);
      setTimeout(checkBadges, 400);
    } });
  },
  async viewBattle(id, justPlayed) {
    Audio.stop();
    $('#app').innerHTML = '<p class="loading">Chargement de la battle…</p>';
    try {
      await this.ensure();
      const b = await Cloud.get('battles/' + id);
      if (!b) { $('#app').innerHTML = '<p class="loading">Cette battle n\'existe pas ou a été supprimée.</p><a class="btn" href="#ensemble">Retour</a>'; return; }
      const res = (await Cloud.all(`battles/${id}/resultats`)).sort((a, c) => c.score - a.score);
      const me = Cloud.uid(), played = res.some(r => r.id === me);
      const questions = b.questions.filter(q => BYID[q.id] && q.choices.every(c => BYID[c]));
      const link = `${siteURL()}#battle/${id}`;
      $('#app').innerHTML = `<span class="eyebrow">${esc(b.label)}</span><h1 class="display" style="font-size:clamp(2rem,7vw,3rem)">Battle de ${esc(b.par.pseudo)}</h1>
        <p class="lede">${questions.length} questions, les mêmes pour tous les joueurs.</p>
        ${res.length ? `<ol class="board big">${res.map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span class="rk">${i === 0 ? '🏆' : i + 1}</span><a href="#joueur/${encodeURIComponent(pseudoMin(r.pseudo))}">${esc(r.pseudo)}</a><span class="gr">${esc(r.grid || '')}</span><b>${r.correct}/${r.n} · ${r.score}</b></li>`).join('')}</ol>` : '<p class="small">Personne n\'a encore joué.</p>'}
        <div id="bt-act" style="margin-top:18px"></div>`;
      const act = $('#bt-act');
      if (!this.signedIn()) { act.innerHTML = this.requireAccountHTML('relever ce défi'); this.bindAccountCard(); return; }
      if (!played) { act.innerHTML = `<button type="button" class="btn primary big" id="bt-go">Relever le défi</button>`; $('#bt-go').onclick = () => this.playBattle(id, questions, b.label); return; }
      act.innerHTML = `${justPlayed ? '<p class="record" style="margin:0 0 10px">Résultat enregistré ! Envoie le lien à tes amis :</p>' : '<p class="small">Envoie le lien à tes amis pour qu\'ils jouent les mêmes questions :</p>'}
        <div class="copyline"><input readonly value="${esc(link)}" aria-label="Lien de la battle" id="bt-link"><button type="button" class="btn primary" id="bt-share">${ICON.share} Partager</button></div>
        <div class="row" style="margin-top:12px"><button type="button" class="btn ghost" id="bt-refresh">Actualiser les résultats</button><a class="btn ghost" href="#ensemble">Retour</a></div>`;
      const mine = res.find(r => r.id === me);
      $('#bt-share').onclick = () => shareText(`⚔️ Battle Krapo Kwizz : j'ai fait ${mine.correct}/${mine.n} (${mine.score} pts) en ${b.label.replace('Battle · ', '')}. À toi de battre mon score !\n${link}`.replace('\n' + link, ''));
      $('#bt-link').onclick = e => e.target.select();
      $('#bt-refresh').onclick = () => this.viewBattle(id);
    } catch (e) { $('#app').innerHTML = `<p class="loading">${errMsg(e)}</p><a class="btn" href="#ensemble">Retour</a>`; }
  },

  /* ---------- parties en direct ---------- */
  async createSalon() {
    const c = this.cfg.live; let code = randCode();
    try {
      for (let i = 0; i < 5 && await Cloud.get('salons/' + code); i++) code = randCode();
      const questions = buildFixed(c.mode, c.level, LIVE.questions, hashStr(code + Date.now()));
      await Cloud.set('salons/' + code, { hote: Cloud.uid(), hotePseudo: this.profile.pseudo, etat: 'attente', phase: 'q', idx: -1, mode: c.mode, level: c.level, questions, duree: LIVE.seconds, cree: Cloud.now() });
      location.hash = '#salon/' + code;
    } catch (e) { toast(errMsg(e)); }
  },
  leaveSalonView() { if (this.salon) document.body.classList.remove('in-game'); this.salonUnsubs.forEach(u => { try { u(); } catch (e) {} }); this.salonUnsubs = []; clearInterval(this.hostTimer); this.hostTimer = 0; this.salon = null; },
  async viewSalon(code) {
    this.leaveSalonView(); Audio.stop();
    code = (code || '').toUpperCase();
    $('#app').innerHTML = '<p class="loading">Connexion au salon…</p>';
    try { await this.ensure(); } catch (e) { $('#app').innerHTML = `<p class="loading">${errMsg(e)}</p>`; return; }
    if (!this.signedIn()) { $('#app').innerHTML = `<h1 class="display" style="font-size:2.4rem">Salon ${esc(code)}</h1>` + this.requireAccountHTML('rejoindre la partie'); this.bindAccountCard(); return; }
    const S2 = this.salon = { code, doc: null, players: [], answers: [], shownIdx: -2, shownPhase: '', answered: false, qT0: 0, myAns: null };
    const me = Cloud.uid();
    try {
      const d = await Cloud.get('salons/' + code);
      if (!d) { $('#app').innerHTML = `<p class="loading">Aucun salon avec le code ${esc(code)}.</p><a class="btn" href="#ensemble">Retour</a>`; return; }
      const j = await Cloud.get(`salons/${code}/joueurs/${me}`);
      if (!j) {
        if (d.etat !== 'attente') { $('#app').innerHTML = '<p class="loading">La partie a déjà commencé, impossible de la rejoindre.</p><a class="btn" href="#ensemble">Retour</a>'; return; }
        await Cloud.set(`salons/${code}/joueurs/${me}`, { pseudo: this.profile.pseudo, score: 0 });
      }
    } catch (e) { $('#app').innerHTML = `<p class="loading">${errMsg(e)}</p><a class="btn" href="#ensemble">Retour</a>`; return; }
    this.salonUnsubs.push(Cloud.listen('salons/' + code, d => { if (this.salon !== S2) return; S2.doc = d; this.renderSalon(); }));
    this.salonUnsubs.push(Cloud.listenCol(`salons/${code}/joueurs`, ps => { if (this.salon !== S2) return; S2.players = ps; this.renderSalon(true); }));
  },
  isHost() { const s = this.salon; return s && s.doc && s.doc.hote === Cloud.uid(); },
  renderSalon(playersOnly) {
    const s = this.salon; if (!s || !s.doc) return; const d = s.doc, me = Cloud.uid();
    if (location.hash.split('/')[0] !== '#salon') return;
    const ranking = s.players.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const boardHTML = (hl) => `<ol class="board">${ranking.map((p, i) => `<li class="${p.id === me ? 'me' : ''}"><span class="rk">${i + 1}</span><span>${esc(p.pseudo)}${p.id === d.hote ? ' <small class="muted">hôte</small>' : ''}</span>${hl && hl[p.id] != null ? `<span class="gr">${hl[p.id] > 0 ? '+' + hl[p.id] : '✗'}</span>` : '<span></span>'}<b>${p.score || 0}</b></li>`).join('')}</ol>`;
    if (d.etat === 'attente') {
      document.body.classList.remove('in-game');
      const link = `${siteURL()}#salon/${s.code}`;
      $('#app').innerHTML = `<span class="eyebrow">Partie en direct · ${MODE_LABEL[d.mode]} · ${LEVEL_LABEL[d.level]}</span>
        <div class="salon-code"><span>Code du salon</span><b>${esc(s.code)}</b></div>
        <div class="copyline"><input readonly value="${esc(link)}" aria-label="Lien du salon" id="sl-link"><button type="button" class="btn" id="sl-share">${ICON.share} Inviter</button></div>
        <h2 style="margin-top:20px">Joueurs <span class="muted" style="font-size:.9rem">${s.players.length}</span></h2>${boardHTML()}
        <div class="row" style="margin-top:18px">${this.isHost() ? `<button type="button" class="btn primary big" id="sl-go">Lancer la partie</button>` : '<p class="muted">En attente du lancement par l\'hôte…</p>'}<button type="button" class="btn ghost" id="sl-quit">Quitter</button></div>`;
      $('#sl-share').onclick = () => shareText(`🐸 Rejoins ma partie Krapo Kwizz en direct ! Code : ${s.code}\n${link}`.replace('\n' + link, ''));
      $('#sl-link').onclick = e => e.target.select();
      $('#sl-quit').onclick = () => this.quitSalon();
      const go = $('#sl-go'); if (go) go.onclick = () => this.hostNext(0);
      return;
    }
    if (playersOnly && s.shownIdx === d.idx && s.shownPhase === d.phase && d.etat === 'jeu') { const lb = $('#sl-board'); if (lb) lb.innerHTML = boardHTML(s.lastGain); const c = $('#sl-count'); if (c) c.textContent = `${s.players.length} joueur${s.players.length > 1 ? 's' : ''}`; return; }
    if (d.etat === 'fini') {
      this.stopHostLoop(); Audio.stop(); document.body.classList.remove('in-game');
      const podium = ranking.slice(0, 3);
      $('#app').innerHTML = `<section class="end"><span class="eyebrow">Partie terminée · salon ${esc(s.code)}</span>
        <div class="scorebig">${podium[0] ? '🏆 ' + esc(podium[0].pseudo) : '—'}</div>
        ${boardHTML()}
        <div class="row" style="justify-content:center">${this.isHost() ? '<button type="button" class="btn primary" id="sl-again">Rejouer avec le même groupe</button>' : '<p class="muted">L\'hôte peut relancer une partie.</p>'}<a class="btn ghost" href="#ensemble">Quitter</a></div></section>`;
      const ag = $('#sl-again'); if (ag) ag.onclick = () => this.hostRestart();
      return;
    }
    // en jeu
    document.body.classList.add('in-game');
    const q = d.questions[d.idx]; if (!q) return;
    const cur = BYID[q.id];
    if (s.shownIdx !== d.idx) { s.shownIdx = d.idx; s.answered = false; s.myAns = null; s.qT0 = performance.now(); s.lastGain = null; }
    s.shownPhase = d.phase;
    const choices = q.choices.map(id => BYID[id]).filter(Boolean);
    const rev = d.phase === 'rev';
    $('#app').innerHTML = `<section class="game">
      <div class="ghead"><button class="quit" type="button" id="sl-quit" aria-label="Quitter la partie">${ICON.close}</button>
        <div class="gprog"><div class="bar timer"><div id="sl-bar" style="width:100%"></div></div><div class="meta"><span>Question ${d.idx + 1} / ${d.questions.length}</span><span id="sl-count">${s.players.length} joueurs</span></div></div>
        <div><div class="score">${(s.players.find(p => p.id === me) || {}).score || 0}</div></div></div>
      <div class="stage">${q.mode === 'ecoute' ? `<div class="listen"><button class="playbig" id="gplay" type="button" aria-label="Écouter le chant">${ICON.play}</button><div class="spec"><div class="wave on" id="wave">${'<i></i>'.repeat(18)}</div></div></div>`
        : `<div class="pic"><img src="${photoURL(q.photo || cur.photos[0])}" alt="Photo de l'espèce à trouver"></div>`}</div>
      <div class="choices names">${choices.map((c, i) => `<button type="button" class="choice${rev ? (c.id === q.id ? ' right' : s.myAns === c.id ? ' wrong' : ' dim') : s.myAns === c.id ? ' picked' : ''}" data-id="${c.id}"${rev || s.answered ? ' disabled' : ''}><span class="k">${i + 1}</span><span><span class="nm">${sciHTML(c.name)}</span><span class="vn">${esc(c.vern)}</span></span></button>`).join('')}</div>
      <div id="sl-status">${rev ? `<div class="fb ${s.myAns === q.id ? 'ok' : 'ko'}"><span class="verdict">${s.myAns === q.id ? 'Bonne réponse !' : s.myAns ? 'Raté…' : 'Trop tard…'}</span><div class="big">${sciHTML(cur.name)}</div><div class="sub">${esc(cur.vern)}</div></div>` : s.answered ? '<p class="muted" style="text-align:center">Réponse envoyée, en attente des autres joueurs…</p>' : ''}</div>
      <div id="sl-board">${rev ? boardHTML(s.lastGain) : ''}</div></section>`;
    $('#sl-quit').onclick = () => this.quitSalon();
    if (q.mode === 'ecoute') {
      const pl = $('#gplay'); pl.onclick = () => Audio.toggle(soundURL(cur), 'game');
      if (!rev && !Audio.playing('game')) Audio.toggle(soundURL(cur), 'game');
      syncPlay();
    } else Audio.stop();
    if (!rev) {
      $$('.choice').forEach(b => b.onclick = () => this.answerLive(b.dataset.id));
      const tick = () => { if (!this.salon || this.salon !== s || s.shownIdx !== d.idx || s.doc.phase !== 'q') return; const left = Math.max(0, 1 - (performance.now() - s.qT0) / 1000 / d.duree); const bar = $('#sl-bar'); if (bar) bar.style.width = left * 100 + '%'; if (left > 0) requestAnimationFrame(tick); else if (!s.answered) this.answerLive(null); };
      requestAnimationFrame(tick);
    } else {
      Audio.stop();
      this.fetchGains(d.idx);
    }
    if (this.isHost()) this.startHostLoop();
  },
  async fetchGains(idx) {
    const s = this.salon; if (!s) return;
    try { const ans = await Cloud.all(`salons/${s.code}/reponses`); s.lastGain = Object.fromEntries(ans.filter(a => a.idx === idx).map(a => [a.uid, a.pts])); const lb = $('#sl-board'); if (lb && s.doc.phase === 'rev') this.renderSalon(true); } catch (e) {}
  },
  async answerLive(id) {
    const s = this.salon; if (!s || s.answered || !s.doc || s.doc.phase !== 'q') return; s.answered = true; s.myAns = id;
    const d = s.doc, q = d.questions[d.idx], ok = id === q.id, ms = performance.now() - s.qT0;
    const pts = ok ? Math.round(500 + 500 * Math.max(0, 1 - ms / 1000 / d.duree)) : 0;
    $$('.choice').forEach(b => { b.disabled = true; if (b.dataset.id === id) b.classList.add('picked'); });
    const st = $('#sl-status'); if (st) st.innerHTML = '<p class="muted" style="text-align:center">Réponse envoyée, en attente des autres joueurs…</p>';
    Store.record(q.id, q.mode === 'ecoute' ? 'e' : 'p', ok);
    try {
      await Cloud.set(`salons/${s.code}/reponses/${d.idx}_${Cloud.uid()}`, { uid: Cloud.uid(), idx: d.idx, ok, pts });
      if (pts) await Cloud.update(`salons/${s.code}/joueurs/${Cloud.uid()}`, { score: Cloud.inc(pts) });
    } catch (e) {}
  },
  startHostLoop() {
    if (this.hostTimer) return; const s = this.salon;
    this.salonUnsubs.push(Cloud.listenCol(`salons/${s.code}/reponses`, ans => { if (this.salon === s) s.answers = ans; }));
    this.hostTimer = setInterval(() => this.hostCheck(), 500);
  },
  stopHostLoop() { clearInterval(this.hostTimer); this.hostTimer = 0; },
  async hostCheck() {
    const s = this.salon; if (!s || !s.doc || !this.isHost() || s.doc.etat !== 'jeu' || s.hostBusy) return;
    const d = s.doc, now = Date.now();
    if (d.phase === 'q') {
      const got = s.answers.filter(a => a.idx === d.idx).length;
      if (got >= s.players.length || now - (d.qAt || now) > (d.duree + 1.5) * 1000) { s.hostBusy = true; try { await Cloud.update('salons/' + s.code, { phase: 'rev', revAt: Date.now() }); } catch (e) {} s.hostBusy = false; }
    } else if (d.phase === 'rev' && now - (d.revAt || now) > LIVE.revealMs) {
      s.hostBusy = true; await this.hostNext(d.idx + 1); s.hostBusy = false;
    }
  },
  async hostNext(idx) {
    const s = this.salon; if (!s) return;
    try {
      if (idx >= s.doc.questions.length) await Cloud.update('salons/' + s.code, { etat: 'fini' });
      else await Cloud.update('salons/' + s.code, { etat: 'jeu', phase: 'q', idx, qAt: Date.now() });
    } catch (e) { toast(errMsg(e)); }
  },
  async hostRestart() {
    const s = this.salon; if (!s) return; const d = s.doc;
    try {
      await Promise.all(s.players.map(p => Cloud.update(`salons/${s.code}/joueurs/${p.id}`, { score: 0 })));
      await Cloud.update('salons/' + s.code, { etat: 'attente', phase: 'q', idx: -1, questions: buildFixed(d.mode, d.level, LIVE.questions, hashStr(s.code + Date.now())) });
    } catch (e) { toast(errMsg(e)); }
  },
  async quitSalon() {
    const s = this.salon; if (!s) return location.hash = '#ensemble';
    try { if (!this.isHost()) await Cloud.del(`salons/${s.code}/joueurs/${Cloud.uid()}`); else if (s.doc && s.doc.etat === 'attente' && s.players.length <= 1) await Cloud.del('salons/' + s.code); } catch (e) {}
    document.body.classList.remove('in-game'); location.hash = '#ensemble';
  },

  /* ---------- confidentialité ---------- */
  viewPrivacy() {
    Audio.stop();
    $('#app').innerHTML = `<article class="prose"><span class="eyebrow">Données personnelles</span><h1 class="display" style="font-size:clamp(2.2rem,8vw,3.2rem)">Confidentialité</h1>
      <p><b>Sans compte, rien ne quitte ton appareil.</b> Tes progrès, ton carnet, tes badges et tes réglages sont enregistrés uniquement dans ton navigateur. Krapo Kwizz n'utilise ni publicité, ni outil de mesure d'audience, ni cookie de suivi.</p>
      <h2>Si tu crées un profil de joueur</h2>
      <p>Le profil est facultatif. Il sert uniquement à comparer ton carnet, apparaître dans les classements, lancer des battles et jouer en direct. Sont alors enregistrés sur le serveur :</p>
      <ul><li>ton <b>pseudo</b>, visible par les autres joueurs ;</li>
      <li>ton <b>carnet</b> (espèces cochées vues ou entendues), tes <b>badges</b> et quelques statistiques de jeu (nombre de bonnes réponses, chants maîtrisés), visibles sur ton profil public ;</li>
      <li>tes <b>scores</b> aux classements, au défi du jour, aux battles et aux parties en direct ;</li>
      <li>un <b>identifiant technique</b> anonyme, et ton <b>adresse e-mail</b> seulement si tu choisis de la relier pour retrouver ton compte. L'e-mail n'est jamais affiché ni utilisé pour t'envoyer autre chose que le lien de connexion que tu demandes.</li></ul>
      <p>Choisis un pseudo qui ne permet pas de t'identifier si tu préfères rester discret. Les pseudos injurieux ou inappropriés peuvent être supprimés.</p>
      <h2>Où sont les données</h2>
      <p>Elles sont hébergées par Google Firebase (Authentication et Cloud Firestore), dans un centre de données situé dans l'Union européenne. Elles ne sont ni vendues, ni partagées, ni utilisées à d'autres fins que le fonctionnement du jeu.</p>
      <h2>Tes droits</h2>
      <p>Tu peux à tout moment supprimer ton compte depuis l'onglet Profil, avec le bouton « Supprimer mon compte » : ton pseudo, ton profil, tes scores et tes résultats de battles sont alors effacés du serveur. Pour toute question, ou pour exercer tes droits d'accès, de rectification et d'effacement (RGPD), écris à :</p>
      <p class="mail">${CFG.email}</p>
      <p class="small">Responsable : Nicolas Burnel, concepteur de Krapo Kwizz. Dernière mise à jour : novembre 2026.</p>
      <div class="row"><a class="btn" href="#progres">Retour au profil</a></div></article>`;
  },
};

function askEmail() {
  return new Promise(res => {
    const back = document.createElement('div'); back.className = 'sheet-back';
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" style="max-width:460px"><div class="body"><h2>Confirme ton e-mail</h2><p class="small">Pour finir la connexion, indique l'adresse e-mail à laquelle tu as reçu le lien.</p>
      <form class="free" id="ask-f"><input type="email" id="ask-e" required placeholder="ton@email.fr" aria-label="Adresse e-mail"><button class="btn primary" type="submit">Valider</button></form>
      <button type="button" class="btn ghost" id="ask-c" style="margin-top:8px">Annuler</button></div></div>`;
    document.body.appendChild(back);
    $('#ask-f').onsubmit = e => { e.preventDefault(); const v = $('#ask-e').value.trim(); back.remove(); res(v); };
    $('#ask-c').onclick = () => { back.remove(); res(null); };
  });
}

/* démarrage : connexion automatique si un compte existe sur cet appareil, ou retour d'un lien e-mail */
if (LS.get('account') || /[?&](connexion|apiKey|oobCode)=/.test(location.search) || /^#(ensemble|joueur|battle|salon)/.test(location.hash)) Social.start();
