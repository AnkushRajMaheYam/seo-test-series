"use strict";
/* =========================================================================
   Authentication, invitations, onboarding and app boot.
   - Open registration: anyone can create an account (email + password).
   - Invite-only: only emails on the admin's invite list can join.
   - Invite emails are Firebase "email link" sign-in emails.
   ========================================================================= */
const fbReady = () => new Promise(res => { if (window.FB) res(); else window.addEventListener("fb-ready", () => res(), { once: true }); });
const siteUrl = () => location.origin + location.pathname;
const AUTH_ERR = {
  "auth/invalid-credential": "The email or password is incorrect.",
  "auth/wrong-password": "The email or password is incorrect.",
  "auth/user-not-found": "The email or password is incorrect.",
  "auth/invalid-login-credentials": "The email or password is incorrect.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-password": "Enter your password.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/operation-not-allowed": "This sign-in method isn't enabled yet. In Firebase, open Authentication > Sign-in method and enable Email/Password and Email link.",
  "auth/unauthorized-domain": "This website's domain isn't authorised. In Firebase, add it under Authentication > Settings > Authorized domains.",
  "auth/unauthorized-continue-uri": "This website's domain isn't authorised. In Firebase, add it under Authentication > Settings > Authorized domains.",
  "auth/invalid-action-code": "This sign-in link has expired or was already used. Request a new one.",
  "auth/expired-action-code": "This sign-in link has expired. Request a new one.",
  "auth/requires-recent-login": "For security, sign out and sign in again before changing your password.",
  "auth/network-request-failed": "Network error. Check your connection and try again."
};
const authErr = e => AUTH_ERR[e && e.code] || (e && e.message) || "Something went wrong.";

