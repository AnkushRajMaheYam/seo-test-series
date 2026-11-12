"use strict";
/* =========================================================================
   Test-series menus: Mock Test Series, Quick Quiz, Daily Challenge,
   Leaderboard, Certificates and Study Library.
   ========================================================================= */

/* ---------- leaderboard data (loaded on demand, cached for 60 s) ---------- */
const Board = {
  rows: null, ts: 0, loading: false, err: null,
  need() {
    if (this.rows && nowTs() - this.ts < 60000) return null;
    if (!this.loading) {
      this.loading = true; this.err = null;
      Store.list("leaderboard").then(rows => { this.rows = rows.map(r => Object.assign({ uid: r._id }, r)); this.ts = nowTs(); })
        .catch(e => { this.err = e.message || String(e); this.rows = this.rows || []; this.ts = nowTs(); })
        .finally(() => { this.loading = false; UI.refresh(); });
    }
    return this.rows ? null : `<div class="loading" style="min-height:30vh"><div><div class="spin"></div>Loading leaderboard…</div></div>`;
  },
  reset() { this.ts = 0; }
};
function rankRows(rows, val, tie) { return rows.filter(r => val(r) != null).sort((a, b) => val(b) - val(a) || (tie ? tie(a, b) : 0)).map((r, i) => Object.assign({ rank: i + 1 }, r)); }
function rankBadge(n) { return `<span class="rankno ${n <= 3 ? "r" + n : ""}">${n}</span>`; }
function podium(list, fmt, label) {
  if (list.length < 3) return "";
  const order = [list[1], list[0], list[2]], cls = ["p2", "p1", "p3"];
  return `<div class="podium">${order.map((r, i) => `<div class="${cls[i]}"><div class="rank">${["2ND", "1ST", "3RD"][i]}</div>${avatar(r.name, "lg")}<b>${esc(r.name)}</b><div class="small muted">${esc(r.team || "")}</div><div class="score num">${fmt(r)}</div><div class="tiny muted">${esc(label)}</div></div>`).join("")}</div>`;
}

