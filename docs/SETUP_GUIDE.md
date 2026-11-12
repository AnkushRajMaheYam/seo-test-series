# Setup guide

This takes about 20 minutes. You need a Google account (for Firebase) and a GitHub account. No coding is required.

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and click **Create a project**.
2. Name it, for example `seo-test-series`. Google Analytics is optional; you can turn it off.
3. When the project opens, click the **Web** icon (`</>`) to add a web app. Give it a nickname such as `SEO Test Series`. You don't need Firebase Hosting.
4. Firebase shows a `firebaseConfig` block. Keep this tab open; you'll paste it in step 4.

## 2. Turn on sign-in

1. In the left menu open **Build > Authentication** and click **Get started**.
2. On the **Sign-in method** tab, enable **Email/Password**.
3. In the same Email/Password panel, also switch on **Email link (passwordless sign-in)**. Invitations and "Email me a sign-in link" use it.
4. Optional: on the **Templates** tab, set the sender name (for example `SEO Test Series`) and edit the email wording.

## 3. Create the database and publish the security rules

1. Open **Build > Firestore Database** and click **Create database**.
2. Choose a location close to your participants (for India, `asia-south1 (Mumbai)`). Start in **production mode**.
3. Open the **Rules** tab, delete everything there, paste the whole contents of `firebase/firestore.rules` from this project, and click **Publish**.

> The rules are the backend. They are what stops participants from reading other people's results or opening admin data, so don't skip this step.

## 4. Connect the website to Firebase

Open `js/firebase-config.js` and replace the placeholder values with the ones from step 1:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "seo-test-series.firebaseapp.com",
  projectId: "seo-test-series",
  storageBucket: "seo-test-series.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
```

This config is not a password. It only identifies your project; the rules decide who can do what.

## 5. Put the site on GitHub Pages

1. Create a new repository on GitHub, for example `seo-test-series`. It must be **public** for free GitHub Pages (or private on a paid plan).
2. Publish the contents of the `seo-test-series` folder to a new **public** GitHub repository. In VS Code, open that folder (not its parent), use **Source Control > Initialize Repository**, review the changes, then choose **Publish to GitHub** and select **Public repository**. Your existing VS Code GitHub sign-in can be used.
   - Before publishing, confirm `private-question-bank` is not in this folder or the staged file list. Do not stage `.env` files, service-account credentials, or the local-only `docs/images` screenshots. `.gitignore` protects these when using Git; GitHub's browser upload does **not** apply `.gitignore`.
   - If you prefer the command line, run the Git commands from inside `seo-test-series`: `git init`, `git add .`, `git commit -m "SEO test series"`, `git branch -M main`, `git remote add origin https://github.com/<you>/seo-test-series.git`, `git push -u origin main`.
3. **Do not upload `private-question-bank`.** It contains every answer.
4. In the repository open **Settings > Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select **main** and **/ (root)**, and click **Save**.
5. After a minute or two the page shows your address, for example `https://<you>.github.io/seo-test-series/`.

## 6. Authorise your website in Firebase

In Firebase open **Authentication > Settings > Authorized domains**, click **Add domain**, and add `<you>.github.io` (no `https://`, no path). If you later use a custom domain, add that too.

## 7. Create your account and make yourself the admin

1. Open your site and click **Create a free account**. Use your own name and email, then finish the profile step.
2. In Firebase open **Authentication > Users** and copy your **User UID**.
3. Open **Firestore Database > Data**, click **Start collection**, enter the collection ID `admins`, and click **Next**.
4. For **Document ID** paste your User UID. Add one field: `role` (string) = `owner`. Click **Save**.
5. Reload your site. The sidebar now shows **Open admin console**.

You can make other people administrators later from **Admin console > People > Edit**.

## 8. Load the questions and trends

1. Open the admin console and go to **Question Bank > Import JSON**.
2. Choose `private-question-bank/questions.json` from the zip (it sits next to the website folder) and click **Import**. You should see "Imported 336".
3. Go to **Trend Library > Import JSON** and choose `private-question-bank/trends.json`.

Questions are stored in two parts: the questions participants download (no answers) and the answer keys, which are only sent to a participant after they've answered that question.

## 9. Create the mock test series

Open **Mock Tests > Generate a mock series**. The defaults create 6 mocks of 50 questions (30% easy, 40% medium, 30% hard), 60 minutes each, published immediately. With the 336-question starter bank, later mocks borrow from neighbouring difficulty levels once a level runs out; add more questions to keep every mock perfectly balanced.

## 10. Decide who can join and invite people

Open **Invites and Access**.

- **Anyone with the link** (default): anyone can create a free account.
- **Invite-only**: only emails on the invitation list can join. Invited people verify their email before starting.

To invite: paste email addresses (one per line), optionally a team and job title, keep **Email each person a one-click sign-in link** ticked and click **Add invites**. Each person receives a Firebase sign-in email. You can also copy each person's invite link or open your own mail app with a ready-written invitation.

## 11. Optional settings

**Settings and Rules** lets you change the site name, tagline, certificate issuer, pass mark, the daily-challenge reset time (default midnight India time), whether the leaderboard is shown, and every scoring rule.

---

## Updating the site later

Edit files on GitHub (or push with Git). GitHub Pages republishes within a minute or two. If you change `firebase/firestore.rules`, paste and publish them again in the Firebase console.

## Deploying the rules with the Firebase CLI (optional)

```bash
npm install -g firebase-tools
firebase login
# put your project ID in .firebaserc, then:
firebase deploy --only firestore:rules
```

## Testing locally with the Firebase emulators (optional, for developers)

```bash
npm install -g firebase-tools        # needs Java 11+ for the Firestore emulator
firebase emulators:start --only auth,firestore --project demo-seo
```

Then, in `js/firebase-config.js`, use `projectId: "demo-seo"`, any `apiKey` such as `"demo-key"`, set `useEmulators: true`, and serve the folder with any static server, for example `python3 -m http.server 5173`. Set `useEmulators` back to `false` before uploading.

## Troubleshooting

| You see | Fix |
|---|---|
| "Connect Firebase to finish setup" | `js/firebase-config.js` still has the `YOUR_...` placeholders. |
| "This website's domain isn't authorised" | Add your `github.io` domain under Authentication > Settings > Authorized domains. |
| "This sign-in method isn't enabled yet" | Enable Email/Password **and** Email link in Authentication > Sign-in method. |
| "The data couldn't be loaded" / permission errors | Publish `firebase/firestore.rules` in Firestore > Rules. |
| No "Open admin console" button | Check the `admins` document ID exactly matches your User UID, then reload. |
| "The question bank is empty" | Import `private-question-bank/questions.json` from Admin console > Question Bank. |
| Invitation emails don't arrive | Check spam, confirm Email link is enabled, and check the Authentication > Templates sender. Firebase's free plan limits how many sign-in emails it sends per day; use **Link** or **Mail app** on the Invites page as a fallback. |
| Page shows old content after an update | Hard-refresh (Ctrl+F5 / Cmd+Shift+R); GitHub Pages caches for a few minutes. |
