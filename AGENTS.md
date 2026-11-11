# Repository instructions

These instructions apply throughout this repository. Read [docs/SRS.md](docs/SRS.md) for business rules and [docs/TESTING.md](docs/TESTING.md) for test commands, prerequisites, and current implementation limits.

This is a browser-only React application. There is no backend, database, or container stack in this repository.

## Required tests for changes

- Every new feature or application behavior change must include meaningful unit tests in the same change. Test new or changed business rules directly; use component tests for behavior expressed through React.
- Every bug fix must include a regression test that fails for the original defect and passes with the fix.
- Cover normal behavior, relevant boundaries, invalid input, error handling, and state transitions. Assert observable outcomes and preserved data, rather than repeating the implementation or adding placeholder assertions.
- Add component/integration tests when UI interactions, storage, or linked entities are affected. Add browser tests when a user journey, navigation, persistence, or device layout needs browser verification. Pure helper tests cannot establish shared persistence or cross-device behavior.
- Do not skip, remove, or weaken relevant tests, coverage thresholds, or CI checks to make a change pass. Fix the underlying issue; avoid arbitrary waits or retries that conceal failures.
- Documentation-only changes do not need runtime tests or meaningless new tests. Check the documentation, links, and diff instead.

## Verification

Use the existing npm scripts; [docs/TESTING.md](docs/TESTING.md) is the source of commands and setup details.

- From the repository root, run `npm ci` when dependencies need installation, `npm test` for focused unit/component feedback, and `npm run typecheck` plus `npm run test:coverage` for behavior changes. Use `npm run test:watch` during iteration when helpful.
- Run `npm run build` to verify the build, or `npm run test:e2e` when browser coverage is relevant; the browser suite builds and type-checks the app itself. Install Chromium with `npx playwright install chromium` when needed.
- Run the affected checks after changes and rerun them after fixes. Report the commands run and their results. If an external prerequisite is unavailable, report that check as unverified and explain why; never claim it passed or suppress it.
