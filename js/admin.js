"use strict";
/* =========================================================================
   Admin console. Loaded only after the signed-in user is confirmed as an
   administrator (a document exists at admins/{uid}). Firestore security
   rules enforce the same check on the server, so this file grants nothing
   by itself: a participant who downloads it still can't read or change
   anyone else's data.
   ========================================================================= */
window.ADMIN_LOADED = true;

/* ---------- admin data ---------- */
const Admin = {
  async load() {
    const [people, inboxes, invites] = await Promise.all([Store.list("users"), Store.list("inbox"), Store.list("invites"), Keys.loadAll()]);
    S.admin.people = people.filter(p => p._id).map(p => Object.assign({ id: p._id }, p));
    S.admin.byId = Object.fromEntries(S.admin.people.map(p => [p.id, p]));
    S.admin.inboxes = inboxes;
    S.admin.invites = invites.map(i => Object.assign({ email: i._id }, i));
    this.counts(); S.admin.loaded = true;
  },
  counts() {
    let f = 0, r = 0;
    for (const ib of S.admin.inboxes) { f += Object.values(ib.flags || {}).filter(x => x.status === "open").length; r += Object.values(ib.reviews || {}).filter(x => x.status === "pending").length; }
    S.admin.openFlags = f; S.admin.pendingReviews = r;
  },
  async person(pid, force) {
    const c = S.admin.cache[pid];
    if (c && !force) return c;
    const [attempts, answers, assignments, learning] = await Promise.all([Store.list(P.attempts(pid)), Store.list(P.answers(pid)), Store.list(P.assignments(pid)), Store.get(P.learning(pid))]);
    const data = { attempts: attempts.map(a => Object.assign({ id: a._id }, a)).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0)), answers: Object.fromEntries(answers.map(a => [a._id, a.items || []])), assignments, learning: learning || {} };
    data.items = itemsFrom(data.attempts, data.answers); data.model = buildModel(data.items); data.timeline = computeTimeline(data.attempts, data.answers);
    S.admin.cache[pid] = data; return data;
  }
};
function pname(id) { const p = S.admin.byId && S.admin.byId[id]; return (p && p.name) || (id === S.uid && S.profile && S.profile.name) || "Unnamed participant"; }
function needAdmin() {
  if (S.admin.loaded) return null;
  if (!S.admin.loading) { S.admin.loading = true; Admin.load().then(() => { S.admin.loading = false; S.admin.err = null; UI.renderShell(); UI.route(); }).catch(e => { console.error(e); S.admin.loading = false; S.admin.err = e; UI.route(); }); }
  if (S.admin.err) { const m = S.admin.err.message || S.admin.err.code || ""; S.admin.err = null; return `<div class="banner err">Admin data couldn't be loaded${m ? ": " + esc(m) : ""}. Make sure firebase/firestore.rules is published and your account has a document in the admins collection.</div>`; }
  return `<div class="loading"><div><div class="spin"></div>Loading admin data…</div></div>`;
}
function teamFilter() { return S.filters.team || (S.filters.team = { team: "", from: "", to: "", cat: "", q: "" }); }
function teams() { return Array.from(new Set(S.admin.people.map(p => (p.team || "").trim()).filter(Boolean))).sort(); }
function personAt(p, f) {
  f = f || teamFilter();
  const from = f.from ? new Date(f.from + "T00:00:00").getTime() : 0, to = f.to ? new Date(f.to + "T23:59:59").getTime() : Infinity;
  const tl = (p.timeline || []).filter(t => t.t >= from && t.t <= to && t.overall != null);
  if (!f.from && !f.to) { const s = p.summary || {}; const cats = {}; Object.entries(s.cats || {}).forEach(([k, v]) => cats[k] = v.s); return { overall: s.overall, cats, first: tl[0], last: tl[tl.length - 1], n: (p.timeline || []).length, tl }; }
  const last = tl[tl.length - 1];
  return { overall: last ? last.overall : null, cats: last ? last.cats : {}, first: tl[0], last, n: tl.length, tl };
}
function filteredPeople() {
  const f = teamFilter(), q = f.q.toLowerCase();
  return S.admin.people.filter(p => p.joinedAt && (!f.team || (p.team || "") === f.team) && (!q || pname(p.id).toLowerCase().includes(q) || (p.team || "").toLowerCase().includes(q) || (p.title || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q)));
}
function teamFilterBar(opts = {}) {
  const f = teamFilter();
  return `<div class="filters"><label class="f">Team<select data-change="setTeamF" data-field="team"><option value="">All teams</option>${teams().map(t => `<option ${f.team === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
    ${opts.search !== false ? `<label class="f">Participant<input type="search" value="${esc(f.q)}" placeholder="Name, email, team or title" data-change="setTeamF" data-field="q"></label>` : ""}
    <label class="f">From<input type="date" value="${f.from}" data-change="setTeamF" data-field="from"></label><label class="f">To<input type="date" value="${f.to}" data-change="setTeamF" data-field="to"></label>
    ${opts.cat ? `<label class="f">Category<select data-change="setTeamF" data-field="cat">${catOptions(f.cat, "All categories")}</select></label>` : ""}
    <button class="btn sm ghost" data-act="clearTeamF">Clear filters</button><button class="btn sm" data-act="reloadTeam">Refresh data</button></div>`;
}
ACT.setTeamF = el => { teamFilter()[el.dataset.field] = el.value; UI.refresh(); };
ACT.clearTeamF = () => { S.filters.team = null; UI.refresh(); };
ACT.reloadTeam = async () => { S.admin.loaded = false; S.admin.cache = {}; UI.refresh(); };
function catAverages(people, f) {
  const out = {};
  for (const c of CATS) { const v = people.map(p => personAt(p, f).cats[c.id]).filter(x => x != null); out[c.id] = { avg: v.length ? round1(avg(v)) : null, n: v.length }; }
  return out;
}

/* ---------- overview ---------- */
VIEWS.team = () => {
  const w = needAdmin(); if (w) return w;
  const f = teamFilter(), all = S.admin.people, people = filteredPeople(), st = S.settings;
  const active = people.filter(p => p.lastActive && nowTs() - p.lastActive < st.activeDays * DAY);
  const at = people.map(p => ({ p, a: personAt(p, f) }));
  const scored = at.filter(x => x.a.overall != null);
  const assessments = sum(at, x => (f.from || f.to) ? x.a.n : (x.p.summary ? x.p.summary.attempts : 0));
  const ca = catAverages(people, f), withData = CATS.filter(c => ca[c.id].avg != null).sort((a, b) => ca[b.id].avg - ca[a.id].avg);
  const imp = at.filter(x => x.a.tl.length >= 2).map(x => x.a.tl[x.a.tl.length - 1].overall - x.a.tl[0].overall);
  const ranked = scored.slice().sort((a, b) => b.a.overall - a.a.overall);
  const training = people.map(p => ({ p, r: trainingReasons(p) })).filter(x => x.r.length);
  const pendingInv = S.admin.invites.filter(i => i.status !== "joined").length;
  let h = `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>Team overview</h1><p>Competency across everyone taking the test series. Open any person to see what they know, what they're missing and whether they're improving.</p></div><div class="row"><button class="btn" data-act="go" data-to="team-invites">${ico("mail")} Invite people</button><button class="btn primary" data-act="go" data-to="team-heatmap">Open heatmap</button></div></div>${teamFilterBar()}`;
  h += `<div class="statline" style="margin-top:0">
    <div><b class="num">${all.filter(p => p.joinedAt).length}</b><span>Registered participants${pendingInv ? ` (+${pendingInv} invited)` : ""}</span></div>
    <div><b class="num">${active.length}</b><span>Active in last ${st.activeDays} days</span></div>
    <div><b class="num">${assessments}</b><span>Tests completed</span></div>
    <div><b class="num">${scored.length ? fmtScore(round1(avg(scored.map(x => x.a.overall)))) : "–"}</b><span>Average competency</span></div>
    <div><b>${withData.length ? esc(withData[0].short) : "–"}</b><span>Strongest category${withData.length ? ` (${fmtScore(ca[withData[0].id].avg)})` : ""}</span></div>
    <div><b>${withData.length ? esc(withData[withData.length - 1].short) : "–"}</b><span>Weakest category${withData.length ? ` (${fmtScore(ca[withData[withData.length - 1].id].avg)})` : ""}</span></div>
    <div><b class="num">${imp.length ? deltaHtml(avg(imp)) : "–"}</b><span>Average improvement${imp.length ? ` (${imp.length} people)` : ""}</span></div></div>`;
  if (!people.length) return h + `<section class="section">${empty("No participants yet", "Share your site link or invite people by email. Participants appear here once they create an account.", `<button class="btn primary" data-act="go" data-to="team-invites">Invite people</button>`)}</section>`;
  h += `<section class="section grid g2"><div class="panel"><h2>Average by category</h2><div class="chart-box tall">${chart("t1", () => ({ type: "bar", data: { labels: withData.map(c => c.short), datasets: [{ label: "Average score", data: withData.map(c => ca[c.id].avg), backgroundColor: withData.map(c => cssVar("--lv" + Math.max(0, levelIdx(ca[c.id].avg)))), borderRadius: 4 }] }, options: { indexAxis: "y", scales: { x: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } }))}</div></div>
    <div class="panel"><h2>People requiring additional training</h2>${training.length ? `<ul style="padding-left:18px">${training.slice(0, 12).map(x => `<li><button class="linkbtn" data-act="openPerson" data-pid="${x.p.id}">${esc(pname(x.p.id))}</button> <span class="small muted">${esc(x.r.join("; "))}</span></li>`).join("")}</ul>` : '<p class="muted">Nobody meets the training criteria right now.</p>'}<p class="small muted">Criteria: overall below ${st.trainingThreshold}, a core category below 40, a drop of 5+ points, five or more confirmed gaps, or no test in 60 days.</p></div></section>`;
  h += `<section class="section"><h2>Individual rankings</h2><div class="tw"><table><thead><tr><th class="r">#</th><th>Name</th><th>Team</th><th class="r">Competency</th><th>Level</th><th class="r">Change</th><th class="r">Categories</th><th class="r">Tests</th><th>Last active</th></tr></thead><tbody>${ranked.map((x, i) => {
    const d = x.a.tl.length >= 2 ? x.a.tl[x.a.tl.length - 1].overall - x.a.tl[0].overall : null;
    return `<tr class="click" data-act="openPerson" data-pid="${x.p.id}"><td class="r num">${i + 1}</td><td>${esc(pname(x.p.id))}<div class="small muted">${esc(x.p.title || "")}</div></td><td>${esc(x.p.team || "–")}</td><td class="r num"><b>${fmtScore(x.a.overall)}</b></td><td>${levelChip(x.a.overall)}</td><td class="r num">${deltaHtml(d)}</td><td class="r num">${x.p.summary ? x.p.summary.coverage : 0}/16</td><td class="r num">${x.p.summary ? x.p.summary.attempts : 0}</td><td>${fmtDate(x.p.lastActive)}</td></tr>`; }).join("")}
    ${people.filter(p => personAt(p, f).overall == null).map(p => `<tr class="click" data-act="openPerson" data-pid="${p.id}"><td class="r muted">–</td><td>${esc(pname(p.id))}</td><td>${esc(p.team || "–")}</td><td class="r muted">Not assessed</td><td></td><td></td><td></td><td></td><td>${fmtDate(p.lastActive)}</td></tr>`).join("")}</tbody></table></div></section>`;
  return h;
};
ACT.openPerson = el => UI.go("team-person", { pid: el.dataset.pid });

/* ---------- heatmap ---------- */
function heatClass(s) { return s == null ? "h-none" : s < 40 ? "h-weak" : s < 60 ? "h-dev" : s < 75 ? "h-good" : "h-exc"; }
VIEWS["team-heatmap"] = () => {
  const w = needAdmin(); if (w) return w;
  const f = teamFilter(); let people = filteredPeople();
  const cols = f.cat ? CATS.filter(c => c.id === f.cat).concat(CATS.filter(c => c.id !== f.cat)) : CATS;
  const at = Object.fromEntries(people.map(p => [p.id, personAt(p, f)]));
  people = people.slice().sort((a, b) => f.cat ? ((at[a.id].cats[f.cat] ?? 999) - (at[b.id].cats[f.cat] ?? 999)) : ((at[b.id].overall ?? -1) - (at[a.id].overall ?? -1)));
  const ca = catAverages(people, f);
  let h = `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>Competency heatmap</h1><p>Rows are people and columns are the 16 categories. Pick a category to sort by it and find who needs help. With a date range, each cell shows competency as of the latest test in that range.</p></div></div>${teamFilterBar({ cat: true })}
    <div class="legend" style="margin-bottom:12px"><span><i class="h-weak"></i>Weak (0–39)</span><span><i class="h-dev"></i>Developing (40–59)</span><span><i class="h-good"></i>Good (60–74)</span><span><i class="h-exc"></i>Excellent (75–100)</span><span><i class="h-none"></i>Not assessed</span></div>`;
  if (!people.length) return h + empty("No one matches these filters", "Clear the filters or invite participants.");
  h += `<div class="tw" style="padding:10px"><table class="heat"><thead><tr><th style="text-align:left">Person</th><th class="vert"><div>Overall</div></th>${cols.map(c => `<th class="vert" title="${esc(c.name)}"><div style="${c.id === f.cat ? "color:var(--accent-strong)" : ""}">${esc(c.short)}</div></th>`).join("")}</tr></thead><tbody>
    ${people.map(p => { const a = at[p.id]; return `<tr><td class="name" data-act="openPerson" data-pid="${p.id}">${esc(pname(p.id))}<div class="tiny muted">${esc(p.team || "")}</div></td><td class="cell ${heatClass(a.overall)}">${a.overall == null ? "–" : Math.round(a.overall)}</td>${cols.map(c => { const v = a.cats[c.id]; return `<td class="cell ${heatClass(v)}" title="${esc(pname(p.id))}, ${esc(c.name)}: ${v == null ? "not assessed" : fmtScore(v)}">${v == null ? "–" : Math.round(v)}</td>`; }).join("")}</tr>`; }).join("")}
    <tr><td class="name muted">Average</td>${(() => { const v = avg(people.map(p => at[p.id].overall)); return `<td class="cell ${heatClass(v)}">${v == null ? "–" : Math.round(v)}</td>`; })()}${cols.map(c => `<td class="cell ${heatClass(ca[c.id].avg)}">${ca[c.id].avg == null ? "–" : Math.round(ca[c.id].avg)}</td>`).join("")}</tr></tbody></table></div>`;
  return h;
};

/* ---------- people ---------- */
VIEWS["team-people"] = () => {
  const w = needAdmin(); if (w) return w;
  const people = S.admin.people.slice().sort((a, b) => pname(a.id).localeCompare(pname(b.id)));
  let h = `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>People</h1><p>Everyone with an account. Only administrators can see this page and other people's results; participants only ever see their own. Disabling someone blocks their access to every test and removes them from the leaderboard.</p></div><button class="btn primary" data-act="go" data-to="team-invites">${ico("mail")} Invite people</button></div>`;
  if (!people.length) return h + empty("No one registered yet", "Share your site link or send invitations to get started.");
  h += `<div class="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Team</th><th>Job title</th><th>Status</th><th class="r">Competency</th><th>Last active</th><th></th></tr></thead><tbody>${people.map(p => `<tr><td><div class="row">${avatar(pname(p.id), "sm")}${esc(pname(p.id))}</div></td><td class="small">${esc(p.email || "–")}</td><td>${esc(p.team || "–")}</td><td>${esc(p.title || "–")}</td><td>${p.disabled ? '<span class="st st-gap">Disabled</span>' : p.id === S.uid ? '<span class="chip navy">You (admin)</span>' : p.invited ? '<span class="chip">Invited</span>' : '<span class="chip">Open sign-up</span>'}</td><td class="r num">${p.summary ? fmtScore(p.summary.overall) : "–"}</td><td>${fmtDate(p.lastActive)}</td>
    <td class="r"><button class="btn sm" data-act="editPerson" data-pid="${p.id}">Edit</button> <button class="btn sm" data-act="openPerson" data-pid="${p.id}">Open</button></td></tr>`).join("")}</tbody></table></div>`;
  return h;
};
ACT.editPerson = async el => {
  const p = S.admin.people.find(x => x.id === el.dataset.pid); if (!p) return;
  const isAdm = !!(await Store.get(P.admin(p.id)).catch(() => null));
  UI.modal("Edit " + pname(p.id), `<p class="small muted">${esc(p.email || "")}</p><div class="grid g2"><label class="f">Name<input type="text" id="ep-name" value="${esc(p.name || "")}"></label><label class="f">Team<input type="text" id="ep-team" value="${esc(p.team || "")}" list="teamlist2"><datalist id="teamlist2">${teams().map(t => `<option value="${esc(t)}">`).join("")}</datalist></label><label class="f">Job title<input type="text" id="ep-title" value="${esc(p.title || "")}"></label></div>
    <div class="stack" style="margin-top:14px"><label class="check"><input type="checkbox" id="ep-disabled" ${p.disabled ? "checked" : ""} ${p.id === S.uid ? "disabled" : ""}> <span>Disable access <span class="muted small">(blocks all tests and data; hides them from the leaderboard)</span></span></label>
    <label class="check"><input type="checkbox" id="ep-admin" ${isAdm ? "checked" : ""} ${p.id === S.uid ? "disabled" : ""}> <span>Administrator <span class="muted small">(full access to this admin console and everyone's results)</span></span></label></div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" data-act="savePerson" data-pid="${p.id}" data-wasadmin="${isAdm ? 1 : ""}">Save</button></div>`);
};
ACT.savePerson = async el => {
  const pid = el.dataset.pid, p = S.admin.people.find(x => x.id === pid);
  const data = { name: $("#ep-name").value.trim() || p.name, team: $("#ep-team").value.trim(), title: $("#ep-title").value.trim(), disabled: $("#ep-disabled").checked };
  await Store.update(P.person(pid), data); Object.assign(p, data);
  if (data.disabled) await Store.del(P.leader(pid)).catch(() => {});
  if (pid !== S.uid) {
    const want = $("#ep-admin").checked, was = !!el.dataset.wasadmin;
    if (want && !was) await Store.set(P.admin(pid), { grantedAt: nowTs(), by: S.uid, email: p.email || "" });
    if (!want && was) await Store.del(P.admin(pid));
  }
  UI.closeModal(); UI.toast("Saved"); UI.refresh();
};

