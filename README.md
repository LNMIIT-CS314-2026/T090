# ResearchPulse — prototype (CS314, Team T090)

ResearchPulse is a web-based research impact dashboard for LNMIIT. Researchers record their publications, research administrators verify them, and the system computes each researcher's official impact metrics (total citations, h-index, i10-index) from verified records only. The **first increment** (Assignments 1–8) implements the three use cases that were designed in detail: **UC-004 Add Publication (Manual)**, **UC-006 Verify Publication Data** and **UC-008 Compute Impact Metrics**, with screens W01–W06 of the wireframes (SRS section 43.3). The **second increment** adds the remaining functional requirements of the SRS: department and institute dashboards, the comparison view and filters (FR-029 – FR-031, FR-033), CSV import (FR-014, FR-015), accreditation and department reports with export (FR-034 – FR-036), researcher profiles (FR-006 – FR-008), user and role management (FR-004, FR-009) and milestone notifications (FR-038).

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
| Lakshya Singhal | Head of Department (CSE) | lakshya.singhal@lnmiit.ac.in | CSE department dashboard, comparison of CSE researchers, CSE department reports; 403 on other departments and admin pages |
| Kartik Mantri | Head of Department (ECE) | kartik.mantri@lnmiit.ac.in | ECE department dashboard only (BR-006) |
| Dr. Neha Kulkarni | Researcher (ECE) | neha.kulkarni@lnmiit.ac.in | Second department in the queue filter |
| Dr. Arjun Bhatt | Researcher (CSE) | arjun.bhatt@lnmiit.ac.in | Owner checks: cannot see or edit Dr. Sourabh's records |
| Dr. Ritu Saxena | Researcher (MTH), **deactivated** | ritu.saxena@lnmiit.ac.in | Deactivated account cannot log in (BR-009) |
| Dr. Meenakshi Rao | Institute Management (Dean, R&D) | meenakshi.rao@lnmiit.ac.in | Institute dashboard, all department dashboards, comparison, accreditation reports (FR-030, FR-034) |
| Vikram Joshi | System Administrator | vikram.joshi@lnmiit.ac.in | Users and roles: create accounts, change roles, deactivate (FR-004, FR-009) |


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
| Department dashboard | W06 layout, department scope | UC-010, UC-012 | FR-029, FR-033, BR-006 | `public/dashboards/department.js`, `src/services/DashboardService.js` |
| Institute dashboard | W06 layout, institute scope | UC-011, UC-012 | FR-030, FR-033 | `public/dashboards/institute.js`, `src/services/DashboardService.js` |
| Compare | — | UC-012 | FR-031, FR-033, BR-006 | `public/dashboards/compare.js`, `DashboardService.getComparison` |
| Import publications | — | UC-005 | FR-014, FR-015, FR-016, FR-017 | `public/researcher/import.js`, `src/services/PublicationImporter.js`, `src/domain/csv.js` |
| Reports / report view | — | UC-013, UC-014 | FR-034, FR-035, FR-036, BR-002, BR-006, BR-007 | `public/reports/*`, `src/services/ReportService.js`, `src/repositories/ReportRepository.js` |
| My profile | — | UC-003 | FR-006, FR-007, FR-008 | `public/profile.js`, `src/services/UserManagementService.js` |
| Users and roles | — | UC-002 | FR-004, FR-005, FR-009, BR-009, NFR-019 | `public/sysadmin/users.js`, `src/services/UserManagementService.js` |
| Milestone notifications | — (Notifications page) | UC-008 → UC-015 | FR-038 | `src/domain/metrics.js` (`milestones`), `src/services/VerificationManager.js` |

## Architecture mapping

The code follows the layered client–server architecture of SRS section 42 (Figure 15) and the components of section 38.

| Layer (SRS 42.2) | Component (C1–C12) | Folder / file |
|---|---|---|
| L1 Presentation | C1 Researcher Web UI | `public/researcher/*`, `public/login.*` |
| L1 Presentation | C2 Administrator Web UI | `public/admin/*` |
| L1 Presentation | C3 Dashboard Web UI | `public/dashboards/*`, `public/reports/*` |
| L1 Presentation | System administrator UI, profile | `public/sysadmin/*`, `public/profile.*` |
| L1 shared | layout, API client, formatting, charts, filters | `public/js/*`, `public/css/style.css` |
| L2 Request handling | endpoint adapters | `src/api/*Routes.js`, `src/api/requireSession.js`, `src/api/errorHandler.js` |
| Cross-cutting | C4 Authentication & Access Control | `src/services/AuthService.js` |
| Cross-cutting | C11 User & Department Management | `src/services/UserDirectoryService.js`, `src/services/UserManagementService.js` |
| L3 Application services | C5 Publication Management | `src/services/PublicationManager.js`, `src/services/DuplicateDetector.js`, `src/services/PublicationImporter.js` |
| L3 Application services | C6 Verification Management | `src/services/VerificationManager.js` |
| L3 Application services | C7 Metric Computation | `src/services/MetricCalculator.js` |
| L3 Application services | C8 Dashboard & Analytics | `src/services/DashboardService.js` |
| L3 Application services | C9 Notification | `src/services/NotificationService.js` |
| L3 Application services | C10 Audit Logging | `src/services/AuditService.js` |
| L3 Application services | Reporting (UC-013, UC-014; Report entity of SRS section 16) | `src/services/ReportService.js` |
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
| BR-006 Department dashboards aggregate own department only | `DashboardService.resolveDepartment` gives a Head of Department only their own department (403 otherwise); the comparison and department reports apply the same rule; aggregation queries filter by `department_id` |
| BR-007 Reports only by administrators / management | `ReportService.generate` authorises ACCREDITATION reports for RESEARCH_ADMIN and INSTITUTE_MGMT only; a Head of Department gets department reports of their own department only |
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
- **PDF export** uses the browser: the report page has a print layout, and "Print / save as PDF" produces the PDF (no PDF library, by the dependency rule of the instruction file). CSV export is built in.
- **Dashboards are computed on each request** from the verified records, so they are always current. Stored dashboard views with a "stale" flag (SRS 40.6) are not needed at this size.
- **Out of scope (SRS section 7 and 22, "Won't have"):** live Scopus / Web of Science synchronisation, payment, grant management, plagiarism detection, peer-review workflow, ERP, AI recommendations. UC-017 (system configuration) has no functional requirement and is not built.
- **Database upgrade:** a `data/researchpulse.db` from the first increment is detected (schema version) and rebuilt with the demo data on the next start.

