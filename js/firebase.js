/* Firebase bootstrap (ES module). Loads the Firebase SDK from Google's CDN,
   initialises Auth + Firestore and exposes a small API on window.FB for the
   rest of the app (which is written as plain scripts). */
const V = "10.12.2";
const base = `https://www.gstatic.com/firebasejs/${V}`;

function done(api) {
  window.FB = api;
  window.dispatchEvent(new Event("fb-ready"));
}

(async () => {
  const cfg = window.FIREBASE_CONFIG || {};
  const configured = !!(cfg.apiKey && cfg.projectId && !/^YOUR_/.test(cfg.apiKey) && !/YOUR_/.test(cfg.projectId));
  if (!configured) { done({ configured: false }); return; }
  try {
    const [appM, authM, fsM] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`)
    ]);
    const app = appM.initializeApp(cfg);
    const auth = authM.getAuth(app);
    const db = fsM.getFirestore(app);
    const opts = window.APP_OPTIONS || {};
    if (opts.useEmulators) {
      authM.connectAuthEmulator(auth, opts.authEmulator || "http://127.0.0.1:9099", { disableWarnings: true });
      fsM.connectFirestoreEmulator(db, opts.firestoreHost || "127.0.0.1", opts.firestorePort || 8080);
    }
    done({ configured: true, app, auth, db, a: authM, f: fsM });
  } catch (e) {
    console.error(e);
    done({ configured: false, loadError: (e && e.message) || String(e) });
  }
})();
