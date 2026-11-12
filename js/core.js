"use strict";
/* =========================================================================
   Core: utilities, state, Firestore data layer, answer keys, grading,
   competency model, question selection, adaptive engine, recommendations.
   ========================================================================= */

/* ---------- utilities ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ESC[c]);
const nowTs = () => Date.now();
const DAY = 86400000;
const uidgen = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o));
const round1 = n => Math.round(n * 10) / 10;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const fmtDate = ts => ts ? new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "–";
const fmtDateTime = ts => ts ? new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";
const fmtDur = ms => { if (!ms || ms < 0) return "–"; const m = Math.round(ms / 60000); return m < 1 ? "< 1 min" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const fmtSecs = ms => { if (ms == null) return "–"; const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };
const isoDay = ts => new Date(ts).toISOString().slice(0, 10);
function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
function groupBy(arr, fn) { const m = {}; for (const x of arr) { const k = fn(x); (m[k] || (m[k] = [])).push(x); } return m; }
function sum(arr, fn = x => x) { let s = 0; for (const x of arr) s += fn(x) || 0; return s; }
function avg(arr) { const v = arr.filter(x => x != null && !isNaN(x)); return v.length ? sum(v) / v.length : null; }
function csvCell(v) { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function toCSV(rows) { return rows.map(r => r.map(csvCell).join(",")).join("\n"); }
function words(s) { return new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2)); }
function jaccard(a, b) { const A = words(a), B = words(b); let i = 0; A.forEach(w => { if (B.has(w)) i++; }); return i / (A.size + B.size - i || 1); }
function initials(name) { const p = String(name || "?").trim().split(/\s+/).filter(Boolean); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
function seededRng(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function localStorageGet(k) { try { return localStorage.getItem("seo-ts:" + k); } catch (e) { return null; } }
function localStorageSet(k, v) { try { if (v == null) localStorage.removeItem("seo-ts:" + k); else localStorage.setItem("seo-ts:" + k, v); } catch (e) {} }

/* ---------- taxonomy & levels ---------- */
const CATS = TAXONOMY;
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
const subKey = (cat, sub) => cat + ":" + sub;
const subName = key => { const [c, s] = key.split(":"); return (CAT[c] && CAT[c].subs[s]) || s; };
const DIFFS = ["easy", "medium", "hard"];
const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" };
const TYPE_LABEL = { single: "Single answer", multi: "Multiple answers", truefalse: "True or false", scenario: "Scenario", troubleshooting: "Troubleshooting", decision: "Decision", data: "Data interpretation", match: "Match the pairs", open: "Open response (rubric)" };
const LEVELS = [
  { min: 0, name: "Beginner" }, { min: 40, name: "Developing" }, { min: 60, name: "Intermediate" },
  { min: 75, name: "Advanced" }, { min: 90, name: "Expert" }];