/* ---------- mock test series ---------- */
function mockMix(mk) { const g = groupBy((mk.qids || []).map(id => S.bankById[id]).filter(Boolean), q => q.diff); return DIFFS.map(d => `${(g[d] || []).length} ${d}`).join(" · "); }
VIEWS.mocks = () => {
  const pm = passMark(), mocks = S.mocks;
  const tried = mocks.filter(m => mockAttempts(m.id).length), passed = mocks.filter(m => (bestOf(mockAttempts(m.id)) || 0) >= pm);
  const bests = tried.map(m => bestOf(mockAttempts(m.id)));
  let h = `<div class="page-head"><div><div class="eyebrow">Test series</div><h1>Mock Test Series</h1><p>Full-length, timed mock tests. Everyone gets the same question set for each mock, so scores are comparable on the leaderboard. Score ${pm}% or more to earn a certificate.</p></div><button class="btn" data-act="go" data-to="leaderboard">${ico("trophy")} Mock leaderboard</button></div>
    <div class="statline" style="margin-top:0"><div><b class="num">${mocks.length}</b><span>Mocks published</span></div><div><b class="num">${tried.length}</b><span>Attempted</span></div><div><b class="num">${passed.length}</b><span>Passed (${pm}%+)</span></div><div><b class="num">${bests.length ? fmtScore(round1(avg(bests))) : "–"}</b><span>Average best score</span></div></div>`;
  if (!mocks.length) return h + `<section class="section">${empty("No mock tests yet", S.isAdmin ? "Open the admin console > Mock Tests and generate a mock series from the question bank." : "The administrator hasn't published any mock tests yet. Try the quick quiz or daily challenge meanwhile.", S.isAdmin ? `<button class="btn primary" data-act="go" data-to="team-mocks">Create mock tests</button>` : `<button class="btn primary" data-act="go" data-to="quick">Start a quick quiz</button>`)}</section>`;
  h += `<section class="section"><div class="series">${mocks.map(mk => {
    const atts = mockAttempts(mk.id), best = bestOf(atts), last = atts.sort((a, b) => b.completedAt - a.completedAt)[0];
    const ip = inProgress().find(a => a.mode === "mock" && a.mockId === mk.id);
    const left = mk.attemptsAllowed > 0 ? mk.attemptsAllowed - atts.length : Infinity, ok = best != null && best >= pm;
    return `<article class="mock"><div class="mock-top"><div class="mock-no">${esc(String(mk.number || "•"))}</div><div><h3>${esc(mk.title)}</h3><small>${(mk.qids || []).length} questions · ${mk.minutes} minutes</small></div></div>
      <div class="mock-body">${mk.desc ? `<p class="small muted" style="margin:0">${esc(mk.desc)}</p>` : ""}
        <div class="facts"><span class="chip">${esc(mockMix(mk))}</span><span class="chip">${mk.attemptsAllowed > 0 ? `${mk.attemptsAllowed} attempt${mk.attemptsAllowed > 1 ? "s" : ""}` : "Unlimited attempts"}</span></div>
        <div class="row small">${best == null ? `<span class="muted">Not attempted yet</span>` : `<span>Best: <b class="num">${fmtScore(best)}</b></span>${levelChip(best)}${ok ? `<span class="chip saffron">${ico("award")} Passed</span>` : `<span class="chip">Pass at ${pm}</span>`}`}</div>
        ${best != null ? bar(best, true) : ""}
        <div class="actions">${ip ? `<button class="btn primary" data-act="resume" data-aid="${ip.id}">Resume (${fmtDur(ip.deadline - nowTs())} left)</button>` : left > 0 ? `<button class="btn primary" data-act="startMock" data-id="${esc(mk.id)}">${atts.length ? "Retake" : "Start mock"}</button>` : `<span class="small muted">All attempts used</span>`}
          ${last ? `<button class="btn" data-act="go" data-to="review" data-aid="${last.id}">Review</button>` : ""}${ok ? `<button class="btn" data-act="openCert" data-aid="${atts.find(a => a.summary.score === best).id}">Certificate</button>` : ""}</div></div></article>`;
  }).join("")}</div></section>
  <section class="section panel"><h2>How mock tests work</h2><ul class="small"><li>The timer starts when you begin and keeps running if you leave; unanswered questions count as incorrect when time runs out.</li><li>Answers and explanations appear after you submit, never during the test.</li><li>Your best score for each mock counts on the leaderboard; the mock leaderboard ranks by average best score across mocks taken.</li><li>Mock results also update your competency profile, knowledge gaps and learning roadmap.</li></ul></section>`;
  return h;
};
ACT.startMock = el => Runner.start({ mode: "mock", mockId: el.dataset.id });

