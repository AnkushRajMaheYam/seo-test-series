"use strict";
/* =========================================================================
   UI shell: navigation, routing, modals, shared components, charts, actions.
   ========================================================================= */
const ICON = {
  dashboard: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  assess: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  categories: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  performance: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  gaps: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  roadmap: '<path d="M4 19l5-14 5 10 3-6 3 10"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  trends: '<path d="M2 12h4l3-8 4 16 3-8h6"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5M16 14.5c2.6 0 4.6 1.6 5.5 4.5"/>',
  heat: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  people: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/><path d="M19 3v6M16 6h6"/>',
  bank: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
  reports: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  mock: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 15h3"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 16l-4-4 4-4M6 12h11"/>',
  theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'
};
const ico = n => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ""}</svg>`;
const BRAND_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B1F3A" stroke-width="2.4" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`;
const NAV_LEARN = [
  { g: "Overview", items: [["dashboard", "Dashboard", "dashboard"]] },
  { g: "Test series", items: [["mocks", "Mock Test Series", "mock"], ["assess", "Take Assessment", "assess"], ["quick", "Quick Quiz", "bolt"], ["daily", "Daily Challenge", "calendar"]] },
  { g: "Progress", items: [["leaderboard", "Leaderboard", "trophy"], ["performance", "My Performance", "performance"], ["gaps", "Knowledge Gaps", "gaps"], ["roadmap", "Learning Roadmap", "roadmap"], ["history", "Assessment History", "history"], ["certificates", "Certificates", "award"]] },
  { g: "Learn", items: [["categories", "SEO Categories", "categories"], ["library", "Study Library", "book"], ["trends", "SEO Trends", "trends"]] },
  { g: "Account", items: [["profile", "Profile", "profile"]] }
];
const NAV_TEAM = [
  { g: "Team", items: [["team", "Team Overview", "team"], ["team-heatmap", "Competency Heatmap", "heat"], ["team-people", "People", "people"], ["team-gaps", "Team Knowledge Gaps", "gaps"]] },
  { g: "Access", items: [["team-invites", "Invites and Access", "mail"]] },
  { g: "Content", items: [["team-mocks", "Mock Tests", "mock"], ["team-assessments", "Assessments", "assess"], ["team-bank", "Question Bank", "bank"], ["team-trends", "Trend Library", "trends"]] },
  { g: "Operations", items: [["team-inbox", "Flags and Reviews", "inbox"], ["team-reports", "Reports and Exports", "reports"], ["team-config", "Settings and Rules", "config"]] }
];
const RUN_VIEWS = ["runner", "review", "practice"];