const levelIdx = s => s == null ? -1 : s >= 90 ? 4 : s >= 75 ? 3 : s >= 60 ? 2 : s >= 40 ? 1 : 0;
const levelName = s => s == null ? "Not assessed" : LEVELS[levelIdx(s)].name;
const STATUS_LABEL = { gap: "Knowledge gap", unconfirmed: "Needs evidence", isolated: "Isolated error", developing: "Developing", proficient: "Proficient", mastered: "Mastered", untested: "Not assessed" };
const MATURITY = ["established", "emerging", "experimental", "speculative"];
function resource(key) {
  if (/^https?:\/\//.test(key)) { let host = key; try { host = new URL(key).hostname.replace(/^www\./, ""); } catch (e) {} return { key, title: host, url: key, src: host }; }
  const r = RESOURCES[key]; return r ? { key, title: r[0], url: r[1], src: r[2] } : null;
}

/* ---------- settings & site config ---------- */
const DEFAULT_SETTINGS = {
  weights: { easy: 1, medium: 2, hard: 3 },
  complete: { count: 80, mix: { easy: 30, medium: 30, hard: 20 }, minutes: 90, includeOpen: true },
  category: { count: 20, mix: { easy: 40, medium: 35, hard: 25 }, minutes: 30, includeOpen: true },
  trends: { count: 20, mix: { easy: 40, medium: 35, hard: 25 }, minutes: 30 },
  adaptive: { max: 30, minutes: 45 },
  quick: { count: 10, mix: { easy: 40, medium: 40, hard: 20 }, minutes: 10 },
  daily: { count: 5, minutes: 6 },
  window: { cat: 24, sub: 10 },
  activeDays: 30, trainingThreshold: 60
};
const DEFAULT_CONFIG = {
  registration: "open",           // "open" = anyone can sign up; "invite" = invited emails only
  siteName: "SEO Skills Intelligence",
  tagline: "SEO Test Series",
  issuer: "SEO Skills Intelligence",
  passMark: 60,                   // % needed to earn a certificate
  dailyOffset: 330,               // daily challenge resets at midnight UTC+5:30 (India). Minutes from UTC.
  leaderboard: true,
  settings: null
};
function mergeSettings(s) {
  const d = clone(DEFAULT_SETTINGS); if (!s) return d;
  for (const k of Object.keys(d)) if (s[k] != null) d[k] = typeof d[k] === "object" ? Object.assign(d[k], s[k]) : s[k];
  return d;
}
function mergeConfig(c) { const d = Object.assign(clone(DEFAULT_CONFIG), c || {}); return d; }

/* ---------- state ---------- */
const S = {
  ready: false, error: null, readOnly: false,
  authUser: null, uid: null, me: null, isAdmin: false,
  mode: "learn", // learn | team (admin console)
  config: mergeConfig(null), settings: mergeSettings(null),
  bank: [], bankById: {}, keys: {}, revealed: new Set(), conceptMap: {},
  trends: [], templates: [], mocks: [],
  profile: null, attempts: [], answers: {}, seen: {}, learning: null, assignments: [], inbox: null,
  board: null,
  admin: { loaded: false, people: [], inboxes: [], invites: [], cache: {} },
  params: {}, run: null, practice: null, charts: {}, filters: {}
};

/* ---------- Firestore data layer ---------- */
const FS = () => window.FB.f;
const Store = {
  q: new Map(),
  async withTimeout(p, ms = 20000) {
    let t; const to = new Promise((_, rej) => { t = setTimeout(() => rej({ code: "timeout", message: "The database did not respond in time." }), ms); });
    try { return await Promise.race([p, to]); } finally { clearTimeout(t); }
  },
  ref(path) { return FS().doc(window.FB.db, path); },
  async get(path) {
    const snap = await this.withTimeout(FS().getDoc(this.ref(path)));
    return snap.exists() ? clone(snap.data()) : null;
  },
  async list(col, build) {
    let q = FS().collection(window.FB.db, col); if (build) q = build(q, FS());
    const snap = await this.withTimeout(FS().getDocs(q));
    return snap.docs.map(d => Object.assign({ _id: d.id }, clone(d.data())));
  },
  write(path, data, mode = "set") { // one write at a time per document
    const prev = this.q.get(path) || Promise.resolve();
    const body = data == null ? null : clone(data);
    const next = prev.catch(() => {}).then(() => {
      const ref = this.ref(path), f = FS();
      return mode === "delete" ? f.deleteDoc(ref) : mode === "update" ? f.updateDoc(ref, body) : mode === "merge" ? f.setDoc(ref, body, { merge: true }) : f.setDoc(ref, body);
    }).catch(e => { this.fail(e, path); throw e; });
    this.q.set(path, next);
    next.finally(() => { if (this.q.get(path) === next) this.q.delete(path); }).catch(() => {});
    return next;
  },
  set(path, data) { return this.write(path, data, "set"); },
  update(path, data) { return this.write(path, data, "update"); },
  merge(path, data) { return this.write(path, data, "merge"); },
  upsert(path, data) { return this.write(path, data, "merge"); },
  del(path) { return this.write(path, null, "delete"); },
  async batch(ops) { // [{ op: set|merge|update|delete, path, data }]
    const f = FS();
    for (let i = 0; i < ops.length; i += 400) {
      const b = f.writeBatch(window.FB.db);
      for (const o of ops.slice(i, i + 400)) {
        const ref = this.ref(o.path), d = o.data == null ? null : clone(o.data);
        if (o.op === "delete") b.delete(ref); else if (o.op === "update") b.update(ref, d); else if (o.op === "merge") b.set(ref, d, { merge: true }); else b.set(ref, d);
      }
      await this.withTimeout(b.commit(), 60000);
    }
  },
  fail(e, path) {
    const code = e && e.code;
    if (code === "permission-denied") UI.toast("You don't have permission to make that change.");
    else if (code === "resource-exhausted") UI.toast("The database quota was reached. Try again later.");
    else if (code === "unavailable") UI.toast("You appear to be offline. Changes will retry when you reconnect.");
    console.warn("write failed", path, e);
  }
};
const P = { // Firestore paths
  me: () => "users/" + S.uid,
  person: id => "users/" + id,
  attempts: id => `users/${id}/attempts`,
  attempt: (id, aid) => `users/${id}/attempts/${aid}`,
  answers: id => `users/${id}/answers`,
  answer: (id, aid) => `users/${id}/answers/${aid}`,
  seen: id => `users/${id}/state/seen`,
  learning: id => `users/${id}/state/learning`,
  revealed: id => `users/${id}/state/revealed`,
  assignments: id => `users/${id}/assignments`,
  assignment: (id, x) => `users/${id}/assignments/${x}`,
  inbox: id => "inbox/" + id,
  bankCat: c => "bank/" + c, key: id => "keys/" + id,
  config: () => "config/app", tpl: id => "templates/" + id, trend: id => "trends/" + id, mock: id => "mocks/" + id,
  invite: email => "invites/" + String(email).toLowerCase(), admin: id => "admins/" + id, leader: id => "leaderboard/" + id
};

/* ---------- question bank: public part + private answer keys ----------
   Participants download questions WITHOUT answers. An answer key (keys/{id})
   can only be read after the person has committed an answer to that question
   (recorded in users/{uid}/state/revealed, which is append-only). */
const KEY_FIELDS = ["answer", "why", "explanation", "model", "example", "match", "concept", "source"];
function splitQuestion(q) {
  const pub = {}, key = {};
  for (const [k, v] of Object.entries(q)) { if (v === undefined) continue; if (KEY_FIELDS.includes(k)) key[k] = v; else if (k !== "pairs" && k !== "_id") pub[k] = v; }
  if (q.type === "match" && Array.isArray(q.pairs)) {
    const order = shuffle(q.pairs.map((_, i) => i));
    pub.left = q.pairs.map(p => p[0]);
    pub.right = order.map(i => q.pairs[i][1]);
    key.match = q.pairs.map((_, i) => order.indexOf(i));
  }
  return { pub, key };
}
function joinQuestion(pub, key) { // full question in the original authoring format (for admin editing and export)
  const q = Object.assign({}, pub, key || {});
  if (q.type === "match" && q.left && q.right) { q.pairs = q.left.map((l, i) => [l, (key && key.match) ? q.right[key.match[i]] : ""]); delete q.left; delete q.right; delete q.match; }
  delete q._id;
  return q;
}
function hasKey(q) { return !!q && (q.type === "open" || (q.type === "match" ? Array.isArray(q.match) : Array.isArray(q.answer))); }
function full(id) { const q = S.bankById[id]; if (!q) return null; const k = S.keys[id]; return k ? Object.assign({}, q, k) : q; }
function conceptOf(id) { return (S.keys[id] && S.keys[id].concept) || S.conceptMap[id] || null; }
const Keys = {
  async ensure(qids) {
    const need = Array.from(new Set(qids)).filter(id => id && !S.keys[id] && S.bankById[id]);
    if (!need.length) return;
    if (!S.isAdmin) {
      const fresh = need.filter(id => !S.revealed.has(id));
      if (fresh.length) {
        await Store.withTimeout(FS().setDoc(Store.ref(P.revealed(S.uid)), { ids: FS().arrayUnion(...fresh), updatedAt: nowTs() }, { merge: true }));
        fresh.forEach(id => S.revealed.add(id));
      }
    }
    const res = await Promise.all(need.map(id => Store.get(P.key(id)).catch(e => { console.warn("key", id, e); return null; })));
    need.forEach((id, i) => { if (res[i]) S.keys[id] = res[i]; });
    const missing = need.filter(id => !S.keys[id]);
    if (missing.length) throw new Error(`Answer keys couldn't be loaded for ${missing.length} question(s).`);
  },
  async loadAll() { // admins only
    const all = await Store.list("keys");
    for (const k of all) { const id = k._id; delete k._id; S.keys[id] = k; }
  }
};
function setBank(pubs) {
  S.bank = pubs.filter(q => q && q.id && q.cat && CAT[q.cat]);
  S.bankById = Object.fromEntries(S.bank.map(q => [q.id, q]));
}
async function loadBank() {
  const docs = await Store.list("bank");
  const all = [];
  for (const d of docs) { try { all.push(...JSON.parse(d.json || "[]")); } catch (e) { console.warn("bad bank doc", d._id); } }
  setBank(all);
}

/* ---------- file downloads ---------- */
async function saveFile(filename, data, type) {
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || (/\.csv$/.test(filename) ? "text/csv" : /\.json$/.test(filename) ? "application/json" : /\.html$/.test(filename) ? "text/html" : "text/plain") + ";charset=utf-8" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    UI.toast("Downloaded " + filename);
  } catch (e) { UI.toast("Couldn't download the file: " + ((e && e.message) || e)); }
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("Couldn't load " + src)); document.head.appendChild(s); }); }