/* ---------- quick quiz ---------- */
VIEWS.quick = () => {
  const st = S.settings.quick, recent = completed().filter(a => a.mode === "quick").reverse().slice(0, 10);
  const c = mixCounts(st.count, st.mix, true);
  let h = `<div class="page-head"><div><div class="eyebrow">Test series</div><h1>Quick Quiz</h1><p>${st.count} questions in ${st.minutes} minutes. A fast way to check yourself between mock tests. It counts toward your competency profile.</p></div></div>
    <section class="mode" style="max-width:640px"><h3>Start a quick quiz</h3><div class="facts num">${st.count} questions: ${c.easy} easy, ${c.medium} medium, ${c.hard} hard. Questions you've seen least come first.</div>
      <label class="f">Category<select id="qq-cat"><option value="">All categories (mixed)</option>${catOptions("")}</select></label>
      <div class="row"><button class="btn primary" data-act="startQuick">Start quick quiz</button><button class="btn" data-act="practiceQuick">Practise instead (no timer)</button></div></section>`;
  h += `<section class="section"><h2>Recent quick quizzes</h2>${recent.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Quiz</th><th class="r">Score</th><th class="r">Correct</th><th>Time</th><th></th></tr></thead><tbody>${recent.map(a => `<tr><td>${fmtDateTime(a.completedAt)}</td><td>${esc(a.title)}</td><td class="r num"><b>${fmtScore(a.summary.score)}</b></td><td class="r num">${a.summary.correct}/${a.summary.n}</td><td>${fmtSecs(a.durationMs)}</td><td class="r"><button class="btn sm" data-act="go" data-to="review" data-aid="${a.id}">Review</button></td></tr>`).join("")}</tbody></table></div>` : empty("No quick quizzes yet", "Your quick quiz results will appear here.")}</section>`;
  return h;
};
ACT.startQuick = () => Runner.start({ mode: "quick", cat: $("#qq-cat").value || null });
ACT.practiceQuick = () => { const c = $("#qq-cat").value; if (!c) { UI.toast("Choose a category to practise."); return; } Practice.start({ cat: c }); };

/* ---------- daily challenge ---------- */
VIEWS.daily = () => {
  const today = dayKey(), st = S.settings.daily, streak = dailyStreak(S.attempts);
  const mine = S.attempts.filter(a => a.mode === "daily" && a.status === "completed"), todayAtt = mine.find(a => a.day === today);
  const ip = inProgress().find(a => a.mode === "daily" && a.day === today);
  const resetsAt = (() => { const off = (S.config.dailyOffset == null ? 330 : S.config.dailyOffset); const h = -off / 60; return `00:00 UTC${off >= 0 ? "+" : "−"}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? ":" + String(Math.abs(off) % 60).padStart(2, "0") : ""}`; })();
  let h = `<div class="page-head"><div><div class="eyebrow">Test series</div><h1>Daily Challenge</h1><p>${st.count} questions, ${st.minutes} minutes, one attempt a day. Everyone gets the same questions, ranked by score and then time. A new challenge starts at ${esc(resetsAt)}.</p></div></div>
    <section class="daily-hero"><div><span class="streak">${ico("bolt")} ${streak} day streak</span><h2 style="margin-top:10px">Challenge for ${esc(today)}</h2><p>${todayAtt ? `You scored ${fmtScore(todayAtt.summary.score)} (${todayAtt.summary.correct}/${todayAtt.summary.n} correct) in ${fmtSecs(todayAtt.durationMs)}. Come back tomorrow to keep your streak.` : ip ? "You've started today's challenge. Finish before the timer runs out." : "Five questions across different SEO categories, from easy to hard."}</p>
      <div class="row" style="margin-top:12px">${todayAtt ? `<button class="btn primary" data-act="go" data-to="review" data-aid="${todayAtt.id}">Review today's answers</button>` : ip ? `<button class="btn primary" data-act="resume" data-aid="${ip.id}">Resume challenge</button>` : `<button class="btn primary lg" data-act="start" data-mode="daily">Start today's challenge</button>`}</div></div>
      <div style="text-align:center"><div class="big num">${todayAtt ? fmtScore(todayAtt.summary.score) : streak}</div><div class="small" style="color:#C9D5E8">${todayAtt ? "today's score" : "day streak"}</div></div></section>`;
  const days = []; for (let i = 13; i >= 0; i--) days.push(dayKey(nowTs() - i * DAY));
  const byDay = Object.fromEntries(mine.map(a => [a.day, a]));
  h += `<section class="section"><h2>Last 14 days</h2><div class="row">${days.map(d => { const a = byDay[d]; return `<div class="panel" style="padding:8px 10px;min-width:74px;text-align:center;box-shadow:none;${a ? "border-color:var(--accent)" : ""}"><div class="tiny muted">${esc(d.slice(5))}</div><b class="num">${a ? fmtScore(a.summary.score) : "–"}</b></div>`; }).join("")}</div></section>`;
  const wait = Board.need();
  h += `<section class="section"><div class="section-head"><h2>Today's top 10</h2><button class="btn sm" data-act="refreshBoard">Refresh</button></div>`;
  if (wait) return h + wait + "</section>";
  const list = rankRows((Board.rows || []).filter(r => r.daily && r.daily.day === today), r => r.daily.score, (a, b) => (a.daily.ms || 9e9) - (b.daily.ms || 9e9)).slice(0, 10);
  h += list.length ? `<div class="tw"><table><thead><tr><th>#</th><th>Name</th><th>Team</th><th class="r">Score</th><th class="r">Time</th><th class="r">Streak</th></tr></thead><tbody>${list.map(r => `<tr class="${r.uid === S.uid ? "me" : ""}"><td>${rankBadge(r.rank)}</td><td><div class="row">${avatar(r.name, "sm")}${esc(r.name)}</div></td><td>${esc(r.team || "–")}</td><td class="r num"><b>${fmtScore(r.daily.score)}</b></td><td class="r num">${fmtSecs(r.daily.ms)}</td><td class="r num">${r.dailyStreak || 0}</td></tr>`).join("")}</tbody></table></div>` : empty("No one has finished today's challenge yet", "Be the first on today's board.");
  return h + "</section>";
};
ACT.refreshBoard = () => { Board.reset(); UI.refresh(); };

