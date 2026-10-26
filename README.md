# ResearchPulse — prototype (CS314, Team T090)

ResearchPulse is a web-based research impact dashboard for LNMIIT. Researchers record their publications, research administrators verify them, and the system computes each researcher's official impact metrics (total citations, h-index, i10-index) from verified records only. This prototype is the first working increment of our SRS (Assignments 1–7). It implements the three use cases that were designed in detail: **UC-004 Add Publication (Manual)**, **UC-006 Verify Publication Data** and **UC-008 Compute Impact Metrics**, with screens W01–W06 of the wireframes (SRS section 43.3).

Team:

| Name | Roll number |
|---|---|
| Prayag Vijay | 24UCS244 |
| Lakshya Singhal | 24UCS245 |
| Kartik Mantri | 24UCS246 |
| Pulkit Mittal | 24UCS247 |

## How to run

Prerequisites: **Node.js 20 or newer** (Node 22 LTS recommended) and npm.

```bash
npm install        # installs express, better-sqlite3, bcryptjs, cookie-parser
npm start          # starts the server; the first start creates and seeds data/researchpulse.db
```

Open **http://localhost:3000** and log in with one of the demo accounts below.

```bash
npm run reset      # restores the demo data (and clears data/mail.log); safe to run at any time
npm test           # runs all automated tests (node:test, in-memory database)
```

Notes:
- After `npm run reset`, restart the server (Ctrl+C, `npm start`) so that old login sessions are cleared.
- The port can be changed with `PORT=4000 npm start`.
- On Windows, if `better-sqlite3` fails to install, use Node 20, 22 or 24 LTS. The project uses better-sqlite3 v13, which also ships prebuilt binaries for Node 26, so no compiler is needed.

## Demo accounts

The password is **`demo123`** for every account. On the login page, clicking a row of the "Demo accounts" table fills in the form.

| Name | Role | E-mail | What it demonstrates |
|---|---|---|---|
| Dr. Sourabh | Researcher (CSE) | sourabh@lnmiit.ac.in | Main researcher: six records in every status, metrics 25 / 2 / 2 |
| Prayag Vijay | Research Administrator | prayag.vijay@lnmiit.ac.in | Main administrator: verification queue, verify / reject |
| Pulkit Mittal | Research Administrator | pulkit.mittal@lnmiit.ac.in | Second administrator: "notify all admins"; has P-1104 open in review |
| Lakshya Singhal | Head of Department (CSE) | lakshya.singhal@lnmiit.ac.in | HoD home with CSE-only totals; gets 403 on admin pages |
| Kartik Mantri | Head of Department (ECE) | kartik.mantri@lnmiit.ac.in | HoD home with ECE-only totals (BR-006) |
| Dr. Neha Kulkarni | Researcher (ECE) | neha.kulkarni@lnmiit.ac.in | Second department in the queue filter |
| Dr. Arjun Bhatt | Researcher (CSE) | arjun.bhatt@lnmiit.ac.in | Owner checks: cannot see or edit Dr. Sourabh's records |
| Dr. Ritu Saxena | Researcher (MTH), **deactivated** | ritu.saxena@lnmiit.ac.in | Deactivated account cannot log in (BR-009) |

## Viva demo script

Run `npm run reset` and restart the server before the demo.

