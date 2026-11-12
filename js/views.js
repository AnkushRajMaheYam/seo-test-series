"use strict";
/* =========================================================================
   Participant views: dashboard, assessments, test runner, results review,
   practice, categories, performance, knowledge gaps, roadmap, history,
   trends and profile.
   ========================================================================= */
const MODE_LABEL = { complete: "Complete", category: "Category", adaptive: "Adaptive", trends: "Trends", template: "Assigned", practice: "Practice", mock: "Mock test", quick: "Quick quiz", daily: "Daily challenge" };
const MODE_HOME = { mock: "mocks", quick: "quick", daily: "daily" };
function completed() { return S.attempts.filter(a => a.status === "completed").sort((a, b) => a.completedAt - b.completedAt); }
function inProgress() { return S.attempts.filter(a => a.status === "in_progress"); }

/* ---------- shared question renderer ---------- */
function dataTable(d) { return `<div class="tw" style="margin:0 0 14px"><table><thead><tr>${d.h.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${d.r.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`; }
function qBody(q, c) {
  // c: { ctx:'run'|'practice'|'review', resp, order, reveal, hideDiff, num }. When reveal is true, q must include its answer key.
  const dis = c.reveal ? "disabled" : "";
  let body = "";
  if (q.type === "match") {
    const resp = c.resp || {}, order = c.order || (q.right || []).map((_, i) => i);
    body = `<div>${(q.left || []).map((l, i) => {
      const v = resp[i]; const ok = c.reveal ? (v != null && v !== "" && Number(v) === q.match[i]) : null;
      return `<div class="match-row"><div>${esc(l)}</div><div>
        <select data-change="pickMatch" data-ctx="${c.ctx}" data-qid="${q.id}" data-i="${i}" ${dis} aria-label="Match for ${esc(l)}"><option value="">Choose…</option>${order.map(j => `<option value="${j}" ${String(v) === String(j) ? "selected" : ""}>${esc(q.right[j])}</option>`).join("")}</select>
        ${c.reveal ? `<div class="small" style="margin-top:4px">${ok ? '<span class="delta-up">Correct</span>' : `<span class="delta-down">Correct match:</span> ${esc(q.right[q.match[i]])}`}</div>` : ""}</div></div>`;
    }).join("")}</div>`;
  } else if (q.type === "open") {
    body = `<p class="small muted">Write your answer. A reviewer scores it against this rubric; your score is provisional until then.</p>
      <ul class="small">${(q.rubric || []).map(r => `<li>${esc(r.c)} <span class="muted">(${r.p} pts)</span></li>`).join("")}</ul>
      <textarea data-input="pickText" data-ctx="${c.ctx}" data-qid="${q.id}" ${dis} style="min-height:200px" aria-label="Your answer">${esc(c.resp || "")}</textarea>`;
  } else {
    const order = c.order || q.options.map((_, i) => i);
    const multi = q.select === "many", sel = Array.isArray(c.resp) ? c.resp.map(Number) : [], ans = q.answer || [];
    body = `<div class="opts" role="${multi ? "group" : "radiogroup"}">${order.map(i => {
      const on = sel.includes(i), right = c.reveal && ans.includes(i), wrong = c.reveal && on && !ans.includes(i);
      return `<label class="opt ${on ? "sel" : ""} ${right ? "right" : ""} ${wrong ? "wrong" : ""}"><input type="${multi ? "checkbox" : "radio"}" name="q-${q.id}" ${on ? "checked" : ""} ${dis} data-change="pick" data-ctx="${c.ctx}" data-qid="${q.id}" data-i="${i}"><span>${esc(q.options[i])}${c.reveal && right ? ' <b class="delta-up small">Correct answer</b>' : ""}${wrong ? ' <b class="delta-down small">Your choice</b>' : ""}</span></label>`;
    }).join("")}</div>`;
  }
  return `<div class="qmeta">${c.num ? `<b>Question ${c.num}</b>` : ""}<span>${esc(CAT[q.cat].short)}: ${esc(CAT[q.cat].subs[q.sub] || q.sub)}</span>${c.hideDiff ? "" : diffChip(q.diff)}<span class="chip">${esc(TYPE_LABEL[q.type])}</span>${q.trend ? matChip(q.maturity) : ""}</div>
    ${q.ctx ? `<div class="ctx">${esc(q.ctx)}</div>` : ""}
    <div class="qtext">${esc(q.text)}</div>${q.code ? `<pre class="code">${esc(q.code)}</pre>` : ""}${q.data ? dataTable(q.data) : ""}${body}`;
}
function explainBlock(q, resp) {
  const parts = [], why = q.why || [], ans = q.answer || [];
  if (q.type !== "open" && q.explanation) parts.push(`<p><b>Explanation.</b> ${esc(q.explanation)}</p>`);
  if (isChoice(q) && Array.isArray(resp)) {
    const wrong = resp.map(Number).filter(i => !ans.includes(i));
    if (wrong.length) parts.push(`<p><b>Why your answer was wrong.</b> ${wrong.map(i => esc(why[i])).join(" ")}</p>`);
    const missed = ans.filter(i => !resp.map(Number).includes(i));
    if (q.select === "many" && missed.length) parts.push(`<p><b>You missed.</b> ${missed.map(i => esc(q.options[i])).join("; ")}</p>`);
  }
  if (q.type === "match" && typeof q.why === "string" && q.why) parts.push(`<p>${esc(q.why)}</p>`);
  if (q.type === "open") parts.push(`<p><b>Model answer.</b> ${esc(q.model)}</p>`);
  if (q.example) parts.push(`<p><b>Example.</b> ${esc(q.example)}</p>`);
  if (isChoice(q)) {
    const others = q.options.map((o, i) => i).filter(i => !ans.includes(i) && !(Array.isArray(resp) && resp.map(Number).includes(i)));
    if (others.length) parts.push(`<details><summary>Why the other options are wrong</summary><ul class="small">${others.map(i => `<li><b>${esc(q.options[i])}</b>: ${esc(why[i])}</li>`).join("")}</ul></details>`);
  }
  parts.push(`<p class="small">${q.concept ? `<b>Concept:</b> ${esc(q.concept)}. ` : ""}<b>Learn more:</b> ${(q.resources || []).map(resLink).join("; ")}</p>`);
  return parts.join("");
}
function respLabel(q, resp) {
  if (resp == null || (Array.isArray(resp) && !resp.length) || resp === "") return "No answer";
  if (q.type === "open") return String(resp).slice(0, 400) + (String(resp).length > 400 ? "…" : "");
  if (q.type === "match") return (q.left || []).map((l, i) => `${l} → ${resp[i] != null && resp[i] !== "" ? q.right[resp[i]] : "—"}`).join("; ");
  return resp.map(i => q.options[i]).join("; ");
}
function correctLabel(q) {
  if (q.type === "match") return (q.left || []).map((l, i) => `${l} → ${q.match ? q.right[q.match[i]] : "?"}`).join("; ");
  if (q.type === "open") return "Scored against the rubric";
  return (q.answer || []).map(i => q.options[i]).join("; ");
}