/* ---------- leaderboard ---------- */
VIEWS.leaderboard = () => {
  const tab = S.filters.boardTab || "overall", pm = passMark();
  let h = `<div class="page-head"><div><div class="eyebrow">Progress</div><h1>Leaderboard</h1><p>Rankings across the test series. Only names, teams and scores are shown; emails and answers stay private.</p></div><button class="btn" data-act="refreshBoard">Refresh</button></div>`;
  if (S.config.leaderboard === false) return h + empty("The leaderboard is turned off", "The administrator has hidden the leaderboard for this test series.");
  if (S.profile.showOnBoard === false) h += `<div class="banner warn">You're hidden from the leaderboard. <span class="spacer"></span><button class="btn sm" data-act="go" data-to="profile">Change in Profile</button></div>`;
  h += `<div class="tabs" role="tablist">${[["overall", "Overall competency"], ["mocks", "Mock tests"], ["daily", "Daily challenge"], ["streak", "Streaks"]].map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-act="boardTab" data-t="${k}">${l}</button>`).join("")}</div>`;
  const wait = Board.need(); if (wait) return h + wait;
  if (Board.err) h += `<div class="banner err">The leaderboard couldn't be fully loaded: ${esc(Board.err)}</div>`;
  const rows = Board.rows || [];
  let list = [], cols = [], fmt = r => "", label = "";
  if (tab === "overall") {
    list = rankRows(rows.filter(r => r.coverage >= 1), r => r.overall, (a, b) => (b.coverage || 0) - (a.coverage || 0));
    fmt = r => fmtScore(r.overall); label = "competency";
    cols = [["Competency", r => `<b>${fmtScore(r.overall)}</b>`], ["Level", r => levelChip(r.overall)], ["Categories", r => `${r.coverage || 0}/16`], ["Tests", r => r.attempts || 0], ["Accuracy", r => r.accuracy == null ? "–" : r.accuracy + "%"]];
  } else if (tab === "mocks") {
    const sel = S.filters.boardMock || "";
    h += `<div class="filters"><label class="f">Ranking<select data-change="boardMock"><option value="">Average of best mock scores</option>${S.mocks.map(m => `<option value="${esc(m.id)}" ${sel === m.id ? "selected" : ""}>${esc(m.title)}</option>`).join("")}</select></label></div>`;
    if (sel) { list = rankRows(rows.filter(r => r.mocks && r.mocks[sel] != null), r => r.mocks[sel]); fmt = r => fmtScore(r.mocks[sel]); label = "best score"; cols = [["Best score", r => `<b>${fmtScore(r.mocks[sel])}</b>`], ["Result", r => r.mocks[sel] >= pm ? `<span class="chip saffron">Passed</span>` : `<span class="chip">Below ${pm}</span>`]]; }
    else { list = rankRows(rows.filter(r => r.mockAvg != null), r => r.mockAvg, (a, b) => (b.mocksTaken || 0) - (a.mocksTaken || 0)); fmt = r => fmtScore(r.mockAvg); label = "avg. best score"; cols = [["Avg. best", r => `<b>${fmtScore(r.mockAvg)}</b>`], ["Mocks taken", r => r.mocksTaken || 0], ["Passed", r => r.mocksPassed || 0], ["Certificates", r => r.certificates || 0]]; }
  } else if (tab === "daily") {
    const today = dayKey();
    list = rankRows(rows.filter(r => r.daily && r.daily.day === today), r => r.daily.score, (a, b) => (a.daily.ms || 9e9) - (b.daily.ms || 9e9));
    fmt = r => fmtScore(r.daily.score); label = "today's score";
    cols = [["Score", r => `<b>${fmtScore(r.daily.score)}</b>`], ["Time", r => fmtSecs(r.daily.ms)], ["Streak", r => r.dailyStreak || 0]];
    h += `<p class="small muted">Today's challenge (${esc(today)}). Ties are broken by the faster time.</p>`;
  } else {
    list = rankRows(rows.filter(r => r.dailyCount), r => r.dailyStreak || 0, (a, b) => (b.dailyCount || 0) - (a.dailyCount || 0));
    fmt = r => String(r.dailyStreak || 0); label = "day streak";
    cols = [["Current streak", r => `<b>${r.dailyStreak || 0}</b>`], ["Challenges done", r => r.dailyCount || 0]];
  }
  if (!list.length) return h + empty("No rankings yet", "Rankings appear once participants complete tests in this category.");
  const me = list.find(r => r.uid === S.uid);
  if (me) h += `<div class="banner"><b>Your rank: #${me.rank}</b> of ${list.length}<span class="spacer"></span><span class="num">${esc(fmt(me))} ${esc(label)}</span></div>`;
  h += podium(list, fmt, label);
  h += `<div class="tw"><table><thead><tr><th>#</th><th>Name</th><th>Team</th>${cols.map(c => `<th class="r">${c[0]}</th>`).join("")}</tr></thead><tbody>${list.slice(0, 200).map(r => `<tr class="${r.uid === S.uid ? "me" : ""}"><td>${rankBadge(r.rank)}</td><td><div class="row">${avatar(r.name, "sm")}${esc(r.name)}${r.uid === S.uid ? ' <span class="chip saffron">You</span>' : ""}</div></td><td>${esc(r.team || "–")}</td>${cols.map(c => `<td class="r num">${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  return h;
};
ACT.boardTab = el => { S.filters.boardTab = el.dataset.t; UI.refresh(); };
ACT.boardMock = el => { S.filters.boardMock = el.value; UI.refresh(); };

/* ---------- certificates ---------- */
VIEWS.certificates = () => {
  const pm = passMark(), certs = certificatesFrom(S.attempts);
  const todo = S.mocks.filter(m => !mockAttempts(m.id).some(a => a.summary.score >= pm));
  let h = `<div class="page-head"><div><div class="eyebrow">Progress</div><h1>Certificates</h1><p>Score ${pm}% or more on a mock test or the complete SEO assessment to earn a certificate. Open one to print it or save it as a PDF.</p></div></div>`;
  h += certs.length ? `<div class="cert-list">${certs.map(a => `<article class="cert-card"><div class="row">${ico("award")}<b>${esc(a.title)}</b></div><div class="small muted">${fmtDate(a.completedAt)} · ID ${esc(certId(a))}</div><div class="row"><span class="num" style="font-family:var(--font-head);font-size:1.5rem;font-weight:700">${fmtScore(a.summary.score)}</span>${levelChip(a.summary.score)}</div><div class="row"><button class="btn primary sm" data-act="openCert" data-aid="${a.id}">${ico("print")} View and print</button><button class="btn sm" data-act="go" data-to="review" data-aid="${a.id}">Review answers</button></div></article>`).join("")}</div>`
    : empty("No certificates yet", `Pass a mock test or the complete assessment with ${pm}% or more to earn your first certificate.`, `<button class="btn primary" data-act="go" data-to="mocks">Go to mock tests</button>`);
  if (todo.length) h += `<section class="section"><h2>Still to earn</h2><div class="tw"><table><thead><tr><th>Mock test</th><th class="r">Your best</th><th class="r">Needed</th><th></th></tr></thead><tbody>${todo.map(m => { const b = bestOf(mockAttempts(m.id)); return `<tr><td>${esc(m.title)}</td><td class="r num">${fmtScore(b)}</td><td class="r num">${pm}</td><td class="r"><button class="btn sm" data-act="go" data-to="mocks">Open</button></td></tr>`; }).join("")}</tbody></table></div></section>`;
  return h;
};
function certId(a) { return (S.uid || "").slice(0, 5).toUpperCase() + "-" + String(a.id).slice(-6).toUpperCase(); }
function certHtml(a) {
  const name = (S.profile && S.profile.name) || "Participant";
  return `<div class="certificate" id="cert"><div class="c-brand">${esc(S.config.issuer || S.config.siteName)}</div><h1>Certificate of Achievement</h1><p>This certifies that</p><div class="c-name">${esc(name)}</div>
    <p>has successfully passed</p><h2 style="font-size:1.4rem">${esc(a.title)}</h2><p>with a score of <span class="c-score">${fmtScore(a.summary.score)} / 100</span> (${esc(levelName(a.summary.score))}), answering ${a.summary.correct} of ${a.summary.n} questions correctly.</p>
    <div class="c-meta"><div>Date<br><b>${fmtDate(a.completedAt)}</b></div><div>Pass mark<br><b>${passMark()}%</b></div><div>Certificate ID<br><b>${esc(certId(a))}</b></div><div>Issued by<br><b>${esc(S.config.tagline || S.config.siteName)}</b></div></div></div>`;
}
ACT.openCert = el => {
  const a = S.attempts.find(x => x.id === el.dataset.aid); if (!a) return;
  UI.modal("Certificate", certHtml(a) + `<div class="row no-print" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-act="closeModal">Close</button><button class="btn primary" data-act="printCert">${ico("print")} Print or save as PDF</button></div>`, { wide: true });
  document.body.classList.add("printing-cert");
};
ACT.printCert = () => window.print();

/* ---------- study library ---------- */
function libraryFor(cat) { const keys = CAT[cat].res.slice(); S.bank.filter(q => q.cat === cat && q.status === "active").forEach(q => (q.resources || []).forEach(r => { if (!keys.includes(r)) keys.push(r); })); return keys.filter(k => resource(k)); }
VIEWS.library = () => {
  const f = S.filters.lib || (S.filters.lib = { q: "", cat: "", show: "" }), L = S.learning || {}, mods = L.modules || {}, text = f.q.toLowerCase();
  const all = new Set(); CATS.forEach(c => libraryFor(c.id).forEach(k => all.add(k)));
  const studied = Array.from(all).filter(k => mods[k]).length;
  let h = `<div class="page-head"><div><div class="eyebrow">Learn</div><h1>Study Library</h1><p>The official documentation behind every question, organised by category. Tick what you've studied; it counts toward your learning roadmap.</p></div></div>
    <div class="statline" style="margin-top:0"><div><b class="num">${all.size}</b><span>Resources</span></div><div><b class="num">${studied}</b><span>Studied</span></div><div><b class="num">${all.size ? Math.round(studied / all.size * 100) : 0}%</b><span>Library completed</span></div></div>
    <div class="filters" style="margin-top:16px"><label class="f">Search<input type="search" value="${esc(f.q)}" placeholder="e.g. canonical, hreflang, INP" data-change="setLibF" data-field="q"></label><label class="f">Category<select data-change="setLibF" data-field="cat">${catOptions(f.cat, "All categories")}</select></label><label class="f">Show<select data-change="setLibF" data-field="show"><option value="">Everything</option><option value="todo" ${f.show === "todo" ? "selected" : ""}>Not studied yet</option><option value="done" ${f.show === "done" ? "selected" : ""}>Studied</option></select></label></div>`;
  const cards = CATS.filter(c => !f.cat || c.id === f.cat).map(c => {
    const list = libraryFor(c.id).map(resource).filter(r => (!text || (r.title + " " + r.src + " " + c.name).toLowerCase().includes(text)) && (!f.show || (f.show === "done" ? mods[r.key] : !mods[r.key])));
    if (!list.length) return "";
    const done = list.filter(r => mods[r.key]).length;
    return `<article class="lib-card"><div class="row"><h3 style="flex:1">${esc(c.name)}</h3><span class="chip">${done}/${list.length}</span></div><div style="margin-top:8px">${bar(list.length ? done / list.length * 100 : 0, true)}</div>
      <ul>${list.map(r => `<li><input type="checkbox" data-change="toggleModule" data-res="${esc(r.key)}" ${mods[r.key] ? "checked" : ""} aria-label="Studied ${esc(r.title)}" style="margin-top:4px;accent-color:var(--accent)"><span><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a><br><span class="tiny muted">${esc(r.src)}</span></span></li>`).join("")}</ul>
      <div class="row" style="margin-top:10px"><button class="btn sm" data-act="practice" data-cat="${c.id}">Practise</button><button class="btn sm" data-act="start" data-mode="quick" data-cat="${c.id}">Quick quiz</button></div></article>`;
  }).join("");
  return h + (cards ? `<div class="lib">${cards}</div>` : empty("Nothing matches", "Try a different search or filter."));
};
ACT.setLibF = el => { S.filters.lib[el.dataset.field] = el.value; UI.refresh(); };