1. **Log in as Dr. Sourabh.** The dashboard (W01) shows 25 citations, h-index 2 and i10-index 2, the verified-per-year chart, and six records covering every status. *(FR-001, FR-028, AC-11, AC-12)*
2. **Open Impact Metrics** (W06). The ranked table of verified records explains "14 ≥ 1, 11 ≥ 2 → h-index = 2", and the page shows "triggered by verification of P-1042". *(FR-023–FR-026, BR-004, NFR-020)*
3. **Click + Add Publication and save with empty fields.** You get the summary "Please correct 4 fields. Nothing has been saved yet.", a red message under each field, and the values you typed are kept. Enter year 2030 → "Enter a year between 1900 and 2026." *(FR-011, FR-015, AC-02, NFR-008)*
4. **Add "Graph-Based Citation Analysis", 2025.** The duplicate dialog lists P-1042 and P-1110. Choose **Edit details**, change the title, and save → "P-1120 saved as draft (DRAFT_ENTERED)." → **Submit for verification** → "P-1120 submitted for verification. Research administrators have been notified." *(FR-016, BR-008, AC-03, AC-04, AC-05, FR-017, FR-039)*
5. **Open P-1088 → View reason** (W05). The rejection reason is shown exactly as the administrator entered it. **Correct and resubmit** opens the form with the info box. Change the DOI, save → DRAFT_ENTERED → Submit. *(FR-020, FR-022, FR-037, T11)*
6. **Log out and log in as Prayag Vijay.** The bell shows the unread count, and the queue (W03) is ordered oldest first with P-1110 flagged "Possible duplicate". *(FR-021, AC-07, FR-039, BR-005)*
7. **Review P-1110** (W04). The duplicate check shows "Matches verified record P-1042". **Verify** → "Cannot verify: a VERIFIED record of the same researcher has the same DOI / title and year. Reject this record as a duplicate." Enter the reason "Duplicate of P-1042" → **Reject**. *(BR-008, FR-019, FR-020, BR-010)*
8. **Review P-1095.** **Reject** with an empty reason → "A rejection reason is required." (no request is sent; the server would also refuse it). **Verify** → confirm → "P-1095 verified. Metrics recomputed: 27 citations, h-index 2, i10-index 2. Researcher notified." *(FR-018, FR-027, AC-08, AC-09, AC-10, T10)*
9. **Log in as Dr. Sourabh.** The bell shows the new notifications, and the dashboard and Impact Metrics show 27 citations, "triggered by verification of P-1095". *(FR-037, AC-13, NFR-020)*
10. **Access control.** As Dr. Sourabh, open http://localhost:3000/admin/queue → "You do not have permission to verify publication data." Log in as **Dr. Ritu Saxena** → "This account has been deactivated. Contact the research office." Log in as **Lakshya Singhal** → HoD home with CSE totals only. *(FR-005, BR-005, BR-009, BR-006, NFR-004, NFR-005)*
11. **Open `data/mail.log`.** It contains the simulated e-mails sent to administrators and to the researcher, and the server console prints one `[MAIL] to=… subject="…"` line per e-mail. *(UC-015, FR-037, FR-039)*

## Traceability (SRS → prototype)

| Screen | Wireframe | Use case | Requirements / rules | Files |
|---|---|---|---|---|
| Login | — | UC-001 | FR-001, FR-002, FR-003, BR-009, NFR-004 | `public/login.html`, `public/login.js`, `src/api/authRoutes.js`, `src/services/AuthService.js` |
| Researcher Dashboard | W01 (Fig. 16) | UC-004 entry, UC-008 result | FR-012, FR-013, FR-017, FR-028, FR-032, BR-003, AC-11 | `public/researcher/dashboard.js`, `public/researcher/pubtable.js`, `public/researcher/publications.js` |
| Add / Edit Publication | W02 (Fig. 17) | UC-004 | FR-010, FR-011, FR-015, FR-016, FR-017, FR-022, BR-001, BR-008, AC-01–AC-05 | `public/researcher/publication-form.js`, `src/services/PublicationManager.js`, `src/services/DuplicateDetector.js`, `src/domain/validation.js` |
| Verification Queue | W03 (Fig. 18) | UC-006 steps 20–22 | FR-021, AC-07, BR-005 | `public/admin/queue.js`, `src/services/VerificationManager.js` |
| Verification Detail | W04 (Fig. 19) | UC-006 steps 22–26, reject flow | FR-018, FR-019, FR-020, FR-027, BR-008, BR-010, AC-06–AC-10 | `public/admin/review.js`, `src/services/VerificationManager.js`, `src/services/AuditService.js` |
| Verification Outcome | W05 (Fig. 20) | UC-006 step 26 | FR-020, FR-022, FR-037 | `public/researcher/outcome.js` |
| Impact Metrics | W06 (Fig. 21) | UC-008 | FR-023–FR-026, BR-002, BR-004, AC-11–AC-13, NFR-020 | `public/researcher/metrics.js`, `src/services/MetricCalculator.js`, `src/services/DashboardService.js`, `src/domain/metrics.js` |
| Notifications | — (W05 side panel) | UC-015 | FR-037, FR-039 | `public/js/notifications.js`, `src/services/NotificationService.js` |
| HoD home | — | UC-010 (placeholder) | FR-005, BR-006 | `public/hod/home.js`, `src/services/DashboardService.js` |

## Architecture mapping

The code follows the layered client–server architecture of SRS section 42 (Figure 15) and the components of section 38.