function applyTheme() { const t = localStorageGet("theme"); if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme"); }
applyTheme();
function avatar(name, cls = "") { return `<span class="avatar ${cls}" aria-hidden="true">${esc(initials(name))}</span>`; }
async function loadAdmin() { if (window.ADMIN_LOADED) return; await loadScript("js/admin.js?v=1"); }

const UI = {
  after: [],
  loading(msg) { document.getElementById("app").innerHTML = `<div class="loading"><div><div class="spin"></div>${esc(msg)}…</div></div>`; },
  toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3800); },
  renderShell() {
    const app = document.getElementById("app");
    if (S.error) { app.innerHTML = UI.errorPage(); return; }
    const nav = S.mode === "team" ? NAV_TEAM : NAV_LEARN;
    const inboxCount = S.mode === "team" ? (S.admin.openFlags || 0) + (S.admin.pendingReviews || 0) : 0;
    const name = (S.profile && S.profile.name) || (S.me && S.me.name) || "You";
    const theme = localStorageGet("theme") || "system";
    app.innerHTML = `
    <div class="topbar"><button class="btn ghost sm" data-act="menu" aria-label="Open navigation">${ico("menu")}</button><b>${esc(S.config.siteName)}</b></div>
    <div class="shell">
      <aside class="side" id="side">
        <div class="brand"><div class="brand-mark">${BRAND_SVG}</div>
          <div><b>${esc(S.config.siteName)}</b><span>${S.mode === "team" ? "Admin console" : esc(S.config.tagline || "SEO Test Series")}</span></div></div>
        ${S.isAdmin ? `<button class="btn sm mode-switch" data-act="switchMode">${ico("swap")} ${S.mode === "team" ? "Switch to test series" : "Open admin console"}</button>` : ""}
        <nav class="nav" aria-label="Main">${nav.map(grp => `<div class="nav-group">${esc(grp.g)}</div>` + grp.items.map(([h, l, i]) => `<a href="#${h}" data-nav="${h}">${ico(i)}<span>${esc(l)}</span>${h === "team-inbox" && inboxCount ? `<span class="count">${inboxCount}</span>` : ""}</a>`).join("")).join("")}</nav>
        <div class="side-foot"><div class="who">${avatar(name)}<div><b>${esc(name)}</b><small>${S.isAdmin ? "Administrator" : "Participant"}${S.readOnly ? " (read-only)" : ""}</small></div></div>
          <div class="row"><button class="btn sm" data-act="theme" title="Theme: ${esc(theme)}">${ico("theme")} ${theme === "system" ? "Auto" : theme === "dark" ? "Dark" : "Light"}</button><button class="btn sm" data-act="signOut">${ico("logout")} Sign out</button></div></div>
      </aside>
      <main class="main" id="main" tabindex="-1"><div class="wrap" id="view"></div></main>
    </div>`;
  },
  errorPage() {
    const msg = {
      noConfig: ["Connect Firebase to finish setup", "This site stores accounts and results in Firebase. Open js/firebase-config.js and paste your Firebase web app config, then reload. The step-by-step guide is in docs/SETUP_GUIDE.md."],
      sdk: ["Firebase couldn't load", "The Firebase SDK didn't load from Google's CDN. Check your connection or ad blocker and reload. " + (window.FB && window.FB.loadError ? "Detail: " + window.FB.loadError : "")],
      load: ["The data couldn't be loaded", "The database didn't respond or refused access. Reload to try again. If it keeps happening, make sure the Firestore security rules from firebase/firestore.rules are published. " + (S.errorDetail ? "Detail: " + S.errorDetail : "")],
      disabled: ["Your access has been paused", "An administrator has disabled your account on this test series. Contact them if you think this is a mistake."]
    }[S.error] || ["Something went wrong", ""];
    return `<div class="center-card"><div class="auth-card"><div class="brand" style="padding:0 0 14px"><div class="brand-mark">${BRAND_SVG}</div><div><b style="color:var(--ink)">${esc(S.config.siteName)}</b><span>${esc(S.config.tagline || "")}</span></div></div><h2>${esc(msg[0])}</h2><p class="muted">${esc(msg[1])}</p>${S.authUser ? `<div class="row" style="margin-top:14px"><button class="btn" data-act="signOut">Sign out</button></div>` : ""}</div></div>`;
  },
  setActiveNav(name) {
    $$(".nav a").forEach(a => {
      const n = a.dataset.nav;
      const on = n === name || (name === "team-person" && n === "team-people") || (RUN_VIEWS.includes(name) && n === (S.navFrom || "assess")) || (name === "certificate" && n === "certificates");
      a.removeAttribute("aria-current"); if (on) a.setAttribute("aria-current", "page");
    });
  },
  route() {
    if (!S.ready || !S.profile) return;
    let name = (location.hash || "").slice(1) || (S.mode === "team" ? "team" : "dashboard");
    let isTeam = name.startsWith("team");
    if (isTeam && !S.isAdmin) { name = "dashboard"; isTeam = false; history.replaceState(null, "", "#dashboard"); } // participants never load the admin console
    if (isTeam && !window.ADMIN_LOADED) {
      const el = $("#view"); if (el) el.innerHTML = `<div class="loading"><div><div class="spin"></div>Loading admin console…</div></div>`;
      loadAdmin().then(() => UI.route()).catch(e => { if (el) el.innerHTML = `<div class="banner err">The admin console couldn't load: ${esc(e.message)}</div>`; });
      return;
    }
    if ((isTeam ? "team" : "learn") !== S.mode) { S.mode = isTeam ? "team" : "learn"; localStorageSet("mode", S.mode); UI.renderShell(); }
    if (!RUN_VIEWS.includes(name) && name !== "certificate") S.navFrom = name;
    const view = VIEWS[name] || VIEWS.dashboard;
    Object.values(S.charts).forEach(c => { try { c.destroy(); } catch (e) {} }); S.charts = {};
    if (S.run && name !== "runner") Runner.stopTimer();
    UI.after = [];
    const el = $("#view");
    if (!el) return;
    try { el.innerHTML = view(); } catch (e) { console.error(e); el.innerHTML = `<div class="banner err">This view failed to render: ${esc(e.message)}</div>`; }
    UI.setActiveNav(name);
    $("#side") && $("#side").classList.remove("open");
    const after = UI.after; UI.after = []; after.forEach(f => { try { f(); } catch (e) { console.error(e); } });
    window.scrollTo(0, 0);
  },
  go(name, params) { S.params = params || {}; if (location.hash === "#" + name) UI.route(); else location.hash = name; },
  refresh() { UI.route(); },
  modal(title, body, opts = {}) {
    UI.closeModal();
    const back = document.createElement("div"); back.className = "modal-back"; back.id = "modal";
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="${opts.wide ? "width:min(1000px,100%)" : ""}"><div class="modal-head"><h2>${esc(title)}</h2><button class="btn ghost sm" data-act="closeModal" aria-label="Close">Close</button></div><div id="modal-body">${body}</div></div>`;
    back.addEventListener("mousedown", e => { if (e.target === back && !opts.sticky) UI.closeModal(); });
    document.body.appendChild(back);
    const f = back.querySelector("input,select,textarea,button.primary"); if (f) f.focus();
    return back;
  },
  closeModal() { const m = $("#modal"); if (m) m.remove(); document.body.classList.remove("printing-cert"); },
  confirm(msg, okLabel = "Confirm") {
    return new Promise(res => {
      UI.modal("Please confirm", `<p>${esc(msg)}</p><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" id="cf-no">Cancel</button><button class="btn primary" id="cf-yes">${esc(okLabel)}</button></div>`);
      $("#cf-no").onclick = () => { UI.closeModal(); res(false); }; $("#cf-yes").onclick = () => { UI.closeModal(); res(true); };
    });
  }
};

