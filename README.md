# Tasklane

A small issue tracker in the style of Linear and Trello, built to be tested. It is the demo target app for Test Kombajn, a local AI QA tester for web apps. It has fake email-and-password auth, three roles, projects, a kanban board, a list view, an issue drawer, team management and settings.

The app runs in two versions:
- **Clean** (the default): no planted bugs. Anything a tester finds is a real bug in Tasklane.
- **With bugs**: up to 16 known bugs (10 functional, 6 visual) switched on, so you can measure what a tester finds against a known answer key.

Everything runs locally. Data lives in memory and is re-seeded on every start or reset.

## Run it

Needs Node 24 and pnpm.

```
pnpm install
pnpm dev        # Vite + API on http://127.0.0.1:5180, with hot reload
pnpm serve      # production build + API on http://127.0.0.1:5180 (closer to a real deployment)
pnpm start      # serve an existing build without rebuilding
pnpm test       # API and logic tests (Vitest)
pnpm typecheck
```

If 5180 is taken, both servers move to the next free port (5181, 5182, ...) and print the URL they use. Point the tester at that URL.

Use pnpm, not npm: `npm install` fails with "Cannot read properties of null (reading 'children')" because npm can't read the `node_modules` folder pnpm creates.

### Clean or with bugs

The `BUGS` setting picks the version. Leave it unset for the clean app.

| `BUGS` value | What is switched on |
| --- | --- |
| unset or `none` | Nothing: the clean, bug-free app |
| `all` | All 16 planted bugs |
| `functional` | The 10 functional bugs |
| `visual` | The 6 visual bugs |
| a list of ids, e.g. `search-case-sensitive,broken-avatar` | Just those bugs |

Set it in a `.env` file in this folder (copy [.env.example](.env.example)) and restart the server, or set it in the terminal for a one-off run:

```
# PowerShell
$env:BUGS = "all"; pnpm dev

# bash
BUGS=all pnpm dev
```

