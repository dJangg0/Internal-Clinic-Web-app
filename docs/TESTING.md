# Testing

The test suite covers the browser demo: pure clinic rules, React behavior, and desktop/mobile browser journeys. Read the [SRS](SRS.md) for intended requirements and the distinction between implemented and planned behavior.

## Required testing policy

The root [AGENTS.md](../AGENTS.md) applies across the repository. Every new feature or behavior change must include meaningful unit tests, and every bug fix must include a regression test. Cover relevant boundaries, invalid inputs, failures, and state transitions; add component/integration or browser tests when the affected behavior requires them. Do not skip or weaken tests, assertions, coverage thresholds, or CI checks to make a change pass.

Documentation-only changes need documentation and diff checks, not runtime tests or placeholder test cases. Report unavailable checks as unverified, with the missing prerequisite.

## Run the checks

Use Node.js `22.22.2+` in the Node 22 line, Node.js `24.15+` in the Node 24 line, or Node.js `26+`, matching `package.json`.

From the repository root:

```sh
npm ci
npm run typecheck
npm run test:coverage
npx playwright install chromium
npm run test:e2e
```

On Linux, install Chromium's operating-system dependencies with `npx playwright install --with-deps chromium` when needed. The browser suite builds the application and starts a production preview on port 4173; that port must be available.

For a shorter feedback loop:

```sh
npm test
npm run test:watch
npm run test:e2e -- --project=chromium
```

## What each check verifies

| Level | Files | Evidence |
| --- | --- | --- |
| Unit | [`src/clinic.test.ts`](../src/clinic.test.ts) | Pure date, booking, stored-data, and queue rules, including invalid and boundary cases. |
| Component / integration | [`src/App.test.tsx`](../src/App.test.tsx) | User interactions with the actual React app: validation, chart isolation, booking, queue behavior, notes, prescriptions, and browser storage. Browser APIs can be mocked here. |
| Browser | [`e2e/clinic.spec.ts`](../e2e/clinic.spec.ts) | Desktop and mobile Chromium journeys against a production build, including reload persistence and absence of unhandled application errors. |
| CI | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Reproducible install, unit/component coverage, and the desktop/mobile browser suite on pushes, pull requests, and manual runs. |

Vitest reports coverage through `npm run test:coverage`. Coverage reports are evidence of exercised code, not proof that every requirement or branch is correct. The browser suite freezes time for repeatable dates and exercises desktop and narrow-screen navigation; the application itself uses the user's local date.

CI enforces an initial coverage floor of 75% lines, 70% branches, 65% statements, and 60% functions across the application, plus 100% for the extracted date, booking, validation, and storage helpers in `clinic.ts`. These thresholds prevent coverage from silently declining; they do not substitute for behavioral assertions.

Useful local reports are `coverage/index.html` and `playwright-report/index.html`. Browser failures retain traces and screenshots under `.context/test-results/`. These outputs are ignored by Git. Run `npx playwright show-report` from the repository root to inspect the browser report.

## Review, resolve, and iterate

1. Read the failing assertion and relevant implementation together. Reproduce the smallest meaningful failing case before changing code.
2. Fix the underlying behavior and add a regression assertion that fails without the fix. Keep patient identity and historical content in view when reviewing clinical-chart changes.
3. Rerun the affected suite, then the broader checks affected by the change. A behavior change needs unit/component, build, and browser checks.
4. Review the resulting diff for new problems, incorrect assumptions, and accidentally weakened assertions. If that review exposes another issue, fix it and rerun the relevant checks.
5. Finish only when required checks pass. Record a genuinely unavailable external check as unverified, rather than calling it passed or suppressing it.

Use behavioral assertions and negative cases: a rejected booking must leave existing appointments intact; a note save must retain its historical text; a patient switch must never reuse another patient's draft or print preview. Do not make a failing test pass by removing the assertion, adding arbitrary waits, skipping the case, or masking errors with retries.

## Limits

These checks cannot establish API authorization, shared persistence, a synchronized multi-device queue, staff identity, permitted visit transitions, atomic appointment/visit completion, audit history, migrations, or backup recovery. Browser `localStorage` tests are not server persistence tests.

Add API integration, database, and browser tests for those capabilities when they are implemented, using the requirement IDs in the SRS. Keep all fixtures synthetic, and verify workload, security, accessibility, and recovery requirements separately before handling real patient records.