/* ---------- grading ---------- */
const CHOICE_TYPES = ["single", "multi", "truefalse", "scenario", "troubleshooting", "decision", "data"];
function isChoice(q) { return CHOICE_TYPES.includes(q.type); }
function isAnswered(q, resp) {
  if (!q || resp == null) return false;
  if (q.type === "open") return !!String(resp).trim();
  if (q.type === "match") return Object.values(resp).some(v => v !== null && v !== "" && v !== undefined);
  return Array.isArray(resp) && resp.length > 0;
}
function grade(q, resp) { // q must be a full question (public part + answer key)
  const none = { answered: false, credit: 0, correct: false, pending: false };
  if (!q) return none;
  if (q.type === "open") {
    if (resp == null || !String(resp).trim()) return none;
    return { answered: true, credit: null, correct: null, pending: true };
  }
  if (q.type === "match") {
    const n = (q.left || []).length; if (!resp || !isAnswered(q, resp)) return none;
    let ok = 0; for (let i = 0; i < n; i++) if (resp[i] != null && resp[i] !== "" && Number(resp[i]) === q.match[i]) ok++;
    return { answered: true, credit: ok / n, correct: ok === n, pending: false };
  }
  const sel = Array.isArray(resp) ? resp.map(Number) : [];
  if (!sel.length) return none;
  const ans = q.answer || [];
  if (q.select !== "many") { const c = ans.includes(sel[0]); return { answered: true, credit: c ? 1 : 0, correct: c, pending: false }; }
  const hits = sel.filter(i => ans.includes(i)).length, fp = sel.length - hits;
  return { answered: true, credit: Math.max(0, (hits - fp) / ans.length), correct: hits === ans.length && fp === 0, pending: false };
}
function wScore(arr, W = S.settings.weights) {
  let ws = 0, wc = 0;
  for (const it of arr) { if (it.pending || it.credit == null) continue; const w = W[it.diff] || 1; ws += w; wc += w * (it.credit || 0); }
  return ws ? round1((wc / ws) * 100) : null;
}
function summarize(items) {
  const out = { n: items.length, correct: 0, incorrect: 0, unanswered: 0, pending: 0, byDiff: {}, byCat: {} };
  DIFFS.forEach(d => out.byDiff[d] = { n: 0, correct: 0 });
  for (const it of items) {
    if (it.pending) out.pending++;
    else if (!it.answered) out.unanswered++;
    else if (it.correct) out.correct++;
    else out.incorrect++;
    if (!it.pending) { out.byDiff[it.diff].n++; if (it.correct) out.byDiff[it.diff].correct++; }
    const c = out.byCat[it.cat] || (out.byCat[it.cat] = { n: 0, correct: 0, items: [] });
    c.n++; if (it.correct) c.correct++; c.items.push(it);
  }
  for (const k of Object.keys(out.byCat)) { const c = out.byCat[k]; c.score = wScore(c.items); delete c.items; }
  DIFFS.forEach(d => { const b = out.byDiff[d]; b.acc = b.n ? Math.round((b.correct / b.n) * 100) : null; });
  out.score = wScore(items) || 0;
  out.accuracy = (out.n - out.pending) ? Math.round((out.correct / (out.n - out.pending)) * 100) : 0;
  out.level = levelName(out.score);
  return out;
}

