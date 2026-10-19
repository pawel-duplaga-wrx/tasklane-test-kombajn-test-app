# Test scenarios for the tester

Plain-English scenarios to give Test Kombajn (or any tester). Each one says which account and screen size to use, what to do, and what has to be true for it to pass. They describe correct behaviour only. Which planted bug each one should catch is in [BUGS.md](BUGS.md#which-scenario-catches-which-bug); keep that file out of the tester's prompts.

Accounts are named by alias. Give the tester the real logins through its account settings, not in the prompt:

| Alias | Login |
| --- | --- |
| admin | ada@tasklane.test (Ada Park) |
| member | maya@tasklane.test (Maya Okafor) |
| viewer | victor@tasklane.test (Victor Lindqvist) |

Reset the data before each scenario (`POST /api/test/reset`), because some scenarios change it.

## 1. Log in and check the dashboard (desktop)

Go to the app and log in as admin with a wrong password. Check that an error says the email or password is incorrect and that you stay on the login page. Then log in with the right password. Check that the dashboard greets Ada by name. Compare the "Overdue" number with the "Your open issues" list: it must equal the number of issues there whose due date is shown in red as overdue.

## 2. Create a project with the wizard (desktop)

Log in as admin. On the Projects page, create a project named "Billing Revamp" with the key BILL, the Marketing template, and Maya Okafor as an extra member. Check that its board opens with the columns Ideas, Planned, In Progress, Review and Published. Check that "Billing Revamp" is listed on the Projects page and in the sidebar under "Your projects". Then use the project's New issue button to create "Draft pricing email", and check that it appears on the board.

## 3. Create a project on a phone (mobile)

On a phone-sized screen, log in as admin and open Projects. Check that the page title and the New project button are fully visible and nothing covers them. Create a project named "Field Ops" with the Simple template, going through all four steps of the wizard. On every step, check that the Back, Next or Create buttons are visible and that no content is cut off. Check that the new board opens with the columns To do, Doing and Done.

## 4. Work the board (desktop)

Log in as member and open the Website Redesign board. For the Todo column, check that the "pts" total in the header equals the sum of the estimate numbers on its cards. Check that every card's title stays inside its card and doesn't overlap other cards or columns. Then drag WEB-4 "Fix footer links opening in the same tab" from Todo to In Progress. In Progress was full (4 of 4), so check that a warning about its limit appears, that its header shows 5 / 4, and that the column is highlighted. Open WEB-4 and check that its status is In Progress.

## 5. Filter, search and page through issues (desktop)

Log in as member and open the Website Redesign board. Type "checkout" in Filter issues and check that WEB-30 is found. Replace it with "CHECKOUT" and check that you get the same result. Clear the filter, switch to the List view, sort by ID, and go through all pages. Check that every issue from WEB-1 to WEB-46 appears exactly once, with none missing or repeated. Check that the "Showing X–Y of 46" text matches the rows on each page.

## 6. Edit an issue end to end (desktop)

Log in as member and open WEB-12 "Write copy for the About page". Set its due date to two weeks from today, close the issue, open it again, and check that the date is still the one you picked. Add the comment "Copy draft is in the doc." and check that it shows exactly once. Add a sub-task "Review with legal", tick it, and check that the progress says 1 of 1 done. Then delete the issue from its actions menu. Press Undo in the message that appears (it disappears after a few seconds), and check that WEB-12 is back on the board.

## 7. Viewer can look but not touch (desktop)

Log in as viewer. Check that there is no way to create anything: no New issue button in the top bar or project header, and no New project button on the Projects page. Open WEB-3 on the Website Redesign board. Check that its fields can't be changed and that the comment area says viewers can't comment.

## 8. Profile and dark theme (desktop)

Log in as member. In Settings, Profile, change the full name to "Maya O. Okafor" and save. Reload the page and check that the field still shows the new name, and that the Team page lists "Maya O. Okafor". Then, in Settings, Preferences, switch the theme to Dark. Look through the dashboard, the Website Redesign board and the Team page. Report any text that is hard to read against its background.

## 9. Notifications and team (desktop)

Log in as admin. Open the notifications bell. Check that every notification says who did what, for example "Liam Chen commented on WEB-30". Check that clicking one opens that issue. Use "Mark all as read" and check that the unread badge on the bell goes away. On the Team page, check that every member has a proper avatar, with initials or a photo and no broken images. Invite new.person@tasklane.test as a Member, check that it shows under Pending invites, then revoke it and check that it's gone.

## Freestyle

Press Start with no scenario, logged in as admin: about 15 minutes on desktop, then about 10 on a phone-sized screen. Compare the findings with BUGS.md afterwards.

## How to score a run

1. Run all nine with `BUGS` unset. Every scenario should pass and the tester should report no bugs. Anything it reports is either a false alarm or a real bug in Tasklane.
2. Run them again with `BUGS=all`, or with only the bugs a scenario targets. Each scenario should fail or report the bugs listed for it in BUGS.md, with a screenshot that shows the problem.