/* ---------- small components ---------- */
function lvClass(s) { const i = levelIdx(s); return i < 0 ? "" : "lv-" + i; }
function levelChip(s) { return s == null ? `<span class="chip">Not assessed</span>` : `<span class="lvchip ${lvClass(s)}">${esc(levelName(s))}</span>`; }
function statusChip(st) { return `<span class="st st-${st}">${esc(STATUS_LABEL[st] || st)}</span>`; }
function diffChip(d) { return `<span class="chip ${d}">${DIFF_LABEL[d]}</span>`; }
function matChip(m) { return m ? `<span class="mat mat-${m}">${esc(m[0].toUpperCase() + m.slice(1))}</span>` : ""; }
function bar(s, thin) { const v = s == null ? 0 : Math.max(2, Math.min(100, s)); return `<div class="bar ${thin ? "thin" : ""} ${lvClass(s)}" role="img" aria-label="${s == null ? "No data" : s + " out of 100"}"><i style="width:${v}%"></i></div>`; }
function fmtScore(s) { return s == null ? "–" : (Math.round(s * 10) / 10).toString(); }
function deltaHtml(d, suffix = "") { if (d == null || isNaN(d)) return `<span class="muted">–</span>`; const v = round1(d); return v > 0 ? `<span class="delta-up">+${v}${suffix}</span>` : v < 0 ? `<span class="delta-down">${v}${suffix}</span>` : `<span class="muted">0${suffix}</span>`; }
function ruler(score, prev) {
  const bands = [[0, 40], [40, 60], [60, 75], [75, 90], [90, 100]];
  const cur = levelIdx(score);
  const track = bands.map(([a, b], i) => `<div class="lv-${i} ${i <= cur ? "on" : ""}" style="flex:${b - a}"></div>`).join("");
  const labels = bands.map(([a, b], i) => `<div style="flex:${b - a}">${LEVELS[i].name}</div>`).join("");
  const ticks = [0, 40, 60, 75, 90, 100].map(t => `<span style="left:${t}%">${t}</span>`).join("");
  return `<div class="ruler" aria-label="Competency scale">
    <div class="ruler-track">${track}</div><div class="ruler-labels">${labels}</div>
    ${prev != null ? `<div class="ruler-prev" style="left:${prev}%" title="Previous: ${fmtScore(prev)}"></div>` : ""}
    ${score != null ? `<div class="ruler-mark" style="left:${score}%" data-label="${fmtScore(score)}"></div>` : ""}
    <div class="ruler-ticks">${ticks}</div></div>`;
}
function empty(title, text, actionHtml) { return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${actionHtml ? `<div style="margin-top:12px">${actionHtml}</div>` : ""}</div>`; }
function resLink(key) { const r = resource(key); return r ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a> <span class="muted tiny">${esc(r.src)}</span>` : ""; }
function catOptions(sel, withAll) { return (withAll ? `<option value="">${esc(withAll)}</option>` : "") + CATS.map(c => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join(""); }

/* ---------- charts ---------- */
function tlLabels(pts) { const d = pts.map(p => fmtDate(p.t)); return pts.map((p, i) => d.filter(x => x === d[i]).length > 1 ? fmtDateTime(p.t) : d[i]); }
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function chartTheme() {
  if (!window.Chart) return;
  Chart.defaults.font.family = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
  Chart.defaults.color = cssVar("--muted"); Chart.defaults.borderColor = cssVar("--line");
  Chart.defaults.plugins.legend.labels.boxWidth = 12; Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation = (S.snapshot || matchMedia("(prefers-reduced-motion: reduce)").matches) ? false : { duration: 450 };
  Chart.defaults.devicePixelRatio = S.snapshot ? Math.max(2, window.devicePixelRatio || 1) : (window.devicePixelRatio || 1);
  Chart.defaults.datasets.bar.minBarLength = 4;
}
const SERIES = ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6"];
function chart(id, cfg) {
  UI.after.push(() => {
    const el = document.getElementById(id); if (!el) return;
    if (!window.Chart) { el.parentElement.innerHTML = `<p class="muted small">Charts couldn't load in this view.</p>`; return; }
    chartTheme(); if (S.charts[id]) S.charts[id].destroy();
    S.charts[id] = new Chart(el.getContext("2d"), typeof cfg === "function" ? cfg() : cfg);
  });
  return `<canvas id="${id}" role="img"></canvas>`;
}

/* ---------- actions ---------- */
const ACT = {};
const VIEWS = {};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  e.preventDefault(); Promise.resolve(fn(el, e)).catch(err => { console.error(err); UI.toast((err && err.message) || "Something went wrong."); });
});
document.addEventListener("submit", e => {
  const f = e.target.closest("form[data-submit]"); if (!f) return;
  e.preventDefault(); const fn = ACT[f.dataset.submit]; if (fn) Promise.resolve(fn(f, e)).catch(err => { console.error(err); UI.toast((err && err.message) || "Something went wrong."); });
});
document.addEventListener("change", e => { const el = e.target.closest("[data-change]"); if (el && ACT[el.dataset.change]) ACT[el.dataset.change](el, e); });
document.addEventListener("input", e => { const el = e.target.closest("[data-input]"); if (el && ACT[el.dataset.input]) ACT[el.dataset.input](el, e); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#modal")) UI.closeModal(); });
window.addEventListener("hashchange", () => UI.route());
ACT.closeModal = () => UI.closeModal();
ACT.menu = () => $("#side").classList.toggle("open");
ACT.go = el => UI.go(el.dataset.to, Object.assign({}, el.dataset));
ACT.switchMode = () => { S.mode = S.mode === "team" ? "learn" : "team"; localStorageSet("mode", S.mode); UI.renderShell(); UI.go(S.mode === "team" ? "team" : "dashboard"); };
ACT.theme = () => { const cur = localStorageGet("theme") || "system", next = cur === "system" ? "light" : cur === "light" ? "dark" : "system"; localStorageSet("theme", next === "system" ? null : next); applyTheme(); UI.renderShell(); UI.route(); };
ACT.copy = async el => { try { await navigator.clipboard.writeText(el.dataset.text); UI.toast(el.dataset.done || "Copied"); } catch (e) { UI.modal("Copy this", `<textarea readonly style="min-height:120px">${esc(el.dataset.text)}</textarea>`); } };