/* ---------- competency model ---------- */
function itemsFrom(attempts, answers, filter) {
  const out = [];
  for (const a of attempts) {
    if (a.status !== "completed") continue;
    if (filter && !filter(a)) continue;
    for (const it of (answers[a.id] || [])) out.push(Object.assign({ aid: a.id, mode: a.mode }, it, { ts: it.ts || a.completedAt }));
  }
  return out.sort((x, y) => x.ts - y.ts);
}
function subStatus(arr, score) {
  const n = arr.length; if (!n) return "untested";
  const misses = arr.filter(i => !i.correct).length;
  if (n === 1) return misses ? "unconfirmed" : "proficient";
  if (misses >= 2 && score < 60) return "gap";
  if (misses === 1 && score < 60) return "unconfirmed";
  if (misses === 1) return "isolated";
  if (score >= 85 && arr.some(i => i.correct && i.diff !== "easy")) return "mastered";
  return score >= 60 ? "proficient" : "developing";
}
function buildModel(items, settings = S.settings) {
  const scored = items.filter(i => !i.pending && i.credit != null);
  const byCat = groupBy(scored, i => i.cat), bySub = groupBy(scored, i => subKey(i.cat, i.sub));
  const m = { cats: {}, subs: {}, answered: scored.length, correct: scored.filter(i => i.correct).length };
  for (const c of CATS) {
    const all = byCat[c.id] || [], arr = all.slice(-settings.window.cat);
    const bd = {}; DIFFS.forEach(d => { const x = arr.filter(i => i.diff === d); bd[d] = { n: x.length, c: x.filter(i => i.correct).length }; });
    m.cats[c.id] = { n: arr.length, total: all.length, score: arr.length ? wScore(arr, settings.weights) : null, correct: arr.filter(i => i.correct).length, byDiff: bd };
    for (const sub of Object.keys(c.subs)) {
      const key = subKey(c.id, sub), sAll = bySub[key] || [], sArr = sAll.slice(-settings.window.sub);
      const score = sArr.length ? wScore(sArr, settings.weights) : null;
      const misses = sArr.filter(i => !i.correct);
      let trend = 0;
      if (sArr.length >= 4) { const h = Math.floor(sArr.length / 2); trend = (wScore(sArr.slice(h)) || 0) - (wScore(sArr.slice(0, h)) || 0); }
      m.subs[key] = { n: sArr.length, total: sAll.length, score, status: subStatus(sArr, score), misses: misses.length,
        missedQ: misses.map(i => i.qid).reverse(), missedDiffs: misses.map(i => i.diff), correctQ: sAll.filter(i => i.correct).map(i => i.qid),
        lastTs: sArr.length ? sArr[sArr.length - 1].ts : null, lastMissTs: misses.length ? misses[misses.length - 1].ts : null, trend };
    }
  }
  const assessed = CATS.filter(c => m.cats[c.id].n >= 2);
  const impSum = sum(assessed, c => c.importance);
  m.overall = assessed.length ? round1(sum(assessed, c => m.cats[c.id].score * c.importance) / impSum) : null;
  m.coverage = assessed.length;
  m.level = levelName(m.overall);
  const recent = scored.slice(-200);
  m.diff = {}; DIFFS.forEach(d => { const x = recent.filter(i => i.diff === d); m.diff[d] = { n: x.length, acc: x.length ? Math.round(x.filter(i => i.correct).length / x.length * 100) : null }; });
  m.accuracy = scored.length ? Math.round(m.correct / scored.length * 100) : null;
  return m;
}
function computeTimeline(attempts, answers) {
  const done = attempts.filter(a => a.status === "completed").sort((a, b) => a.completedAt - b.completedAt);
  const tl = [], cum = [];
  for (const a of done) {
    for (const it of (answers[a.id] || [])) cum.push(Object.assign({ aid: a.id, mode: a.mode }, it, { ts: it.ts || a.completedAt }));
    cum.sort((x, y) => x.ts - y.ts);
    const m = buildModel(cum), cats = {};
    for (const c of CATS) if (m.cats[c.id].n) cats[c.id] = m.cats[c.id].score;
    tl.push({ t: a.completedAt, aid: a.id, mode: a.mode, cat: a.cat || null, title: a.title, score: a.summary ? a.summary.score : null, overall: m.overall, cats });
  }
  return tl;
}
function computeSummary(attempts, answers) {
  const items = itemsFrom(attempts, answers), m = buildModel(items);
  const done = attempts.filter(a => a.status === "completed");
  const cats = {}, subs = {};
  for (const c of CATS) { const x = m.cats[c.id]; if (x.n) cats[c.id] = { s: x.score, n: x.n }; }
  for (const [k, x] of Object.entries(m.subs)) if (x.n) subs[k] = { s: x.score, n: x.n, st: x.status };
  const summary = { overall: m.overall, level: m.level, coverage: m.coverage, cats, subs,
    diff: { easy: m.diff.easy.acc, medium: m.diff.medium.acc, hard: m.diff.hard.acc },
    attempts: done.length, answered: m.answered, accuracy: m.accuracy,
    lastAttemptAt: done.length ? Math.max(...done.map(a => a.completedAt)) : null, updatedAt: nowTs() };
  return { summary, timeline: computeTimeline(attempts, answers).slice(-100), model: m };
}
function myModel() { if (!S._model) S._model = buildModel(itemsFrom(S.attempts, S.answers)); return S._model; }
function myTimeline() { if (!S._tl) S._tl = computeTimeline(S.attempts, S.answers); return S._tl; }
function invalidateMine() { S._model = null; S._tl = null; }
function rebuildConceptMap() {
  const m = {};
  for (const items of Object.values(S.answers)) for (const it of items) if (it.concept) m[it.qid] = it.concept;
  S.conceptMap = m;
}