| Layer (SRS 42.2) | Component (C1–C12) | Folder / file |
|---|---|---|
| L1 Presentation | C1 Researcher Web UI | `public/researcher/*`, `public/login.*` |
| L1 Presentation | C2 Administrator Web UI | `public/admin/*` |
| L1 Presentation | C3 Dashboard Web UI (HoD placeholder) | `public/hod/*` |
| L1 shared | layout, API client, formatting | `public/js/layout.js`, `public/js/api.js`, `public/js/format.js`, `public/css/style.css` |
| L2 Request handling | endpoint adapters | `src/api/*Routes.js`, `src/api/requireSession.js`, `src/api/errorHandler.js` |
| Cross-cutting | C4 Authentication & Access Control | `src/services/AuthService.js` |
| Cross-cutting | C11 User & Department Management | `src/services/UserDirectoryService.js` |
| L3 Application services | C5 Publication Management | `src/services/PublicationManager.js`, `src/services/DuplicateDetector.js` |
| L3 Application services | C6 Verification Management | `src/services/VerificationManager.js` |
| L3 Application services | C7 Metric Computation | `src/services/MetricCalculator.js` |
| L3 Application services | C8 Dashboard & Analytics | `src/services/DashboardService.js` |
| L3 Application services | C9 Notification | `src/services/NotificationService.js` |
| L3 Application services | C10 Audit Logging | `src/services/AuditService.js` |
| L4 Domain model | lifecycle, validation, normalisation, metrics, errors | `src/domain/*` |
| L5 Persistence | C12 Data Access Layer | `src/repositories/*`, `src/db/*` |
| External | E1 Relational DBMS / E2 SMTP | SQLite file `data/researchpulse.db` / simulated by `data/mail.log` |

**How one Verify request flows through the layers.** The W04 page (L1) sends `POST /api/publications/:id/verify` with the comment and the record version. `requireSession` and `verificationRoutes` (L2) turn the `rp_session` cookie into a session through `AuthService.authenticate`. `VerificationManager.verify` (L3) calls `AuthService.authorize(RESEARCH_ADMIN)` and then, inside **one transaction** (`unitOfWork.run`): loads the record and checks it is UNDER_REVIEW and the version matches, checks there is no VERIFIED duplicate, sets the status to VERIFIED, inserts the Verification row and the status-history row, writes the AuditLog row (`AuditService.record`), recomputes the metrics (`MetricCalculator.recompute`), and creates the researcher's Notification. Only after the commit does `unitOfWork.afterCommit` run `NotificationService.dispatchPending`, which writes the e-mail to `data/mail.log`. If any step fails, nothing is written.

## Business rules enforced

All rules are checked on the server. The browser only repeats field checks for quick feedback.

| Rule | Where and how it is enforced |
|---|---|
| BR-001 Only authenticated researchers add or update their own records | `requireSession` (401 without a session); `PublicationManager` calls `authorize(RESEARCHER)` and `loadOwned()` (403 for another owner) |
| BR-002 Only verified records count in official metrics | `MetricCalculator.recompute` reads `findVerifiedByOwner` only; metrics change only inside `VerificationManager.verify` |
| BR-003 Researchers edit or delete only their own unverified records | `PublicationStatus.assertTransition` allows edit/delete only from DRAFT_ENTERED or REJECTED (409 INVALID_STATE otherwise), plus the owner check |
| BR-004 Standard formulas, verified data only | Pure functions in `src/domain/metrics.js`, unit-tested in `tests/metrics.test.js` |
| BR-005 Only administrators verify or reject | `VerificationManager` calls `authorize(RESEARCH_ADMIN)` on every operation; the W03/W04 pages show the 403 panel to other roles |
| BR-006 Department dashboards aggregate own department only | **Partially / next increment:** the HoD home summary reads only the HoD's own department (`findVerifiedByDepartment`). Full department dashboards (FR-029) are not built yet |
| BR-007 Reports only by administrators / management | **Next increment:** reports are not part of this prototype |
| BR-008 Duplicates flagged and never counted twice | `DuplicateDetector`: same owner and (same normalised DOI, or same normalised title + year). The add/edit warning needs confirmation (`duplicate_flag` is set); verifying a duplicate of a VERIFIED record fails with DUPLICATE_OF_VERIFIED |
| BR-009 Deactivated accounts cannot log in or submit | `AuthService.login` returns 403 with the deactivated message; `authorize()` re-checks ACTIVE status on every service call |
| BR-010 Every verification / rejection is logged | `AuditService.record` runs inside the decision's transaction; `audit_logs` is insert-only and no update/delete method exists (tested) |