/* ---------- invites and access ---------- */
function inviteLink(email) { return siteUrl() + "?email=" + encodeURIComponent(email) + "&join=1"; }
function inviteMailto(email) {
  const c = S.config, link = inviteLink(email);
  const body = `Hi,\n\nYou're invited to take the ${c.siteName} SEO test series (${c.tagline}).\n\nJoin here: ${link}\n\nCreate your account with this email address (${email}). You'll get mock tests, quick quizzes, a daily challenge, a leaderboard and a certificate when you pass.\n\nSee you on the leaderboard!`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`You're invited to the ${c.siteName} SEO test series`)}&body=${encodeURIComponent(body)}`;
}
VIEWS["team-invites"] = () => {
  const w = needAdmin(); if (w) return w;
  const mode = S.config.registration === "invite" ? "invite" : "open";
  const inv = S.admin.invites.slice().sort((a, b) => (b.invitedAt || 0) - (a.invitedAt || 0));
  const joinedEmails = new Set(S.admin.people.map(p => (p.email || "").toLowerCase()));
  let h = `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>Invites and access</h1><p>Choose who can join, then invite people by email. Participants never see this page or any admin data; the Firestore security rules block it on the server.</p></div></div>
  <div class="grid g2"><section class="panel"><h2>Who can join</h2><div class="seg" role="group" aria-label="Registration mode" style="margin-top:10px"><button aria-pressed="${mode === "open"}" data-act="setRegMode" data-m="open">Anyone with the link</button><button aria-pressed="${mode === "invite"}" data-act="setRegMode" data-m="invite">Invite-only</button></div>
    <p class="small" style="margin-top:12px">${mode === "open" ? "<b>Open registration.</b> Anyone who visits your site can create a free account and take the tests. Invites still work and pre-fill each person's team." : "<b>Invite-only.</b> Only email addresses on the list below can create a profile. People who sign up with other emails see an \"invite-only\" message and can't read any questions or results. Invited people verify their email before starting."}</p>
    <label class="f" style="margin-top:10px">Your site link<div class="row" style="flex-wrap:nowrap"><input type="text" readonly value="${esc(siteUrl())}"><button class="btn sm" data-act="copy" data-text="${esc(siteUrl())}">${ico("copy")} Copy</button></div></label></section>
  <section class="panel"><h2>Invite people</h2><form data-submit="addInvites" class="stack" style="margin-top:10px">
    <label class="f">Email addresses <span class="hint">one per line, or separated by commas</span><textarea id="iv-emails" style="min-height:96px" placeholder="name@company.com&#10;colleague@agency.com"></textarea></label>
    <div class="grid g2"><label class="f">Team <span class="hint">optional</span><input type="text" id="iv-team" list="teamlist4"><datalist id="teamlist4">${teams().map(t => `<option value="${esc(t)}">`).join("")}</datalist></label><label class="f">Job title <span class="hint">optional</span><input type="text" id="iv-title"></label></div>
    <label class="check small"><input type="checkbox" id="iv-send" checked> <span>Email each person a one-click sign-in link (sent by Firebase from your project)</span></label>
    <div class="row"><button class="btn primary" type="submit">${ico("mail")} Add invites</button><span class="small muted">You can also copy a personal invite link or open your own mail app for each person.</span></div><div id="iv-out" class="small"></div></form></section></div>`;
  h += `<section class="section"><div class="section-head"><h2>Invitations (${inv.length})</h2><span class="small muted">${inv.filter(i => i.status === "joined" || joinedEmails.has(i.email)).length} joined · ${inv.filter(i => i.status !== "joined" && !joinedEmails.has(i.email)).length} pending</span></div>
    ${inv.length ? `<div class="tw"><table><thead><tr><th>Email</th><th>Team</th><th>Status</th><th>Invited</th><th>Emails sent</th><th></th></tr></thead><tbody>${inv.map(i => { const joined = i.status === "joined" || joinedEmails.has(i.email);
      return `<tr><td>${esc(i.email)}</td><td>${esc(i.team || "–")}</td><td>${joined ? `<span class="st st-proficient">Joined${i.joinedAt ? " " + fmtDate(i.joinedAt) : ""}</span>` : '<span class="st st-unconfirmed">Pending</span>'}</td><td>${fmtDate(i.invitedAt)}</td><td class="num">${i.sent || 0}${i.lastSentAt ? ` <span class="tiny muted">(last ${fmtDate(i.lastSentAt)})</span>` : ""}</td>
      <td class="r"><div class="row" style="justify-content:flex-end"><button class="btn sm" data-act="copy" data-text="${esc(inviteLink(i.email))}" data-done="Invite link copied">${ico("copy")} Link</button>${joined ? "" : `<button class="btn sm" data-act="resendInvite" data-email="${esc(i.email)}">Resend</button><a class="btn sm" href="${esc(inviteMailto(i.email))}">Mail app</a>`}<button class="btn sm danger" data-act="revokeInvite" data-email="${esc(i.email)}">Remove</button></div></td></tr>`; }).join("")}</tbody></table></div>` : empty("No invitations yet", "Add email addresses above. In invite-only mode, only these people can join.")}</section>
  <section class="section panel"><h2>About invitation emails</h2><ul class="small"><li>Invitation emails are Firebase "email link" sign-in emails sent from your Firebase project. For them to work, enable <b>Email link (passwordless sign-in)</b> under Authentication &gt; Sign-in method and add your site's domain under Authentication &gt; Settings &gt; Authorized domains.</li><li>You can customise the sender name and wording under Authentication &gt; Templates in the Firebase console.</li><li>Removing an invite stops someone who hasn't joined yet. To block someone who already joined, open People and disable their access.</li></ul></section>`;
  return h;
};
ACT.setRegMode = async el => {
  const m = el.dataset.m; if (m === S.config.registration) return;
  if (m === "invite" && !(await UI.confirm("Switch to invite-only? New sign-ups will need an invitation. Existing participants keep their access.", "Switch to invite-only"))) return;
  await Store.merge(P.config(), { registration: m, updatedAt: nowTs() }); S.config.registration = m; UI.toast(m === "open" ? "Anyone with the link can now join" : "The test series is now invite-only"); UI.refresh();
};
async function sendInviteEmail(email) {
  await FB.a.sendSignInLinkToEmail(FB.auth, email, { url: siteUrl() + "?email=" + encodeURIComponent(email), handleCodeInApp: true });
  const i = S.admin.invites.find(x => x.email === email), sent = ((i && i.sent) || 0) + 1, lastSentAt = nowTs();
  await Store.merge(P.invite(email), { sent, lastSentAt }); if (i) Object.assign(i, { sent, lastSentAt });
}
ACT.addInvites = async f => {
  const raw = $("#iv-emails").value, team = $("#iv-team").value.trim(), title = $("#iv-title").value.trim(), send = $("#iv-send").checked, out = $("#iv-out");
  const emails = Array.from(new Set(raw.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)));
  const bad = emails.filter(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.includes("/")), good = emails.filter(e => !bad.includes(e));
  if (!good.length) { out.innerHTML = `<div class="banner err">Enter at least one valid email address.${bad.length ? " Not valid: " + esc(bad.join(", ")) : ""}</div>`; return; }
  f.querySelector("button[type=submit]").disabled = true; out.textContent = "Saving invitations…";
  const now = nowTs(), results = [];
  for (const email of good) {
    const existing = S.admin.invites.find(x => x.email === email);
    const data = Object.assign({ email, status: existing ? existing.status : "pending", invitedAt: existing ? existing.invitedAt : now, invitedBy: S.uid, sent: existing ? existing.sent || 0 : 0 }, team ? { team } : {}, title ? { title } : {});
    try { await Store.merge(P.invite(email), data); if (existing) Object.assign(existing, data); else S.admin.invites.push(data); }
    catch (e) { results.push(`${email}: couldn't save (${e.code || e.message})`); continue; }
    if (send) { try { await sendInviteEmail(email); results.push(`${email}: invited and emailed`); } catch (e) { results.push(`${email}: invited, but the email failed: ${authErr(e)}`); } }
    else results.push(`${email}: invited`);
  }
  UI.refresh();
  const o = $("#iv-out"); if (o) o.innerHTML = `<div class="banner ${results.some(r => /fail|couldn't/.test(r)) ? "warn" : ""}"><ul style="margin:0;padding-left:18px">${results.concat(bad.map(b => `${b}: not a valid email`)).map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>`;
};
ACT.resendInvite = async el => { try { await sendInviteEmail(el.dataset.email); UI.toast("Invitation email sent to " + el.dataset.email); UI.refresh(); } catch (e) { UI.toast(authErr(e)); } };
ACT.revokeInvite = async el => {
  const email = el.dataset.email; if (!(await UI.confirm(`Remove the invitation for ${email}? If they already joined, they keep access until you disable them under People.`, "Remove"))) return;
  await Store.del(P.invite(email)); S.admin.invites = S.admin.invites.filter(i => i.email !== email); UI.refresh();
};