/* ---------- selection ---------- */
function seenInfo(qid) { const s = S.seen[qid]; return s ? { n: s[0] || 0, t: s[1] || 0, c: s[2] } : { n: 0, t: 0, c: null }; }
function mixCounts(count, mix, percent) {
  if (!percent) return { easy: mix.easy, medium: mix.medium, hard: mix.hard };
  const e = Math.round(count * mix.easy / 100), m = Math.round(count * mix.medium / 100);
  return { easy: e, medium: m, hard: Math.max(0, count - e - m) };
}
function pickQuestions({ cats, mix, trendOnly, includeOpen, exclude }) {
  exclude = exclude || new Set();
  const pool = S.bank.filter(q => q.status === "active" && cats.includes(q.cat) && (!trendOnly || q.trend) && !exclude.has(q.id));
  const nonOpen = pool.filter(q => q.type !== "open");
  const rnd = {}; pool.forEach(q => rnd[q.id] = Math.random());
  const picked = [], ids = new Set(), usedSub = {};
  const key = q => [seenInfo(q.id).n, usedSub[subKey(q.cat, q.sub)] || 0, rnd[q.id]];
  const cmp = (a, b) => { const A = key(a), B = key(b); for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] - B[i]; return 0; };
  const take = (cat, diff) => {
    const c = nonOpen.filter(q => (cat == null || q.cat === cat) && q.diff === diff && !ids.has(q.id));
    if (!c.length) return false; c.sort(cmp); const q = c[0];
    picked.push(q); ids.add(q.id); const k = subKey(q.cat, q.sub); usedSub[k] = (usedSub[k] || 0) + 1; return true;
  };
  const deficit = {};
  for (const d of DIFFS) {
    let got = 0; const need = mix[d] || 0; const order = trendOnly ? [null] : shuffle(cats);
    for (let guard = 0; got < need && guard < 400; guard++) {
      let progress = false;
      for (const c of order) { if (got >= need) break; if (take(c, d)) { got++; progress = true; } }
      if (!progress) break;
    }
    deficit[d] = need - got;
  }
  const NEAR = { easy: ["medium", "hard"], medium: ["easy", "hard"], hard: ["medium", "easy"] };
  for (const d of DIFFS) for (const alt of NEAR[d]) {
    const order = trendOnly ? [null] : shuffle(cats);
    for (let guard = 0; deficit[d] > 0 && guard < 400; guard++) {
      let progress = false;
      for (const c of order) { if (deficit[d] <= 0) break; if (take(c, alt)) { deficit[d]--; progress = true; } }
      if (!progress) break;
    }
  }
  if (includeOpen) {
    const opens = pool.filter(q => q.type === "open").sort((a, b) => seenInfo(a.id).n - seenInfo(b.id).n || rnd[a.id] - rnd[b.id]);
    const hardIdx = picked.map((q, i) => q.diff === "hard" ? i : -1).filter(i => i >= 0);
    if (opens.length && hardIdx.length) picked[hardIdx[Math.floor(Math.random() * hardIdx.length)]] = opens[0];
  }
  return shuffle(picked);
}
function optionOrder(q) {
  if (q.type === "match") return shuffle((q.right || []).map((_, i) => i));
  if (isChoice(q) && q.type !== "truefalse") return shuffle(q.options.map((_, i) => i));
  return null;
}
function dayKey(ts = nowTs()) { const off = (S.config.dailyOffset == null ? 330 : S.config.dailyOffset) * 60000; return new Date(ts + off).toISOString().slice(0, 10); }
function dailyQuestions(day) { // same set for everyone on the same day
  const rng = seededRng("daily|" + day), n = S.settings.daily.count || 5;
  const pool = S.bank.filter(q => q.status === "active" && q.type !== "open").sort((a, b) => a.id.localeCompare(b.id));
  const sh = arr => { const r = arr.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const plan = []; for (let i = 0; i < n; i++) plan.push(i < Math.round(n * .4) ? "easy" : i < Math.round(n * .8) ? "medium" : "hard");
  const out = [], usedCats = new Set();
  for (const d of plan) {
    let c = sh(pool.filter(q => q.diff === d && !usedCats.has(q.cat) && !out.includes(q)));
    if (!c.length) c = sh(pool.filter(q => !out.includes(q)));
    if (c[0]) { out.push(c[0]); usedCats.add(c[0].cat); }
  }
  return out;
}
function newAttempt(spec) {
  const st = S.settings, id = uidgen(), now = nowTs();
  let qs = [], minutes = 30, title = "", cats = CATS.map(c => c.id);
  if (spec.mode === "complete") {
    qs = pickQuestions({ cats, mix: mixCounts(st.complete.count, st.complete.mix, false), includeOpen: st.complete.includeOpen });
    minutes = st.complete.minutes; title = "Complete SEO assessment";
  } else if (spec.mode === "category") {
    qs = pickQuestions({ cats: [spec.cat], mix: mixCounts(st.category.count, st.category.mix, true), includeOpen: st.category.includeOpen });
    minutes = st.category.minutes; title = CAT[spec.cat].name + " assessment";
  } else if (spec.mode === "trends") {
    qs = pickQuestions({ cats, mix: mixCounts(st.trends.count, st.trends.mix, true), trendOnly: true });
    minutes = st.trends.minutes; title = "SEO trends assessment";
  } else if (spec.mode === "template") {
    const t = S.templates.find(x => x._id === spec.templateId || x.id === spec.templateId);
    if (!t) throw new Error("Assessment not found");
    qs = pickQuestions({ cats: t.cats && t.cats.length ? t.cats : cats, mix: mixCounts(t.count, t.mix, true), includeOpen: !!t.includeOpen });
    minutes = t.minutes || 30; title = t.name;
  } else if (spec.mode === "mock") {
    const mk = S.mocks.find(m => (m._id || m.id) === spec.mockId);
    if (!mk) throw new Error("Mock test not found");
    qs = shuffle((mk.qids || []).map(x => S.bankById[x]).filter(q => q && q.status === "active"));
    minutes = mk.minutes || 60; title = mk.title || "Mock test";
  } else if (spec.mode === "quick") {
    qs = pickQuestions({ cats: spec.cat ? [spec.cat] : cats, mix: mixCounts(st.quick.count, st.quick.mix, true), includeOpen: false });
    minutes = st.quick.minutes; title = "Quick quiz" + (spec.cat ? ": " + CAT[spec.cat].short : "");
  } else if (spec.mode === "daily") {
    qs = dailyQuestions(spec.day); minutes = st.daily.minutes; title = "Daily challenge, " + spec.day;
  } else if (spec.mode === "adaptive") {
    minutes = st.adaptive.minutes; title = "Adaptive assessment";
  }
  const order = {}; qs.forEach(q => { const o = optionOrder(q); if (o) order[q.id] = o; });
  const att = { id, mode: spec.mode, title, cat: spec.cat || null, templateId: spec.templateId || null, mockId: spec.mockId || null, day: spec.day || null, status: "in_progress",
    startedAt: now, deadline: now + minutes * 60000, minutes, qids: qs.map(q => q.id), order, resp: {}, marked: {}, idx: 0, updatedAt: now };
  if (spec.mode === "adaptive") {
    att.adaptive = { level: 0, cc: 0, cw: 0, probe: null, log: [], sweep: shuffle(CATS.map(c => c.id)), max: st.adaptive.max, verdicts: {}, done: false };
    const first = adaptiveNext(att); if (first) addAdaptiveQ(att, first);
  }
  return att;
}

/* ---------- adaptive engine ---------- */
const LVL = d => DIFFS.indexOf(d);
function addAdaptiveQ(att, pick) {
  att.qids.push(pick.q.id); const o = optionOrder(pick.q); if (o) att.order[pick.q.id] = o;
  att.adaptive.current = { qid: pick.q.id, probe: !!pick.probe };
}
function adaptiveNext(att) {
  const st = att.adaptive; if (att.qids.length >= st.max) return null;
  const asked = new Set(att.qids), model = myModel();
  const mastered = new Set(Object.entries(model.subs).filter(([, s]) => s.status === "mastered").map(([k]) => k));
  const pool = S.bank.filter(q => q.status === "active" && q.type !== "open" && !asked.has(q.id));
  const askedSubs = {}; att.qids.forEach(id => { const q = S.bankById[id]; if (q) { const k = subKey(q.cat, q.sub); askedSubs[k] = (askedSubs[k] || 0) + 1; } });
  const rnd = {}; pool.forEach(q => rnd[q.id] = Math.random());
  const rank = q => { const s = seenInfo(q.id); return [askedSubs[subKey(q.cat, q.sub)] || 0, s.c === 1 ? 1 : 0, s.n, rnd[q.id]]; };
  const cmp = (a, b) => { const A = rank(a), B = rank(b); for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] - B[i]; return 0; };
  if (st.probe) {
    const p = st.probe;
    const c = pool.filter(q => q.cat === p.cat && q.sub === p.sub && LVL(q.diff) <= p.level)
      .sort((a, b) => Math.abs(LVL(a.diff) - p.level) - Math.abs(LVL(b.diff) - p.level) || cmp(a, b));
    if (c.length) return { q: c[0], probe: true };
    st.verdicts[subKey(p.cat, p.sub)] = "unconfirmed"; st.probe = null;
  }
  const catCount = {}; att.qids.forEach(id => { const q = S.bankById[id]; if (q) catCount[q.cat] = (catCount[q.cat] || 0) + 1; });
  const tried = new Set();
  for (let attempt = 0; attempt < CATS.length; attempt++) {
    let cat = st.sweep.find(c => !catCount[c] && !tried.has(c));
    if (!cat) {
      const sc = CATS.filter(c => !tried.has(c.id) && (catCount[c.id] || 0) < 5).map(c => {
        const log = st.log.filter(l => l.cat === c.id), miss = log.filter(l => !l.correct).length, prior = model.cats[c.id].score;
        return { id: c.id, w: miss * 2 + (prior == null ? 1 : (100 - prior) / 50) - (catCount[c.id] || 0) * 0.7 + Math.random() * 0.3 };
      }).sort((a, b) => b.w - a.w);
      cat = sc.length ? sc[0].id : null;
    }
    if (!cat) return null;
    tried.add(cat);
    for (const d of [st.level, st.level + 1, st.level - 1, st.level + 2, st.level - 2]) {
      if (d < 0 || d > 2) continue;
      let c = pool.filter(q => q.cat === cat && LVL(q.diff) === d);
      const fresh = c.filter(q => !mastered.has(subKey(q.cat, q.sub)));
      if (fresh.length) c = fresh;
      if (c.length) { c.sort(cmp); return { q: c[0], probe: false }; }
    }
  }
  return null;
}
function adaptiveRecord(att, q, g) {
  const st = att.adaptive, probe = !!(st.current && st.current.probe), key = subKey(q.cat, q.sub);
  st.log.push({ qid: q.id, cat: q.cat, sub: q.sub, diff: q.diff, correct: !!g.correct, credit: g.credit, probe, level: st.level });
  if (probe) { st.verdicts[key] = g.correct ? "isolated" : "gap"; st.probe = null; }
  else if (!g.correct) st.probe = { cat: q.cat, sub: q.sub, level: LVL(q.diff) };
  if (g.correct) { st.cc++; st.cw = 0; if (st.cc >= 2 && st.level < 2) { st.level++; st.cc = 0; } }
  else { st.cw++; st.cc = 0; if (st.cw >= 2 && st.level > 0) { st.level--; st.cw = 0; } }
}
function adaptiveReport(att) {
  const st = att.adaptive, cats = {}, subs = {};
  for (const l of st.log) {
    const c = cats[l.cat] || (cats[l.cat] = { n: 0, correct: 0, top: -1 });
    c.n++; if (l.correct) { c.correct++; c.top = Math.max(c.top, LVL(l.diff)); }
    const k = subKey(l.cat, l.sub), s = subs[k] || (subs[k] = { n: 0, correct: 0 });
    s.n++; if (l.correct) s.correct++;
  }
  for (const [k, s] of Object.entries(subs)) {
    s.verdict = st.verdicts[k] || (s.correct === s.n ? "correct" : s.correct === 0 ? (s.n >= 2 ? "gap" : "unconfirmed") : "mixed");
  }
  return { cats, subs, finalLevel: DIFFS[st.level] };
}