## Publication lifecycle

Implemented in `src/domain/PublicationStatus.js` (State Diagram 01, SRS 37.2). Every status change also writes a `status_history` row, which W05 shows as the timeline.

| ID | Transition | Trigger / guard |
|---|---|---|
| T2 | new → DRAFT_ENTERED | save as draft; valid fields; no duplicate or duplicate confirmed |
| T4 | DRAFT_ENTERED → DRAFT_ENTERED | owner edits |
| T5 | DRAFT_ENTERED → SUBMITTED | owner submits; all active administrators notified |
| T6 | DRAFT_ENTERED → deleted | owner deletes |
| T7 | SUBMITTED → UNDER_REVIEW | administrator opens the record (repeat has no effect) |
| T8 | UNDER_REVIEW → VERIFIED | administrator verifies; no VERIFIED duplicate; metrics recomputed |
| T9 | UNDER_REVIEW → REJECTED | administrator rejects with a reason |
| T10 | UNDER_REVIEW → UNDER_REVIEW | reject with an empty reason is refused (REASON_REQUIRED) |
| T11 | REJECTED → DRAFT_ENTERED | owner corrects the record (FR-022); resubmission is T5 |
| T12 | REJECTED → deleted | owner deletes |

Anything else is refused with `INVALID_STATE` (HTTP 409).

## What is simulated or out of scope

- **E-mail** is simulated. Each notification is appended to `data/mail.log` and one `[MAIL]` line is printed to the console instead of being sent by SMTP. Delivery is retried up to 3 times, and a failure never rolls back a decision.
- **Sessions** are kept in server memory (SRS 40.6), so restarting the server logs everyone out.
- **Not built yet:** CSV / bibliographic import (UC-005), reports and export (UC-013, UC-014), department and institute dashboards (FR-029, FR-030), the comparison view (FR-031), profile management (UC-003), and an account/role management UI (UC-002). Stored dashboard views with a "stale" flag (SRS 40.6) are not needed yet, because the individual view is computed on each request.
- The HoD home page is a small read-only summary that mainly demonstrates role-based access.

## Tests

Run `npm test`. It uses Node's built-in `node:test` and an in-memory SQLite database seeded with the demo data, so it never touches `data/`.

| File | Covers |
|---|---|
| `tests/metrics.test.js` | h-index, i10-index, total citations and the year trend (including gap filling), with the worked examples of SRS 45.6 |
| `tests/validation.test.js` | Every rule and message of `validateFields` (title length 300/301, years 1899/1900/current/current+1, citations −1, DOI formats), plus title/DOI normalisation |
| `tests/lifecycle.test.js` | Services end to end: add → P-1120, duplicate warning and confirmation, submit notifies exactly 2 admins, BR-003 / ownership errors, open / reject (blank reason refused) / correct (T11), verify P-1095 → 27 / 2 / 2, P-1110 → DUPLICATE_OF_VERIFIED, stale version → CONCURRENT_UPDATE, insert-only audit service |
| `tests/api.test.js` | HTTP level: same 401 message for a wrong password and an unknown e-mail, deactivated → 403, no cookie → 401, researcher → 403 on the queue, 422/409 responses, and the full add → submit → open → verify → dashboard happy path |

`tests/helpers.js` holds the shared setup (in-memory database plus seed).

## Project structure

```
researchpulse/
├── package.json, README.md, .gitignore
├── src/
│   ├── server.js            starts the app (PORT, default 3000), seeds on first start
│   ├── app.js               createApp(db): routes, pages, static files, error handler
│   ├── db/                  schema.sql, connection.js, seed.js (npm run reset)
│   ├── api/                 L2 endpoint adapters, session middleware, error mapping
│   ├── services/            L3 services C4–C11 (+ index.js wiring)
│   ├── domain/              L4 lifecycle, validation (shared with the browser), normalise, metrics, errors
│   └── repositories/        L5 SQL repositories and the unit of work
├── public/                  L1 pages: login, researcher/ (W01, W02, W05, W06), admin/ (W03, W04), hod/, js/, css/
├── tests/                   node:test suites
└── data/                    created at runtime: researchpulse.db, mail.log
```