/* ---------- dashboard ---------- */
function gapCard(w, opts = {}) {
  return `<article class="gap ${lvClass(w.score)}">
    <div class="gap-head"><h3>${esc(w.name)} <span class="muted small">in ${esc(w.catName)}</span></h3>${statusChip(w.status)}<b class="num">${fmtScore(w.score)}</b></div>
    <dl>
      <dt>Current knowledge score</dt><dd><span class="num">${fmtScore(w.score)}</span> / 100 from ${w.n} recent answer${w.n === 1 ? "" : "s"}${w.fundamentals ? " — includes missed fundamentals" : ""}${w.declining ? " — trending down" : ""}</dd>
      <dt>Struggling with</dt><dd>${w.struggling.length ? `<ul>${w.struggling.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : "—"}</dd>
      <dt>Concepts to understand</dt><dd>${w.toLearn.length ? `<ul>${w.toLearn.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : "Review the explanations of the questions you missed, then practise this area."}</dd>
      <dt>Recommended resources</dt><dd><ul>${w.resources.map(r => `<li>${resLink(r)}</li>`).join("")}</ul></dd>
      <dt>Suggested practice</dt><dd>${w.practiceAvail ? `${w.practiceAvail} question${w.practiceAvail === 1 ? "" : "s"} available. ${opts.noButtons ? "" : `<button class="linkbtn" data-act="practice" data-cat="${w.cat}" data-sub="${w.sub}">Practise now</button>`}` : "No practice questions in this area yet."}</dd>
      <dt>Retest recommendation</dt><dd>${esc(w.retest)} ${opts.noButtons ? "" : `<button class="linkbtn" data-act="start" data-mode="category" data-cat="${w.cat}">Start ${esc(CAT[w.cat].short)} assessment</button>`}</dd>
    </dl></article>`;
}
function categoryList(model) {
  return `<div class="catlist">${CATS.map(c => {
    const x = model.cats[c.id], acc = x.n ? Math.round(x.correct / x.n * 100) : null;
    const dd = DIFFS.map(d => x.byDiff[d].n ? `${DIFF_LABEL[d][0]} ${Math.round(x.byDiff[d].c / x.byDiff[d].n * 100)}%` : `${DIFF_LABEL[d][0]} –`).join(" / ");
    return `<div class="catrow"><div class="name">${esc(c.name)}</div><div class="score num">${fmtScore(x.score)}</div>${bar(x.score)}
      <div class="meta"><span>${x.total} attempted</span><span>Accuracy ${acc == null ? "–" : acc + "%"}</span><span class="num">${dd}</span>${x.n ? levelChip(x.score) : '<span class="chip">Not assessed</span>'}</div></div>`;
  }).join("")}</div>`;
}
function seriesStrip() {
  const today = dayKey(), dailyDone = S.attempts.find(a => a.mode === "daily" && a.day === today && a.status === "completed");
  const nextMock = S.mocks.find(m => !mockAttempts(m.id).length), certs = certificatesFrom(S.attempts), streak = dailyStreak(S.attempts);
  return `<section class="section"><div class="section-head"><h2>Your test series</h2><button class="btn sm" data-act="go" data-to="leaderboard">${ico("trophy")} Leaderboard</button></div><div class="modes">
    <div class="mode"><span class="chip saffron tag">${streak ? `${streak}-day streak` : "Daily"}</span><h3>Daily challenge</h3><p class="small muted">${S.settings.daily.count} questions, the same for everyone today.</p><div class="facts">${dailyDone ? `Done today: <b>${fmtScore(dailyDone.summary.score)}</b> in ${fmtSecs(dailyDone.durationMs)}` : "Not attempted today"}</div>${dailyDone ? `<button class="btn" data-act="go" data-to="daily">View today's result</button>` : `<button class="btn primary" data-act="start" data-mode="daily">Take today's challenge</button>`}</div>
    <div class="mode"><h3>${nextMock ? esc(nextMock.title) : "Mock test series"}</h3><p class="small muted">${nextMock ? `${(nextMock.qids || []).length} questions, ${nextMock.minutes} minutes. Pass with ${passMark()}% for a certificate.` : S.mocks.length ? "You've attempted every published mock. Retake one to improve your best score." : "No mock tests are published yet."}</p><div class="facts">${S.mocks.length} mock${S.mocks.length === 1 ? "" : "s"} published · ${S.mocks.filter(m => mockAttempts(m.id).length).length} attempted</div>${nextMock ? `<button class="btn primary" data-act="startMock" data-id="${esc(nextMock.id)}">Start ${esc(nextMock.title)}</button>` : `<button class="btn" data-act="go" data-to="mocks">Open mock tests</button>`}</div>
    <div class="mode"><h3>Quick quiz</h3><p class="small muted">${S.settings.quick.count} questions in ${S.settings.quick.minutes} minutes across every category.</p><div class="facts">${certs.length} certificate${certs.length === 1 ? "" : "s"} earned</div><button class="btn primary" data-act="start" data-mode="quick">Start a quick quiz</button></div>
  </div></section>`;
}
VIEWS.dashboard = () => {
  const m = myModel(), tl = myTimeline().filter(p => p.overall != null), done = completed();
  const cur = m.overall, prev = tl.length >= 2 ? tl[tl.length - 2].overall : null, first = tl.length ? tl[0].overall : null;
  const ip = inProgress(), assigned = S.assignments.filter(a => a.status !== "done");
  const tpls = availableTemplates(), name = (S.profile && S.profile.name) || "";
  let h = `<div class="page-head"><div><div class="eyebrow">${esc(S.config.tagline || "SEO Test Series")}</div><h1>Hello${name ? ", " + esc(name.split(" ")[0]) : ""}</h1><p>Your SEO competency, where you're strong, and what to learn next.</p></div>
    <div class="row"><button class="btn" data-act="go" data-to="assess">Choose an assessment</button><button class="btn primary" data-act="start" data-mode="adaptive">Start adaptive assessment</button></div></div>`;
  if (ip.length) h += `<div class="banner"><b>Test in progress.</b> <span>${esc(ip[0].title)} started ${fmtDateTime(ip[0].startedAt)}.</span><span class="spacer"></span><button class="btn sm primary" data-act="resume" data-aid="${ip[0].id}">Resume</button></div>`;
  if (assigned.length) h += `<div class="banner warn"><b>${assigned.length} learning assignment${assigned.length > 1 ? "s" : ""} from your administrator.</b><span class="spacer"></span><button class="btn sm" data-act="go" data-to="roadmap">View roadmap</button></div>`;
  if (tpls.length) h += `<div class="banner"><b>${tpls.length} assessment${tpls.length > 1 ? "s" : ""} assigned to you.</b><span class="spacer"></span><button class="btn sm" data-act="go" data-to="assess">See assessments</button></div>`;
  if (!S.bank.length) h += `<div class="banner err">The question bank is empty. ${S.isAdmin ? "Open the admin console > Question Bank > Import JSON and choose private-question-bank/questions.json from the zip." : "Ask the administrator to load the question bank."}</div>`;
  h += `<section class="panel hero navy"><div><div class="score-big num">${cur == null ? "–" : fmtScore(cur)}<small>/ 100</small></div>
      <div class="score-meta">${levelChip(cur)}<span class="small muted">${cur == null ? "Complete an assessment to get your score." : `Based on ${m.coverage} of 16 categories`}</span></div></div>
      <div>${ruler(cur, prev)}<div class="small muted">${prev != null ? `Hollow marker: previous score ${fmtScore(prev)}` : "Your previous score will appear here after your next assessment."}</div></div></section>
    <div class="statline">
      <div><b class="num">${fmtScore(prev)}</b><span>Previous score</span></div>
      <div><b class="num">${cur != null && first != null && tl.length > 1 ? deltaHtml(cur - first) + (first ? ` <span class="small">(${deltaHtml((cur - first) / first * 100, "%")})</span>` : "") : "–"}</b><span>Improvement since first</span></div>
      <div><b class="num">${done.length}</b><span>Tests completed</span></div>
      <div><b class="num">${m.answered}</b><span>Questions answered</span></div>
      <div><b class="num">${m.accuracy == null ? "–" : m.accuracy + "%"}</b><span>Accuracy</span></div>
      <div><b>${esc(m.level)}</b><span>Competency level</span></div></div>`;
  h += seriesStrip();
  h += `<section class="section"><h2>Accuracy by difficulty</h2><div class="diffs">${DIFFS.map(d => `<div><div class="small muted">${DIFF_LABEL[d]} questions</div><b class="num">${m.diff[d].acc == null ? "–" : m.diff[d].acc + "%"}</b><div class="small muted">${m.diff[d].n} answered</div>${bar(m.diff[d].acc, true)}</div>`).join("")}</div></section>`;
  h += `<section class="section"><div class="section-head"><h2>Category performance</h2><span class="small muted">Scores use your most recent ${S.settings.window.cat} answers per category, weighted by difficulty</span></div>${categoryList(m)}</section>`;
  const weak = weakAreas(m, 5);
  h += `<section class="section"><div class="section-head"><h2>Areas requiring improvement</h2><button class="btn sm" data-act="go" data-to="roadmap">Open learning roadmap</button></div>
    ${weak.length ? weak.map(w => gapCard(w)).join("") : empty("No weak areas identified yet", done.length ? "Nothing currently scores below the improvement threshold. Keep testing new categories to confirm." : "Take an assessment to see your weakest subcategories here.")}</section>`;
  const strong = strongAreas(m);
  h += `<section class="section"><h2>Strong areas</h2>${strong.cats.length || strong.mastered.length ? `<div class="grid g2"><div class="panel"><h3>Strongest categories</h3>${strong.cats.length ? `<ul>${strong.cats.slice(0, 6).map(c => `<li>${esc(c.name)}: <b class="num">${fmtScore(m.cats[c.id].score)}</b></li>`).join("")}</ul>` : '<p class="muted small">No category above 75 yet.</p>'}</div>
     <div class="panel"><h3>Mastered concepts</h3>${strong.mastered.length ? `<div class="pill-list">${strong.mastered.slice(0, 18).map(k => `<span class="st st-mastered">${esc(subName(k))}</span>`).join("")}</div>` : '<p class="muted small">Subcategories you answer consistently well, including medium or hard questions, appear here.</p>'}</div></div>` : empty("Strengths appear after a few assessments", "Categories above 75 and mastered subcategories will be listed here.")}</section>`;
  return h;
};

/* ---------- take assessment ---------- */
function availableTemplates() {
  return S.templates.filter(t => t.active !== false && (
    !t.audience || t.audience.type === "all" ||
    (t.audience.type === "team" && S.profile && t.audience.team && (S.profile.team || "").toLowerCase() === t.audience.team.toLowerCase()) ||
    (t.audience.type === "people" && (t.audience.people || []).includes(S.uid))));
}
VIEWS.assess = () => {
  const st = S.settings, ip = inProgress(), tpls = availableTemplates();
  const cc = mixCounts(st.category.count, st.category.mix, true), tc = mixCounts(st.trends.count, st.trends.mix, true);
  let h = `<div class="page-head"><div><div class="eyebrow">Test series</div><h1>Take an assessment</h1><p>Answers aren't revealed until you submit. Your progress saves automatically, so you can close the page and resume.</p></div><div class="row"><button class="btn" data-act="go" data-to="mocks">${ico("mock")} Mock tests</button><button class="btn" data-act="go" data-to="daily">${ico("calendar")} Daily challenge</button></div></div>`;
  if (ip.length) h += `<section class="section" style="margin-top:0"><h2>In progress</h2><div class="tw"><table><thead><tr><th>Test</th><th>Started</th><th>Answered</th><th>Time left</th><th></th></tr></thead><tbody>${ip.map(a => {
    const left = a.deadline - nowTs();
    return `<tr><td>${esc(a.title)}</td><td>${fmtDateTime(a.startedAt)}</td><td class="num">${Object.keys(a.resp || {}).length} / ${a.mode === "adaptive" ? "up to " + a.adaptive.max : a.qids.length}</td><td>${left > 0 ? fmtDur(left) : "Expired, will be submitted"}</td>
      <td class="r"><button class="btn sm primary" data-act="resume" data-aid="${a.id}">${left > 0 ? "Resume" : "Submit"}</button> <button class="btn sm danger" data-act="abandon" data-aid="${a.id}">Discard</button></td></tr>`; }).join("")}</tbody></table></div></section>`;
  h += `<section class="section"><div class="modes">
    <div class="mode"><h3>Complete SEO assessment</h3><p class="small">Covers all 16 categories to give your full competency profile.</p><div class="facts num">${st.complete.count} questions: ${st.complete.mix.easy} easy, ${st.complete.mix.medium} medium, ${st.complete.mix.hard} hard. ${st.complete.minutes}-minute limit. Earns a certificate at ${passMark()}%.</div><button class="btn primary" data-act="start" data-mode="complete">Start complete assessment</button></div>
    <div class="mode"><h3>Adaptive assessment</h3><p class="small">Starts easy, gets harder as you answer correctly and easier when you struggle. A follow-up question checks whether a miss is a real gap or a one-off.</p><div class="facts">Up to ${st.adaptive.max} questions, ${st.adaptive.minutes}-minute limit. Skips areas you've already mastered.</div><button class="btn primary" data-act="start" data-mode="adaptive">Start adaptive assessment</button></div>
    <div class="mode"><h3>Category assessment</h3><p class="small">Go deep on one discipline.</p><div class="facts num">${st.category.count} questions: ${cc.easy} easy, ${cc.medium} medium, ${cc.hard} hard. ${st.category.minutes} minutes.</div>
      <label class="f">Category<select id="cat-pick">${catOptions(S.params.cat || "tech")}</select></label><button class="btn primary" data-act="startCategory">Start category assessment</button></div>
    <div class="mode"><h3>SEO trends assessment</h3><p class="small">AI search, GEO and AEO, zero-click and search changes. Each question shows whether the concept is established, emerging, experimental or speculative.</p><div class="facts num">${st.trends.count} questions: ${tc.easy} easy, ${tc.medium} medium, ${tc.hard} hard.</div><button class="btn primary" data-act="start" data-mode="trends">Start trends assessment</button></div>
  </div></section>`;
  if (tpls.length) h += `<section class="section"><h2>Assigned to you</h2><div class="modes">${tpls.map(t => `<div class="mode"><h3>${esc(t.name)}</h3>${t.desc ? `<p class="small">${esc(t.desc)}</p>` : ""}<div class="facts">${t.count} questions, ${t.minutes} minutes. ${(t.cats || []).length ? (t.cats || []).map(c => CAT[c] ? CAT[c].short : c).join(", ") : "All categories"}.</div><button class="btn primary" data-act="start" data-mode="template" data-tpl="${esc(t._id || t.id)}">Start</button></div>`).join("")}</div></section>`;
  h += `<section class="section"><h2>Practice without scoring</h2><p class="muted">Practice shows the answer and explanation after each question and doesn't affect your competency score.</p><div class="row"><select id="prac-cat" style="max-width:320px">${catOptions("tech")}</select><button class="btn" data-act="practiceCat">Practise this category</button></div></section>`;
  return h;
};
ACT.startCategory = () => Runner.start({ mode: "category", cat: $("#cat-pick").value });
ACT.practiceCat = () => Practice.start({ cat: $("#prac-cat").value });
ACT.start = el => Runner.start({ mode: el.dataset.mode, cat: el.dataset.cat, templateId: el.dataset.tpl, mockId: el.dataset.mock });
ACT.resume = el => Runner.resume(el.dataset.aid);
ACT.abandon = async el => {
  if (!(await UI.confirm("Discard this in-progress test? Your answers in it will be deleted.", "Discard"))) return;
  const aid = el.dataset.aid; await Store.del(P.attempt(S.uid, aid)).catch(() => {});
  S.attempts = S.attempts.filter(a => a.id !== aid); if (S.run && S.run.att.id === aid) S.run = null; UI.refresh();
};

/* ---------- runner ---------- */
const Runner = {
  timer: null, saveT: null,
  async start(spec) {
    if (S.readOnly) { UI.toast("You have view-only access, so tests can't be saved."); return; }
    if (!S.bank.length) { UI.toast("The question bank is empty."); return; }
    if (spec.mode === "daily") {
      spec.day = dayKey();
      if (S.attempts.some(a => a.mode === "daily" && a.day === spec.day && a.status === "completed")) { UI.toast("You've already completed today's challenge. Come back tomorrow!"); UI.go("daily"); return; }
    }
    if (spec.mode === "quick") spec.cat = spec.cat || null;
    if (spec.mode === "mock") {
      const mk = S.mocks.find(m => m.id === spec.mockId); if (!mk) { UI.toast("This mock test isn't available."); return; }
      const used = mockAttempts(mk.id).length;
      if (mk.attemptsAllowed > 0 && used >= mk.attemptsAllowed) { UI.toast(`You've used all ${mk.attemptsAllowed} attempt${mk.attemptsAllowed > 1 ? "s" : ""} for ${mk.title}.`); return; }
    }
    const existing = inProgress().find(a => a.mode === spec.mode && (spec.mode !== "category" || a.cat === spec.cat) && (spec.mode !== "mock" || a.mockId === spec.mockId) && (spec.mode !== "daily" || a.day === spec.day) && (spec.mode !== "template" || a.templateId === spec.templateId));
    if (existing) { if (await UI.confirm(`You already have "${existing.title}" in progress. Resume it?`, "Resume")) return this.resume(existing.id); return; }
    if (spec.mode === "mock") {
      const mk = S.mocks.find(m => m.id === spec.mockId);
      if (!(await UI.confirm(`Start ${mk.title}? ${(mk.qids || []).length} questions, ${mk.minutes} minutes. The timer starts as soon as you begin and keeps running if you leave.`, "Start the timer"))) return;
    }
    let att; try { att = newAttempt(spec); } catch (e) { UI.toast(e.message); return; }
    if (!att.qids.length) { UI.toast("No active questions are available for this test."); return; }
    try { await Store.set(P.attempt(S.uid, att.id), att); } catch (e) { UI.toast("Couldn't start the test. Check your connection."); return; }
    S.attempts.push(att); S.run = { att, idx: 0 }; S.navFrom = MODE_HOME[att.mode] || "assess"; UI.go("runner");
  },
  resume(aid) {
    const att = S.attempts.find(a => a.id === aid); if (!att) return;
    S.run = { att, idx: att.mode === "adaptive" ? att.qids.length - 1 : (att.idx || 0) }; S.navFrom = MODE_HOME[att.mode] || "assess";
    if (att.deadline <= nowTs()) { this.submit(true); return; }
    UI.go("runner");
  },
  stopTimer() { clearInterval(this.timer); this.timer = null; },
  startTimer() {
    this.stopTimer();
    const tick = () => {
      if (!S.run) return this.stopTimer();
      const left = S.run.att.deadline - nowTs(), el = $("#timer");
      if (el) { const m = Math.max(0, Math.floor(left / 60000)), s = Math.max(0, Math.floor(left / 1000) % 60); el.textContent = `${m}:${String(s).padStart(2, "0")}`; el.classList.toggle("low", left < 5 * 60000); }
      if (left <= 0) { this.stopTimer(); UI.toast("Time is up. Submitting your answers."); this.submit(true); }
    };
    tick(); this.timer = setInterval(tick, 1000);
  },
  queueSave() { clearTimeout(this.saveT); this.saveT = setTimeout(() => this.saveNow(), 1200); },
  saveNow() {
    clearTimeout(this.saveT); if (!S.run) return Promise.resolve();
    const a = S.run.att; a.updatedAt = nowTs(); a.idx = S.run.idx;
    const s = $("#savestate"); if (s) s.textContent = "Saving…";
    return Store.update(P.attempt(S.uid, a.id), { resp: a.resp, marked: a.marked, idx: a.idx, qids: a.qids, order: a.order, adaptive: a.adaptive || null, updatedAt: a.updatedAt })
      .then(() => { const s2 = $("#savestate"); if (s2) s2.textContent = "Saved"; }).catch(() => { const s2 = $("#savestate"); if (s2) s2.textContent = "Not saved"; });
  },
  async submit(auto) {
    if (!S.run) return; const a = S.run.att; if (a._submitting) return; a._submitting = true;
    this.stopTimer(); clearTimeout(this.saveT);
    UI.loading("Scoring your answers");
    await this.saveNow().catch(() => {});
    try { await Keys.ensure(a.qids); }
    catch (e) { delete a._submitting; S.run = null; UI.renderShell(); UI.go("assess"); UI.toast("Your answers are saved, but scoring needs a connection. Open the test from In progress and submit again."); return; }
    const now = nowTs(), probes = {};
    if (a.adaptive) a.adaptive.log.forEach(l => { if (l.probe) probes[l.qid] = true; });
    const items = a.qids.map(id => {
      const q = full(id); if (!q) return null;
      const r = a.resp[id] == null ? null : a.resp[id], g = grade(q, r);
      const it = { qid: id, cat: q.cat, sub: q.sub, diff: q.diff, type: q.type, resp: r, credit: g.credit, correct: g.correct, answered: g.answered, pending: g.pending, ts: now, concept: q.concept || null };
      if (probes[id]) it.probe = true; return it;
    }).filter(Boolean);
    const summary = summarize(items);
    if (a.adaptive) summary.adaptive = adaptiveReport(a);
    delete a._submitting;
    Object.assign(a, { status: "completed", completedAt: now, summary, auto: !!auto, durationMs: Math.min(now, a.deadline + 5000) - a.startedAt });
    try {
      await Store.set(P.answer(S.uid, a.id), { aid: a.id, completedAt: now, items });
      await Store.set(P.attempt(S.uid, a.id), a);
    } catch (e) { a.status = "in_progress"; UI.renderShell(); UI.toast("Your answers couldn't be submitted. They're still saved; try again."); UI.go("assess"); return; }
    S.answers[a.id] = items; items.forEach(i => { if (i.concept) S.conceptMap[i.qid] = i.concept; });
    for (const it of items) { const s = S.seen[it.qid] || [0, 0, null]; S.seen[it.qid] = [s[0] + 1, now, it.pending ? s[2] : (it.correct ? 1 : 0)]; }
    Store.set(P.seen(S.uid), { m: S.seen }).catch(() => {});
    const pend = items.filter(i => i.pending);
    if (pend.length) {
      const reviews = {}; pend.forEach(i => { const rid = a.id + "_" + i.qid; reviews[rid] = { rid, uid: S.uid, aid: a.id, qid: i.qid, resp: i.resp, ts: now, status: "pending" }; });
      Store.merge(P.inbox(S.uid), { reviews }).catch(() => {});
    }
    invalidateMine();
    await updateMySummary();
    S.run = null; UI.renderShell(); UI.go("review", { aid: a.id });
    const pm = passMark();
    if (["mock", "complete"].includes(a.mode) && !summary.pending && summary.score >= pm) UI.toast(`Passed with ${fmtScore(summary.score)}. Your certificate is ready under Certificates.`);
  }
};
async function updateMySummary() {
  const r = computeSummary(S.attempts, S.answers);
  S.profile.summary = r.summary; S.profile.timeline = r.timeline; S.profile.lastActive = nowTs();
  await Store.update(P.me(), { summary: r.summary, timeline: r.timeline, lastActive: S.profile.lastActive }).catch(() => {});
  await updateLeaderboard();
}
VIEWS.runner = () => {
  if (!S.run) { const ip = inProgress()[0]; if (ip) { S.run = { att: ip, idx: ip.mode === "adaptive" ? ip.qids.length - 1 : (ip.idx || 0) }; } else { setTimeout(() => UI.go("assess"), 0); return ""; } }
  const a = S.run.att, adaptive = a.mode === "adaptive";
  if (a.deadline <= nowTs()) { setTimeout(() => Runner.submit(true), 0); return ""; }
  const idx = Math.min(S.run.idx, a.qids.length - 1), q = S.bankById[a.qids[idx]];
  UI.after.push(() => Runner.startTimer());
  const answered = a.qids.filter(id => isAnswered(S.bankById[id], a.resp[id])).length;
  let h = `<div class="runner"><div class="run-head"><div><b>${esc(a.title)}</b><div class="small muted">${adaptive ? `Question ${a.qids.length} of up to ${a.adaptive.max}` : `${answered} of ${a.qids.length} answered`} <span id="savestate"></span></div></div><span class="spacer"></span>
    <span class="timer num" id="timer" aria-live="off">–</span>
    <button class="btn sm" data-act="saveExit">Save and exit</button>${adaptive ? `<button class="btn sm" data-act="finishAdaptive">Finish now</button>` : `<button class="btn sm primary" data-act="submitRun">Submit</button>`}</div>`;
  if (!q) { h += `<div class="banner err">This question is no longer in the bank. Skip it.</div>`; }
  else h += `<div class="qcard">${qBody(q, { ctx: "run", resp: a.resp[q.id], order: a.order[q.id], num: idx + 1, hideDiff: adaptive })}
    <div class="run-foot">${adaptive ? `<button class="btn primary" data-act="adaptiveNext">Submit answer and continue</button><span class="small muted">You can't go back in adaptive mode.</span>` :
      `<button class="btn" data-act="runPrev" ${idx === 0 ? "disabled" : ""}>Previous</button><button class="btn primary" data-act="runNext">${idx === a.qids.length - 1 ? "Review and submit" : "Next"}</button>
       <label class="check small"><input type="checkbox" data-change="markReview" ${a.marked[q.id] ? "checked" : ""}> Mark for review</label>`}
      <span class="spacer"></span><button class="linkbtn small" data-act="flagQ" data-qid="${q.id}">Report a problem with this question</button></div></div>`;
  if (!adaptive) h += `<nav class="palette" aria-label="Questions">${a.qids.map((id, i) => { const ans = isAnswered(S.bankById[id], a.resp[id]); return `<button data-act="runJump" data-i="${i}" class="${ans ? "ans" : ""} ${i === idx ? "cur" : ""} ${a.marked[id] ? "mk" : ""}" aria-label="Question ${i + 1}${ans ? ", answered" : ""}">${i + 1}</button>`; }).join("")}</nav>
    <p class="small muted">Filled: answered. Dashed: marked for review.</p>`;
  return h + "</div>";
};
function respTarget(ctx) { return ctx === "practice" ? S.practice.resp : S.run.att.resp; }
ACT.pick = el => {
  const ctx = el.dataset.ctx, qid = el.dataset.qid, i = Number(el.dataset.i), q = S.bankById[qid], r = respTarget(ctx);
  if (q.select === "many") { const cur = new Set((r[qid] || []).map(Number)); el.checked ? cur.add(i) : cur.delete(i); r[qid] = Array.from(cur).sort((a, b) => a - b); }
  else r[qid] = [i];
  $$(`input[name="q-${qid}"]`).forEach(inp => inp.closest(".opt").classList.toggle("sel", inp.checked));
  if (ctx === "run") { Runner.queueSave(); const b = $(`.palette button[data-i="${S.run.idx}"]`); if (b) b.classList.toggle("ans", isAnswered(q, r[qid])); }
};
ACT.pickMatch = el => { const r = respTarget(el.dataset.ctx), qid = el.dataset.qid; r[qid] = Object.assign({}, r[qid] || {}); r[qid][el.dataset.i] = el.value === "" ? null : Number(el.value); if (el.dataset.ctx === "run") Runner.queueSave(); };
ACT.pickText = el => { respTarget(el.dataset.ctx)[el.dataset.qid] = el.value; if (el.dataset.ctx === "run") Runner.queueSave(); };
ACT.markReview = el => { const a = S.run.att, qid = a.qids[S.run.idx]; if (el.checked) a.marked[qid] = true; else delete a.marked[qid]; Runner.queueSave(); };
ACT.runPrev = () => { S.run.idx = Math.max(0, S.run.idx - 1); Runner.queueSave(); UI.refresh(); };
ACT.runNext = () => { const a = S.run.att; if (S.run.idx >= a.qids.length - 1) return ACT.submitRun(); S.run.idx++; Runner.queueSave(); UI.refresh(); };
ACT.runJump = el => { S.run.idx = Number(el.dataset.i); Runner.queueSave(); UI.refresh(); };
ACT.saveExit = async () => { await Runner.saveNow(); Runner.stopTimer(); S.run = null; UI.toast("Progress saved. Resume any time from Take Assessment. The timer keeps running."); UI.go("dashboard"); };
ACT.submitRun = async () => {
  const a = S.run.att, un = a.qids.filter(id => !isAnswered(S.bankById[id], a.resp[id])).length, mk = Object.keys(a.marked).length;
  const msg = (un ? `${un} question${un > 1 ? "s are" : " is"} unanswered and will be scored as incorrect. ` : "") + (mk ? `${mk} marked for review. ` : "") + "Submit your test now?";
  if (await UI.confirm(msg, "Submit test")) Runner.submit(false);
};
ACT.adaptiveNext = async el => {
  const a = S.run.att, qid = a.qids[a.qids.length - 1], pub = S.bankById[qid];
  if (!isAnswered(pub, a.resp[qid]) && !(await UI.confirm("You haven't answered. Skip this question? It will count as incorrect.", "Skip"))) return;
  if (el) el.disabled = true;
  try { await Keys.ensure([qid]); } catch (e) { if (el) el.disabled = false; UI.toast("Couldn't check your answer. Check your connection and try again."); return; }
  adaptiveRecord(a, pub, grade(full(qid), a.resp[qid]));
  const nxt = adaptiveNext(a);
  if (!nxt) { await Runner.saveNow(); return Runner.submit(false); }
  addAdaptiveQ(a, nxt); S.run.idx = a.qids.length - 1; await Runner.saveNow(); UI.refresh();
};
ACT.finishAdaptive = async () => {
  if (!(await UI.confirm("Finish the adaptive assessment now? The current question will be included if answered.", "Finish"))) return;
  const a = S.run.att, qid = a.qids[a.qids.length - 1], pub = S.bankById[qid];
  if (isAnswered(pub, a.resp[qid])) { try { await Keys.ensure([qid]); adaptiveRecord(a, pub, grade(full(qid), a.resp[qid])); } catch (e) {} } else { a.qids.pop(); delete a.order[qid]; }
  await Runner.saveNow(); Runner.submit(false);
};

/* ---------- flags ---------- */
ACT.flagQ = el => {
  const qid = el.dataset.qid;
  UI.modal("Report a problem", `<p class="small muted">The administrator reviews every report. Your current answer isn't affected.</p>
    <label class="f">What's wrong?<select id="fl-reason"><option value="incorrect">The marked answer is wrong</option><option value="ambiguous">More than one answer is defensible</option><option value="outdated">It's outdated</option><option value="unclear">It's unclear or has a typo</option><option value="other">Something else</option></select></label>
    <label class="f" style="margin-top:10px">Details<textarea id="fl-note" placeholder="Explain the problem and, if possible, cite a source."></textarea></label>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-act="sendFlag" data-qid="${qid}">Send report</button></div>`);
};
ACT.sendFlag = async el => {
  const fid = uidgen(), flag = { fid, uid: S.uid, qid: el.dataset.qid, reason: $("#fl-reason").value, note: $("#fl-note").value.trim().slice(0, 2000), ts: nowTs(), status: "open" };
  try { await Store.merge(P.inbox(S.uid), { flags: { [fid]: flag } }); UI.closeModal(); UI.toast("Thanks. Your report was sent to the administrator."); }
  catch (e) { UI.toast("The report couldn't be sent."); }
};

/* ---------- review ---------- */
function needKeys(qids) {
  const need = qids.filter(id => !S.keys[id] && S.bankById[id]);
  if (!need.length) return null;
  if (!S._keysLoading) {
    S._keysLoading = true;
    Keys.ensure(need).then(() => { S._keysLoading = false; UI.refresh(); }).catch(e => { S._keysLoading = false; S._keysErr = e.message; UI.refresh(); });
  }
  if (S._keysErr) { const m = S._keysErr; S._keysErr = null; return `<div class="banner err">${esc(m)} Reload the page to try again.</div>`; }
  return `<div class="loading"><div><div class="spin"></div>Loading answers and explanations…</div></div>`;
}
VIEWS.review = () => {
  const done = completed(); const aid = S.params.aid || (done.length ? done[done.length - 1].id : null);
  const a = S.attempts.find(x => x.id === aid);
  if (!a || a.status !== "completed") return empty("No completed test to review", "Your results appear here after you submit a test.", `<button class="btn primary" data-act="go" data-to="assess">Take an assessment</button>`);
  const items = S.answers[a.id] || [], s = a.summary || summarize(items);
  const wait = needKeys(items.map(i => i.qid)); if (wait) return wait;
  S.params.aid = a.id;
  const prevSame = done.filter(x => x.mode === a.mode && x.completedAt < a.completedAt && (a.mode !== "category" || x.cat === a.cat) && (a.mode !== "mock" || x.mockId === a.mockId)).pop();
  const filter = S.filters.review || "all", pm = passMark(), passed = ["mock", "complete"].includes(a.mode) && !s.pending && s.score >= pm;
  let h = `<div class="page-head"><div><div class="eyebrow">${esc(MODE_LABEL[a.mode] || a.mode)} result</div><h1>${esc(a.title)}</h1><p>Completed ${fmtDateTime(a.completedAt)} in ${fmtDur(a.durationMs)}${a.auto ? " (submitted automatically when time ran out)" : ""}.</p></div>
    <div class="row"><button class="btn" data-act="go" data-to="history">All results</button>${passed ? `<button class="btn" data-act="openCert" data-aid="${a.id}">${ico("award")} View certificate</button>` : ""}<button class="btn primary" data-act="go" data-to="roadmap">Open learning roadmap</button></div></div>`;
  if (["mock", "complete"].includes(a.mode)) h += passed ? `<div class="banner"><b>Passed.</b> You scored ${fmtScore(s.score)}, above the ${pm}% pass mark. Your certificate is ready.</div>` : (s.pending ? "" : `<div class="banner warn"><b>Not passed yet.</b> The pass mark is ${pm}%. Review the explanations below, practise your weak areas and try again.</div>`);
  h += `<section class="panel hero navy"><div><div class="score-big num">${fmtScore(s.score)}<small>/ 100</small></div><div class="score-meta">${levelChip(s.score)}<span class="small muted">Weighted score (easy ${S.settings.weights.easy}, medium ${S.settings.weights.medium}, hard ${S.settings.weights.hard})</span></div></div>
    <div>${ruler(s.score, prevSame && prevSame.summary ? prevSame.summary.score : null)}<div class="small muted">${prevSame ? `Previous ${esc(MODE_LABEL[a.mode] || a.mode).toLowerCase()} attempt: ${fmtScore(prevSame.summary.score)} (${deltaHtml(s.score - prevSame.summary.score)})` : "First attempt of this type."}</div></div></section>
    <div class="statline"><div><b class="num">${s.correct}</b><span>Correct</span></div><div><b class="num">${s.incorrect}</b><span>Incorrect</span></div><div><b class="num">${s.unanswered}</b><span>Unanswered</span></div><div><b class="num">${s.pending}</b><span>Awaiting review</span></div><div><b class="num">${s.accuracy}%</b><span>Accuracy</span></div>
    ${DIFFS.map(d => `<div><b class="num">${s.byDiff[d].acc == null ? "–" : s.byDiff[d].acc + "%"}</b><span>${DIFF_LABEL[d]} accuracy (${s.byDiff[d].correct}/${s.byDiff[d].n})</span></div>`).join("")}</div>`;
  if (s.pending) h += `<div class="banner warn" style="margin-top:16px">${s.pending} open-response answer${s.pending > 1 ? "s are" : " is"} awaiting rubric review. Your score excludes ${s.pending > 1 ? "them" : "it"} until graded.</div>`;
  const cats = Object.entries(s.byCat);
  if (cats.length > 1) h += `<section class="section"><h2>By category</h2><div class="tw"><table><thead><tr><th>Category</th><th class="r">Questions</th><th class="r">Correct</th><th class="r">Score</th><th style="width:30%"></th></tr></thead><tbody>${cats.sort((x, y) => (x[1].score || 0) - (y[1].score || 0)).map(([c, v]) => `<tr><td>${esc(CAT[c].name)}</td><td class="r num">${v.n}</td><td class="r num">${v.correct}</td><td class="r num">${fmtScore(v.score)}</td><td>${bar(v.score, true)}</td></tr>`).join("")}</tbody></table></div></section>`;
  if (s.adaptive) {
    const ar = s.adaptive, VER = { gap: ["gap", "Knowledge gap (missed twice)"], isolated: ["isolated", "Isolated error (follow-up correct)"], unconfirmed: ["unconfirmed", "Needs evidence"], correct: ["proficient", "Answered correctly"], mixed: ["developing", "Mixed"] };
    h += `<section class="section"><h2>Adaptive competency report</h2><p class="muted small">Finished at ${esc(DIFF_LABEL[ar.finalLevel])} difficulty. After any miss, the engine asked a follow-up in the same subcategory: a correct follow-up marks the miss as an isolated error; a second miss confirms a knowledge gap.</p>
    <div class="tw"><table><thead><tr><th>Subcategory</th><th>Category</th><th class="r">Asked</th><th class="r">Correct</th><th>Finding</th></tr></thead><tbody>${Object.entries(ar.subs).sort((x, y) => (x[1].correct / x[1].n) - (y[1].correct / y[1].n)).map(([k, v]) => `<tr><td>${esc(subName(k))}</td><td>${esc(CAT[k.split(":")[0]].short)}</td><td class="r num">${v.n}</td><td class="r num">${v.correct}</td><td>${statusChip(VER[v.verdict][0]).replace(STATUS_LABEL[VER[v.verdict][0]], VER[v.verdict][1])}</td></tr>`).join("")}</tbody></table></div>
    <div class="tw" style="margin-top:12px"><table><thead><tr><th>Category</th><th class="r">Asked</th><th class="r">Correct</th><th>Highest difficulty answered correctly</th></tr></thead><tbody>${Object.entries(ar.cats).map(([c, v]) => `<tr><td>${esc(CAT[c].name)}</td><td class="r num">${v.n}</td><td class="r num">${v.correct}</td><td>${v.top < 0 ? "None" : DIFF_LABEL[DIFFS[v.top]]}</td></tr>`).join("")}</tbody></table></div></section>`;
  }
  const touched = new Set(items.map(i => i.cat));
  const plan = weakAreas(myModel(), 12).filter(w => touched.has(w.cat)).slice(0, 3);
  h += `<section class="section"><h2>Your improvement plan</h2>${plan.length ? plan.map(w => `<div class="panel" style="margin-bottom:12px"><h3>Weak area: ${esc(w.name)} <span class="muted small">(${esc(w.catName)}, ${fmtScore(w.score)}/100)</span></h3>
    <p class="small"><b>Identified gaps:</b> ${w.struggling.length ? w.struggling.map(esc).join("; ") : "see missed questions below"}</p>
    <ol class="small"><li>Study: ${w.toLearn.concat(w.struggling).slice(0, 2).map(esc).join("; ") || esc(w.name)}.</li><li>Read ${resLink(w.resources[0])}.</li>${w.resources[1] ? `<li>Then ${resLink(w.resources[1])}.</li>` : ""}<li>Complete ${w.practiceTarget} practice questions. <button class="linkbtn" data-act="practice" data-cat="${w.cat}" data-sub="${w.sub}">Practise now</button></li><li>Work through a practical troubleshooting exercise in ${esc(CAT[w.cat].short)}.</li><li>Retake the ${esc(CAT[w.cat].name)} assessment.</li></ol></div>`).join("") : empty("No weak areas from this test", "Nothing here scored below the improvement threshold. Try a harder mode or another category.")}</section>`;
  const list = items.map((it, i) => ({ it, i })).filter(({ it }) => filter === "all" || (filter === "wrong" && it.answered && !it.correct && !it.pending) || (filter === "skip" && !it.answered) || (filter === "pending" && it.pending));
  h += `<section class="section"><div class="section-head"><h2>Question review</h2><div class="tabs" role="tablist" style="margin:0;border:0">${[["all", "All"], ["wrong", "Incorrect"], ["skip", "Unanswered"], ["pending", "Awaiting review"]].map(([k, l]) => `<button role="tab" aria-selected="${filter === k}" data-act="reviewFilter" data-f="${k}">${l}</button>`).join("")}</div></div>
    ${list.length ? list.map(({ it, i }) => reviewItem(it, i)).join("") : empty("Nothing to show", "No questions match this filter.")}</section>`;
  return h;
};
function reviewItem(it, i) {
  const q = full(it.qid);
  if (!q) return `<div class="rv"><p class="muted">Question ${esc(it.qid)} was removed from the bank.</p></div>`;
  const res = it.pending ? ["skip", "Awaiting review"] : !it.answered ? ["skip", "Unanswered"] : it.correct ? ["ok", "Correct"] : (it.credit > 0 ? ["no", `Partly correct (${Math.round(it.credit * 100)}% credit)`] : ["no", "Incorrect"]);
  const graded = it.graded ? `<p class="small"><b>Reviewer score:</b> ${it.graded.points}/${it.graded.max}${it.graded.comment ? ` — ${esc(it.graded.comment)}` : ""}</p>` : "";
  const keyed = hasKey(q);
  return `<article class="rv"><div class="rv-head"><span class="rv-res ${res[0]}">${res[1]}</span><span>Question ${i + 1}</span><span>${esc(CAT[q.cat].short)}: ${esc(CAT[q.cat].subs[q.sub])}</span>${diffChip(q.diff)}<span class="chip">${esc(TYPE_LABEL[q.type])}</span>${it.probe ? '<span class="chip">Follow-up</span>' : ""}</div>
    <h4>${esc(q.text)}</h4>${q.ctx ? `<div class="ctx small">${esc(q.ctx)}</div>` : ""}${q.code ? `<pre class="code">${esc(q.code)}</pre>` : ""}${q.data ? dataTable(q.data) : ""}
    <p class="ans-line"><b>Your answer:</b> ${esc(respLabel(q, it.resp))}</p>${it.correct && !it.pending ? "" : keyed ? `<p class="ans-line"><b>Correct answer:</b> ${esc(correctLabel(q))}</p>` : ""}${graded}
    ${keyed ? `<details ${!it.correct && !it.pending ? "open" : ""}><summary>Explanation and resources</summary>${explainBlock(q, it.resp)}</details>` : ""}
    <div class="row" style="margin-top:8px"><button class="btn sm" data-act="practice" data-cat="${q.cat}" data-sub="${q.sub}">Practise similar questions</button><button class="linkbtn small" data-act="flagQ" data-qid="${q.id}">Report a problem</button></div></article>`;
}
ACT.reviewFilter = el => { S.filters.review = el.dataset.f; UI.refresh(); };

/* ---------- practice ---------- */
const Practice = {
  start({ cat, sub, qid }) {
    let qs;
    if (qid) qs = [S.bankById[qid]].filter(Boolean);
    else {
      qs = S.bank.filter(q => q.status === "active" && q.type !== "open" && q.cat === cat && (!sub || q.sub === sub));
      const rnd = {}; qs.forEach(q => rnd[q.id] = Math.random());
      qs.sort((a, b) => (seenInfo(a.id).c === 1) - (seenInfo(b.id).c === 1) || seenInfo(a.id).n - seenInfo(b.id).n || rnd[a.id] - rnd[b.id]);
      qs = qs.slice(0, 10);
    }
    if (!qs.length) { UI.toast("No practice questions are available here yet."); return; }
    const order = {}; qs.forEach(q => { const o = optionOrder(q); if (o) order[q.id] = o; });
    S.practice = { cat, sub, exercise: !!qid, qids: qs.map(q => q.id), order, idx: 0, resp: {}, checked: {}, correct: 0,
      title: qid ? "Practical exercise" : `Practice: ${sub ? CAT[cat].subs[sub] : CAT[cat].name}` };
    UI.go("practice");
  },
  async record(q, g) {
    const L = S.learning; L.practice = L.practice || { total: 0, correct: 0, bySub: {} }; L.practice.bySub = L.practice.bySub || {};
    const k = subKey(q.cat, q.sub), b = L.practice.bySub[k] || { n: 0, c: 0 };
    L.practice.total++; if (g.correct) L.practice.correct++; b.n++; if (g.correct) b.c++; L.practice.bySub[k] = b;
    if (S.practice.exercise) { L.exercises = L.exercises || {}; L.exercises[q.id] = nowTs(); }
    L.log = (L.log || []).concat([{ qid: q.id, c: g.correct ? 1 : 0, t: nowTs() }]).slice(-300);
    const s = S.seen[q.id] || [0, 0, null]; S.seen[q.id] = [s[0] + 1, nowTs(), s[2]];
    if (q.concept) S.conceptMap[q.id] = q.concept;
    Store.set(P.learning(S.uid), L).catch(() => {});
  }
};
ACT.practice = el => Practice.start({ cat: el.dataset.cat, sub: el.dataset.sub, qid: el.dataset.qid });
VIEWS.practice = () => {
  const p = S.practice; if (!p) { setTimeout(() => UI.go("assess"), 0); return ""; }
  const qid = p.qids[p.idx], chk = p.checked[qid], q = chk ? full(qid) : S.bankById[qid];
  let h = `<div class="runner"><div class="run-head"><div><b>${esc(p.title)}</b><div class="small muted">Question ${p.idx + 1} of ${p.qids.length}. Practice doesn't change your competency score.</div></div><span class="spacer"></span><button class="btn sm" data-act="endPractice">End practice</button></div>
    <div class="qcard">${qBody(q, { ctx: "practice", resp: p.resp[q.id], order: p.order[q.id], reveal: !!chk })}`;
  if (chk) h += `<div class="feedback ${chk.correct ? "ok" : "no"}"><b>${chk.correct ? "Correct." : chk.credit > 0 ? `Partly correct (${Math.round(chk.credit * 100)}% credit).` : "Not quite."}</b> ${explainBlock(q, p.resp[q.id])}</div>`;
  h += `<div class="run-foot">${chk ? (p.idx < p.qids.length - 1 ? `<button class="btn primary" data-act="practiceNext">Next question</button>` : `<button class="btn primary" data-act="endPractice">Finish practice</button>`) : `<button class="btn primary" data-act="practiceCheck">Check answer</button>`}<span class="spacer"></span><button class="linkbtn small" data-act="flagQ" data-qid="${q.id}">Report a problem</button></div></div>`;
  return h + `<p class="small muted" style="margin-top:12px">${p.correct} correct so far.</p></div>`;
};
ACT.practiceCheck = async el => {
  const p = S.practice, qid = p.qids[p.idx], pub = S.bankById[qid];
  if (!isAnswered(pub, p.resp[qid])) { UI.toast("Choose an answer first."); return; }
  el.disabled = true;
  try { await Keys.ensure([qid]); } catch (e) { el.disabled = false; UI.toast("Couldn't load the answer. Check your connection."); return; }
  const q = full(qid), g = grade(q, p.resp[qid]);
  p.checked[qid] = g; if (g.correct) p.correct++; await Practice.record(q, g); UI.refresh();
};
ACT.practiceNext = () => { S.practice.idx++; UI.refresh(); };
ACT.endPractice = () => { const p = S.practice; const n = Object.keys(p.checked).length; S.practice = null; if (n) UI.toast(`Practice saved: ${p.correct} of ${n} correct.`); Store.set(P.seen(S.uid), { m: S.seen }).catch(() => {}); UI.go("roadmap"); };

/* ---------- categories ---------- */
VIEWS.categories = () => {
  const m = myModel();
  return `<div class="page-head"><div><div class="eyebrow">Learn</div><h1>SEO categories</h1><p>All 16 disciplines in the test series, with your score for each subcategory. Open a category to see its subcategories and learning resources.</p></div></div>
  ${CATS.map(c => { const x = m.cats[c.id], qn = S.bank.filter(q => q.cat === c.id && q.status === "active").length;
    return `<details class="panel" style="margin-bottom:10px" ${S.params.cat === c.id ? "open" : ""}><summary style="cursor:pointer;list-style:none"><div class="catrow" style="border:0;padding:0"><div class="name">${esc(c.name)} <span class="muted small">${qn} questions in bank</span></div><div class="score num">${fmtScore(x.score)}</div>${bar(x.score)}<div class="meta"><span>${esc(c.desc)}</span>${x.n ? levelChip(x.score) : ""}</div></div></summary>
    <div class="tw" style="margin-top:14px"><table><thead><tr><th>Subcategory</th><th class="r">Recent answers</th><th class="r">Score</th><th>Status</th><th></th></tr></thead><tbody>${Object.entries(c.subs).map(([sid, sn]) => { const s = m.subs[subKey(c.id, sid)]; return `<tr><td>${esc(sn)}</td><td class="r num">${s.n}</td><td class="r num">${fmtScore(s.score)}</td><td>${statusChip(s.status)}</td><td class="r"><button class="btn sm" data-act="practice" data-cat="${c.id}" data-sub="${sid}">Practise</button></td></tr>`; }).join("")}</tbody></table></div>
    <p class="small" style="margin-top:12px"><b>Key resources:</b> ${c.res.map(resLink).join("; ")}</p>
    <div class="row"><button class="btn primary sm" data-act="start" data-mode="category" data-cat="${c.id}">Take ${esc(c.short)} assessment</button><button class="btn sm" data-act="start" data-mode="quick" data-cat="${c.id}">Quick quiz</button><button class="btn sm" data-act="practice" data-cat="${c.id}">Practise this category</button></div></details>`; }).join("")}`;
};

/* ---------- performance ---------- */
const ATT_TYPES = ["mock", "complete", "category", "adaptive", "quick", "daily", "trends", "template"];
function perfFilters(key, withType = true) {
  const f = S.filters[key] || (S.filters[key] = { from: "", to: "", cat: "", type: "" });
  return `<div class="filters"><label class="f">From<input type="date" value="${f.from}" data-change="setFilter" data-key="${key}" data-field="from"></label><label class="f">To<input type="date" value="${f.to}" data-change="setFilter" data-key="${key}" data-field="to"></label>
    <label class="f">Category<select data-change="setFilter" data-key="${key}" data-field="cat">${catOptions(f.cat, "All categories")}</select></label>
    ${withType ? `<label class="f">Test type<select data-change="setFilter" data-key="${key}" data-field="type"><option value="">All types</option>${ATT_TYPES.map(t => `<option value="${t}" ${f.type === t ? "selected" : ""}>${MODE_LABEL[t]}</option>`).join("")}</select></label>` : ""}
    <button class="btn sm ghost" data-act="clearFilter" data-key="${key}">Clear filters</button></div>`;
}
ACT.setFilter = el => { S.filters[el.dataset.key][el.dataset.field] = el.value; UI.refresh(); };
ACT.clearFilter = el => { S.filters[el.dataset.key] = { from: "", to: "", cat: "", type: "" }; UI.refresh(); };
function attemptFilter(f) {
  const from = f.from ? new Date(f.from + "T00:00:00").getTime() : 0, to = f.to ? new Date(f.to + "T23:59:59").getTime() : Infinity;
  return a => a.completedAt >= from && a.completedAt <= to && (!f.type || a.mode === f.type);
}
function lineOpts(yMax = 100) { return { responsive: true, interaction: { mode: "index", intersect: false }, scales: { y: { min: 0, max: yMax, ticks: { stepSize: 20 } } }, plugins: { legend: { position: "bottom" } } }; }
VIEWS.performance = () => {
  const f = S.filters.perf || (S.filters.perf = { from: "", to: "", cat: "", type: "" }), match = attemptFilter(f);
  const att = completed().filter(match), items = itemsFrom(att, S.answers), m = buildModel(items);
  const tl = myTimeline().filter(p => match({ completedAt: p.t, mode: p.mode }));
  let h = `<div class="page-head"><div><div class="eyebrow">Progress</div><h1>My performance</h1><p>Charts update after every completed test. Filters apply to every chart on this page.</p></div></div>${perfFilters("perf")}`;
  if (!att.length) return h + empty("No tests in this range", "Change the filters or complete a test.", `<button class="btn primary" data-act="go" data-to="assess">Take an assessment</button>`);
  const labels = tlLabels(tl);
  h += `<section class="section panel"><h2>Overall SEO progress</h2><p class="small muted">Competency score after each test, with that test's own score for comparison.</p><div class="chart-box">${chart("c1", { type: "line", data: { labels, datasets: [
    { label: "Competency score", data: tl.map(p => p.overall), borderColor: cssVar("--c1"), backgroundColor: cssVar("--c1"), tension: .25, spanGaps: true },
    { label: "Test score", data: tl.map(p => p.score), borderColor: cssVar("--c2"), backgroundColor: cssVar("--c2"), borderDash: [4, 4], showLine: false, pointRadius: 4 }] }, options: lineOpts() })}</div></section>`;
  const prevPt = tl.length >= 2 ? tl[tl.length - 2] : null;
  h += `<div class="grid g2 section"><section class="panel"><h2>Category competency</h2><p class="small muted">Strengths reach the edge; weaknesses sit near the centre.</p><div class="chart-box tall">${chart("c2", () => ({ type: "radar", data: { labels: CATS.map(c => c.short), datasets: [
      { label: "Now", data: CATS.map(c => m.cats[c.id].score), borderColor: cssVar("--c2"), backgroundColor: cssVar("--c2") + "40", pointRadius: 3, spanGaps: true }]
      .concat(prevPt ? [{ label: "Previous test", data: CATS.map(c => prevPt.cats[c.id] == null ? null : prevPt.cats[c.id]), borderColor: cssVar("--c1"), backgroundColor: "transparent", borderDash: [4, 4], pointRadius: 2, spanGaps: true }] : []) },
      options: { scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, backdropColor: "transparent" }, pointLabels: { font: { size: 11 } } } }, plugins: { legend: { position: "bottom" } } } }))}</div></section>
    <section class="panel"><h2>Difficulty-wise accuracy</h2><p class="small muted">Share of questions answered fully correctly.</p><div class="chart-box tall">${chart("c3", () => ({ type: "bar", data: { labels: DIFFS.map(d => DIFF_LABEL[d]), datasets: [{ label: "Accuracy %", data: DIFFS.map(d => m.diff[d].acc), backgroundColor: [cssVar("--lv3"), cssVar("--lv1"), cssVar("--lv0")], borderRadius: 6 }] }, options: { scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } }))}</div></section></div>`;
  const focus = f.cat ? [f.cat] : CATS.map(c => c.id).filter(id => tl.some(p => p.cats[id] != null)).sort((a, b) => tl.filter(p => p.cats[b] != null).length - tl.filter(p => p.cats[a] != null).length).slice(0, 6);
  h += `<section class="section panel"><h2>Skill improvement by category</h2><p class="small muted">${f.cat ? esc(CAT[f.cat].name) : "The six categories with the most test data"}. Pick a category above to focus on one.</p><div class="chart-box">${chart("c4", () => ({ type: "line", data: { labels, datasets: focus.map((id, i) => ({ label: CAT[id].short, data: tl.map(p => p.cats[id] == null ? null : p.cats[id]), borderColor: cssVar(SERIES[i % SERIES.length]), backgroundColor: cssVar(SERIES[i % SERIES.length]), tension: .25, spanGaps: true })) }, options: lineOpts() }))}</div></section>`;
  const subs = Object.entries(m.subs).filter(([k, s]) => s.n && (!f.cat || k.startsWith(f.cat + ":"))).sort((a, b) => a[1].score - b[1].score).slice(0, 14);
  h += `<section class="section panel"><h2>Knowledge gap analysis</h2><p class="small muted">Weakest subcategories first.</p>${subs.length ? `<div class="chart-box" style="height:${Math.max(220, subs.length * 30 + 60)}px">${chart("c5", () => ({ type: "bar", data: { labels: subs.map(([k]) => subName(k)), datasets: [{ label: "Score", data: subs.map(([, s]) => s.score), backgroundColor: subs.map(([, s]) => cssVar("--lv" + Math.max(0, levelIdx(s.score)))), borderRadius: 4 }] }, options: { indexAxis: "y", scales: { x: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } }))}</div>` : '<p class="muted">No subcategory data in this range.</p>'}</section>`;
  return h;
};

/* ---------- knowledge gaps ---------- */
VIEWS.gaps = () => {
  const m = myModel(), f = S.filters.gaps || (S.filters.gaps = { cat: "", st: "" });
  const rows = Object.entries(m.subs).filter(([k, s]) => (!f.cat || k.startsWith(f.cat + ":")) && (!f.st || s.status === f.st)).sort((a, b) => (a[1].score == null) - (b[1].score == null) || (a[1].score || 0) - (b[1].score || 0));
  const counts = {}; Object.values(m.subs).forEach(s => counts[s.status] = (counts[s.status] || 0) + 1);
  const weakest = Object.entries(m.subs).filter(([, s]) => s.n).sort((a, b) => a[1].score - b[1].score).slice(0, 12);
  let h = `<div class="page-head"><div><div class="eyebrow">Progress</div><h1>Knowledge gaps</h1><p>Every subcategory, ranked from weakest. A single wrong answer isn't treated as a gap: the platform needs at least two misses with a score under 60 to confirm one.</p></div></div>
    <div class="statline" style="margin-top:0">${["gap", "unconfirmed", "isolated", "developing", "proficient", "mastered", "untested"].map(s => `<div><b class="num">${counts[s] || 0}</b><span>${STATUS_LABEL[s]}</span></div>`).join("")}</div>`;
  if (weakest.length) h += `<section class="section panel"><h2>Weakest subcategories</h2><div class="chart-box" style="height:${weakest.length * 30 + 60}px">${chart("g5", () => ({ type: "bar", data: { labels: weakest.map(([k]) => `${subName(k)} (${CAT[k.split(":")[0]].short})`), datasets: [{ label: "Score", data: weakest.map(([, s]) => s.score), backgroundColor: weakest.map(([, s]) => cssVar("--lv" + Math.max(0, levelIdx(s.score)))), borderRadius: 4 }] }, options: { indexAxis: "y", scales: { x: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } }))}</div></section>`;
  h += `<section class="section"><div class="filters"><label class="f">Category<select data-change="setGapF" data-field="cat">${catOptions(f.cat, "All categories")}</select></label><label class="f">Status<select data-change="setGapF" data-field="st"><option value="">All statuses</option>${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${f.st === k ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
    <div class="tw"><table><thead><tr><th>Subcategory</th><th>Category</th><th class="r">Recent answers</th><th class="r">Missed</th><th class="r">Score</th><th>Status</th><th>Missed concepts</th><th></th></tr></thead><tbody>${rows.map(([k, s]) => `<tr><td>${esc(subName(k))}</td><td>${esc(CAT[k.split(":")[0]].short)}</td><td class="r num">${s.n}</td><td class="r num">${s.misses}</td><td class="r num">${fmtScore(s.score)}</td><td>${statusChip(s.status)}</td><td class="small">${conceptsOf(s.missedQ, 2).map(esc).join("; ")}</td><td class="r"><button class="btn sm" data-act="practice" data-cat="${k.split(":")[0]}" data-sub="${k.split(":")[1]}">Practise</button></td></tr>`).join("")}</tbody></table></div>
    <details class="panel" style="margin-top:14px"><summary style="cursor:pointer"><b>How statuses are decided</b></summary><ul class="small"><li><b>Knowledge gap:</b> two or more misses in your last ${S.settings.window.sub} answers in this area, with a score under 60.</li><li><b>Needs evidence:</b> one miss, not yet confirmed. Answer more questions here to find out.</li><li><b>Isolated error:</b> one miss, but you otherwise answer this area well.</li><li><b>Developing:</b> score under 60 without a confirmed pattern of misses.</li><li><b>Proficient:</b> score 60 or more.</li><li><b>Mastered:</b> score 85 or more across at least two answers, including a medium or hard question.</li></ul></details></section>`;
  return h;
};
ACT.setGapF = el => { S.filters.gaps[el.dataset.field] = el.value; UI.refresh(); };

/* ---------- roadmap ---------- */
function learningProgress() {
  const done = completed(), cum = [], everWeak = {};
  for (const a of done) {
    for (const it of (S.answers[a.id] || [])) cum.push(Object.assign({}, it, { ts: it.ts || a.completedAt }));
    cum.sort((x, y) => x.ts - y.ts);
    const m = buildModel(cum);
    for (const [k, s] of Object.entries(m.subs)) if (s.n && s.score < 60 && !everWeak[k]) everWeak[k] = { then: s.score, at: a.completedAt };
  }
  const now = myModel();
  const prev = Object.entries(everWeak).map(([k, v]) => ({ key: k, then: v.then, now: now.subs[k].score, at: v.at })).filter(x => x.at < (done.length ? done[done.length - 1].completedAt : 0) || x.now !== x.then);
  const retests = []; const byCat = groupBy(done.filter(a => a.mode === "category"), a => a.cat);
  for (const [c, arr] of Object.entries(byCat)) for (let i = 1; i < arr.length; i++) retests.push({ cat: c, before: arr[i - 1].summary.score, after: arr[i].summary.score, at: arr[i].completedAt });
  const L = S.learning || {};
  return { prev, retests, modules: Object.keys(L.modules || {}).length, practice: L.practice || { total: 0, correct: 0 }, remaining: Object.values(now.subs).filter(s => s.status === "gap" || s.status === "unconfirmed").length };
}
VIEWS.roadmap = () => {
  const m = myModel(), weak = weakAreas(m, 5), assigned = S.assignments;
  let h = `<div class="page-head"><div><div class="eyebrow">Progress</div><h1>Learning roadmap</h1><p>Generated from your test results and ordered by how severe each gap is, how important the skill is, whether you missed fundamentals, and whether the area is declining.</p></div></div>`;
  if (assigned.length) h += `<section class="section" style="margin-top:0"><h2>Assigned by your administrator</h2>${assigned.map(a => `<div class="panel" style="margin-bottom:10px"><div class="row"><h3 style="flex:1">${esc(a.title)}</h3>${a.status === "done" ? '<span class="st st-mastered">Done</span>' : (a.due ? `<span class="chip">Due ${fmtDate(a.due)}</span>` : "")}</div>${a.note ? `<p class="small">${esc(a.note)}</p>` : ""}${(a.resources || []).length ? `<ul class="small">${a.resources.map(r => `<li>${resLink(r)}</li>`).join("")}</ul>` : ""}
    <div class="row">${a.cat ? `<button class="btn sm" data-act="practice" data-cat="${a.cat}" ${a.sub ? `data-sub="${a.sub}"` : ""}>Practise</button><button class="btn sm" data-act="start" data-mode="category" data-cat="${a.cat}">Take ${esc(CAT[a.cat] ? CAT[a.cat].short : "")} assessment</button>` : ""}${a.status !== "done" ? `<button class="btn sm primary" data-act="assignmentDone" data-id="${a._id || a.id}">Mark as done</button>` : ""}</div></div>`).join("")}</section>`;
  h += `<section class="section"><h2>Your priorities</h2>${weak.length ? weak.map((w, i) => { const steps = roadmapSteps(w); const doneN = steps.filter(s => s.done).length;
    return `<article class="gap ${lvClass(w.score)}"><div class="gap-head"><h3>${i + 1}. ${esc(w.name)} <span class="muted small">in ${esc(w.catName)}</span></h3>${statusChip(w.status)}<span class="small muted">${doneN}/4 steps</span></div>
    <ol class="steps">${steps.map(s => `<li class="${s.done ? "done" : ""}"><div class="t">${esc(s.label)}${s.progress ? ` <span class="muted small">(${esc(s.progress)})</span>` : ""}
      ${s.kind === "study" ? `<div style="margin-top:6px">${w.resources.map(r => `<label class="check small"><input type="checkbox" data-change="toggleModule" data-res="${esc(r)}" ${S.learning.modules && S.learning.modules[r] ? "checked" : ""}> <span>${resLink(r)}</span></label>`).join("")}</div>` : ""}</div>
      <div>${s.kind === "practice" ? `<button class="btn sm" data-act="practice" data-cat="${w.cat}" data-sub="${w.sub}">Practise</button>` : s.kind === "exercise" && s.qid ? `<button class="btn sm" data-act="practice" data-qid="${s.qid}" data-cat="${w.cat}">Start exercise</button>` : s.kind === "retest" ? `<button class="btn sm" data-act="start" data-mode="category" data-cat="${w.cat}">Retest</button>` : ""}</div></li>`).join("")}</ol></article>`; }).join("") : empty("No priorities right now", completed().length ? "You have no open gaps. Take another category or the adaptive assessment to keep your profile current." : "Complete a test and your personalised roadmap will be generated here.", `<button class="btn primary" data-act="go" data-to="assess">Take an assessment</button>`)}</section>`;
  const lp = learningProgress();
  h += `<section class="section"><h2>Learning progress</h2><div class="statline" style="margin-top:0"><div><b class="num">${lp.modules}</b><span>Learning resources completed</span></div><div><b class="num">${lp.practice.total || 0}</b><span>Practice questions (${lp.practice.total ? Math.round(lp.practice.correct / lp.practice.total * 100) : 0}% correct)</span></div><div><b class="num">${lp.retests.length}</b><span>Retests taken</span></div><div><b class="num">${lp.prev.filter(x => x.now != null && x.now >= 60).length} / ${lp.prev.length}</b><span>Former weak areas now 60+</span></div><div><b class="num">${lp.remaining}</b><span>Remaining gaps</span></div></div>
    ${lp.prev.length ? `<div class="panel" style="margin-top:14px"><h3>Improvement in previously weak areas</h3><div class="chart-box" style="height:${Math.min(14, lp.prev.length) * 34 + 70}px">${chart("c6", () => ({ type: "bar", data: { labels: lp.prev.slice(0, 14).map(x => subName(x.key)), datasets: [{ label: "When first weak", data: lp.prev.slice(0, 14).map(x => x.then), backgroundColor: cssVar("--line-strong"), borderRadius: 4 }, { label: "Now", data: lp.prev.slice(0, 14).map(x => x.now), backgroundColor: cssVar("--c2"), borderRadius: 4 }] }, options: { indexAxis: "y", scales: { x: { min: 0, max: 100 } }, plugins: { legend: { position: "bottom" } } } }))}</div></div>` : ""}
    ${lp.retests.length ? `<div class="tw" style="margin-top:14px"><table><thead><tr><th>Retest</th><th>Date</th><th class="r">Before</th><th class="r">After</th><th class="r">Change</th></tr></thead><tbody>${lp.retests.slice(-10).reverse().map(r => `<tr><td>${esc(CAT[r.cat].name)}</td><td>${fmtDate(r.at)}</td><td class="r num">${fmtScore(r.before)}</td><td class="r num">${fmtScore(r.after)}</td><td class="r num">${deltaHtml(r.after - r.before)}</td></tr>`).join("")}</tbody></table></div>` : ""}</section>`;
  return h;
};
ACT.toggleModule = el => { const L = S.learning; L.modules = L.modules || {}; if (el.checked) L.modules[el.dataset.res] = nowTs(); else delete L.modules[el.dataset.res]; Store.set(P.learning(S.uid), L).catch(() => {}); };
ACT.assignmentDone = async el => { const a = S.assignments.find(x => (x._id || x.id) === el.dataset.id); if (!a) return; a.status = "done"; a.doneAt = nowTs(); await Store.update(P.assignment(S.uid, el.dataset.id), { status: "done", doneAt: a.doneAt }).catch(() => {}); UI.refresh(); };

/* ---------- history ---------- */
VIEWS.history = () => {
  const f = S.filters.hist || (S.filters.hist = { type: "" });
  const all = S.attempts.slice().sort((a, b) => (b.completedAt || b.startedAt) - (a.completedAt || a.startedAt)).filter(a => !f.type || a.mode === f.type);
  const done = completed(), last = done[done.length - 1], prev = done[done.length - 2];
  let h = `<div class="page-head"><div><div class="eyebrow">Progress</div><h1>Assessment history</h1><p>Every test you've started, with scores and time taken.</p></div><div class="row"><button class="btn" data-act="exportMine">Export my results (CSV)</button></div></div>`;
  if (last && prev) {
    const tl = myTimeline(), pl = tl[tl.length - 1], pp = tl[tl.length - 2];
    const rows = CATS.filter(c => pl.cats[c.id] != null || pp.cats[c.id] != null);
    h += `<section class="section panel" style="margin-top:0"><h2>Latest compared with previous</h2><p class="small muted">${esc(last.title)} (${fmtDate(last.completedAt)}) compared with ${esc(prev.title)} (${fmtDate(prev.completedAt)}).</p>
      <div class="statline"><div><b class="num">${fmtScore(last.summary.score)}</b><span>Latest test score</span></div><div><b class="num">${deltaHtml(last.summary.score - prev.summary.score)}</b><span>Change in test score</span></div><div><b class="num">${fmtScore(pl.overall)}</b><span>Competency now</span></div><div><b class="num">${deltaHtml(pl.overall != null && pp.overall != null ? pl.overall - pp.overall : null)}</b><span>Change in competency</span></div></div>
      <div class="tw" style="margin-top:12px"><table><thead><tr><th>Category</th><th class="r">Before</th><th class="r">After</th><th class="r">Change</th></tr></thead><tbody>${rows.map(c => `<tr><td>${esc(c.name)}</td><td class="r num">${fmtScore(pp.cats[c.id])}</td><td class="r num">${fmtScore(pl.cats[c.id])}</td><td class="r num">${pl.cats[c.id] != null && pp.cats[c.id] != null ? deltaHtml(pl.cats[c.id] - pp.cats[c.id]) : "–"}</td></tr>`).join("")}</tbody></table></div></section>`;
  }
  h += `<section class="section"><div class="filters"><label class="f">Test type<select data-change="setHistF"><option value="">All types</option>${ATT_TYPES.map(t => `<option value="${t}" ${f.type === t ? "selected" : ""}>${MODE_LABEL[t]}</option>`).join("")}</select></label></div>
    ${all.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Test</th><th>Type</th><th class="r">Score</th><th>Level</th><th class="r">Correct</th><th>Duration</th><th>Status</th><th></th></tr></thead><tbody>${all.map(a => { const s = a.summary;
      return `<tr><td>${fmtDateTime(a.completedAt || a.startedAt)}</td><td>${esc(a.title)}</td><td>${esc(MODE_LABEL[a.mode] || a.mode)}</td><td class="r num">${s ? fmtScore(s.score) : "–"}</td><td>${s ? levelChip(s.score) : ""}</td><td class="r num">${s ? `${s.correct}/${s.n}` : `${Object.keys(a.resp || {}).length} answered`}</td><td>${fmtDur(a.durationMs)}</td><td>${a.status === "completed" ? (s && s.pending ? "Awaiting review" : "Completed") : "In progress"}</td>
      <td class="r">${a.status === "completed" ? `<button class="btn sm" data-act="go" data-to="review" data-aid="${a.id}">Review</button>` : `<button class="btn sm primary" data-act="resume" data-aid="${a.id}">Resume</button>`}</td></tr>`; }).join("")}</tbody></table></div>` : empty("No tests yet", "Your attempts will be listed here.", `<button class="btn primary" data-act="go" data-to="assess">Take an assessment</button>`)}</section>`;
  return h;
};
ACT.setHistF = el => { S.filters.hist.type = el.value; UI.refresh(); };
ACT.exportMine = () => {
  const rows = [["date", "test", "type", "score", "level", "correct", "questions", "accuracy", "unanswered", "pending", "duration_min", ...CATS.map(c => "cat_" + c.id)]];
  for (const a of completed()) { const s = a.summary; rows.push([isoDay(a.completedAt), a.title, a.mode, s.score, s.level, s.correct, s.n, s.accuracy, s.unanswered, s.pending, Math.round((a.durationMs || 0) / 60000), ...CATS.map(c => s.byCat[c.id] ? s.byCat[c.id].score : "")]); }
  saveFile("my-seo-test-results.csv", toCSV(rows));
};

/* ---------- trends ---------- */
VIEWS.trends = () => {
  const f = S.filters.trends || (S.filters.trends = { mat: "" });
  const items = S.trends.slice().sort((a, b) => MATURITY.indexOf(a.maturity) - MATURITY.indexOf(b.maturity) || String(a.title).localeCompare(b.title)).filter(t => !f.mat || t.maturity === f.mat);
  const tq = S.bank.filter(q => q.trend && q.status === "active"), byMat = groupBy(tq, q => q.maturity || "established");
  let h = `<div class="page-head"><div><div class="eyebrow">Learn</div><h1>SEO trends and industry updates</h1><p>Developments in AI search, GEO and AEO, and search result changes. Every item is labelled by how well-supported it is, so speculation isn't mistaken for a confirmed ranking factor.</p></div><button class="btn primary" data-act="start" data-mode="trends">Take the trends assessment</button></div>
    <div class="legend" style="margin-bottom:14px">${MATURITY.map(mm => `<span>${matChip(mm)} ${esc({ established: "Documented by the platform or widely confirmed", emerging: "New and changing; confirm before relying on it", experimental: "Being tried; no reliable evidence of effect", speculative: "Unsupported claims or risky tactics" }[mm])}</span>`).join("")}</div>
    <div class="filters"><label class="f">Maturity<select data-change="setTrendF"><option value="">All</option>${MATURITY.map(mm => `<option value="${mm}" ${f.mat === mm ? "selected" : ""}>${mm[0].toUpperCase() + mm.slice(1)}</option>`).join("")}</select></label><span class="small muted">${tq.length} trend questions in the bank: ${MATURITY.map(mm => `${(byMat[mm] || []).length} ${mm}`).join(", ")}.</span></div>`;
  h += items.length ? `<div class="grid g2">${items.map(t => { const due = t.verified && (nowTs() - new Date(t.verified).getTime()) > 90 * DAY; return `<article class="panel"><div class="row">${matChip(t.maturity)}<span class="small muted">${esc(t.area || "")}</span><span class="spacer"></span><span class="small ${due ? "delta-down" : "muted"}">Verified ${esc(t.verified || "–")}${due ? " (review due)" : ""}</span></div><h3 style="margin:8px 0 6px">${esc(t.title)}</h3><p class="small">${esc(t.summary)}</p><p class="small">Source: ${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.sourceTitle || t.url)}</a>` : resLink(t.res)}</p></article>`; }).join("")}</div>` : empty("No trend items", S.isAdmin ? "Import private-question-bank/trends.json from the Trend Library in the admin console." : "The administrator hasn't published trend items yet.");
  return h;
};
ACT.setTrendF = el => { S.filters.trends.mat = el.value; UI.refresh(); };

/* ---------- profile ---------- */
VIEWS.profile = () => {
  const p = S.profile, w = S.settings.weights;
  return `<div class="page-head"><div><div class="eyebrow">Account</div><h1>Profile</h1><p>Your name appears on the leaderboard and on certificates.</p></div></div>
  <div class="grid g2"><section class="panel"><div class="row">${avatar(p.name, "lg")}<div><h2>${esc(p.name || "You")}</h2><span class="small muted">${S.isAdmin ? "Administrator" : "Participant"} since ${fmtDate(p.joinedAt)} · ${esc(p.email || (S.me && S.me.email) || "")}</span></div></div>
    <div class="grid g2" style="margin-top:16px"><label class="f">Full name<input type="text" id="pf-name" value="${esc(p.name || "")}" maxlength="80"></label><label class="f">Team or company<input type="text" id="pf-team" value="${esc(p.team || "")}"></label><label class="f">Job title<input type="text" id="pf-title" value="${esc(p.title || "")}"></label></div>
    <label class="check small" style="margin-top:12px"><input type="checkbox" id="pf-board" ${p.showOnBoard !== false ? "checked" : ""}> Show my name and scores on the leaderboard</label>
    <div class="row" style="margin-top:14px"><button class="btn primary" data-act="saveProfile">Save profile</button><button class="btn" data-act="exportMine">Export my results</button><button class="btn" data-act="myReport">Download my report</button></div>
    <hr><div class="row"><button class="btn sm" data-act="changePassword">Email me a password reset link</button><span class="tiny muted">User ID: <span class="mono">${esc(S.uid)}</span></span></div></section>
  <section class="panel"><h2>How scoring works</h2><ul class="small"><li>Each question is worth ${w.easy} point (easy), ${w.medium} points (medium) or ${w.hard} points (hard). Scores are weighted points earned out of 100.</li><li>Multiple-answer questions give partial credit: correct picks minus wrong picks, divided by the number of correct options. Match questions give credit per correct pair. Only fully correct answers count toward accuracy.</li><li>Open-response answers are scored by a reviewer against the rubric shown with the question, and stay provisional until graded.</li><li>Category scores use your most recent ${S.settings.window.cat} answers in each category, so they reflect what you know now.</li><li>Your overall score averages assessed categories, weighting core skills (technical, JavaScript, analytics, auditing, algorithms and strategy) more heavily.</li><li>Levels: Beginner 0–39, Developing 40–59, Intermediate 60–74, Advanced 75–89, Expert 90–100.</li><li>Mock tests and the complete assessment earn a certificate at ${passMark()}% or more.</li></ul></section></div>`;
};
ACT.saveProfile = async () => {
  const name = $("#pf-name").value.trim(), team = $("#pf-team").value.trim(), title = $("#pf-title").value.trim(), showOnBoard = $("#pf-board").checked;
  if (!name) { UI.toast("Your name can't be empty."); return; }
  try {
    await Store.update(P.me(), { name, team, title, showOnBoard }); Object.assign(S.profile, { name, team, title, showOnBoard });
    if (FB.auth.currentUser && FB.auth.currentUser.displayName !== name) FB.a.updateProfile(FB.auth.currentUser, { displayName: name }).catch(() => {});
    await updateLeaderboard(); UI.renderShell(); UI.route(); UI.toast("Profile saved");
  } catch (e) { UI.toast("Couldn't save your profile."); }
};
ACT.changePassword = async () => { try { await FB.a.sendPasswordResetEmail(FB.auth, S.profile.email || FB.auth.currentUser.email, { url: siteUrl() }); UI.toast("Check your inbox for a password reset link."); } catch (e) { UI.toast(authErr(e)); } };
ACT.myReport = () => saveFile("my-seo-competency-report.html", personReportHtml({ id: S.uid, team: S.profile.team, title: S.profile.title, summary: S.profile.summary, timeline: S.profile.timeline }, S.profile.name || "Me", S.attempts, S.answers));

/* ---------- printable reports ---------- */
const REPORT_CSS = `body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0B1F3A;max-width:960px;margin:32px auto;padding:0 20px;line-height:1.5}h1{margin-bottom:4px}h2{margin-top:32px;border-bottom:2px solid #FF9933;padding-bottom:6px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #E6DFD1}th{background:#F6F3EC}.muted{color:#5A6478}.big{font-size:44px;font-weight:700}.c0{background:#C0392B;color:#fff}.c1{background:#C76E00;color:#fff}.c2{background:#12806A;color:#fff}.c3{background:#1F4F8C;color:#fff}.cn{background:#F2EDE2;color:#5A6478}td.cell{text-align:center;font-weight:600;font-size:12px}`;
function personReportHtml(p, name, attempts, answers) {
  const items = itemsFrom(attempts || [], answers || {}), m = buildModel(items), tl = computeTimeline(attempts || [], answers || {}), fq = fiveQuestions(m, tl);
  const done = (attempts || []).filter(a => a.status === "completed");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SEO competency report: ${esc(name)}</title><style>${REPORT_CSS}</style></head><body>
<h1>SEO competency report: ${esc(name)}</h1><p class="muted">${esc([p.title, p.team].filter(Boolean).join(", "))}. ${esc(S.config.siteName)}. Generated ${fmtDate(nowTs())}.</p>
<p><span class="big">${fmtScore(m.overall)}</span> / 100, ${esc(m.level)}. ${m.coverage} of 16 categories assessed, ${m.answered} answers, ${m.accuracy == null ? "–" : m.accuracy + "%"} accuracy. Difficulty accuracy: easy ${m.diff.easy.acc ?? "–"}%, medium ${m.diff.medium.acc ?? "–"}%, hard ${m.diff.hard.acc ?? "–"}%.</p>
<h2>1. What they know well</h2><p>${fq.strong.cats.map(c => `${esc(c.name)} (${fmtScore(m.cats[c.id].score)})`).join(", ") || "No category above 75 yet."}</p><p>${fq.strong.mastered.map(subName).map(esc).join(", ")}</p>
<h2>2. Concepts they don't understand</h2><ul>${fq.gaps.map(g => `<li><b>${esc(subName(g.key))}</b> (${fmtScore(g.s.score)}): ${g.concepts.map(esc).join("; ")}</li>`).join("") || "<li>No confirmed gaps.</li>"}</ul>
<h2>3. Important skills missing</h2><ul>${fq.coreMissing.map(x => `<li>${esc(x.cat.name)}: ${x.score == null ? "not assessed" : fmtScore(x.score)}</li>`).join("") || "<li>All core skills are at 60 or above.</li>"}</ul>
<h2>4. What to learn next</h2><ol>${fq.next.map(w => `<li><b>${esc(w.name)}</b> (${esc(w.catName)}, ${fmtScore(w.score)}): ${w.struggling.concat(w.toLearn).slice(0, 3).map(esc).join("; ")}. Resources: ${w.resources.map(r => { const x = resource(r); return x ? `<a href="${esc(x.url)}">${esc(x.title)}</a>` : ""; }).join(", ")}</li>`).join("") || "<li>No priorities.</li>"}</ol>
<h2>5. Are they improving?</h2><p><b>${esc(fq.trend.verdict)}.</b> ${fq.trend.delta == null ? esc(fq.trend.detail) : `From ${fmtScore(fq.trend.first.overall)} to ${fmtScore(fq.trend.last.overall)} (${fq.trend.delta > 0 ? "+" : ""}${fq.trend.delta} points).`}</p>
<h2>Category scores</h2><table><tr><th>Category</th><th>Score</th><th>Level</th><th>Recent answers</th></tr>${CATS.map(c => `<tr><td>${esc(c.name)}</td><td>${fmtScore(m.cats[c.id].score)}</td><td>${m.cats[c.id].n ? esc(levelName(m.cats[c.id].score)) : "Not assessed"}</td><td>${m.cats[c.id].n}</td></tr>`).join("")}</table>
<h2>Test history</h2><table><tr><th>Date</th><th>Test</th><th>Score</th><th>Correct</th></tr>${done.map(a => `<tr><td>${fmtDate(a.completedAt)}</td><td>${esc(a.title)}</td><td>${fmtScore(a.summary.score)}</td><td>${a.summary.correct}/${a.summary.n}</td></tr>`).join("")}</table></body></html>`;
}