/* ---------- person detail ---------- */
VIEWS["team-person"] = () => {
  const w = needAdmin(); if (w) return w;
  const pid = S.params.pid, p = S.admin.people.find(x => x.id === pid);
  if (!p) return empty("Person not found", "Go back to People and choose someone.", `<button class="btn" data-act="go" data-to="team-people">People</button>`);
  const d = S.admin.cache[pid];
  if (!d) { Admin.person(pid).then(() => { if (S.params.pid === pid) UI.refresh(); }).catch(() => UI.toast("Couldn't load this person's data.")); return `<div class="loading"><div><div class="spin"></div>Loading ${esc(pname(pid))}…</div></div>`; }
  const m = d.model, tl = d.timeline.filter(t => t.overall != null), fq = fiveQuestions(m, d.timeline);
  const cur = m.overall, prev = tl.length >= 2 ? tl[tl.length - 2].overall : null;
  let h = `<div class="page-head"><div class="row">${avatar(pname(pid), "lg")}<div><h1>${esc(pname(pid))}</h1><p style="margin:0">${esc([p.title, p.team].filter(Boolean).join(", ") || "No team set")} · ${esc(p.email || "")}. Last active ${fmtDate(p.lastActive)}.</p></div></div>
    <div class="row"><button class="btn" data-act="go" data-to="team-people">All people</button><button class="btn" data-act="personReport" data-pid="${pid}">Download report</button><button class="btn primary" data-act="assignLearning" data-pid="${pid}">Assign learning</button></div></div>`;
  h += `<section class="panel hero navy"><div><div class="score-big num">${cur == null ? "–" : fmtScore(cur)}<small>/ 100</small></div><div class="score-meta">${levelChip(cur)}<span class="small muted">${m.coverage} of 16 categories assessed; ${m.answered} answers</span></div></div><div>${ruler(cur, prev)}</div></section>`;
  const T = fq.trend;
  h += `<section class="section"><h2>The five questions</h2><div class="five">
    <section><span class="n">1</span><div><h3>What does this person know well?</h3>${fq.strong.cats.length || fq.strong.mastered.length ? `<p>${fq.strong.cats.length ? `Strongest categories: ${fq.strong.cats.slice(0, 5).map(c => `<b>${esc(c.name)}</b> (${fmtScore(m.cats[c.id].score)})`).join(", ")}.` : "No category above 75 yet."}</p>${fq.strong.mastered.length ? `<div class="pill-list">${fq.strong.mastered.slice(0, 14).map(k => `<span class="st st-mastered">${esc(subName(k))}</span>`).join("")}</div>` : ""}` : '<p class="muted">Not enough evidence of strengths yet.</p>'}</div></section>
    <section><span class="n">2</span><div><h3>Which concepts don't they understand?</h3>${fq.gaps.length ? `<ul>${fq.gaps.slice(0, 8).map(g => `<li><b>${esc(subName(g.key))}</b> (${esc(CAT[g.key.split(":")[0]].short)}, ${fmtScore(g.s.score)}): ${g.concepts.map(esc).join("; ")}</li>`).join("")}</ul>` : '<p class="muted">No confirmed knowledge gaps. Single misses are treated as unconfirmed until repeated.</p>'}</div></section>
    <section><span class="n">3</span><div><h3>Which important skills are they missing?</h3>${fq.coreMissing.length ? `<ul>${fq.coreMissing.map(x => `<li><b>${esc(x.cat.name)}</b>: ${x.score == null ? "not assessed yet" : `${fmtScore(x.score)}, ${levelName(x.score).toLowerCase()}`}</li>`).join("")}</ul>` : '<p>All core skills (technical, JavaScript, analytics, auditing, algorithms, strategy) are at 60 or above.</p>'}</div></section>
    <section><span class="n">4</span><div><h3>What should they learn next?</h3>${fq.next.length ? `<ol>${fq.next.map(w => `<li><b>${esc(w.name)}</b> in ${esc(w.catName)} (${fmtScore(w.score)}): ${esc((w.toLearn.concat(w.struggling))[0] || "review missed questions")}. Start with ${resLink(w.resources[0])}.</li>`).join("")}</ol>` : '<p class="muted">No priorities. Assign a new category assessment to widen coverage.</p>'}</div></section>
    <section><span class="n">5</span><div><h3>Are they improving?</h3><p><b>${esc(T.verdict)}.</b> ${T.delta == null ? esc(T.detail) : `Competency moved from ${fmtScore(T.first.overall)} (${fmtDate(T.first.t)}) to ${fmtScore(T.last.overall)} (${fmtDate(T.last.t)}), ${deltaHtml(T.delta)} points; ${deltaHtml(T.recent)} since the previous test.`}</p>${T.up && T.up.length ? `<p class="small">Biggest gains: ${T.up.map(x => `${esc(CAT[x.cat].short)} ${deltaHtml(x.d)}`).join(", ")}.</p>` : ""}${T.down && T.down.length ? `<p class="small">Declines: ${T.down.map(x => `${esc(CAT[x.cat].short)} ${deltaHtml(x.d)}`).join(", ")}.</p>` : ""}</div></section></div></section>`;
  if (tl.length) h += `<section class="section grid g2"><div class="panel"><h2>Progress over time</h2><div class="chart-box">${chart("p1", () => ({ type: "line", data: { labels: tlLabels(tl), datasets: [{ label: "Competency", data: tl.map(t => t.overall), borderColor: cssVar("--c1"), backgroundColor: cssVar("--c1"), tension: .25 }, { label: "Test score", data: tl.map(t => t.score), borderColor: cssVar("--c2"), backgroundColor: cssVar("--c2"), showLine: false, pointRadius: 4 }] }, options: lineOpts() }))}</div></div>
    <div class="panel"><h2>Category profile</h2><div class="chart-box">${chart("p2", () => ({ type: "radar", data: { labels: CATS.map(c => c.short), datasets: [{ label: "Now", data: CATS.map(c => m.cats[c.id].score), borderColor: cssVar("--c2"), backgroundColor: cssVar("--c2") + "40", spanGaps: true }] }, options: { scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, backdropColor: "transparent" } } }, plugins: { legend: { display: false } } } }))}</div></div></section>`;
  h += `<section class="section"><h2>Category performance</h2>${categoryList(m)}</section>`;
  const weak = weakAreas(m, 5);
  h += `<section class="section"><h2>Areas requiring improvement</h2>${weak.length ? weak.map(x => gapCard(x, { noButtons: true })).join("") : '<p class="muted">None identified.</p>'}</section>`;
  h += `<section class="section"><h2>Assigned learning</h2>${d.assignments.length ? `<div class="tw"><table><thead><tr><th>Assignment</th><th>Assigned</th><th>Due</th><th>Status</th></tr></thead><tbody>${d.assignments.map(a => `<tr><td>${esc(a.title)}</td><td>${fmtDate(a.createdAt)}</td><td>${fmtDate(a.due)}</td><td>${a.status === "done" ? `Done ${fmtDate(a.doneAt)}` : "Open"}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Nothing assigned yet.</p>'}
    <p class="small muted">Learning activity: ${Object.keys(d.learning.modules || {}).length} resources studied, ${(d.learning.practice && d.learning.practice.total) || 0} practice questions answered.</p></section>`;
  const atts = d.attempts.slice().reverse();
  h += `<section class="section"><h2>Test history</h2>${atts.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Test</th><th>Type</th><th class="r">Score</th><th class="r">Correct</th><th>Duration</th><th>Status</th><th></th></tr></thead><tbody>${atts.map(a => `<tr><td>${fmtDateTime(a.completedAt || a.startedAt)}</td><td>${esc(a.title)}</td><td>${esc(MODE_LABEL[a.mode] || a.mode)}</td><td class="r num">${a.summary ? fmtScore(a.summary.score) : "–"}</td><td class="r num">${a.summary ? `${a.summary.correct}/${a.summary.n}` : "–"}</td><td>${fmtDur(a.durationMs)}</td><td>${a.status === "completed" ? "Completed" : "In progress"}</td><td class="r">${a.status === "completed" ? `<button class="btn sm" data-act="viewAttempt" data-pid="${pid}" data-aid="${a.id}">View answers</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No tests yet.</p>'}</section>`;
  return h;
};
ACT.viewAttempt = el => {
  const d = S.admin.cache[el.dataset.pid], a = d.attempts.find(x => x.id === el.dataset.aid), items = d.answers[a.id] || [];
  UI.modal(`${pname(el.dataset.pid)}: ${a.title}`, `<p class="small muted">${fmtDateTime(a.completedAt)}. Score ${fmtScore(a.summary.score)}.</p>${items.map((it, i) => reviewItem(it, i)).join("")}`, { wide: true });
  $$("#modal .rv .row").forEach(r => r.remove());
};
ACT.personReport = async el => {
  const pid = el.dataset.pid, p = S.admin.people.find(x => x.id === pid), d = await Admin.person(pid);
  saveFile(`seo-report-${pname(pid).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`, personReportHtml(p, pname(pid), d.attempts, d.answers));
};

/* ---------- assignments ---------- */
ACT.assignLearning = el => openAssign([el.dataset.pid], {});
function openAssign(pids, pre) {
  const cat = pre.cat || "tech";
  UI.modal("Assign learning", `<p class="small muted">Assigning to ${pids.length === 1 ? esc(pname(pids[0])) : pids.length + " people"}. It appears at the top of their learning roadmap.</p>
    <label class="f">Title<input type="text" id="as-title" value="${esc(pre.title || "")}" placeholder="e.g. Learn how Google renders JavaScript"></label>
    <div class="grid g3" style="margin-top:10px"><label class="f">Category<select id="as-cat" data-change="assignCat">${catOptions(cat)}</select></label><label class="f">Subcategory<select id="as-sub">${subOptions(cat, pre.sub)}</select></label><label class="f">Due date<input type="date" id="as-due"></label></div>
    <label class="f" style="margin-top:10px">Note<textarea id="as-note" placeholder="What you expect and why">${esc(pre.note || "")}</textarea></label>
    <div style="margin-top:10px"><b class="small">Resources</b><div id="as-res" class="stack" style="margin-top:6px">${resChecks(cat, pre.sub)}</div></div>
    <input type="hidden" id="as-pids" value="${esc(pids.join(","))}"><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" data-act="saveAssign">Assign</button></div>`);
}
function subOptions(cat, sel) { return `<option value="">Whole category</option>` + Object.entries(CAT[cat].subs).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(v)}</option>`).join(""); }
function resChecks(cat, sub) {
  const keys = []; CAT[cat].res.forEach(r => keys.push(r));
  S.bank.filter(q => q.cat === cat && (!sub || q.sub === sub)).forEach(q => (q.resources || []).forEach(r => { if (!keys.includes(r)) keys.push(r); }));
  return keys.slice(0, 10).map((r, i) => `<label class="check small"><input type="checkbox" value="${esc(r)}" ${i < 2 ? "checked" : ""}> <span>${resLink(r)}</span></label>`).join("");
}
ACT.assignCat = el => { $("#as-sub").innerHTML = subOptions(el.value); $("#as-res").innerHTML = resChecks(el.value); };
ACT.saveAssign = async () => {
  const title = $("#as-title").value.trim(); if (!title) { UI.toast("Add a title."); return; }
  const pids = $("#as-pids").value.split(",").filter(Boolean), due = $("#as-due").value;
  const base = { title, cat: $("#as-cat").value, sub: $("#as-sub").value || null, note: $("#as-note").value.trim(), resources: $$("#as-res input:checked").map(i => i.value), due: due ? new Date(due + "T12:00:00").getTime() : null, createdAt: nowTs(), by: S.uid, status: "open" };
  for (const pid of pids) { const id = uidgen(); await Store.set(P.assignment(pid, id), Object.assign({ id }, base)).catch(() => {}); if (S.admin.cache[pid]) S.admin.cache[pid].assignments.push(Object.assign({ id }, base)); if (pid === S.uid) S.assignments.unshift(Object.assign({ id, _id: id }, base)); }
  UI.closeModal(); UI.toast(`Assigned to ${pids.length} ${pids.length === 1 ? "person" : "people"}`); UI.refresh();
};

/* ---------- team gaps ---------- */
VIEWS["team-gaps"] = () => {
  const w = needAdmin(); if (w) return w;
  const people = filteredPeople(), agg = {};
  for (const p of people) for (const [k, s] of Object.entries((p.summary && p.summary.subs) || {})) {
    const a = agg[k] || (agg[k] = { tested: 0, gap: [], weak: [], scores: [] });
    a.tested++; a.scores.push(s.s); if (s.st === "gap") a.gap.push(p.id); if (s.s < 60) a.weak.push(p.id);
  }
  const rows = Object.entries(agg).map(([k, a]) => ({ k, ...a, avg: round1(avg(a.scores)) })).sort((x, y) => y.gap.length - x.gap.length || y.weak.length - x.weak.length || x.avg - y.avg);
  let h = `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>Team knowledge gaps</h1><p>Subcategories where the most people have confirmed gaps or score below 60. Use these to plan targeted training.</p></div></div>${teamFilterBar({ search: false })}`;
  if (!rows.length) return h + empty("No test data yet", "Gaps appear once participants complete tests.");
  const top = rows.slice(0, 12);
  h += `<section class="panel"><h2>Most common gaps</h2><div class="chart-box" style="height:${top.length * 30 + 70}px">${chart("tg", () => ({ type: "bar", data: { labels: top.map(r => `${subName(r.k)} (${CAT[r.k.split(":")[0]].short})`), datasets: [{ label: "People with a confirmed gap", data: top.map(r => r.gap.length), backgroundColor: cssVar("--lv0"), borderRadius: 4 }, { label: "People scoring under 60", data: top.map(r => r.weak.length), backgroundColor: cssVar("--c2"), borderRadius: 4 }] }, options: { indexAxis: "y", scales: { x: { ticks: { stepSize: 1 } } }, plugins: { legend: { position: "bottom" } } } }))}</div></section>
  <section class="section"><div class="tw"><table><thead><tr><th>Subcategory</th><th>Category</th><th class="r">People tested</th><th class="r">Confirmed gaps</th><th class="r">Under 60</th><th class="r">Average</th><th>Who</th><th></th></tr></thead><tbody>${rows.map(r => { const who = Array.from(new Set(r.gap.concat(r.weak)));
    return `<tr><td>${esc(subName(r.k))}</td><td>${esc(CAT[r.k.split(":")[0]].short)}</td><td class="r num">${r.tested}</td><td class="r num">${r.gap.length}</td><td class="r num">${r.weak.length}</td><td class="r num">${fmtScore(r.avg)}</td><td class="small">${who.slice(0, 4).map(id => esc(pname(id))).join(", ")}${who.length > 4 ? ` +${who.length - 4}` : ""}</td><td class="r">${who.length ? `<button class="btn sm" data-act="trainGroup" data-k="${r.k}" data-pids="${who.join(",")}">Create training</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div></section>`;
  return h;
};
ACT.trainGroup = el => { const [cat, sub] = el.dataset.k.split(":"); openAssign(el.dataset.pids.split(","), { cat, sub, title: `Training: ${CAT[cat].subs[sub]}`, note: "Assigned because test results show a gap in this area. Study the resources, complete the practice questions, then retake the category assessment." }); };

/* ---------- mock tests ---------- */
function mockStats(mk) { const g = groupBy((mk.qids || []).map(id => S.bankById[id]).filter(Boolean), q => q.diff); return DIFFS.map(d => (g[d] || []).length); }
VIEWS["team-mocks"] = () => {
  const w = needAdmin(); if (w) return w;
  const mocks = S.mocks.slice().sort((a, b) => (a.number || 0) - (b.number || 0));
  let h = `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>Mock tests</h1><p>Each mock has a fixed question set, so every participant takes the same test and scores are comparable. Publish a mock to make it visible under Mock Test Series.</p></div><div class="row"><button class="btn" data-act="editMock">Create one mock</button><button class="btn primary" data-act="genMocks">Generate a mock series</button></div></div>`;
  if (!S.bank.length) h += `<div class="banner err">Import the question bank first (Question Bank > Import JSON).</div>`;
  h += mocks.length ? `<div class="tw"><table><thead><tr><th>#</th><th>Title</th><th class="r">Questions</th><th>Mix (E/M/H)</th><th class="r">Minutes</th><th>Attempts</th><th>Status</th><th></th></tr></thead><tbody>${mocks.map(m => { const [e, md, hd] = mockStats(m);
    return `<tr><td class="num">${esc(String(m.number || ""))}</td><td>${esc(m.title)}${m.desc ? `<div class="tiny muted">${esc(m.desc)}</div>` : ""}</td><td class="r num">${(m.qids || []).length}</td><td class="num">${e} / ${md} / ${hd}</td><td class="r num">${m.minutes}</td><td>${m.attemptsAllowed > 0 ? m.attemptsAllowed : "Unlimited"}</td><td>${m.published ? '<span class="st st-proficient">Published</span>' : '<span class="st st-untested">Draft</span>'}</td>
      <td class="r"><div class="row" style="justify-content:flex-end"><button class="btn sm" data-act="toggleMock" data-id="${esc(m.id)}">${m.published ? "Unpublish" : "Publish"}</button><button class="btn sm" data-act="editMock" data-id="${esc(m.id)}">Edit</button></div></td></tr>`; }).join("")}</tbody></table></div>`
    : empty("No mock tests yet", "Generate a series of mocks from the question bank in one click, or create them one at a time.", `<button class="btn primary" data-act="genMocks">Generate a mock series</button>`);
  return h;
};
function pickForMock({ count, mix, cats, exclude }) {
  let qs = pickQuestions({ cats, mix: mixCounts(count, mix, true), includeOpen: false, exclude });
  if (qs.length < count) { const ids = new Set(qs.map(q => q.id)); const more = pickQuestions({ cats, mix: mixCounts(count - qs.length, mix, true), includeOpen: false, exclude: ids }); qs = qs.concat(more).slice(0, count); }
  return qs.map(q => q.id);
}
ACT.genMocks = () => {
  const start = (S.mocks.reduce((m, x) => Math.max(m, x.number || 0), 0)) + 1, nonOpen = S.bank.filter(q => q.status === "active" && q.type !== "open").length;
  UI.modal("Generate a mock series", `<p class="small muted">Creates several mocks across all 16 categories, balanced by difficulty, with as little question overlap as the bank allows (${nonOpen} active questions available).</p>
    <div class="grid g4" style="margin-top:10px"><label class="f">How many mocks<input type="number" id="gm-n" value="6" min="1" max="30"></label><label class="f">Questions each<input type="number" id="gm-c" value="50" min="5" max="150"></label><label class="f">Minutes each<input type="number" id="gm-m" value="60" min="5"></label><label class="f">Attempts allowed <span class="hint">0 = unlimited</span><input type="number" id="gm-a" value="0" min="0"></label></div>
    <div class="grid g3" style="margin-top:10px"><label class="f">Easy %<input type="number" id="gm-e" value="30"></label><label class="f">Medium %<input type="number" id="gm-md" value="40"></label><label class="f">Hard %<input type="number" id="gm-h" value="30"></label></div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="gm-pub" checked> Publish immediately</label>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" data-act="runGenMocks" data-start="${start}">Generate</button></div>`);
};
ACT.runGenMocks = async el => {
  const n = +$("#gm-n").value, count = +$("#gm-c").value, minutes = +$("#gm-m").value, attempts = Math.max(0, +$("#gm-a").value || 0), mix = { easy: +$("#gm-e").value, medium: +$("#gm-md").value, hard: +$("#gm-h").value }, pub = $("#gm-pub").checked;
  if (mix.easy + mix.medium + mix.hard !== 100) { UI.toast("Difficulty percentages must add up to 100."); return; }
  if (!(n > 0 && count >= 5 && minutes >= 5)) { UI.toast("Check the numbers."); return; }
  el.disabled = true;
  const used = new Set(S.mocks.flatMap(m => m.qids || [])), cats = CATS.map(c => c.id), startNo = +el.dataset.start, ops = [], made = [];
  for (let i = 0; i < n; i++) {
    const qids = pickForMock({ count, mix, cats, exclude: used }); qids.forEach(id => used.add(id));
    const no = startNo + i, id = "mock-" + String(no).padStart(2, "0");
    const mk = { id, number: no, title: `Mock Test ${no}`, desc: `Full-length mock across all 16 SEO disciplines.`, qids, minutes, attemptsAllowed: attempts, published: pub, createdAt: nowTs(), updatedAt: nowTs(), by: S.uid };
    ops.push({ op: "set", path: P.mock(id), data: mk }); made.push(mk);
    if (used.size >= S.bank.length - 5) used.clear();
  }
  try { await Store.batch(ops); } catch (e) { el.disabled = false; UI.toast("Couldn't save the mocks: " + (e.message || e.code)); return; }
  S.mocks = S.mocks.filter(m => !made.some(x => x.id === m.id)).concat(made).sort((a, b) => a.number - b.number);
  UI.closeModal(); UI.toast(`Created ${made.length} mock tests`); UI.refresh();
};
ACT.editMock = el => {
  const mk = S.mocks.find(m => m.id === (el && el.dataset.id)) || { id: "", number: (S.mocks.reduce((m, x) => Math.max(m, x.number || 0), 0)) + 1, title: "", desc: "", qids: [], minutes: 60, attemptsAllowed: 0, published: false };
  UI.modal(mk.id ? `Edit ${mk.title}` : "Create a mock test", `<div class="grid g4"><label class="f">Number<input type="number" id="mk-no" value="${mk.number}"></label><label class="f" style="grid-column:span 3">Title<input type="text" id="mk-title" value="${esc(mk.title || `Mock Test ${mk.number}`)}"></label></div>
    <label class="f" style="margin-top:10px">Description<input type="text" id="mk-desc" value="${esc(mk.desc || "")}"></label>
    <div class="grid g3" style="margin-top:10px"><label class="f">Minutes<input type="number" id="mk-min" value="${mk.minutes}"></label><label class="f">Attempts allowed <span class="hint">0 = unlimited</span><input type="number" id="mk-att" value="${mk.attemptsAllowed || 0}"></label><label class="check" style="align-self:end"><input type="checkbox" id="mk-pub" ${mk.published ? "checked" : ""}> Published</label></div>
    <label class="f" style="margin-top:10px">Question IDs <span class="hint">comma or line separated; ${(mk.qids || []).length} now</span><textarea id="mk-qids" class="mono" style="min-height:110px">${esc((mk.qids || []).join(", "))}</textarea></label>
    <div class="row small" style="margin-top:8px"><span>Auto-fill:</span><input type="number" id="mk-fill" value="${(mk.qids || []).length || 40}" style="width:90px"><select id="mk-fcat" style="width:auto"><option value="">All categories</option>${catOptions("")}</select><button class="btn sm" data-act="mockFill">Pick questions</button></div>
    <div class="row" style="justify-content:space-between;margin-top:14px">${mk.id ? `<button class="btn danger" data-act="delMock" data-id="${esc(mk.id)}">Delete</button>` : "<span></span>"}<button class="btn primary" data-act="saveMock" data-id="${esc(mk.id)}">Save mock</button></div>`, { wide: true });
};
ACT.mockFill = () => { const n = Math.max(5, +$("#mk-fill").value || 40), c = $("#mk-fcat").value; $("#mk-qids").value = pickForMock({ count: n, mix: { easy: 30, medium: 40, hard: 30 }, cats: c ? [c] : CATS.map(x => x.id), exclude: new Set() }).join(", "); };
ACT.saveMock = async el => {
  const qids = Array.from(new Set($("#mk-qids").value.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)));
  const unknown = qids.filter(id => !S.bankById[id]); if (unknown.length) { UI.toast("Unknown question IDs: " + unknown.slice(0, 5).join(", ")); return; }
  if (qids.length < 5) { UI.toast("A mock needs at least 5 questions."); return; }
  const no = +$("#mk-no").value || 1, id = el.dataset.id || "mock-" + String(no).padStart(2, "0") + (S.mocks.some(m => m.id === "mock-" + String(no).padStart(2, "0")) ? "-" + uidgen().slice(-4) : "");
  const old = S.mocks.find(m => m.id === id) || {};
  const mk = Object.assign({}, old, { id, number: no, title: $("#mk-title").value.trim() || `Mock Test ${no}`, desc: $("#mk-desc").value.trim(), qids, minutes: Math.max(5, +$("#mk-min").value || 60), attemptsAllowed: Math.max(0, +$("#mk-att").value || 0), published: $("#mk-pub").checked, updatedAt: nowTs(), createdAt: old.createdAt || nowTs(), by: old.by || S.uid });
  delete mk._id;
  await Store.set(P.mock(id), mk); S.mocks = S.mocks.filter(m => m.id !== id).concat([mk]).sort((a, b) => a.number - b.number);
  UI.closeModal(); UI.toast("Mock saved"); UI.refresh();
};
ACT.toggleMock = async el => { const mk = S.mocks.find(m => m.id === el.dataset.id); mk.published = !mk.published; await Store.update(P.mock(mk.id), { published: mk.published, updatedAt: nowTs() }); UI.refresh(); };
ACT.delMock = async el => { if (!(await UI.confirm("Delete this mock test? Past results are kept in people's history.", "Delete"))) return; await Store.del(P.mock(el.dataset.id)); S.mocks = S.mocks.filter(m => m.id !== el.dataset.id); UI.closeModal(); UI.refresh(); };

/* ---------- assessments (templates) ---------- */
VIEWS["team-assessments"] = () => {
  const w = needAdmin(); if (w) return w;
  const st = S.settings, tp = S.templates.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>Assessments</h1><p>The built-in modes are always available. Create custom assessments for specific people or teams, for example an onboarding test or a quarterly technical check.</p></div><button class="btn primary" data-act="editTpl">Create assessment</button></div>
  <section class="section" style="margin-top:0"><h2>Built-in modes</h2><div class="tw"><table><thead><tr><th>Mode</th><th>Structure</th><th>Time limit</th></tr></thead><tbody>
    <tr><td>Complete</td><td>${st.complete.count} questions across all categories: ${st.complete.mix.easy} easy, ${st.complete.mix.medium} medium, ${st.complete.mix.hard} hard${st.complete.includeOpen ? ", one may be an open response" : ""}</td><td>${st.complete.minutes} min</td></tr>
    <tr><td>Category</td><td>${st.category.count} questions: ${st.category.mix.easy}% easy, ${st.category.mix.medium}% medium, ${st.category.mix.hard}% hard</td><td>${st.category.minutes} min</td></tr>
    <tr><td>Adaptive</td><td>Up to ${st.adaptive.max} questions; difficulty rises after 2 correct, falls after 2 wrong; follow-up question after every miss</td><td>${st.adaptive.minutes} min</td></tr>
    <tr><td>Trends</td><td>${st.trends.count} trend questions</td><td>${st.trends.minutes} min</td></tr>
    <tr><td>Quick quiz</td><td>${st.quick.count} questions</td><td>${st.quick.minutes} min</td></tr>
    <tr><td>Daily challenge</td><td>${st.daily.count} questions, same for everyone each day</td><td>${st.daily.minutes} min</td></tr></tbody></table></div><p class="small"><button class="linkbtn" data-act="go" data-to="team-config">Change these rules</button></p></section>
  <section class="section"><h2>Custom assessments</h2>${tp.length ? `<div class="tw"><table><thead><tr><th>Name</th><th>Categories</th><th class="r">Questions</th><th>Assigned to</th><th>Status</th><th></th></tr></thead><tbody>${tp.map(t => `<tr><td>${esc(t.name)}</td><td class="small">${(t.cats || []).length ? t.cats.map(c => CAT[c] ? CAT[c].short : c).join(", ") : "All"}</td><td class="r num">${t.count}</td><td>${t.audience && t.audience.type === "team" ? "Team: " + esc(t.audience.team) : t.audience && t.audience.type === "people" ? (t.audience.people || []).length + " people" : "Everyone"}</td><td>${t.active === false ? "Inactive" : "Active"}</td><td class="r"><button class="btn sm" data-act="editTpl" data-id="${esc(t._id || t.id)}">Edit</button></td></tr>`).join("")}</tbody></table></div>` : empty("No custom assessments", "Create one to target a team or specific skills.")}</section>`;
};
ACT.editTpl = el => {
  const t = S.templates.find(x => (x._id || x.id) === (el && el.dataset.id)) || { name: "", desc: "", cats: [], count: 20, mix: { easy: 40, medium: 35, hard: 25 }, minutes: 30, includeOpen: false, audience: { type: "all" }, active: true };
  const people = S.admin.people.filter(p => p.joinedAt), aud = t.audience || { type: "all" };
  UI.modal(t.id ? "Edit assessment" : "Create assessment", `<label class="f">Name<input type="text" id="tp-name" value="${esc(t.name)}"></label><label class="f" style="margin-top:10px">Description<input type="text" id="tp-desc" value="${esc(t.desc || "")}"></label>
    <div style="margin-top:12px"><b class="small">Categories (none selected means all)</b><div class="grid g3" style="margin-top:6px;gap:4px 12px">${CATS.map(c => `<label class="check small"><input type="checkbox" class="tp-cat" value="${c.id}" ${(t.cats || []).includes(c.id) ? "checked" : ""}> ${esc(c.name)}</label>`).join("")}</div></div>
    <div class="grid g4" style="margin-top:12px"><label class="f">Questions<input type="number" id="tp-count" min="5" max="120" value="${t.count}"></label><label class="f">Easy %<input type="number" id="tp-e" value="${t.mix.easy}"></label><label class="f">Medium %<input type="number" id="tp-m" value="${t.mix.medium}"></label><label class="f">Hard %<input type="number" id="tp-h" value="${t.mix.hard}"></label></div>
    <div class="grid g3" style="margin-top:12px"><label class="f">Time limit (minutes)<input type="number" id="tp-min" value="${t.minutes}"></label><label class="f">Assigned to<select id="tp-aud"><option value="all" ${aud.type === "all" ? "selected" : ""}>Everyone</option><option value="team" ${aud.type === "team" ? "selected" : ""}>A team</option><option value="people" ${aud.type === "people" ? "selected" : ""}>Specific people</option></select></label><label class="f">Team name<input type="text" id="tp-team" value="${esc(aud.team || "")}" list="teamlist3"><datalist id="teamlist3">${teams().map(x => `<option value="${esc(x)}">`).join("")}</datalist></label></div>
    <div style="margin-top:10px"><b class="small">People (when assigning to specific people)</b><div class="grid g3" style="margin-top:6px;gap:4px 12px">${people.map(p => `<label class="check small"><input type="checkbox" class="tp-p" value="${p.id}" ${(aud.people || []).includes(p.id) ? "checked" : ""}> ${esc(pname(p.id))}</label>`).join("") || '<span class="small muted">No registered people yet.</span>'}</div></div>
    <div class="row" style="margin-top:12px"><label class="check"><input type="checkbox" id="tp-open" ${t.includeOpen ? "checked" : ""}> Include one open-response question (needs rubric review)</label><label class="check"><input type="checkbox" id="tp-active" ${t.active !== false ? "checked" : ""}> Active</label></div>
    <div class="row" style="justify-content:space-between;margin-top:14px">${t.id ? `<button class="btn danger" data-act="delTpl" data-id="${esc(t._id || t.id)}">Delete</button>` : "<span></span>"}<button class="btn primary" data-act="saveTpl" data-id="${esc(t._id || t.id || "")}">Save assessment</button></div>`);
};
ACT.saveTpl = async el => {
  const id = el.dataset.id || uidgen(), e = +$("#tp-e").value, m = +$("#tp-m").value, hd = +$("#tp-h").value;
  if (e + m + hd !== 100) { UI.toast("Difficulty percentages must add up to 100."); return; }
  const name = $("#tp-name").value.trim(); if (!name) { UI.toast("Give the assessment a name."); return; }
  const t = { id, name, desc: $("#tp-desc").value.trim(), cats: $$(".tp-cat:checked").map(i => i.value), count: Math.max(5, Math.min(120, +$("#tp-count").value || 20)), mix: { easy: e, medium: m, hard: hd }, minutes: Math.max(5, +$("#tp-min").value || 30), includeOpen: $("#tp-open").checked, active: $("#tp-active").checked,
    audience: { type: $("#tp-aud").value, team: $("#tp-team").value.trim(), people: $$(".tp-p:checked").map(i => i.value) }, updatedAt: nowTs() };
  const old = S.templates.find(x => (x._id || x.id) === id); t.createdAt = old ? old.createdAt : nowTs(); t.by = old ? old.by : S.uid;
  await Store.set(P.tpl(id), t); S.templates = S.templates.filter(x => (x._id || x.id) !== id).concat([Object.assign({ _id: id }, t)]); UI.closeModal(); UI.refresh(); UI.toast("Assessment saved");
};
ACT.delTpl = async el => { if (!(await UI.confirm("Delete this assessment? Past results are kept.", "Delete"))) return; await Store.del(P.tpl(el.dataset.id)); S.templates = S.templates.filter(x => (x._id || x.id) !== el.dataset.id); UI.refresh(); };

/* ---------- question bank ---------- */
const Bank = {
  async write(fullQs) { // upsert full-format questions: rewrites the affected category documents + answer keys
    const map = Object.assign({}, S.bankById), keys = {}, cats = new Set();
    for (const q of fullQs) { const { pub, key } = splitQuestion(q, S.bankById[q.id]); map[q.id] = pub; keys[q.id] = key; cats.add(q.cat); }
    const ops = [];
    for (const c of cats) { const list = Object.values(map).filter(q => q.cat === c).sort((a, b) => a.id.localeCompare(b.id)); ops.push({ op: "set", path: P.bankCat(c), data: { cat: c, n: list.length, json: JSON.stringify(list), updatedAt: nowTs() } }); }
    for (const [id, k] of Object.entries(keys)) ops.push({ op: "set", path: P.key(id), data: k });
    await Store.batch(ops);
    setBank(Object.values(map)); Object.assign(S.keys, keys); invalidateMine();
  },
  async remove(id) {
    const q = S.bankById[id]; if (!q) return;
    const list = S.bank.filter(x => x.cat === q.cat && x.id !== id).sort((a, b) => a.id.localeCompare(b.id));
    await Store.batch([{ op: "set", path: P.bankCat(q.cat), data: { cat: q.cat, n: list.length, json: JSON.stringify(list), updatedAt: nowTs() } }, { op: "delete", path: P.key(id) }]);
    setBank(S.bank.filter(x => x.id !== id)); delete S.keys[id];
  }
};
const _split = splitQuestion;
splitQuestion = function (q, prevPub) { // keep the right-hand order of match questions stable across edits
  const r = _split(q);
  if (q.type === "match" && prevPub && Array.isArray(prevPub.right) && Array.isArray(q.pairs)) {
    const rights = q.pairs.map(p => p[1]);
    if (prevPub.right.length === rights.length && prevPub.right.every(x => rights.includes(x))) { r.pub.right = prevPub.right.slice(); r.key.match = rights.map(x => prevPub.right.indexOf(x)); }
  }
  return r;
};
function fullQ(id) { const p = S.bankById[id]; return p ? joinQuestion(p, S.keys[id]) : null; }
function reviewDue(q) { return q.verified && q.reviewDays && (nowTs() - new Date(q.verified).getTime()) > q.reviewDays * DAY; }
function flagsByQ() { const m = {}; for (const ib of S.admin.inboxes || []) for (const f of Object.values(ib.flags || {})) if (f.status === "open") (m[f.qid] = m[f.qid] || []).push(f); return m; }
VIEWS["team-bank"] = () => {
  const w = needAdmin(); if (w) return w;
  const f = S.filters.bank || (S.filters.bank = { q: "", cat: "", diff: "", type: "", status: "", special: "", page: 0 });
  const fl = flagsByQ(), text = f.q.toLowerCase();
  const list = S.bank.filter(q => (!f.cat || q.cat === f.cat) && (!f.diff || q.diff === f.diff) && (!f.type || q.type === f.type) && (!f.status || q.status === f.status) &&
    (!f.special || (f.special === "flagged" && fl[q.id]) || (f.special === "due" && reviewDue(q)) || (f.special === "trend" && q.trend)) &&
    (!text || (q.id + " " + q.text + " " + (conceptOf(q.id) || "")).toLowerCase().includes(text))).sort((a, b) => a.id.localeCompare(b.id));
  const per = 50, pages = Math.max(1, Math.ceil(list.length / per)), page = Math.min(f.page, pages - 1);
  const byCat = groupBy(S.bank.filter(q => q.status === "active"), q => q.cat);
  let h = `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>Question bank</h1><p>${S.bank.length} questions (${S.bank.filter(q => q.status === "active").length} active, ${S.bank.filter(q => q.status === "draft").length} drafts, ${S.bank.filter(q => q.status === "retired").length} retired). ${S.bank.filter(reviewDue).length} due for review, ${Object.keys(fl).length} flagged. Answers are stored separately and only sent to a participant after they've answered.</p></div>
    <div class="row"><button class="btn primary" data-act="editQ">Add question</button><button class="btn" data-act="importBank">Import JSON</button><button class="btn" data-act="exportBank">Export JSON</button></div></div>`;
  if (!S.bank.length) h += `<div class="banner err">The bank is empty. Click Import JSON and choose <b>private-question-bank/questions.json</b> (it came in the zip, outside the website folder) to load the 336 starter questions.</div>`;
  const short = CATS.filter(c => { const g = groupBy(byCat[c.id] || [], q => q.diff); return (g.easy || []).length < 8 || (g.medium || []).length < 7 || (g.hard || []).filter(q => q.type !== "open").length < 5; });
  if (short.length && S.bank.length) h += `<div class="banner warn">Too few active questions for a full 20-question category assessment in: ${short.map(c => esc(c.short)).join(", ")}.</div>`;
  h += `<div class="filters"><label class="f">Search<input type="search" value="${esc(f.q)}" data-change="setBankF" data-field="q" placeholder="ID, text or concept"></label><label class="f">Category<select data-change="setBankF" data-field="cat">${catOptions(f.cat, "All")}</select></label>
    <label class="f">Difficulty<select data-change="setBankF" data-field="diff"><option value="">All</option>${DIFFS.map(d => `<option value="${d}" ${f.diff === d ? "selected" : ""}>${DIFF_LABEL[d]}</option>`).join("")}</select></label>
    <label class="f">Type<select data-change="setBankF" data-field="type"><option value="">All</option>${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${f.type === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="f">Status<select data-change="setBankF" data-field="status"><option value="">All</option>${["active", "draft", "retired"].map(s => `<option ${f.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
    <label class="f">Show<select data-change="setBankF" data-field="special"><option value="">Everything</option><option value="flagged" ${f.special === "flagged" ? "selected" : ""}>Flagged by users</option><option value="due" ${f.special === "due" ? "selected" : ""}>Review due</option><option value="trend" ${f.special === "trend" ? "selected" : ""}>Trend questions</option></select></label></div>
  <div class="tw"><table><thead><tr><th>ID</th><th>Question</th><th>Category</th><th>Difficulty</th><th>Type</th><th>Status</th><th>Verified</th><th></th></tr></thead><tbody>${list.slice(page * per, page * per + per).map(q => `<tr class="click" data-act="editQ" data-id="${q.id}"><td class="num small">${esc(q.id)}</td><td class="small" style="max-width:420px">${esc(q.text.slice(0, 150))}${q.text.length > 150 ? "…" : ""}${fl[q.id] ? ` <span class="st st-gap">${fl[q.id].length} flag${fl[q.id].length > 1 ? "s" : ""}</span>` : ""}</td><td class="small">${esc(CAT[q.cat].short)}<div class="muted tiny">${esc(CAT[q.cat].subs[q.sub] || q.sub)}</div></td><td>${diffChip(q.diff)}</td><td class="small">${esc(TYPE_LABEL[q.type])}</td><td class="small">${esc(q.status)}</td><td class="small ${reviewDue(q) ? "delta-down" : ""}">${esc(q.verified || "–")}</td><td class="r"><button class="btn sm">Edit</button></td></tr>`).join("")}</tbody></table></div>
  <div class="row" style="margin-top:10px"><span class="small muted">${list.length} matching. Page ${page + 1} of ${pages}.</span><span class="spacer"></span><button class="btn sm" data-act="bankPage" data-d="-1" ${page === 0 ? "disabled" : ""}>Previous</button><button class="btn sm" data-act="bankPage" data-d="1" ${page >= pages - 1 ? "disabled" : ""}>Next</button></div>`;
  return h;
};
ACT.setBankF = el => { S.filters.bank[el.dataset.field] = el.value; S.filters.bank.page = 0; UI.refresh(); };
ACT.bankPage = el => { S.filters.bank.page = Math.max(0, S.filters.bank.page + Number(el.dataset.d)); UI.refresh(); };
const PREFIX = { tech: "TEC", onpage: "ONP", cwv: "CWV", js: "JSS", schema: "SDS", keywords: "KWS", offpage: "OFF", analytics: "ANL", intl: "INT", local: "LOC", ecom: "ECM", audit: "AUD", tools: "TLS", algo: "ALG", ai: "AIS", strategy: "STR" };
function nextId(cat) { const pre = PREFIX[cat]; let max = 0; S.bank.forEach(q => { if (q.id.startsWith(pre + "-")) max = Math.max(max, parseInt(q.id.split("-")[1], 10) || 0); }); return `${pre}-${String(max + 1).padStart(3, "0")}`; }
ACT.editQ = (el) => openQEditor(el && el.dataset && el.dataset.id ? fullQ(el.dataset.id) : null);
function openQEditor(q, draftNote) {
  const isNew = !q || !q.id || !S.bankById[q.id];
  q = Object.assign({ cat: "tech", sub: "crawl-index", diff: "easy", type: "single", text: "", options: ["", "", "", ""], answer: [0], why: ["", "", "", ""], explanation: "", concept: "", resources: [], status: "draft", trend: false, reviewDays: 365, verified: "" }, q || {});
  const fl = (flagsByQ()[q.id] || []);
  const opts = q.options || [], ans = q.answer || [];
  UI.modal(isNew ? "Add question" : `Edit ${q.id}`, `${draftNote ? `<div class="banner warn">${esc(draftNote)}</div>` : ""}${fl.length ? `<div class="banner err"><div><b>${fl.length} open report${fl.length > 1 ? "s" : ""}:</b><ul class="small">${fl.map(x => `<li>${esc(x.reason)}: ${esc(x.note || "(no detail)")}</li>`).join("")}</ul></div></div>` : ""}
    <div class="grid g4"><label class="f">Category<select id="qe-cat" data-change="qeCat">${catOptions(q.cat)}</select></label><label class="f">Subcategory<select id="qe-sub">${Object.entries(CAT[q.cat].subs).map(([k, v]) => `<option value="${k}" ${k === q.sub ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
      <label class="f">Difficulty<select id="qe-diff">${DIFFS.map(d => `<option value="${d}" ${q.diff === d ? "selected" : ""}>${DIFF_LABEL[d]}</option>`).join("")}</select></label><label class="f">Type<select id="qe-type" data-change="qeType">${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${q.type === k ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
    <label class="f" style="margin-top:10px">Question text<textarea id="qe-text">${esc(q.text)}</textarea></label>
    <div class="grid g2" style="margin-top:10px"><label class="f">Scenario context <span class="hint">optional</span><textarea id="qe-ctx" style="min-height:60px">${esc(q.ctx || "")}</textarea></label><label class="f">Code block <span class="hint">optional</span><textarea id="qe-code" class="mono" style="min-height:60px">${esc(q.code || "")}</textarea></label></div>
    <label class="f" style="margin-top:10px">Data table <span class="hint">optional; one row per line, cells separated by |, first line is the header</span><textarea id="qe-data" style="min-height:60px">${esc(q.data ? [q.data.h].concat(q.data.r).map(r => r.join(" | ")).join("\n") : "")}</textarea></label>
    <div id="qe-choice" style="margin-top:12px;${["match", "open", "truefalse"].includes(q.type) ? "display:none" : ""}"><b class="small">Options</b> <span class="small muted">Tick every correct option. Explain why each wrong option is wrong.</span>
      <div id="qe-opts">${(opts.length ? opts : ["", "", "", ""]).map((o, i) => optRow(o, ans.includes(i), (Array.isArray(q.why) ? q.why : [])[i] || "")).join("")}</div><button class="btn sm" data-act="qeAddOpt" style="margin-top:6px">Add option</button></div>
    <div id="qe-tf" style="margin-top:12px;${q.type === "truefalse" ? "" : "display:none"}"><label class="f">The statement is<select id="qe-tfv"><option value="0" ${ans[0] === 0 ? "selected" : ""}>True</option><option value="1" ${ans[0] === 1 ? "selected" : ""}>False</option></select></label><label class="f" style="margin-top:8px">Why the opposite answer is wrong<input type="text" id="qe-tfwhy" value="${esc(q.type === "truefalse" ? (q.why || []).filter(Boolean)[0] || "" : "")}"></label></div>
    <div id="qe-match" style="margin-top:12px;${q.type === "match" ? "" : "display:none"}"><label class="f">Pairs <span class="hint">one per line: left => right</span><textarea id="qe-pairs">${esc((q.pairs || []).map(p => p.join(" => ")).join("\n"))}</textarea></label></div>
    <div id="qe-open" style="margin-top:12px;${q.type === "open" ? "" : "display:none"}"><label class="f">Rubric <span class="hint">one criterion per line: criterion | points</span><textarea id="qe-rubric">${esc((q.rubric || []).map(r => `${r.c} | ${r.p}`).join("\n"))}</textarea></label><label class="f" style="margin-top:8px">Model answer<textarea id="qe-model">${esc(q.model || "")}</textarea></label></div>
    <label class="f" style="margin-top:12px">Explanation of the correct answer<textarea id="qe-expl">${esc(q.type === "open" ? "" : q.explanation)}</textarea></label>
    <div class="grid g2" style="margin-top:10px"><label class="f">Concept tested <span class="hint">hidden from participants until they answer</span><input type="text" id="qe-concept" value="${esc(q.concept)}"></label><label class="f">Practical example <span class="hint">optional</span><input type="text" id="qe-ex" value="${esc(q.example || "")}"></label></div>
    <label class="f" style="margin-top:10px">Learning resources <span class="hint">resource keys or full URLs, comma separated</span><input type="text" id="qe-res" value="${esc((q.resources || []).join(", "))}" list="reskeys"><datalist id="reskeys">${Object.keys(RESOURCES).map(k => `<option value="${k}">`).join("")}</datalist></label>
    <div class="grid g4" style="margin-top:10px"><label class="f">Status<select id="qe-status">${["active", "draft", "retired"].map(s => `<option ${q.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><label class="f">Last verified<input type="date" id="qe-ver" value="${esc(q.verified || "")}"></label><label class="f">Review every (days)<input type="number" id="qe-rd" value="${q.reviewDays || 365}"></label><label class="f">Time estimate (s)<input type="number" id="qe-time" value="${q.time || ""}" placeholder="auto"></label></div>
    <div class="grid g3" style="margin-top:10px"><label class="check" style="align-self:end"><input type="checkbox" id="qe-trend" ${q.trend ? "checked" : ""}> Trend question</label><label class="f">Maturity<select id="qe-mat"><option value="">n/a</option>${MATURITY.map(m => `<option ${q.maturity === m ? "selected" : ""}>${m}</option>`).join("")}</select></label><label class="f">Source<input type="text" id="qe-src" value="${esc(q.source || "")}"></label></div>
    <input type="hidden" id="qe-id" value="${esc(isNew ? "" : q.id)}"><input type="hidden" id="qe-origin" value="${esc(q.origin || "admin")}">
    <div class="row" style="margin-top:16px">${!isNew ? `<button class="btn danger" data-act="delQ" data-id="${q.id}">Delete</button>` : ""}${fl.length ? `<button class="btn" data-act="resolveFlagsFor" data-id="${q.id}">Resolve reports</button>` : ""}<span class="spacer"></span><button class="btn" data-act="qeVerifyToday">Set verified to today</button><button class="btn primary" data-act="saveQ">Save question</button></div>`, { wide: true, sticky: true });
}
function optRow(text, correct, why) { return `<div class="grid" style="grid-template-columns:auto 1fr 1fr auto;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" class="qe-ok" ${correct ? "checked" : ""} aria-label="Correct"><input type="text" class="qe-opt" value="${esc(text)}" placeholder="Option"><input type="text" class="qe-why" value="${esc(why)}" placeholder="Why it's wrong (leave empty if correct)"><button class="btn sm ghost" data-act="qeDelOpt" aria-label="Remove option">✕</button></div>`; }
ACT.qeCat = el => { $("#qe-sub").innerHTML = Object.entries(CAT[el.value].subs).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join(""); };
ACT.qeType = el => { const t = el.value; $("#qe-choice").style.display = ["match", "open", "truefalse"].includes(t) ? "none" : ""; $("#qe-tf").style.display = t === "truefalse" ? "" : "none"; $("#qe-match").style.display = t === "match" ? "" : "none"; $("#qe-open").style.display = t === "open" ? "" : "none"; };
ACT.qeAddOpt = () => $("#qe-opts").insertAdjacentHTML("beforeend", optRow("", false, ""));
ACT.qeDelOpt = el => el.parentElement.remove();
ACT.qeVerifyToday = () => { $("#qe-ver").value = isoDay(nowTs()); };
function readQEditor() {
  const type = $("#qe-type").value, cat = $("#qe-cat").value, errs = [];
  const q = { cat, sub: $("#qe-sub").value, diff: $("#qe-diff").value, type, text: $("#qe-text").value.trim(), explanation: $("#qe-expl").value.trim(), concept: $("#qe-concept").value.trim(),
    resources: $("#qe-res").value.split(",").map(s => s.trim()).filter(Boolean), status: $("#qe-status").value, verified: $("#qe-ver").value, reviewDays: +$("#qe-rd").value || 365,
    trend: $("#qe-trend").checked, source: $("#qe-src").value.trim(), origin: $("#qe-origin").value || "admin" };
  const ctx = $("#qe-ctx").value.trim(), code = $("#qe-code").value.replace(/\s+$/, ""), dataTxt = $("#qe-data").value.trim(), ex = $("#qe-ex").value.trim();
  if (ctx) q.ctx = ctx; if (code) q.code = code; if (ex) q.example = ex;
  if (dataTxt) { const rows = dataTxt.split("\n").map(r => r.split("|").map(c => c.trim())); q.data = { h: rows[0], r: rows.slice(1) }; }
  if ($("#qe-mat").value) q.maturity = $("#qe-mat").value;
  if (q.trend && !q.maturity) errs.push("Trend questions need a maturity label.");
  if (!q.text) errs.push("Question text is required.");
  if (!q.concept) errs.push("Add the concept being tested.");
  if (!q.resources.length) errs.push("Add at least one learning resource.");
  q.resources.forEach(r => { if (!resource(r)) errs.push(`Unknown resource key: ${r}`); });
  if (isChoice(q) && type !== "truefalse") {
    const rows = $$("#qe-opts > div").map(r => ({ o: r.querySelector(".qe-opt").value.trim(), ok: r.querySelector(".qe-ok").checked, why: r.querySelector(".qe-why").value.trim() })).filter(r => r.o);
    q.options = rows.map(r => r.o); q.answer = rows.map((r, i) => r.ok ? i : -1).filter(i => i >= 0); q.why = rows.map(r => r.ok ? "" : r.why);
    if (q.options.length < 2) errs.push("Add at least two options.");
    if (!q.answer.length) errs.push("Mark at least one correct option.");
    if (rows.some(r => !r.ok && !r.why)) errs.push("Explain why each wrong option is wrong.");
    q.select = (type === "multi" || q.answer.length > 1) ? "many" : "one";
    if (q.select === "many" && !/select all/i.test(q.text)) q.text += " (Select all that apply)";
    if (!q.explanation) errs.push("Add an explanation.");
  } else if (type === "truefalse") {
    const v = +$("#qe-tfv").value, why = $("#qe-tfwhy").value.trim();
    q.options = ["True", "False"]; q.answer = [v]; q.why = v === 0 ? ["", why] : [why, ""]; q.select = "one";
    if (!why) errs.push("Explain why the opposite answer is wrong."); if (!q.explanation) errs.push("Add an explanation.");
  } else if (type === "match") {
    q.pairs = $("#qe-pairs").value.split("\n").map(l => l.split("=>").map(s => s.trim())).filter(p => p.length === 2 && p[0] && p[1]);
    if (q.pairs.length < 3) errs.push("Match questions need at least three pairs."); if (!q.explanation) errs.push("Add an explanation.");
  } else if (type === "open") {
    q.rubric = $("#qe-rubric").value.split("\n").map(l => { const [c, p] = l.split("|"); return { c: (c || "").trim(), p: parseInt(p, 10) || 0 }; }).filter(r => r.c && r.p > 0);
    q.model = $("#qe-model").value.trim(); q.explanation = q.model;
    if (q.rubric.length < 2) errs.push("Add at least two rubric criteria with points."); if (!q.model) errs.push("Add a model answer.");
  }
  const t = +$("#qe-time").value; q.time = t || ({ easy: 45, medium: 75, hard: 120 }[q.diff] + (q.data || q.code || q.ctx ? 30 : 0) + (type === "match" ? 30 : 0) + (type === "open" ? 300 : 0));
  if (q.status === "active" && !q.verified) errs.push("Active questions need a verification date. Check the facts against the source, then set the date.");
  return { q, errs };
}
ACT.saveQ = async () => {
  const { q, errs } = readQEditor(); if (errs.length) { UI.toast(errs[0]); return; }
  const id = $("#qe-id").value || nextId(q.cat), old = S.bankById[id];
  q.id = id; q.version = old ? (old.version || 1) + 1 : 1; q.updatedAt = nowTs(); q.updatedBy = S.uid; q.createdAt = old ? (old.createdAt || nowTs()) : nowTs();
  if (old && old.cat !== q.cat) { UI.toast("Category can't change for an existing question. Create a new one instead."); return; }
  const dup = S.bank.filter(x => x.id !== id && x.cat === q.cat).map(x => ({ x, s: jaccard(x.text, q.text) })).sort((a, b) => b.s - a.s)[0];
  if (dup && dup.s > 0.7 && !(await UI.confirm(`This looks very similar to ${dup.x.id}: "${dup.x.text.slice(0, 120)}". Save anyway?`, "Save anyway"))) { openQEditor(q); return; }
  await Bank.write([q]);
  UI.closeModal(); UI.toast(`Saved ${id}`); UI.refresh();
};
ACT.delQ = async el => {
  if (!(await UI.confirm("Delete this question permanently? Past answers keep their records, but reviews of them will lose the question text. Retiring is usually better.", "Delete"))) return;
  await Bank.remove(el.dataset.id); UI.closeModal(); UI.refresh();
};
ACT.exportBank = () => saveFile(`seo-question-bank-${isoDay(nowTs())}.json`, JSON.stringify(S.bank.map(q => fullQ(q.id)), null, 1));
ACT.importBank = () => {
  UI.modal("Import questions", `<p class="small">Choose a JSON file containing an array of questions in this platform's format, for example <b>private-question-bank/questions.json</b> (it came in the zip, outside the website folder) or a previous export. Existing IDs are updated; new IDs are added. Answers are stored separately from the questions participants download.</p>
    <input type="file" id="imp-file" accept=".json,application/json"><label class="check small" style="margin-top:10px"><input type="checkbox" id="imp-skip"> Skip questions that already exist</label><div id="imp-status" class="small muted" style="margin-top:10px"></div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-act="runImport">Import</button></div>`);
};
ACT.runImport = async el => {
  const file = $("#imp-file").files[0]; if (!file) { UI.toast("Choose a file."); return; }
  let arr; try { arr = JSON.parse(await file.text()); } catch (e) { UI.toast("That file isn't valid JSON."); return; }
  if (!Array.isArray(arr)) { UI.toast("Expected an array of questions."); return; }
  const skip = $("#imp-skip").checked, st = $("#imp-status"); let bad = 0, skipped = 0; const ok = [];
  for (const q of arr) {
    if (!q || !q.id || !CAT[q.cat] || !q.text || !q.type || !DIFFS.includes(q.diff) || !/^[A-Za-z0-9_\-.~:@+]+$/.test(q.id)) { bad++; continue; }
    if (q.type === "match" && !Array.isArray(q.pairs)) { bad++; continue; }
    if (skip && S.bankById[q.id]) { skipped++; continue; }
    ok.push(q);
  }
  el.disabled = true; st.textContent = `Importing ${ok.length} questions…`;
  try { await Bank.write(ok); } catch (e) { el.disabled = false; st.textContent = "Import failed: " + (e.message || e.code); return; }
  st.textContent = `Done. Imported ${ok.length}, skipped ${skipped}, invalid ${bad}.`; UI.toast(`Imported ${ok.length} questions`); UI.refresh();
};

/* ---------- flags and reviews ---------- */
VIEWS["team-inbox"] = () => {
  const w = needAdmin(); if (w) return w;
  const tab = S.filters.inboxTab || "reviews";
  const flags = [], reviews = [];
  for (const ib of S.admin.inboxes) { Object.values(ib.flags || {}).forEach(f => flags.push(Object.assign({ owner: ib._id }, f))); Object.values(ib.reviews || {}).forEach(r => reviews.push(Object.assign({ owner: ib._id }, r))); }
  const openF = flags.filter(f => f.status === "open"), pend = reviews.filter(r => r.status === "pending");
  let h = `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>Flags and reviews</h1><p>Open-response answers awaiting rubric scoring, and questions people reported as wrong, ambiguous or outdated.</p></div><button class="btn" data-act="reloadTeam">Refresh</button></div>
    <div class="tabs" role="tablist">${[["reviews", `Rubric reviews (${pend.length})`], ["flags", `Question reports (${openF.length})`], ["done", "Resolved"]].map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-act="inboxTab" data-t="${k}">${l}</button>`).join("")}</div>`;
  if (tab === "reviews") {
    h += pend.length ? pend.sort((a, b) => a.ts - b.ts).map(r => { const q = full(r.qid); if (!q) return ""; const max = sum(q.rubric, x => x.p);
      return `<article class="rv"><div class="rv-head"><b>${esc(pname(r.uid))}</b><span>${fmtDateTime(r.ts)}</span><span>${esc(q.id)}</span>${diffChip(q.diff)}</div><h4>${esc(q.text)}</h4>
        <div class="ctx small" style="white-space:pre-wrap">${esc(r.resp)}</div>
        <div class="grid g2"><div><b class="small">Rubric</b>${q.rubric.map((c, i) => `<label class="check small" style="margin-top:6px"><input type="number" min="0" max="${c.p}" value="0" class="rb-${esc(r.rid)}" data-i="${i}" style="width:64px"> <span>${esc(c.c)} <span class="muted">(max ${c.p})</span></span></label>`).join("")}<p class="small muted">Out of ${max} points.</p></div>
        <div><details><summary>Model answer</summary><p class="small">${esc(q.model)}</p></details><label class="f" style="margin-top:8px">Feedback for the person<textarea id="cm-${esc(r.rid)}" style="min-height:70px"></textarea></label></div></div>
        <div class="row" style="margin-top:10px"><span class="spacer"></span><button class="btn sm primary" data-act="saveGrade" data-rid="${esc(r.rid)}" data-owner="${esc(r.owner)}">Save score</button></div></article>`; }).join("") : empty("No answers awaiting review", "Open-response answers appear here after someone submits a test containing one.");
  } else if (tab === "flags") {
    const byQ = groupBy(openF, f => f.qid);
    h += Object.keys(byQ).length ? Object.entries(byQ).map(([qid, fs]) => { const q = full(qid);
      return `<article class="rv"><div class="rv-head"><b>${esc(qid)}</b>${q ? diffChip(q.diff) + `<span>${esc(CAT[q.cat].short)}</span>` : "<span>Question removed</span>"}<span>${fs.length} report${fs.length > 1 ? "s" : ""}</span></div>${q ? `<h4>${esc(q.text)}</h4><p class="small"><b>Marked answer:</b> ${esc(correctLabel(q))}</p>` : ""}
        <ul class="small">${fs.map(f => `<li><b>${esc(f.reason)}</b> from ${esc(pname(f.uid))} on ${fmtDate(f.ts)}: ${esc(f.note || "(no detail)")}</li>`).join("")}</ul>
        <div class="row">${q ? `<button class="btn sm primary" data-act="editQ" data-id="${q.id}">Edit question</button>` : ""}<button class="btn sm" data-act="resolveFlagsFor" data-id="${esc(qid)}">Mark resolved</button><button class="btn sm ghost" data-act="dismissFlags" data-id="${esc(qid)}">Dismiss</button></div></article>`; }).join("") : empty("No open reports", "When someone reports a problem with a question, it appears here.");
  } else {
    const doneF = flags.filter(f => f.status !== "open"), doneR = reviews.filter(r => r.status !== "pending");
    h += `<div class="tw"><table><thead><tr><th>Type</th><th>Question</th><th>Person</th><th>Outcome</th><th>Date</th></tr></thead><tbody>${doneR.map(r => `<tr><td>Rubric review</td><td>${esc(r.qid)}</td><td>${esc(pname(r.uid))}</td><td>${r.points}/${r.max}</td><td>${fmtDate(r.gradedAt)}</td></tr>`).concat(doneF.map(f => `<tr><td>Report</td><td>${esc(f.qid)}</td><td>${esc(pname(f.uid))}</td><td>${esc(f.status)}${f.resolution ? ": " + esc(f.resolution) : ""}</td><td>${fmtDate(f.resolvedAt)}</td></tr>`)).join("") || `<tr><td colspan="5" class="muted">Nothing resolved yet.</td></tr>`}</tbody></table></div>`;
  }
  return h;
};
ACT.inboxTab = el => { S.filters.inboxTab = el.dataset.t; UI.refresh(); };
async function setFlagStatus(qid, status) {
  const note = status === "resolved" ? "Question reviewed and updated if needed" : "No change needed";
  for (const ib of S.admin.inboxes) {
    const upd = {};
    Object.values(ib.flags || {}).forEach(f => { if (f.qid === qid && f.status === "open") { upd[f.fid] = { status, resolvedAt: nowTs(), resolvedBy: S.uid, resolution: note }; Object.assign(f, upd[f.fid]); } });
    if (Object.keys(upd).length) await Store.merge(P.inbox(ib._id), { flags: upd }).catch(() => {});
  }
  Admin.counts();
}
ACT.resolveFlagsFor = async el => { await setFlagStatus(el.dataset.id, "resolved"); UI.closeModal(); UI.renderShell(); UI.route(); UI.toast("Reports resolved"); };
ACT.dismissFlags = async el => { await setFlagStatus(el.dataset.id, "dismissed"); UI.renderShell(); UI.route(); };
function findReview(owner, rid) { const ib = S.admin.inboxes.find(x => x._id === owner); return ib && ib.reviews && ib.reviews[rid]; }
ACT.saveGrade = async el => {
  const owner = el.dataset.owner, rid = el.dataset.rid, r = findReview(owner, rid), q = full(r.qid);
  const pts = $$(".rb-" + CSS.escape(rid)).map((i, k) => Math.max(0, Math.min(q.rubric[k].p, Number(i.value) || 0)));
  const points = sum(pts), max = sum(q.rubric, x => x.p), comment = $("#cm-" + CSS.escape(rid)).value.trim();
  el.disabled = true;
  try {
    const ans = await Store.get(P.answer(r.uid, r.aid)); const items = ans.items, it = items.find(i => i.qid === r.qid);
    Object.assign(it, { credit: points / max, correct: points / max >= 0.75, pending: false, graded: { points, max, perCriterion: pts, comment, by: S.uid, ts: nowTs() } });
    await Store.set(P.answer(r.uid, r.aid), Object.assign({}, ans, { items }));
    const att = await Store.get(P.attempt(r.uid, r.aid)); const summary = Object.assign(summarize(items), att.summary && att.summary.adaptive ? { adaptive: att.summary.adaptive } : {});
    await Store.update(P.attempt(r.uid, r.aid), { summary });
    const atts = (await Store.list(P.attempts(r.uid))).map(a => Object.assign({ id: a._id }, a)), answers = Object.fromEntries((await Store.list(P.answers(r.uid))).map(a => [a._id, a.items || []]));
    const s = computeSummary(atts, answers); await Store.update(P.person(r.uid), { summary: s.summary, timeline: s.timeline });
    const lb = await Store.get(P.leader(r.uid)).catch(() => null);
    if (lb) await Store.merge(P.leader(r.uid), { overall: s.summary.overall, level: s.summary.level, coverage: s.summary.coverage, accuracy: s.summary.accuracy, updatedAt: nowTs() }).catch(() => {});
    const upd = { status: "graded", gradedAt: nowTs(), points, max, by: S.uid }; await Store.merge(P.inbox(owner), { reviews: { [rid]: upd } }); Object.assign(r, upd);
    const p = S.admin.people.find(x => x.id === r.uid); if (p) Object.assign(p, { summary: s.summary, timeline: s.timeline }); delete S.admin.cache[r.uid];
    if (r.uid === S.uid) { S.answers[r.aid] = items; const a = S.attempts.find(x => x.id === r.aid); if (a) a.summary = summary; S.profile.summary = s.summary; S.profile.timeline = s.timeline; invalidateMine(); }
    Admin.counts(); UI.renderShell(); UI.route(); UI.toast(`Scored ${points}/${max}`);
  } catch (e) { console.error(e); el.disabled = false; UI.toast("The score couldn't be saved."); }
};

/* ---------- trend library ---------- */
VIEWS["team-trends"] = () => {
  const items = S.trends.slice().sort((a, b) => String(a.verified || "").localeCompare(String(b.verified || "")));
  return `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>Trend library</h1><p>Items shown on the SEO Trends page. Keep each one's maturity label and verification date current; items unverified for 90 days are marked as due for review.</p></div><div class="row"><button class="btn" data-act="importTrends">Import JSON</button><button class="btn primary" data-act="editTrend">Add trend</button></div></div>
  ${items.length ? `<div class="tw"><table><thead><tr><th>Trend</th><th>Area</th><th>Maturity</th><th>Last verified</th><th></th></tr></thead><tbody>${items.map(t => { const due = !t.verified || (nowTs() - new Date(t.verified).getTime()) > 90 * DAY; return `<tr><td>${esc(t.title)}</td><td>${esc(t.area || "")}</td><td>${matChip(t.maturity)}</td><td class="${due ? "delta-down" : ""}">${esc(t.verified || "–")}${due ? " (due)" : ""}</td><td class="r"><button class="btn sm" data-act="trendVerified" data-id="${esc(t._id || t.id)}">Mark verified today</button> <button class="btn sm" data-act="editTrend" data-id="${esc(t._id || t.id)}">Edit</button></td></tr>`; }).join("")}</tbody></table></div>` : empty("No trend items", "Import private-question-bank/trends.json to load the 16 starter items, or add your own.", `<button class="btn primary" data-act="importTrends">Import JSON</button>`)}`;
};
ACT.importTrends = () => {
  UI.modal("Import trend items", `<p class="small">Choose a JSON array of trend items, such as <b>private-question-bank/trends.json</b> from the zip.</p><input type="file" id="tri-file" accept=".json,application/json"><div id="tri-status" class="small muted" style="margin-top:10px"></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-act="runImportTrends">Import</button></div>`);
};
ACT.runImportTrends = async el => {
  const file = $("#tri-file").files[0]; if (!file) { UI.toast("Choose a file."); return; }
  let arr; try { arr = JSON.parse(await file.text()); } catch (e) { UI.toast("That file isn't valid JSON."); return; }
  if (!Array.isArray(arr)) { UI.toast("Expected an array."); return; }
  const ok = arr.filter(t => t && t.id && t.title && t.summary && /^[A-Za-z0-9_\-.~:@+]+$/.test(t.id));
  el.disabled = true;
  await Store.batch(ok.map(t => ({ op: "set", path: P.trend(t.id), data: t })));
  S.trends = S.trends.filter(x => !ok.some(t => t.id === (x._id || x.id))).concat(ok.map(t => Object.assign({ _id: t.id }, t)));
  UI.closeModal(); UI.toast(`Imported ${ok.length} trend items`); UI.refresh();
};
ACT.editTrend = el => {
  const t = S.trends.find(x => (x._id || x.id) === (el && el.dataset.id)) || { title: "", area: "", maturity: "emerging", verified: isoDay(nowTs()), summary: "", res: "", url: "", sourceTitle: "" };
  UI.modal(t.id ? "Edit trend" : "Add trend", `<label class="f">Title<input type="text" id="tr-title" value="${esc(t.title)}"></label><div class="grid g3" style="margin-top:10px"><label class="f">Area<input type="text" id="tr-area" value="${esc(t.area || "")}"></label><label class="f">Maturity<select id="tr-mat">${MATURITY.map(m => `<option ${t.maturity === m ? "selected" : ""}>${m}</option>`).join("")}</select></label><label class="f">Last verified<input type="date" id="tr-ver" value="${esc(t.verified || "")}"></label></div>
    <label class="f" style="margin-top:10px">Summary<textarea id="tr-sum">${esc(t.summary)}</textarea></label><div class="grid g3" style="margin-top:10px"><label class="f">Resource key<input type="text" id="tr-res" value="${esc(t.res || "")}" list="reskeys2"><datalist id="reskeys2">${Object.keys(RESOURCES).map(k => `<option value="${k}">`).join("")}</datalist></label><label class="f">Or source URL<input type="text" id="tr-url" value="${esc(t.url || "")}"></label><label class="f">Source title<input type="text" id="tr-st" value="${esc(t.sourceTitle || "")}"></label></div>
    <div class="row" style="justify-content:space-between;margin-top:14px">${t.id ? `<button class="btn danger" data-act="delTrend" data-id="${esc(t._id || t.id)}">Delete</button>` : "<span></span>"}<button class="btn primary" data-act="saveTrend" data-id="${esc(t._id || t.id || "")}">Save</button></div>`);
};
ACT.saveTrend = async el => {
  const id = el.dataset.id || $("#tr-title").value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) || uidgen();
  const t = { id, title: $("#tr-title").value.trim(), area: $("#tr-area").value.trim(), maturity: $("#tr-mat").value, verified: $("#tr-ver").value, summary: $("#tr-sum").value.trim(), res: $("#tr-res").value.trim(), url: $("#tr-url").value.trim(), sourceTitle: $("#tr-st").value.trim() };
  if (!t.title || !t.summary) { UI.toast("Add a title and summary."); return; }
  if (t.url && !/^https?:\/\//.test(t.url)) { UI.toast("Source URL must start with http."); return; }
  await Store.set(P.trend(id), t); S.trends = S.trends.filter(x => (x._id || x.id) !== id).concat([Object.assign({ _id: id }, t)]); UI.closeModal(); UI.refresh();
};
ACT.delTrend = async el => { await Store.del(P.trend(el.dataset.id)); S.trends = S.trends.filter(x => (x._id || x.id) !== el.dataset.id); UI.closeModal(); UI.refresh(); };
ACT.trendVerified = async el => { const t = S.trends.find(x => (x._id || x.id) === el.dataset.id); t.verified = isoDay(nowTs()); await Store.update(P.trend(el.dataset.id), { verified: t.verified }); UI.refresh(); };

/* ---------- reports ---------- */
VIEWS["team-reports"] = () => {
  const w = needAdmin(); if (w) return w;
  const people = S.admin.people.filter(p => p.joinedAt);
  return `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>Reports and exports</h1><p>Download results for analysis or sharing.</p></div></div>
  <section class="panel" style="margin-bottom:16px"><div class="row"><div style="flex:1;min-width:260px"><h2>Shareable snapshot of every page</h2><p class="small muted" style="margin-top:6px">Exports the platform's pages as standalone HTML that opens in any browser, for people who don't have an account. Charts become images, buttons and forms are removed, and the data is frozen as of the export.</p></div><button class="btn primary" data-act="openSnapshot">Export pages</button></div></section>
  <div class="grid g2"><section class="panel"><h2>Team report</h2><p class="small muted">A readable HTML report with competency, heatmap and most common gaps.</p><button class="btn primary" data-act="teamReport">Download team report</button></section>
  <section class="panel"><h2>Individual report</h2><p class="small muted">Answers the five questions for one person, with their category scores and history.</p><div class="row"><select id="rp-person" style="max-width:260px">${people.map(p => `<option value="${p.id}">${esc(pname(p.id))}</option>`).join("")}</select><button class="btn primary" data-act="indivReport">Download</button></div></section>
  <section class="panel"><h2>Data exports (CSV)</h2><div class="stack"><div class="row"><button class="btn" data-act="exportTeamCsv">Participant summary</button><span class="small muted">One row per person with overall, level, difficulty accuracy and all 16 category scores.</span></div>
    <div class="row"><button class="btn" data-act="exportAttemptsCsv">All test attempts</button><span class="small muted">Every completed attempt with scores by category.</span></div>
    <div class="row"><button class="btn" data-act="exportAnswersCsv">All individual answers</button><span class="small muted">Every answer with question, difficulty, correctness and credit.</span></div></div></section>
  <section class="panel"><h2>Question bank</h2><p class="small muted">Full bank with answers as JSON, for backup or re-import.</p><button class="btn" data-act="exportBank">Export question bank</button></section></div>`;
};
ACT.exportTeamCsv = () => {
  const rows = [["name", "email", "team", "title", "overall", "level", "categories_assessed", "tests", "answers", "accuracy", "easy_acc", "medium_acc", "hard_acc", "last_active", "training_reasons", ...CATS.map(c => c.id)]];
  for (const p of S.admin.people.filter(x => x.joinedAt)) { const s = p.summary || {}; rows.push([pname(p.id), p.email, p.team, p.title, s.overall, s.level, s.coverage, s.attempts, s.answered, s.accuracy, s.diff && s.diff.easy, s.diff && s.diff.medium, s.diff && s.diff.hard, p.lastActive ? isoDay(p.lastActive) : "", trainingReasons(p).join("; "), ...CATS.map(c => s.cats && s.cats[c.id] ? s.cats[c.id].s : "")]); }
  saveFile(`seo-participants-${isoDay(nowTs())}.csv`, toCSV(rows));
};
async function allPeopleData() { const out = []; for (const p of S.admin.people.filter(x => x.joinedAt)) out.push({ p, d: await Admin.person(p.id) }); return out; }
ACT.exportAttemptsCsv = async () => {
  UI.toast("Collecting attempts…"); const all = await allPeopleData();
  const rows = [["name", "team", "date", "test", "type", "score", "level", "correct", "questions", "accuracy", "unanswered", "pending", "easy_acc", "medium_acc", "hard_acc", "duration_min", ...CATS.map(c => c.id)]];
  for (const { p, d } of all) for (const a of d.attempts.filter(x => x.status === "completed")) { const s = a.summary; rows.push([pname(p.id), p.team, isoDay(a.completedAt), a.title, a.mode, s.score, s.level, s.correct, s.n, s.accuracy, s.unanswered, s.pending, s.byDiff.easy.acc, s.byDiff.medium.acc, s.byDiff.hard.acc, Math.round((a.durationMs || 0) / 60000), ...CATS.map(c => s.byCat[c.id] ? s.byCat[c.id].score : "")]); }
  saveFile(`seo-attempts-${isoDay(nowTs())}.csv`, toCSV(rows));
};
ACT.exportAnswersCsv = async () => {
  UI.toast("Collecting answers…"); const all = await allPeopleData();
  const rows = [["name", "team", "date", "test", "question_id", "category", "subcategory", "difficulty", "type", "answered", "correct", "credit", "pending", "concept"]];
  for (const { p, d } of all) for (const a of d.attempts.filter(x => x.status === "completed")) for (const it of (d.answers[a.id] || [])) rows.push([pname(p.id), p.team, isoDay(a.completedAt), a.title, it.qid, it.cat, it.sub, it.diff, it.type, it.answered, it.correct, it.credit == null ? "" : round1(it.credit), it.pending, it.concept || conceptOf(it.qid) || ""]);
  saveFile(`seo-answers-${isoDay(nowTs())}.csv`, toCSV(rows));
};
ACT.indivReport = async () => { const pid = $("#rp-person").value; if (!pid) return; await ACT.personReport({ dataset: { pid } }); };
ACT.teamReport = () => {
  const people = S.admin.people.filter(p => p.joinedAt), ca = catAverages(people, { from: "", to: "" });
  const cls = s => s == null ? "cn" : s < 40 ? "c0" : s < 60 ? "c1" : s < 75 ? "c2" : "c3";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SEO team competency report</title><style>${REPORT_CSS}</style></head><body>
<h1>${esc(S.config.siteName)}: competency report</h1><p class="muted">${people.length} people. Generated ${fmtDate(nowTs())}.</p>
<h2>Average by category</h2><table><tr><th>Category</th><th>Average</th><th>People assessed</th></tr>${CATS.map(c => `<tr><td>${esc(c.name)}</td><td>${fmtScore(ca[c.id].avg)}</td><td>${ca[c.id].n}</td></tr>`).join("")}</table>
<h2>Heatmap</h2><div style="overflow-x:auto"><table><tr><th>Person</th><th>Overall</th>${CATS.map(c => `<th>${esc(c.short)}</th>`).join("")}</tr>${people.map(p => { const s = p.summary || {}; return `<tr><td>${esc(pname(p.id))}</td><td class="cell ${cls(s.overall)}">${fmtScore(s.overall)}</td>${CATS.map(c => { const v = s.cats && s.cats[c.id] ? s.cats[c.id].s : null; return `<td class="cell ${cls(v)}">${v == null ? "–" : Math.round(v)}</td>`; }).join("")}</tr>`; }).join("")}</table></div>
<h2>People requiring additional training</h2><ul>${people.map(p => ({ p, r: trainingReasons(p) })).filter(x => x.r.length).map(x => `<li><b>${esc(pname(x.p.id))}</b>: ${esc(x.r.join("; "))}</li>`).join("") || "<li>None.</li>"}</ul></body></html>`;
  saveFile(`seo-team-report-${isoDay(nowTs())}.html`, html);
};

/* ---------- settings and rules ---------- */
VIEWS["team-config"] = () => {
  const s = S.settings, c = S.config;
  const num = (id, v, label, hint) => `<label class="f">${label}${hint ? ` <span class="hint">${hint}</span>` : ""}<input type="number" id="${id}" value="${v}"></label>`;
  return `<div class="page-head"><div><div class="eyebrow">Admin console</div><h1>Settings and rules</h1><p>Site details, certificates and scoring. Scoring changes apply to new tests; existing results are re-scored the next time each person's profile updates.</p></div></div>
  <section class="panel"><h2>Site</h2><div class="grid g3"><label class="f">Site name<input type="text" id="cf-site" value="${esc(c.siteName)}"></label><label class="f">Tagline<input type="text" id="cf-tag" value="${esc(c.tagline)}"></label><label class="f">Certificate issuer<input type="text" id="cf-iss" value="${esc(c.issuer || c.siteName)}"></label></div>
    <div class="grid g4" style="margin-top:10px">${num("cf-pass", c.passMark, "Certificate pass mark", "%")}${num("cf-off", c.dailyOffset, "Daily reset offset", "minutes from UTC; 330 = India")}<label class="check" style="align-self:end"><input type="checkbox" id="cf-lb" ${c.leaderboard !== false ? "checked" : ""}> Show the leaderboard</label><label class="f">Registration<select id="cf-reg"><option value="open" ${c.registration !== "invite" ? "selected" : ""}>Anyone with the link</option><option value="invite" ${c.registration === "invite" ? "selected" : ""}>Invite-only</option></select></label></div></section>
  <section class="panel section"><h2>Difficulty weights</h2><div class="grid g3">${num("cf-we", s.weights.easy, "Easy")}${num("cf-wm", s.weights.medium, "Medium")}${num("cf-wh", s.weights.hard, "Hard")}</div></section>
  <section class="panel section"><h2>Complete assessment</h2><div class="grid g4">${num("cf-cc", s.complete.count, "Questions")}${num("cf-ce", s.complete.mix.easy, "Easy", "count")}${num("cf-cm", s.complete.mix.medium, "Medium", "count")}${num("cf-ch", s.complete.mix.hard, "Hard", "count")}</div><div class="grid g4" style="margin-top:10px">${num("cf-ct", s.complete.minutes, "Minutes")}<label class="check" style="align-self:end"><input type="checkbox" id="cf-co" ${s.complete.includeOpen ? "checked" : ""}> Include one open-response question</label></div></section>
  <section class="panel section"><h2>Category assessment</h2><div class="grid g4">${num("cf-kc", s.category.count, "Questions")}${num("cf-ke", s.category.mix.easy, "Easy", "%")}${num("cf-km", s.category.mix.medium, "Medium", "%")}${num("cf-kh", s.category.mix.hard, "Hard", "%")}</div><div class="grid g4" style="margin-top:10px">${num("cf-kt", s.category.minutes, "Minutes")}<label class="check" style="align-self:end"><input type="checkbox" id="cf-ko" ${s.category.includeOpen ? "checked" : ""}> Include one open-response question</label></div></section>
  <section class="panel section"><h2>Adaptive, trends, quick quiz and daily challenge</h2><div class="grid g4">${num("cf-am", s.adaptive.max, "Adaptive max questions")}${num("cf-at", s.adaptive.minutes, "Adaptive minutes")}${num("cf-tc", s.trends.count, "Trends questions")}${num("cf-tt", s.trends.minutes, "Trends minutes")}${num("cf-qc", s.quick.count, "Quick quiz questions")}${num("cf-qt", s.quick.minutes, "Quick quiz minutes")}${num("cf-dc", s.daily.count, "Daily questions")}${num("cf-dt", s.daily.minutes, "Daily minutes")}</div></section>
  <section class="panel section"><h2>Competency model and team rules</h2><div class="grid g4">${num("cf-wc", s.window.cat, "Recent answers per category")}${num("cf-ws", s.window.sub, "Recent answers per subcategory")}${num("cf-ad", s.activeDays, "Active user window (days)")}${num("cf-tr", s.trainingThreshold, "Training threshold")}</div></section>
  <div class="row" style="margin-top:16px"><button class="btn primary" data-act="saveConfig">Save settings</button><button class="btn" data-act="resetConfig">Restore default scoring</button></div>`;
};
ACT.saveConfig = async () => {
  const v = id => Number($("#" + id).value);
  const s = { weights: { easy: v("cf-we"), medium: v("cf-wm"), hard: v("cf-wh") },
    complete: { count: v("cf-cc"), mix: { easy: v("cf-ce"), medium: v("cf-cm"), hard: v("cf-ch") }, minutes: v("cf-ct"), includeOpen: $("#cf-co").checked },
    category: { count: v("cf-kc"), mix: { easy: v("cf-ke"), medium: v("cf-km"), hard: v("cf-kh") }, minutes: v("cf-kt"), includeOpen: $("#cf-ko").checked },
    trends: Object.assign({}, S.settings.trends, { count: v("cf-tc"), minutes: v("cf-tt") }), adaptive: { max: v("cf-am"), minutes: v("cf-at") },
    quick: Object.assign({}, S.settings.quick, { count: v("cf-qc"), minutes: v("cf-qt") }), daily: { count: v("cf-dc"), minutes: v("cf-dt") },
    window: { cat: v("cf-wc"), sub: v("cf-ws") }, activeDays: v("cf-ad"), trainingThreshold: v("cf-tr") };
  if (s.complete.mix.easy + s.complete.mix.medium + s.complete.mix.hard !== s.complete.count) { UI.toast("Complete assessment difficulty counts must add up to the question count."); return; }
  if (s.category.mix.easy + s.category.mix.medium + s.category.mix.hard !== 100) { UI.toast("Category difficulty percentages must add up to 100."); return; }
  if ([s.weights.easy, s.weights.medium, s.weights.hard].some(x => !(x > 0))) { UI.toast("Weights must be positive."); return; }
  if (!(s.daily.count >= 1 && s.quick.count >= 1)) { UI.toast("Quiz sizes must be at least 1."); return; }
  const c = { siteName: $("#cf-site").value.trim() || DEFAULT_CONFIG.siteName, tagline: $("#cf-tag").value.trim(), issuer: $("#cf-iss").value.trim(), passMark: Math.min(100, Math.max(1, v("cf-pass") || 60)), dailyOffset: v("cf-off") || 0, leaderboard: $("#cf-lb").checked, registration: $("#cf-reg").value, settings: s, updatedAt: nowTs() };
  await Store.merge(P.config(), c); S.config = mergeConfig(Object.assign({}, S.config, c)); S.settings = mergeSettings(s); invalidateMine(); UI.renderShell(); UI.route(); UI.toast("Settings saved");
};
ACT.resetConfig = async () => { if (!(await UI.confirm("Restore the default scoring rules? Site settings are kept.", "Restore"))) return; await Store.merge(P.config(), { settings: clone(DEFAULT_SETTINGS) }); S.settings = mergeSettings(null); invalidateMine(); UI.refresh(); };

/* ---------- shareable snapshot (standalone HTML export) ---------- */
const SNAP_TEAM = [["team", "Team overview", "team-overview"], ["team-heatmap", "Competency heatmap", "competency-heatmap"], ["team-gaps", "Team knowledge gaps", "team-knowledge-gaps"], ["team-mocks", "Mock tests", "mock-tests"], ["team-assessments", "Assessments", "assessments"], ["team-trends", "Trend library", "trend-library"], ["team-config", "Settings and rules", "settings-and-rules"]];
const SNAP_MINE = [["dashboard", "Dashboard", "my-dashboard"], ["categories", "SEO categories", "seo-categories"], ["performance", "My performance", "my-performance"], ["gaps", "Knowledge gaps", "my-knowledge-gaps"], ["roadmap", "Learning roadmap", "my-learning-roadmap"], ["history", "Assessment history", "my-assessment-history"], ["trends", "SEO trends", "seo-trends"]];
ACT.openSnapshot = () => {
  const people = S.admin.people.filter(p => p.joinedAt);
  UI.modal("Export pages as standalone HTML", `<p class="small">Choose what to include. The export shows the data as it is right now and won't update.</p>
    <div class="stack" style="margin-top:12px">
      <label class="check"><input type="checkbox" id="sn-team" checked> <span><b>Team pages</b> <span class="muted small">(${SNAP_TEAM.map(x => x[1]).join(", ")})</span></span></label>
      <label class="check"><input type="checkbox" id="sn-people" checked> <span><b>A profile page for each person</b> <span class="muted small">(${people.length} people: the five questions, charts, category scores, gaps and history)</span></span></label>
      <label class="check"><input type="checkbox" id="sn-mine" checked> <span><b>My learning pages</b> <span class="muted small">(your own ${SNAP_MINE.map(x => x[1].toLowerCase()).join(", ")})</span></span></label>
      <label class="check"><input type="checkbox" id="sn-bank" checked> <span><b>Question list</b> <span class="muted small">(all ${S.bank.filter(q => q.status === "active").length} active questions, without answers or explanations)</span></span></label>
    </div>
    <fieldset style="border:0;padding:0;margin:16px 0 0"><legend class="small" style="font-weight:600;margin-bottom:6px">Format</legend>
      <label class="check"><input type="radio" name="sn-fmt" value="one" checked> <span>One HTML file with all pages and a menu to move between them <span class="muted small">(easiest to email)</span></span></label>
      <label class="check" style="margin-top:6px"><input type="radio" name="sn-fmt" value="zip"> <span>A ZIP with one HTML file per page</span></label></fieldset>
    <div class="banner warn" style="margin:16px 0 0"><span class="small">The export contains participants' names and scores. Anyone you send it to can read them and forward the file. Share it only with people who should see this data.</span></div>
    <div id="sn-status" class="small muted" style="margin-top:12px" role="status"></div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-act="runSnapshot">Export</button></div>`, { sticky: true });
};
function snapBankHtml() {
  const qs = S.bank.filter(q => q.status === "active").sort((a, b) => a.id.localeCompare(b.id));
  const byCat = groupBy(qs, q => q.cat);
  return `<div class="page-head"><div><h1>Question list</h1><p>${qs.length} active questions across 16 categories. Answers and explanations are not included.</p></div></div>
    <div class="tw"><table><thead><tr><th>Category</th><th class="r">Easy</th><th class="r">Medium</th><th class="r">Hard</th><th class="r">Total</th></tr></thead><tbody>${CATS.map(c => { const g = groupBy(byCat[c.id] || [], q => q.diff); return `<tr><td>${esc(c.name)}</td><td class="r num">${(g.easy || []).length}</td><td class="r num">${(g.medium || []).length}</td><td class="r num">${(g.hard || []).length}</td><td class="r num">${(byCat[c.id] || []).length}</td></tr>`; }).join("")}</tbody></table></div>
    ${CATS.map(c => `<section class="section"><h2>${esc(c.name)}</h2><div class="tw"><table><thead><tr><th>ID</th><th>Question</th><th>Subcategory</th><th>Difficulty</th><th>Type</th></tr></thead><tbody>${(byCat[c.id] || []).map(q => `<tr><td class="small num">${esc(q.id)}</td><td class="small">${esc(q.text)}</td><td class="small">${esc(c.subs[q.sub] || q.sub)}</td><td>${diffChip(q.diff)}</td><td class="small">${esc(TYPE_LABEL[q.type])}</td></tr>`).join("")}</tbody></table></div></section>`).join("")}`;
}
async function snapRender(page, linkFor) {
  Object.values(S.charts).forEach(c => { try { c.destroy(); } catch (e) {} }); S.charts = {};
  S.params = page.params || {}; UI.after = [];
  const view = $("#view");
  view.innerHTML = page.custom ? page.custom() : VIEWS[page.view]();
  const after = UI.after; UI.after = []; after.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  await new Promise(r => setTimeout(r, 80)); await new Promise(r => requestAnimationFrame(() => r()));
  view.querySelectorAll("canvas").forEach(cv => { try { const img = document.createElement("img"); img.src = cv.toDataURL("image/png"); img.alt = cv.closest(".panel") && cv.closest(".panel").querySelector("h2") ? cv.closest(".panel").querySelector("h2").textContent : "Chart"; img.className = "snap-chart"; cv.replaceWith(img); } catch (e) { cv.remove(); } });
  Object.values(S.charts).forEach(c => { try { c.destroy(); } catch (e) {} }); S.charts = {};
  const d = view.cloneNode(true);
  d.querySelectorAll("[data-act=openPerson][data-pid]").forEach(el => {
    const href = linkFor(el.dataset.pid); if (!href) return;
    const target = el.tagName === "TR" ? el.querySelector("td:nth-child(2)") : el;
    if (!target) return;
    if (el.tagName === "BUTTON") { const a = document.createElement("a"); a.href = href; a.innerHTML = el.innerHTML; el.replaceWith(a); }
    else target.innerHTML = `<a href="${esc(href)}">${target.innerHTML}</a>`;
  });
  d.querySelectorAll(".filters, .banner, .palette, .tabs, .run-foot").forEach(el => el.remove());
  d.querySelectorAll("input[type=checkbox], input[type=radio]").forEach(el => { const s = document.createElement("span"); s.textContent = el.checked ? "☑ " : "☐ "; el.replaceWith(s); });
  d.querySelectorAll("input, textarea").forEach(el => { const s = document.createElement("b"); s.className = "num"; s.textContent = el.value || "–"; el.replaceWith(s); });
  d.querySelectorAll("select").forEach(el => { const s = document.createElement("b"); s.textContent = el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent : ""; el.replaceWith(s); });
  d.querySelectorAll("button").forEach(el => el.remove());
  d.querySelectorAll("img").forEach(el => { if (!/^data:/.test(el.getAttribute("src") || "")) el.remove(); });
  d.querySelectorAll("[data-act],[data-change],[data-input],[data-to],[data-pid]").forEach(el => { ["data-act", "data-change", "data-input", "data-to", "data-pid", "data-cat", "data-sub", "data-mode", "data-aid", "data-qid", "data-id"].forEach(k => el.removeAttribute(k)); });
  d.querySelectorAll("tr.click").forEach(el => el.classList.remove("click"));
  d.querySelectorAll("canvas").forEach(el => el.remove());
  return d.innerHTML;
}
const SNAP_CSS = `.snap-js .snap-page{display:none}.snap-js .snap-page.on{display:block}img.snap-chart{width:100%;height:100%;object-fit:contain;display:block}.snap-note{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:10px 14px;border-radius:var(--radius);background:var(--surface-2);font-size:.85rem;color:var(--muted);margin-bottom:20px}.side .nav a{cursor:pointer}@media (max-width:860px){.side{position:static;transform:none;width:auto;height:auto;border-right:0;border-bottom:1px solid var(--line)}.shell{display:block}}@media print{.side{display:none}.snap-js .snap-page{display:block!important;break-after:page}}`;
const SNAP_JS = `document.documentElement.classList.add('snap-js');function show(){var id=decodeURIComponent((location.hash||'').slice(1));var pages=document.querySelectorAll('.snap-page');var el=document.getElementById(id);if(!el||!el.classList.contains('snap-page'))el=pages[0];for(var i=0;i<pages.length;i++)pages[i].classList.toggle('on',pages[i]===el);var links=document.querySelectorAll('.nav a');for(var j=0;j<links.length;j++){if(links[j].getAttribute('href')==='#'+el.id)links[j].setAttribute('aria-current','page');else links[j].removeAttribute('aria-current');}window.scrollTo(0,0);}window.addEventListener('hashchange',show);show();`;
function snapDoc(title, css, navHtml, bodyHtml, stamp, withScript) {
  return `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Sora:wght@600;700&display=swap" rel="stylesheet"><style>${css}\n${SNAP_CSS}</style></head><body><div class="shell"><aside class="side"><div class="brand"><div class="brand-mark">${BRAND_SVG}</div><div><b>${esc(S.config.siteName)}</b><span>Snapshot, ${esc(stamp)}</span></div></div><nav class="nav" aria-label="Pages">${navHtml}</nav></aside><main class="main"><div class="wrap"><div class="snap-note">Read-only snapshot exported ${esc(stamp)}${S.profile && S.profile.name ? " by " + esc(S.profile.name) : ""}. Data does not update.</div>${bodyHtml}</div></main></div>${withScript ? `<script>${SNAP_JS}<\/script>` : ""}</body></html>`;
}
async function snapCss() { try { const r = await fetch("css/styles.css"); if (r.ok) return await r.text(); } catch (e) {} return $$("style").map(s => s.textContent).join("\n"); }
ACT.runSnapshot = async el => {
  const want = { team: $("#sn-team").checked, people: $("#sn-people").checked, mine: $("#sn-mine").checked, bank: $("#sn-bank").checked };
  const fmt = ($$("input[name=sn-fmt]").find(i => i.checked) || {}).value || "one";
  if (!Object.values(want).some(Boolean)) { UI.toast("Choose at least one group of pages."); return; }
  const status = $("#sn-status"); el.disabled = true;
  const keep = { filters: S.filters, params: S.params, theme: document.documentElement.getAttribute("data-theme"), y: window.scrollY };
  const pages = [];
  try {
    if (fmt === "zip" && !window.JSZip) { status.textContent = "Loading the ZIP library…"; await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"); }
    status.textContent = "Loading team data…";
    if (!S.admin.loaded) await Admin.load();
    const people = S.admin.people.filter(p => p.joinedAt).sort((a, b) => pname(a.id).localeCompare(pname(b.id)));
    const used = new Set(), slug = s => { let b = String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page", x = b, i = 2; while (used.has(x)) x = `${b}-${i++}`; used.add(x); return x; };
    if (want.team) SNAP_TEAM.forEach(([v, t, f]) => pages.push({ group: "Team", view: v, title: t, id: slug(f) }));
    if (want.people) people.forEach(p => pages.push({ group: "People", view: "team-person", params: { pid: p.id }, title: pname(p.id), id: slug("person-" + pname(p.id)), pid: p.id }));
    if (want.mine) SNAP_MINE.forEach(([v, t, f]) => pages.push({ group: "My learning", view: v, title: t, id: slug(f) }));
    if (want.bank) pages.push({ group: "Reference", custom: snapBankHtml, title: "Question list", id: slug("question-list") });
    const byPid = Object.fromEntries(pages.filter(p => p.pid).map(p => [p.pid, p]));
    const linkFor = pid => byPid[pid] ? (fmt === "zip" ? byPid[pid].id + ".html" : "#" + byPid[pid].id) : null;
    S.snapshot = true; document.documentElement.setAttribute("data-theme", "light"); S.filters = {};
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i]; status.textContent = `Preparing page ${i + 1} of ${pages.length}: ${pg.title}…`;
      if (pg.pid) await Admin.person(pg.pid);
      pg.html = await snapRender(pg, linkFor);
    }
  } catch (e) {
    console.error(e); status.textContent = ""; UI.toast((e && e.message) || "The export failed."); el.disabled = false; return;
  } finally {
    S.snapshot = false; S.filters = keep.filters; S.params = keep.params;
    if (keep.theme == null) document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", keep.theme);
    UI.route(); window.scrollTo(0, keep.y);
  }
  const css = await snapCss(), stamp = new Date().toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), day = isoDay(nowTs());
  const groups = groupBy(pages, p => p.group);
  const nav = (hrefOf) => Object.entries(groups).map(([g, ps]) => `<div class="nav-group">${esc(g)}</div>` + ps.map(p => `<a href="${esc(hrefOf(p))}">${esc(p.title)}</a>`).join("")).join("");
  try {
    if (fmt === "one") {
      const body = pages.map(p => `<section class="snap-page" id="${p.id}">${p.html}</section>`).join("\n");
      await saveFile(`seo-skills-snapshot-${day}.html`, snapDoc(`${S.config.siteName} snapshot, ${stamp}`, css, nav(p => "#" + p.id), body, stamp, true));
    } else {
      const zip = new window.JSZip(), folder = zip.folder(`seo-skills-snapshot-${day}`);
      const hrefOf = p => p.id + ".html";
      pages.forEach((p, i) => {
        const navHtml = nav(hrefOf).replace(`href="${hrefOf(p)}"`, `href="${hrefOf(p)}" aria-current="page"`);
        const html = snapDoc(`${p.title}: ${S.config.siteName} snapshot`, css, navHtml, p.html, stamp, false);
        folder.file(hrefOf(p), html);
        if (i === 0) folder.file("index.html", html);
      });
      status.textContent = "Compressing…";
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      await saveFile(`seo-skills-snapshot-${day}.zip`, blob);
    }
    status.textContent = `Done: ${pages.length} pages exported.`;
  } catch (e) { console.error(e); UI.toast("The export couldn't be saved."); status.textContent = ""; }
  el.disabled = false;
};