## Tests

Run `npm test`. It uses Node's built-in `node:test` and an in-memory SQLite database seeded with the demo data, so it never touches `data/`.

| File | Covers |
|---|---|
| `tests/metrics.test.js` | h-index, i10-index, total citations and the year trend (including gap filling), with the worked examples of SRS 45.6 |
| `tests/validation.test.js` | Every rule and message of `validateFields` (title length 300/301, years 1899/1900/current/current+1, citations −1, DOI formats), plus title/DOI normalisation |
| `tests/lifecycle.test.js` | Services end to end: add → P-1120, duplicate warning and confirmation, submit notifies exactly 2 admins, BR-003 / ownership errors, open / reject (blank reason refused) / correct (T11), verify P-1095 → 27 / 2 / 2, P-1110 → DUPLICATE_OF_VERIFIED, stale version → CONCURRENT_UPDATE, insert-only audit service |
| `tests/api.test.js` | HTTP level: same 401 message for a wrong password and an unknown e-mail, deactivated → 403, no cookie → 401, researcher → 403 on the queue, 422/409 responses, and the full add → submit → open → verify → dashboard happy path |

| `tests/increment2.test.js` | Second increment: TC-27 – TC-29 of A8 (now executable), department / institute dashboards and BR-006, year and researcher filters, comparison, CSV import with duplicates and bad columns, accreditation and department reports with CSV export and BR-007, profile editing, user / role management with audit, milestone notifications |

`tests/helpers.js` holds the shared setup (in-memory database plus seed).

### Assignment 8 test cases (SRS sections 47–50)

| Command | What it runs | Expected result |
|---|---|---|
| `npm run test:a8` (`node --test tests/a8.test.js`) | TC-01 – TC-25 of section 48.2, one test per case, named as in Figure 28. Every case starts from a fresh copy of the demo data (DD-10). Service-level cases call the L3 interfaces; system cases (TC-02, 09, 10, 13, 18, 22, 23, 25) go over HTTP | 25 pass, 0 fail |
| `npm run test:ui` (`node tests/ui-run.js`) | TC-26 in headless Chrome: types −1, 2.5, 5- and 1e into Citation count on W02 and clicks Save as draft. Uses no extra packages (Chrome DevTools protocol over Node's built-in WebSocket, Node 22+). Set `CHROME_PATH` if Chrome or Edge is not found | All four refused: **Pass** (exit code 0) since DEF-01 was fixed |

TC-27 – TC-29 were "Not Executed" in A8 because the functions did not exist yet. They are built in the second increment and run in `tests/increment2.test.js`.

**DEF-01 (fixed in the second increment):** Citation count on W02 was an `<input type="number">`. For text the browser cannot read as a number ("5-", "1e") it reported an empty value, so the form sent a blank count, which DD-05 stores as 0, and the record was saved without a message. The field is now a text field with a numeric keyboard (`inputmode="numeric"`), so the typed text reaches the validation and is refused with "Citation count must be a whole number ≥ 0." on the client and on the server. TC-26 now passes.

## Project structure

```
researchpulse/
├── package.json, README.md, .gitignore
├── src/
│   ├── server.js            starts the app (PORT, default 3000), seeds on first start
│   ├── app.js               createApp(db): routes, pages, static files, error handler
│   ├── db/                  schema.sql, connection.js, seed.js (npm run reset)
│   ├── api/                 L2 endpoint adapters, session middleware, error mapping
│   ├── services/            L3 services C4–C11, PublicationImporter, ReportService, UserManagementService (+ index.js wiring)
│   ├── domain/              L4 lifecycle, validation (shared with the browser), normalise, metrics, csv, users, errors
│   └── repositories/        L5 SQL repositories and the unit of work
├── public/                  L1 pages: login, profile, researcher/ (W01, W02, W05, W06, import), admin/ (W03, W04),
│                            dashboards/ (department, institute, compare), reports/, sysadmin/, samples/, js/, css/
├── tests/                   node:test suites, a8.test.js (TC-01 – TC-25), ui-run.js (TC-26), increment2.test.js
└── data/                    created at runtime: researchpulse.db, mail.log
```