const Auth = {
  view: "signin", msg: null,
  render(view) {
    if (view) this.view = view;
    const c = S.config, open = c.registration !== "invite", v = this.view, m = this.msg;
    const qEmail = new URL(location.href).searchParams.get("email") || "";
    const msgHtml = m ? `<div class="msg ${m.ok ? "ok" : "err"}" role="${m.ok ? "status" : "alert"}">${esc(m.text)}</div>` : "";
    let card = "";
    if (v === "signin") card = `<h2>Sign in</h2><p class="muted small">Welcome back. Continue your SEO test series.</p>
      <form data-submit="signIn">${msgHtml}<label class="f">Email<input type="email" id="au-email" autocomplete="email" required value="${esc(qEmail)}"></label>
      <label class="f">Password<input type="password" id="au-pass" autocomplete="current-password" required></label>
      <button class="btn primary block lg" type="submit">Sign in</button></form>
      <div class="alt"><button class="linkbtn" data-act="authView" data-v="link">Email me a sign-in link</button> · <button class="linkbtn" data-act="authView" data-v="reset">Forgot password?</button></div>
      <div class="alt">${open ? `New here? <button class="linkbtn" data-act="authView" data-v="register">Create a free account</button>` : `Invited? <button class="linkbtn" data-act="authView" data-v="register">Create your account</button>`}</div>`;
    else if (v === "register") card = `<h2>${open ? "Create your account" : "Join by invitation"}</h2><p class="muted small">${open ? "Free access to every mock test, quiz and the leaderboard." : "This test series is invite-only. Use the exact email address your invitation was sent to; you'll verify it before starting."}</p>
      <form data-submit="register">${msgHtml}<label class="f">Full name<input type="text" id="au-name" autocomplete="name" required maxlength="80"></label>
      <label class="f">Email<input type="email" id="au-email" autocomplete="email" required value="${esc(qEmail)}"></label>
      <label class="f">Password <span class="hint">at least 6 characters</span><input type="password" id="au-pass" autocomplete="new-password" minlength="6" required></label>
      <button class="btn primary block lg" type="submit">Create account</button></form>
      <div class="alt">Already have an account? <button class="linkbtn" data-act="authView" data-v="signin">Sign in</button></div>`;
    else if (v === "link") card = `<h2>Sign in with an email link</h2><p class="muted small">We'll email you a one-time link. No password needed.</p>
      <form data-submit="sendLink">${msgHtml}<label class="f">Email<input type="email" id="au-email" autocomplete="email" required value="${esc(qEmail)}"></label>
      <button class="btn primary block lg" type="submit">Send sign-in link</button></form>
      <div class="alt"><button class="linkbtn" data-act="authView" data-v="signin">Back to sign in</button></div>`;
    else if (v === "reset") card = `<h2>Reset your password</h2><p class="muted small">We'll email you a link to choose a new password.</p>
      <form data-submit="resetPass">${msgHtml}<label class="f">Email<input type="email" id="au-email" autocomplete="email" required value="${esc(qEmail)}"></label>
      <button class="btn primary block lg" type="submit">Send reset link</button></form>
      <div class="alt"><button class="linkbtn" data-act="authView" data-v="signin">Back to sign in</button></div>`;
    else if (v === "confirmLink") card = `<h2>Confirm your email</h2><p class="muted small">You opened a sign-in link on a different device or browser. Enter the email address the link was sent to.</p>
      <form data-submit="confirmLink">${msgHtml}<label class="f">Email<input type="email" id="au-email" autocomplete="email" required></label>
      <button class="btn primary block lg" type="submit">Continue</button></form>`;
    document.getElementById("app").innerHTML = `<div class="auth">
      <section class="auth-hero"><div class="brand" style="padding:0"><div class="brand-mark">${BRAND_SVG}</div><div><b>${esc(c.siteName)}</b><span>${esc(c.tagline || "")}</span></div></div>
        <h1>Prove your SEO skills.<br><em>Track every gain.</em></h1>
        <p>A complete SEO test series: mock tests, adaptive assessments across 16 disciplines, a daily challenge, a live leaderboard and certificates when you pass.</p>
        <div class="feats">
          <div class="feat"><span class="k">16</span><b>SEO disciplines</b><span>Technical, JavaScript, AI search, analytics and more</span></div>
          <div class="feat"><span class="k">Mocks</span><b>Timed test series</b><span>Full-length mocks with instant, explained results</span></div>
          <div class="feat"><span class="k">Daily</span><b>Challenge + quick quiz</b><span>Five questions a day, same for everyone</span></div>
          <div class="feat"><span class="k">Ranks</span><b>Leaderboard + certificates</b><span>Compete and earn a certificate at ${esc(passMarkLabel())}+</span></div>
        </div></section>
      <section class="auth-side"><div class="auth-card">${card}</div></section></div>`;
    const f = $("#au-email") || $("#au-name"); if (f && !f.value) f.focus();
  },
  setMsg(text, ok) { this.msg = text ? { text, ok: !!ok } : null; },
  async onUser(user) {
    S.authUser = user;
    if (!user) { S.ready = false; S.profile = null; this.render(); return; }
    S.uid = user.uid; S.me = { name: user.displayName || "", email: user.email || "" };
    UI.loading("Loading your workspace");
    try { S.isAdmin = !!(await Store.get(P.admin(S.uid))); } catch (e) { S.isAdmin = false; }
    let profile = null;
    try { profile = await Store.get(P.person(S.uid)); }
    catch (e) { console.error(e); S.error = "load"; S.errorDetail = (e && (e.message || e.code)) || String(e); UI.renderShell(); return; }
    if (!profile) { await this.gate(user); return; }
    if (profile.disabled) { S.error = "disabled"; UI.renderShell(); return; }
    await startApp(profile);
  },
  async gate(user) {
    const email = (user.email || "").toLowerCase();
    S.invite = null;
    if (email) { try { S.invite = await Store.get(P.invite(email)); } catch (e) { S.invite = null; } }
    const open = S.config.registration !== "invite";
    if (open || S.isAdmin) return this.onboarding(user);
    if (S.invite) return user.emailVerified ? this.onboarding(user) : this.verifyScreen(user);
    this.notInvited(user);
  },
  shell(inner) { document.getElementById("app").innerHTML = `<div class="center-card"><div class="auth-card"><div class="brand" style="padding:0 0 14px"><div class="brand-mark">${BRAND_SVG}</div><div><b style="color:var(--ink)">${esc(S.config.siteName)}</b><span>${esc(S.config.tagline || "")}</span></div></div>${inner}</div></div>`; },
  onboarding(user) {
    const inv = S.invite || {}, name = S.pendingName || user.displayName || inv.name || "";
    this.shell(`<h2>Welcome${name ? ", " + esc(name.split(" ")[0]) : ""}</h2><p class="muted small">Set up your profile to start the test series. Your detailed results are private to you and the administrator.</p>
      <form data-submit="finishOnboarding" style="display:flex;flex-direction:column;gap:12px;margin-top:14px">
        <label class="f">Full name <span class="hint">shown on the leaderboard and certificates</span><input type="text" id="ob-name" value="${esc(name)}" required maxlength="80"></label>
        <div class="grid g2"><label class="f">Team or company<input type="text" id="ob-team" value="${esc(inv.team || "")}" placeholder="e.g. Brightrays"></label>
        <label class="f">Job title<input type="text" id="ob-title" value="${esc(inv.title || "")}" placeholder="e.g. SEO Specialist"></label></div>
        ${S.viaEmailLink ? `<label class="f">Create a password <span class="hint">optional, so you can sign in without an email link</span><input type="password" id="ob-pass" minlength="6" autocomplete="new-password"></label>` : ""}
        <label class="check small"><input type="checkbox" id="ob-board" checked> Show my name and scores on the leaderboard</label>
        <div id="ob-msg"></div>
        <div class="row"><button class="btn ghost" type="button" data-act="signOut">Sign out</button><span class="spacer"></span><button class="btn primary lg" type="submit">Start the test series</button></div>
      </form>`);
  },
  verifyScreen(user, sent) {
    this.shell(`<h2>Verify your email</h2><p class="muted">You're on the invite list. To protect your invitation, confirm that <b>${esc(user.email)}</b> belongs to you: open the verification link we ${sent ? "just sent" : "sent"} to that address, then press Continue.</p>
      <div class="row" style="margin-top:14px"><button class="btn primary" data-act="verifyContinue">Continue</button><button class="btn" data-act="verifyResend">Resend email</button><span class="spacer"></span><button class="btn ghost" data-act="signOut">Sign out</button></div>`);
  },
  notInvited(user) {
    this.shell(`<h2>This test series is invite-only</h2><p class="muted"><b>${esc(user.email || "Your account")}</b> isn't on the invite list yet. Ask the administrator to invite this email address, then sign in again.</p>
      <div class="row" style="margin-top:14px"><button class="btn" data-act="recheckInvite">Check again</button><span class="spacer"></span><button class="btn ghost" data-act="signOut">Sign out</button></div>`);
  },
  async completeEmailLink(email) {
    const url = new URL(location.href);
    email = email || url.searchParams.get("email") || localStorageGet("emailForSignIn");
    if (!email) { this.render("confirmLink"); return false; }
    try {
      await FB.a.signInWithEmailLink(FB.auth, email, location.href);
      S.viaEmailLink = true; localStorageSet("emailForSignIn", null);
    } catch (e) { this.setMsg(authErr(e)); }
    history.replaceState(null, "", siteUrl() + location.hash);
    return true;
  }
};
function passMarkLabel() { return (Number(S.config.passMark) || 60) + "%"; }