A value set in the terminal wins over the file. To switch bugs without a restart, send `POST /api/test/reset` with `{"bugs": "all"}` (see [Test hooks](#test-hooks)). `GET /api/meta` shows which bugs are on.

## Accounts

| Name | Email | Password | Role |
| --- | --- | --- | --- |
| Ada Park | ada@tasklane.test | `Admin123!` | Admin: everything, including team and project deletion |
| Maya Okafor | maya@tasklane.test | `Member123!` | Member: creates and edits projects and issues |
| Victor Lindqvist | victor@tasklane.test | `Viewer123!` | Viewer: read-only, can't comment |
| Liam Chen | liam@tasklane.test | `Password123!` | Member |
| Sofia Rossi | sofia@tasklane.test | `Password123!` | Member |
| Noah Kim | noah@tasklane.test | `Password123!` | Member |

There is also a pending invite for emma@tasklane.test (member); signing up with that email takes the invite's role.

Five failed logins for one email lock it for 30 seconds. "Keep me logged in" sets a 30-day cookie; otherwise the session lasts one day or until the browser closes. Signing up creates a member, or uses the role of a pending invite for that email.

These are fake local accounts with test passwords. They exist only in the app's in-memory seed.

## Planted bugs (the "with bugs" version)

All are off unless `BUGS` turns them on. [BUGS.md](BUGS.md) has the full answer key: how to trigger each bug, what should happen and what happens instead, and which scenario catches it. Keep the answer key out of the tester's prompts.

### Functional

| Id | Where | What goes wrong |
| --- | --- | --- |
| `sidebar-stale-projects` | Sidebar, New issue dialog | Creating, archiving or deleting a project doesn't update the sidebar's project list until a reload; the New issue dialog then says "Create a project first" on a just-created project |
| `points-sum-off-by-one` | Board lane headers | A lane's points total leaves out the last card's estimate (Backlog shows 54 pts, not 57) |
| `search-case-sensitive` | Board and list filter | Search is case-sensitive: "CHECKOUT" doesn't find WEB-30 |
| `undo-delete-noop` | Issue drawer, Delete, then Undo | Undo shows "Restored WEB-12", but the issue stays deleted |
| `list-pagination-skips-row` | List view, page 2 and later | WEB-21 never appears; page 2 shows rows 22–41 under "Showing 21–40 of 46" |
| `due-date-shifts` | Issue drawer, Due date | The saved due date is one day earlier than the one picked |
| `viewer-can-create` | Top bar, project header, API | A viewer sees the New issue button and can create issues |
| `comment-posted-twice` | Issue drawer, Comments | A new comment shows twice until the drawer is reopened |
| `profile-name-not-saved` | Settings, Profile | "Profile saved" shows, but the old name is back after a reload |
| `dashboard-overdue-count` | Dashboard, Overdue | Overdue counts done issues too: Ada sees 5 instead of 1 |

### Visual

| Id | Where | What's wrong |
| --- | --- | --- |
| `long-title-overflow` | Board cards | Long card titles don't wrap and run across the next lanes; the overflowing text can also block dropping a card there |
| `mobile-header-covers-action` | Projects page, phone width (under 640px) | The page header slides under the top bar, hiding the title and the New project button |
| `dark-low-contrast` | Everywhere, dark theme | Secondary text (keys, counts, nav items, emails, dates) is dark grey on dark blue and hard to read |
| `broken-avatar` | Anywhere Sofia Rossi's avatar shows | Her avatar is a broken image with clipped alt text |
| `undefined-in-notification` | Notifications menu | Every notification starts with "undefined", e.g. "undefined commented on WEB-30" |
| `wizard-footer-clipped` | New project wizard, phone width | The dialog clips its content from step 2 on, cutting off the Back and Next buttons, so a project can't be created on a phone |

## What's in it

- **Auth:** log in, sign up (strength meter, confirm password, terms checkbox), forgot password (fake email), log out, log out everywhere, change password.
- **Dashboard:** your numbers (open, due soon, overdue, completed), your open issues, project progress, recent activity.
- **Projects:** grid or list, search, Active/Archived/All filter, a 4-step "New project" wizard (details, template, members, review), archive and delete (type the key to confirm).
- **Board:** lanes from the project template, drag and drop between and within lanes, work-in-progress limits that turn a lane red, point totals, quick add at the bottom of a lane, filters in the URL (debounced search, assignee, priority, label).
- **List:** sortable columns, 20 rows per page, select rows for bulk status, assignee, priority or delete.
- **Issue drawer** (`?issue=WEB-12` on any page): inline title editing; status, priority, a searchable assignee picker, labels, due date and estimate, kept as unsaved changes until Save (Discard drops them, closing the drawer drops them too); description, sub-tasks, comments (edit and delete your own), activity, copy link, delete with Undo.
- **Command palette:** Ctrl+K searches issues and projects and runs commands.
- **Team:** roles (admins only), invites, remove member. **Settings:** profile, account, theme (light, dark, system), density, email notification switches.
- Notifications, toasts, skeletons and spinners, light and dark themes, and layouts for desktop, tablet and phone (the sidebar becomes a drawer below 900px).

Seed data: 4 projects (Website Redesign with 46 issues, Mobile App, Q4 Launch Campaign, and the archived Internal Tools), 6 people, comments, activity and notifications. Due dates are relative to the day the server starts, so "overdue" and "due soon" always have content.

## Flows for a tester

1. Log in as Ada, create a project called "Billing" with the Marketing template and Maya as a member, and check it shows on the Projects page and in the sidebar.
2. On the Website Redesign board, create an issue in Todo, assign it to Liam with priority High, move it to In Progress, and check the lane counter and the issue's activity.
3. Log in as Victor (viewer) and check he can open issues but can't edit them, comment or create anything.

[SCENARIOS.md](SCENARIOS.md) has nine fuller scenarios, written to give to a tester, that together cover all 16 planted bugs. With `BUGS` unset, every scenario passes.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `5180` | Port to try first for `pnpm dev` and `pnpm start`; the next free one is used if it's taken |
| `LATENCY` | `120-350` | Random delay per API call in ms (`0` turns it off, `400` is fixed) |
| `BUGS` | none | Planted bugs to turn on: `all`, `functional`, `visual`, or a comma-separated list of ids |

Put them in a `.env` file (copy [.env.example](.env.example)) and restart the server after changing it.

## Test hooks

- `POST /api/test/reset` restores the seed data and logs everyone out. Send `{"bugs": "all"}` (or a list of ids, or `"none"`) to swap the planted bugs without a restart. Reload the page afterwards, because the UI reads the bug list once at start.
- `POST /api/test/login` with `{"as": "admin"}` (or `member`, `viewer`, or a seed email) logs that account in and sets the session cookie, so test tools never handle passwords. Scenarios should still log in through the form.
- `GET /api/meta` returns the app version and the active bugs.

## Layout

```
server/   Hono API: app.ts (routes), seed.ts, db.ts, templates.ts; start.ts serves the production build
shared/   types and the planted-bug list, used by both sides
src/      React UI: pages/, components/, plus api, auth, hooks and formatting helpers
tests/    Vitest: API behaviour, planted bugs on and off, client logic
```
