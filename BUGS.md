# Planted bugs

The answer key for testing the tester. Every bug is off unless `BUGS` (or `POST /api/test/reset {"bugs": ...}`) turns it on. Keep this file out of the tester's prompts.

`BUGS=all` turns on all 16, `BUGS=functional` the first 10, `BUGS=visual` the last 6. You can also list ids: `BUGS=search-case-sensitive,broken-avatar`.

## Functional

| Id | Where | How to see it | Expected | Actual |
| --- | --- | --- | --- | --- |
| `sidebar-stale-projects` | Sidebar, New issue dialog | Create, archive or delete a project | The sidebar's "Your projects" list updates | The list keeps its old contents until a page reload. Side effect: the New issue dialog uses the same list, so on a just-created project it says "Create a project first" |
| `points-sum-off-by-one` | Board lane headers | Compare a lane's "pts" with its cards' estimates | Sum of all estimates in the lane | The last card's estimate is left out (Website Redesign Backlog shows 54 pts, not 57) |
| `search-case-sensitive` | Board and list filter | Filter Website Redesign by "CHECKOUT" | WEB-30 matches | No results; only the exact case matches |
| `undo-delete-noop` | Issue drawer, Delete, then Undo | Delete an issue and press Undo in the toast | The issue comes back | A "Restored WEB-12" toast appears, but the issue stays deleted |
| `list-pagination-skips-row` | List view, page 2 and later | Sort by ID and page through Website Redesign | Pages show WEB-1 to WEB-46 with no gaps | WEB-21 never appears; "Showing 21–40 of 46" is shown above rows 22–41 |
| `due-date-shifts` | Issue drawer, Due date | Set a due date and click Save | The chosen date is saved | The saved date is one day earlier; the field changes to it after saving |
| `viewer-can-create` | Top bar, project header, API | Log in as Victor (viewer) | No New issue button; the API answers 403 | The button shows and creating an issue works |
| `comment-posted-twice` | Issue drawer, Comments | Post a comment | It appears once | It appears twice until the drawer is reopened |
| `profile-name-not-saved` | Settings, Profile | Change your name, save, reload | The new name stays | "Profile saved" shows and the new name appears, but after a reload the old name is back |
| `dashboard-overdue-count` | Dashboard, Overdue | Log in as Ada and compare Overdue with her open issues | 1 (WEB-31) | 5: done issues with past due dates are counted |

## Visual

The type in brackets is the visual-bug type Test Kombajn reports.

| Id | Where | How to see it | What's wrong |
| --- | --- | --- | --- |
| `long-title-overflow` | Board cards | Open the Website Redesign board | Card titles don't wrap. Long ones (WEB-30, WEB-4) run out of the card across the next lanes. The overflowing text also catches the pointer, so dropping a card on a lane it covers can fail. (overlap, horizontal overflow) |
| `mobile-header-covers-action` | Projects page, phone width (under 640px) | Open Projects on a phone | The page header slides under the top bar, so the title and the "New project" button are covered. (hidden button) |
| `dark-low-contrast` | Everywhere, dark theme | Switch to the dark theme | Secondary text (issue keys, counts, nav items, emails, dates) is dark grey on dark blue and hard to read. (low contrast) |
| `broken-avatar` | Anywhere Sofia Rossi's avatar shows | Team page, board cards, project member lists | Her avatar is a missing image: a broken-image icon with clipped alt text. (broken image) |
| `undefined-in-notification` | Notifications menu | Open the bell as Ada | Every notification starts with "undefined", e.g. "undefined commented on WEB-30". (`undefined` in text) |
| `wizard-footer-clipped` | New project wizard, phone width | Open New project on a phone and go to step 2 | The dialog has a fixed height and clips its content. Step 1 just fits. From step 2 on, the last template card is cut in half and the footer with Back and Next is clipped away, so a project can't be created on a phone. (clipped content, hidden button) |

## Which scenario catches which bug

For the scenarios in [SCENARIOS.md](SCENARIOS.md). With `BUGS` unset, every scenario passes.

| Scenario | Bugs it should catch | What the tester should notice |
| --- | --- | --- |
| 1. Log in and check the dashboard | `dashboard-overdue-count` | Overdue says 5, but only one open issue (WEB-31) has a red date |
| 2. Create a project with the wizard | `sidebar-stale-projects` | "Billing Revamp" is missing from the sidebar, and the New issue dialog says to create a project first |
| 3. Create a project on a phone | `mobile-header-covers-action`, `wizard-footer-clipped` | The New project button is hidden under the top bar; from step 2 the wizard's buttons are cut off, so the project can't be created |
| 4. Work the board | `points-sum-off-by-one`, `long-title-overflow` | Todo shows 27 pts instead of 29; long titles run across columns, and the drag onto In Progress can fail where a title covers the drop spot |
| 5. Filter, search and page | `search-case-sensitive`, `list-pagination-skips-row` | "CHECKOUT" finds nothing; WEB-21 never appears in the list |
| 6. Edit an issue end to end | `due-date-shifts`, `comment-posted-twice`, `undo-delete-noop` | The date comes back one day early; the comment shows twice; WEB-12 stays gone after Undo |
| 7. Viewer can look but not touch | `viewer-can-create` | New issue buttons are visible to the viewer, and creating an issue works |
| 8. Profile and dark theme | `profile-name-not-saved`, `dark-low-contrast`, `broken-avatar` | The old name is back after a reload; grey text is hard to read in dark mode; Sofia's avatar is broken on the Team page |
| 9. Notifications and team | `undefined-in-notification`, `broken-avatar` | Notifications start with "undefined"; Sofia's avatar is a broken image |
