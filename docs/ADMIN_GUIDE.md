# Admin guide

Open the admin console with **Open admin console** at the top of the sidebar. Switch back with **Switch to test series**. You also have a normal participant account, so you can take the tests yourself.

## Team

- **Team Overview**: registered participants, active people, tests completed, average competency, strongest and weakest categories, people who need training, and a ranking. Click a row to open that person.
- **Competency Heatmap**: people against the 16 categories. Pick a category to sort by it.
- **People**: everyone with an account and their email. **Edit** lets you rename someone, set their team and title, **disable access** (blocks all tests and removes them from the leaderboard) or **grant admin access**.
- **Person page**: the five questions (what they know, what they don't, missing core skills, what to learn next, whether they're improving), charts, gaps, assigned learning and every attempt with their answers. **Assign learning** puts a task at the top of their roadmap.
- **Team Knowledge Gaps**: subcategories where the most people struggle, with **Create training** to assign learning to everyone affected.

## Access

**Invites and Access**

- Choose **Anyone with the link** or **Invite-only**.
- Add one or many emails, optionally with a team and job title (pre-filled on their profile).
- Keep **Email each person a one-click sign-in link** ticked to have Firebase send the invitation. Per person you can also **copy the link**, **resend**, open your **mail app** with a ready-made message, or **remove** the invite.
- Status changes from *Pending* to *Joined* when the person creates their profile.
- Removing an invite stops someone who hasn't joined. To block someone who already joined, disable them under People.

## Content

- **Mock Tests**: **Generate a mock series** creates several balanced mocks at once with minimal overlap. **Create one mock** lets you pick questions by ID or auto-fill. Each mock has a time limit, an attempts limit (0 = unlimited) and a Published switch. Only published mocks appear to participants.
- **Assessments**: the built-in modes and their rules, plus custom assessments you can target at everyone, a team or specific people.
- **Question Bank**: search, filter and edit questions; **Add question**; **Import JSON** / **Export JSON** (the export includes answers, so keep it private). Questions marked *active* need a verification date. Flagged questions show their reports in the editor.
- **Trend Library**: the items on the SEO Trends page, each with a maturity label (established, emerging, experimental, speculative) and a verification date.

## Operations

- **Flags and Reviews**: score open-response answers against their rubric (the person's score updates immediately), and resolve or dismiss question reports.
- **Reports and Exports**: team and individual HTML reports, CSV exports of participants, attempts and every answer, a JSON backup of the bank, and a read-only HTML snapshot of the pages.
- **Settings and Rules**: site name, tagline, certificate issuer, pass mark, daily-challenge reset time (minutes from UTC; 330 = India), leaderboard on/off, registration mode, difficulty weights, test sizes and time limits, and the competency model.

## Good routine

- **Weekly**: check Flags and Reviews, glance at Team Overview and Team Knowledge Gaps.
- **Monthly**: publish a new mock, verify any questions or trends marked as due for review, export a backup of the question bank.
- **When Google changes something**: edit or retire the affected questions and update the trend item's maturity and date.
