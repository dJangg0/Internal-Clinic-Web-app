# Testing and delivery

The test suite covers the current browser demo, PostgreSQL integrity, the local development stack, and the built frontend artifact. Read the [SRS](SRS.md) for intended requirements and the distinction between implemented and planned behavior.

## Required testing policy

The root [AGENTS.md](../AGENTS.md) applies across the repository. Every new feature or behavior change must include meaningful unit tests, and every bug fix must include a regression test that fails without the fix. Cover relevant boundaries, invalid inputs, failures, and state transitions; add component/integration, browser, or PostgreSQL tests when the affected behavior requires them. Do not skip or weaken tests, assertions, coverage thresholds, or CI checks to make a change pass.

This document is the source of check commands and prerequisites. Documentation-only changes need documentation/diff checks, not runtime tests or placeholder test cases. Report unavailable checks as unverified, with the missing prerequisite.

## Run the checks

Use Node.js 22.22.2 or later in the Node 22 line, Node.js 24.15 or later in the Node 24 line, or Node.js 26+, matching `frontend/package.json`. Docker tests require a running Docker engine and Docker Compose v2.

From the repository root:

```sh
cd frontend
npm ci
npm run typecheck
npm run test:coverage
npx playwright install chromium
npm run test:e2e
cd ..
sh scripts/test-stack.sh
sh scripts/test-image.sh
```

On Linux, install Chromium's operating-system dependencies with `npx playwright install --with-deps chromium` when needed. The browser suite builds the application and starts a production preview on port 4173; that port must be available. It fails if another process is already serving the configured port.

For a shorter feedback loop:

```sh
cd frontend
npm test
npm run test:watch
npm run test:e2e -- --project=chromium
```

The image test accepts an optional image tag, for example `sh scripts/test-image.sh clinic-frontend:review`. It builds and serves a static frontend container and checks the delivered index/assets. The stack script uses a separate Compose project and disposable volumes, initializes PostgreSQL, runs SQL regression assertions, and checks the Redis/frontend services. Neither script should run against a real patient database.

## What each level verifies

| Level | Files | Evidence |
| --- | --- | --- |
| Unit | [`frontend/src/clinic.test.ts`](../frontend/src/clinic.test.ts), [`frontend/src/demoLogin.test.ts`](../frontend/src/demoLogin.test.ts) | Pure date, booking, stored-data, and queue rules, plus public demo-credential matching, email normalization, exact passwords, and role-mismatch rejection. |
| Component / integration | [`frontend/src/App.test.tsx`](../frontend/src/App.test.tsx) | User interactions with the actual React app: public demo-credential matching and mismatch feedback, explicit `/login` and role-view routing, in-memory-session boundaries, role-specific UI isolation, local hero-cover validation/replacement/reset, explicit synthetic-demo entry, validation, chart isolation, booking, queue behavior, notes, prescriptions, and browser storage. Browser APIs can be mocked here. |
| Browser | [`frontend/e2e/clinic.spec.ts`](../frontend/e2e/clinic.spec.ts) | Desktop and mobile Chromium journeys against a production build, including matching/mismatched demo credentials, Doctor/Attendant/Patient view navigation, Back/Forward and refresh/direct-route login boundaries, actual hero-image loading and cover selection/reset, explicit demo entry, public check-in, reload persistence, responsive hero/form layout, and absence of unhandled application errors. |
| Database | [`db/tests/regression.sql`](../db/tests/regression.sql) | Real PostgreSQL 16 constraints, foreign keys, slot exclusions, timestamp consistency, and completed-visit/prescription aggregation. Test fixtures and helpers are rolled back. |
| Development stack | [`scripts/test-stack.sh`](../scripts/test-stack.sh) | Compose configuration, service startup, fresh database initialization/regressions, Redis, and frontend HTTP response. |
| Delivery artifact | [`scripts/test-image.sh`](../scripts/test-image.sh) | Production frontend image builds and serves its index and bundled assets. |

Vitest reports coverage for application sources through `npm run test:coverage`. Coverage reports are evidence of exercised code, not proof that every requirement or branch is correct. TypeScript checks are part of the frontend build. The browser suite freezes time for repeatable dates and exercises both desktop and narrow-screen navigation; the application itself still uses the user's local date.

CI enforces an initial coverage floor of 75% lines, 70% branches, 65% statements, and 60% functions across the application, plus 100% for the extracted date, booking, validation, and storage helpers in `clinic.ts`. These thresholds prevent coverage from silently declining; they do not substitute for behavioral assertions.

Useful local reports are `frontend/coverage/index.html` and `frontend/playwright-report/index.html`. Browser failures retain traces and screenshots under `.context/test-results/`. These outputs are ignored by Git. Run `npx playwright show-report` from `frontend` to inspect the browser report.

## CI and continuous delivery

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on pull requests and main-branch pushes:

| Job | Required checks / output |
| --- | --- |
| `workflow` | Validate GitHub Actions with actionlint and check shell script syntax. |
| `frontend` | Install from the lockfile, run unit/component coverage, and execute the desktop/mobile browser suite against a production build. Preserve reports for review. |
| `stack` | Run the isolated Compose stack smoke test and PostgreSQL regressions. |
| `container` | Build and smoke-test the frontend image, then save that tested image as a workflow artifact. |
| `deliver` | Only on a main-branch push and only after all four check jobs succeed: download the already-tested image and publish it to GHCR with the commit SHA and `main` tags. |

Pull requests do not publish images. Delivery uses the workflow's GitHub token with package-write permission; repository/organization package policies must permit it. No server credentials or live deployment target are configured. Publishing a frontend image is continuous delivery of the demo, not deployment of a functioning backend EHR.

Repository maintainers should configure branch protection to require the test jobs before merge. Workflow files define checks and job dependencies; they do not configure repository branch protection themselves.

## Review, resolve, and iterate

1. Read the failing assertion and relevant implementation together. Reproduce the smallest meaningful failing case before changing code.
2. Fix the underlying behavior and add a regression assertion that fails without the fix. Keep patient identity and historical content in view when reviewing clinical-chart changes.
3. Rerun the affected suite, then the broader checks affected by the change. A schema change needs fresh PostgreSQL initialization and database regressions; a frontend change needs unit/component, build, and browser checks; image or Compose changes need their respective smoke script.
4. Review the resulting diff for new problems, incorrect assumptions, and accidentally weakened assertions. If that review exposes another issue, fix it and rerun the relevant checks again.
5. Finish only when required checks pass. Record a genuinely unavailable external check as unverified, rather than calling it passed or suppressing it.

Use behavioral assertions and negative cases: a rejected booking must leave existing appointments intact; a note save must retain its historical text; a patient switch must never reuse another patient's draft or print preview. Do not make a failing test pass by removing the assertion, adding arbitrary waits, skipping the case, or masking errors with retries.

## Limits and future tests

The public sample credentials and browser-only demo views do not establish authentication or API authorization. The backend container is a placeholder. These checks cannot establish API authorization, shared persistence, a synchronized multi-device queue, staff identity, permitted visit transitions, atomic appointment/visit completion, audit history, migrations, or backup recovery. The SQL history view is not itself an authorization boundary. A browser `localStorage` test is not a server persistence test.

Add API integration and browser tests for those capabilities as they are implemented, using the requirement IDs in the SRS. Run future migrations against an existing schema as well as a fresh database. Keep all test fixtures synthetic, and verify workload, security, accessibility, and recovery requirements separately before handling real patient records.