/* ---------- recommendations ---------- */
function conceptsOf(qids, n) { const out = []; for (const id of qids) { const c = conceptOf(id); if (c && !out.includes(c)) out.push(c); if (out.length >= n) break; } return out; }
function weakAreas(model, limit = 5) {
  const list = [];
  for (const [key, s] of Object.entries(model.subs)) {
    if (!s.n || !["gap", "unconfirmed", "developing"].includes(s.status)) continue;
    const cat = key.split(":")[0], sub = key.split(":")[1], c = CAT[cat];
    const fund = s.missedDiffs.includes("easy") ? 1.25 : 1, declining = s.trend < -10 ? 1.15 : 1;
    const conf = Math.min(1, s.n / 4), statusW = s.status === "gap" ? 1.2 : s.status === "unconfirmed" ? 0.85 : 1;
    const priority = (100 - (s.score || 0)) * (0.5 + c.importance / 6) * fund * declining * (0.6 + 0.4 * conf) * statusW;
    const subQs = S.bank.filter(q => q.cat === cat && q.sub === sub && q.status === "active");
    const correct = new Set(s.correctQ);
    const struggling = conceptsOf(s.missedQ, 4);
    const toLearn = []; for (const q of subQs) { const cc = conceptOf(q.id); if (!correct.has(q.id) && cc && !toLearn.includes(cc) && !struggling.includes(cc)) toLearn.push(cc); }
    const res = []; for (const id of s.missedQ) { const q = S.bankById[id]; if (q) (q.resources || []).forEach(r => { if (!res.includes(r)) res.push(r); }); }
    c.res.forEach(r => { if (!res.includes(r)) res.push(r); });
    const practiceAvail = subQs.filter(q => q.type !== "open").length;
    list.push({ key, cat, sub, name: c.subs[sub], catName: c.name, score: s.score, n: s.n, status: s.status, misses: s.misses, priority,
      fundamentals: fund > 1, declining: declining > 1, struggling, toLearn: toLearn.slice(0, 5), resources: res.slice(0, 4),
      practiceAvail, practiceTarget: Math.min(10, practiceAvail), lastMissTs: s.lastMissTs,
      retest: s.status === "unconfirmed" ? `Answer ${Math.min(3, practiceAvail)} more questions in this area to confirm whether this is a real gap.` : `After practising, retake the ${c.name} assessment to confirm improvement.` });
  }
  return list.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
function strongAreas(model) {
  const cats = CATS.filter(c => model.cats[c.id].n >= 4 && model.cats[c.id].score >= 75).sort((a, b) => model.cats[b.id].score - model.cats[a.id].score);
  const mastered = Object.entries(model.subs).filter(([, s]) => s.status === "mastered").map(([k]) => k);
  return { cats, mastered };
}
function exerciseFor(cat) {
  const types = ["troubleshooting", "scenario", "decision", "data"];
  const c = S.bank.filter(q => q.cat === cat && q.status === "active" && types.includes(q.type) && q.diff !== "easy");
  c.sort((a, b) => (seenInfo(a.id).c === 1) - (seenInfo(b.id).c === 1) || seenInfo(a.id).n - seenInfo(b.id).n);
  return c[0] || null;
}
function roadmapSteps(w, learning, attempts) {
  learning = learning || S.learning; attempts = attempts || S.attempts;
  const modulesDone = w.resources.filter(r => learning.modules && learning.modules[r]).length;
  const prac = (learning.practice && learning.practice.bySub && learning.practice.bySub[w.key]) || { n: 0, c: 0 };
  const ex = exerciseFor(w.cat);
  const exDone = Object.entries(learning.exercises || {}).some(([qid, ts]) => { const q = S.bankById[qid]; return q && q.cat === w.cat && ts > (w.lastMissTs || 0); });
  const retest = attempts.find(a => a.status === "completed" && ((a.mode === "category" && a.cat === w.cat) || ["adaptive", "complete", "mock"].includes(a.mode)) && a.completedAt > (w.lastMissTs || 0) + 1000);
  return [
    { kind: "study", label: `Study the concepts: ${w.toLearn.concat(w.struggling).slice(0, 3).join("; ") || w.name}`, done: modulesDone >= Math.min(2, w.resources.length), progress: `${modulesDone}/${w.resources.length} resources` },
    { kind: "practice", label: `Complete ${w.practiceTarget} practice questions in ${w.name}`, done: prac.n >= w.practiceTarget && w.practiceTarget > 0, progress: `${Math.min(prac.n, w.practiceTarget)}/${w.practiceTarget}` },
    { kind: "exercise", label: ex ? `Work through a practical ${TYPE_LABEL[ex.type].toLowerCase()} question in ${CAT[w.cat].short}` : "Practical exercise", done: exDone, qid: ex && ex.id },
    { kind: "retest", label: w.cat ? `Retake the ${CAT[w.cat].name} assessment` : "Retake an assessment", done: !!retest }
  ];
}
function trendVerdict(tl) {
  const pts = (tl || []).filter(p => p.overall != null);
  if (pts.length < 2) return { verdict: "Not enough data", delta: null, detail: "Needs at least two completed assessments." };
  const first = pts[0], last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const delta = round1(last.overall - first.overall), recent = round1(last.overall - prev.overall);
  const verdict = delta >= 5 ? "Improving" : delta <= -5 ? "Declining" : "Stable";
  const changes = [];
  for (const c of CATS) { const a = pts.find(p => p.cats && p.cats[c.id] != null), b = last.cats && last.cats[c.id]; if (a && b != null && a !== last) changes.push({ cat: c.id, d: round1(b - a.cats[c.id]) }); }
  changes.sort((x, y) => y.d - x.d);
  return { verdict, delta, recent, first, last, up: changes.filter(c => c.d >= 5).slice(0, 3), down: changes.filter(c => c.d <= -5).slice(-3).reverse() };
}
function fiveQuestions(model, timeline) {
  const strong = strongAreas(model);
  const gaps = Object.entries(model.subs).filter(([, s]) => s.status === "gap").map(([k, s]) => ({ key: k, s, concepts: conceptsOf(s.missedQ, 3) })).sort((a, b) => a.s.score - b.s.score);
  const coreMissing = CATS.filter(c => c.importance === 3 && (model.cats[c.id].score == null || model.cats[c.id].score < 60)).map(c => ({ cat: c, score: model.cats[c.id].score }));
  const next = weakAreas(model, 3);
  return { strong, gaps, coreMissing, next, trend: trendVerdict(timeline) };
}
function trainingReasons(p, settings = S.settings) {
  const s = p.summary, out = [];
  if (!s || s.overall == null) return ["No completed assessment yet"];
  if (s.overall < settings.trainingThreshold) out.push(`Overall competency ${s.overall} is below ${settings.trainingThreshold}`);
  for (const c of CATS) { const x = s.cats && s.cats[c.id]; if (c.importance === 3 && x && x.n >= 3 && x.s < 40) out.push(`${c.short} at ${x.s}`); }
  const tl = (p.timeline || []).filter(t => t.overall != null);
  if (tl.length >= 2 && tl[tl.length - 1].overall - tl[tl.length - 2].overall <= -5) out.push("Score declined in the latest assessment");
  const gaps = Object.values(s.subs || {}).filter(x => x.st === "gap").length;
  if (gaps >= 5) out.push(`${gaps} confirmed knowledge gaps`);
  if (s.lastAttemptAt && nowTs() - s.lastAttemptAt > 60 * DAY) out.push("No assessment in 60+ days");
  return out;
}

/* ---------- test-series helpers (mocks, daily, certificates, leaderboard) ---------- */
function mockAttempts(mockId, attempts = S.attempts) { return attempts.filter(a => a.mode === "mock" && a.mockId === mockId && a.status === "completed"); }
function bestOf(atts) { return atts.length ? Math.max(...atts.map(a => (a.summary && a.summary.score) || 0)) : null; }
function passMark() { return Number(S.config.passMark) || 60; }
function certificatesFrom(attempts) {
  return attempts.filter(a => a.status === "completed" && ["mock", "complete"].includes(a.mode) && a.summary && !a.summary.pending && a.summary.score >= passMark())
    .sort((a, b) => b.completedAt - a.completedAt);
}
function dailyStreak(attempts) {
  const days = new Set(attempts.filter(a => a.mode === "daily" && a.status === "completed" && a.day).map(a => a.day));
  let streak = 0, t = nowTs();
  if (!days.has(dayKey(t))) t -= DAY; // streak still alive if yesterday was done
  while (days.has(dayKey(t))) { streak++; t -= DAY; }
  return streak;
}
function leaderDoc() {
  const p = S.profile, s = p.summary || {}, done = S.attempts.filter(a => a.status === "completed");
  const mocks = {}; done.filter(a => a.mode === "mock" && a.mockId).forEach(a => { const v = a.summary.score; if (mocks[a.mockId] == null || v > mocks[a.mockId]) mocks[a.mockId] = v; });
  const vals = Object.values(mocks);
  const dailies = done.filter(a => a.mode === "daily").sort((a, b) => b.completedAt - a.completedAt);
  const d0 = dailies[0];
  return { uid: S.uid, name: p.name || "Participant", team: p.team || "", overall: s.overall == null ? null : s.overall, level: s.level || "Not assessed", coverage: s.coverage || 0,
    attempts: s.attempts || 0, accuracy: s.accuracy == null ? null : s.accuracy, mocks, mocksTaken: vals.length, mockAvg: vals.length ? round1(avg(vals)) : null,
    mocksPassed: vals.filter(v => v >= passMark()).length, certificates: certificatesFrom(S.attempts).length,
    daily: d0 ? { day: d0.day, score: d0.summary.score, ms: d0.durationMs || null } : null, dailyStreak: dailyStreak(S.attempts), dailyCount: dailies.length, updatedAt: nowTs() };
}
async function updateLeaderboard() {
  if (!S.profile || S.readOnly) return;
  if (S.profile.showOnBoard === false || S.config.leaderboard === false) { if (S.board) { await Store.del(P.leader(S.uid)).catch(() => {}); S.board = null; } return; }
  const d = leaderDoc(); S.board = d;
  await Store.set(P.leader(S.uid), d).catch(() => {});
  if (typeof Board !== "undefined") Board.reset(); // show the new score next time the leaderboard opens
}
