# Security model

The website is static, so anyone can download its HTML, CSS and JavaScript (including `js/admin.js`). That is normal and safe: **all protection lives in `firebase/firestore.rules`**, which Firebase enforces on its servers for every read and write.

## Roles

| Role | How it's granted | Can access |
|---|---|---|
| Visitor (not signed in) | — | The sign-in page and the public site settings (name, registration mode) |
| Signed in, no profile | Firebase account only | Their own invite record. Nothing else. In invite-only mode they can't create a profile unless invited and email-verified |
| Participant | A profile at `users/{uid}` | Their own profile, attempts, answers and progress; questions without answers; published mocks; the leaderboard (names, teams, scores) |
| Administrator | A document at `admins/{uid}` (first one created by hand in the Firebase console) | Everything, including people, invites, answer keys, settings and reports |

## What participants cannot do (verified against the Firebase emulator)

- List users or read another person's profile, attempts, answers, inbox or assignments
- Read the invite list, unpublished mocks or the admin list
- Read an answer key for a question they haven't answered yet
- Change questions, answer keys, mocks, trends, templates, invites or site settings
- Make themselves an administrator or re-enable a disabled account
- Edit another person's leaderboard row
- Remove questions from their own "revealed answers" list

## Answer keys

Questions are stored without answers in `bank/{category}`. Answers, explanations and concepts are stored separately in `keys/{questionId}`. A participant's browser may read a key only after that question id is in `users/{uid}/state/revealed`, an append-only list the app adds to when the participant submits a test, checks a practice answer or moves on in adaptive mode. During a mock or quick quiz no answers are sent to the browser.

## Honest limitations

Scoring runs in the participant's browser (GitHub Pages can't run server code). That means:

- A technically skilled participant could write a fabricated score into **their own** results and leaderboard row. They can't touch anyone else's.
- Practice mode reveals answers by design, so someone could practise every question before taking a mock.

For a casual or internal test series this is a reasonable trade-off. If you need exam-grade integrity (for example prizes for leaderboard positions), move grading to a Firebase Cloud Function (requires the pay-as-you-go Blaze plan) and remove participants' write access to scores and the leaderboard.

## Keep these private

- `private-question-bank/questions.json` and any **Export JSON** of the question bank contain every answer. Don't commit them to a public repository; `.gitignore` already excludes them.
- The Firebase web config in `js/firebase-config.js` is **not** secret and is expected to be public.