/* ---------- auth actions ---------- */
ACT.authView = el => { Auth.setMsg(null); Auth.render(el.dataset.v); };
ACT.signIn = async f => {
  const email = $("#au-email").value.trim(), pass = $("#au-pass").value; f.querySelector("button[type=submit]").disabled = true;
  try { Auth.setMsg(null); await FB.a.signInWithEmailAndPassword(FB.auth, email, pass); }
  catch (e) { Auth.setMsg(authErr(e)); Auth.render(); }
};
ACT.register = async f => {
  const name = $("#au-name").value.trim(), email = $("#au-email").value.trim(), pass = $("#au-pass").value;
  if (!name) { Auth.setMsg("Enter your name."); Auth.render(); return; }
  f.querySelector("button[type=submit]").disabled = true; S.pendingName = name;
  try {
    const cred = await FB.a.createUserWithEmailAndPassword(FB.auth, email, pass);
    await FB.a.updateProfile(cred.user, { displayName: name }).catch(() => {});
    if (S.config.registration === "invite") await FB.a.sendEmailVerification(cred.user, { url: siteUrl() }).catch(e => console.warn(e));
  } catch (e) { Auth.setMsg(authErr(e)); Auth.render(); }
};
ACT.sendLink = async f => {
  const email = $("#au-email").value.trim(); f.querySelector("button[type=submit]").disabled = true;
  try {
    await FB.a.sendSignInLinkToEmail(FB.auth, email, { url: siteUrl() + "?email=" + encodeURIComponent(email), handleCodeInApp: true });
    localStorageSet("emailForSignIn", email);
    Auth.setMsg(`Check ${email} for your sign-in link. It can take a minute; look in spam too.`, true);
  } catch (e) { Auth.setMsg(authErr(e)); }
  Auth.render();
};
ACT.resetPass = async () => {
  const email = $("#au-email").value.trim();
  try { await FB.a.sendPasswordResetEmail(FB.auth, email, { url: siteUrl() }); Auth.setMsg(`If an account exists for ${email}, a reset link is on its way.`, true); }
  catch (e) { Auth.setMsg(e && e.code === "auth/user-not-found" ? `If an account exists for ${email}, a reset link is on its way.` : authErr(e), e && e.code === "auth/user-not-found"); }
  Auth.render();
};
ACT.confirmLink = async () => { await Auth.completeEmailLink($("#au-email").value.trim()); if (!FB.auth.currentUser) Auth.render("signin"); };
ACT.verifyContinue = async () => {
  const u = FB.auth.currentUser; if (!u) return;
  await FB.a.reload(u); await u.getIdToken(true);
  if (u.emailVerified) Auth.onboarding(u); else UI.toast("Not verified yet. Open the link in the email, then press Continue.");
};
ACT.verifyResend = async () => { const u = FB.auth.currentUser; try { await FB.a.sendEmailVerification(u, { url: siteUrl() }); Auth.verifyScreen(u, true); UI.toast("Verification email sent"); } catch (e) { UI.toast(authErr(e)); } };
ACT.recheckInvite = async () => { const u = FB.auth.currentUser; if (u) { UI.loading("Checking"); await Auth.gate(u); } };
ACT.signOut = async () => { try { await FB.a.signOut(FB.auth); } catch (e) {} location.hash = ""; location.reload(); };
ACT.finishOnboarding = async f => {
  const u = FB.auth.currentUser; if (!u) return;
  const name = $("#ob-name").value.trim(), team = $("#ob-team").value.trim(), title = $("#ob-title").value.trim(), board = $("#ob-board").checked, pass = $("#ob-pass") ? $("#ob-pass").value : "";
  const msg = $("#ob-msg");
  if (!name) { msg.innerHTML = `<div class="banner err small">Enter your name.</div>`; return; }
  if (pass && pass.length < 6) { msg.innerHTML = `<div class="banner err small">Passwords need at least 6 characters.</div>`; return; }
  f.querySelector("button[type=submit]").disabled = true;
  const now = nowTs(), email = (u.email || "").toLowerCase();
  const prof = { uid: u.uid, name, email, team, title, showOnBoard: board, joinedAt: now, lastActive: now, createdAt: now, invited: !!S.invite };
  try { await Store.set(P.person(u.uid), prof); }
  catch (e) {
    if (e && e.code === "permission-denied") { Auth.notInvited(u); return; }
    msg.innerHTML = `<div class="banner err small">Your profile couldn't be saved: ${esc(authErr(e))}</div>`; f.querySelector("button[type=submit]").disabled = false; return;
  }
  if (S.invite) await Store.update(P.invite(email), { status: "joined", joinedAt: now, uid: u.uid }).catch(() => {});
  if (name !== u.displayName) FB.a.updateProfile(u, { displayName: name }).catch(() => {});
  if (pass) await FB.a.updatePassword(u, pass).catch(e => UI.toast(authErr(e)));
  S.me.name = name;
  await startApp(prof);
  if (S.profile.showOnBoard !== false) updateLeaderboard();
};

/* ---------- app start ---------- */
async function loadShared() {
  const [_, templates, trends, mocks] = await Promise.all([
    loadBank(), Store.list("templates"), Store.list("trends"),
    S.isAdmin ? Store.list("mocks") : Store.list("mocks", (q, f) => f.query(q, f.where("published", "==", true)))]);
  S.templates = templates; S.trends = trends;
  S.mocks = mocks.map(m => Object.assign({ id: m._id }, m)).sort((a, b) => (a.number || 0) - (b.number || 0));
}
async function loadMine() {
  const id = S.uid;
  const [attempts, answers, seen, learning, assignments, inbox, revealed, board] = await Promise.all([
    Store.list(P.attempts(id)), Store.list(P.answers(id)), Store.get(P.seen(id)), Store.get(P.learning(id)),
    Store.list(P.assignments(id)), Store.get(P.inbox(id)), Store.get(P.revealed(id)), Store.get(P.leader(id)).catch(() => null)]);
  S.attempts = attempts.map(a => Object.assign({ id: a._id }, a)).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  S.answers = Object.fromEntries(answers.map(a => [a._id, a.items || []]));
  S.seen = (seen && seen.m) || {};
  S.learning = learning || { modules: {}, practice: { total: 0, correct: 0, bySub: {} }, exercises: {}, log: [] };
  S.assignments = assignments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  S.inbox = inbox || null;
  S.revealed = new Set((revealed && revealed.ids) || []);
  S.board = board;
}
function touchActive() {
  if (S.readOnly || !S.profile) return;
  const last = S.profile.lastActive || 0;
  if (nowTs() - last > 6 * 3600000) { S.profile.lastActive = nowTs(); Store.update(P.me(), { lastActive: S.profile.lastActive }).catch(() => {}); }
}
async function startApp(profile) {
  S.profile = profile; S.error = null;
  UI.loading("Loading your workspace");
  try { await Promise.all([loadShared(), loadMine()]); }
  catch (e) { console.error(e); S.error = "load"; S.errorDetail = (e && (e.message || e.code)) || String(e); UI.renderShell(); return; }
  rebuildConceptMap(); invalidateMine();
  S.mode = (S.isAdmin && (location.hash || "").startsWith("#team")) ? "team" : "learn";
  S.ready = true;
  touchActive();
  UI.renderShell(); UI.route();
  if (!S.board && S.profile.showOnBoard !== false && S.attempts.some(a => a.status === "completed")) updateLeaderboard(); // restore a missing leaderboard row (e.g. after re-enabling)
}
async function boot() {
  UI.loading("Connecting");
  await fbReady();
  if (!FB.configured) { S.error = FB.loadError ? "sdk" : "noConfig"; UI.renderShell(); return; }
  try { S.config = mergeConfig(await Store.get(P.config())); S.settings = mergeSettings(S.config.settings); }
  catch (e) { console.warn("config", e); }
  document.title = `${S.config.siteName} | ${S.config.tagline || "SEO Test Series"}`;
  if (new URL(location.href).searchParams.get("join")) Auth.view = "register";
  if (FB.a.isSignInWithEmailLink(FB.auth, location.href)) { const ok = await Auth.completeEmailLink(); if (!ok) return; }
  FB.a.onAuthStateChanged(FB.auth, user => { Auth.onUser(user).catch(e => { console.error(e); S.error = "load"; S.errorDetail = e.message; UI.renderShell(); }); });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
