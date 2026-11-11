# Internal Clinic Web App

A clinic operations demo with a React frontend, a PostgreSQL schema, and a Docker Compose development environment. The backend service is currently a placeholder; the frontend uses sample data stored in the current browser.

## Prerequisites

For the full local stack:

- Git
- Docker Desktop with Docker Compose v2, or Docker Engine with the Compose plugin
- Free local ports `5173` (frontend), `3000` (backend placeholder), and `5432` (PostgreSQL)

For running only the frontend without Docker:

- Node.js `22.22.2+` in the Node 22 line, Node.js `24.15+` in the Node 24 line, or Node.js `26+`, and npm (see `frontend/package.json`)

Install Git from [git-scm.com](https://git-scm.com/downloads), Node.js from [nodejs.org](https://nodejs.org/en/download), or Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/). Check the installations with:

```sh
git --version
node --version
npm --version
docker --version
docker compose version
```

## Run the full stack with Docker Compose

Clone the repository and enter its directory:

```sh
git clone https://github.com/trycharoo/Internal-Clinic-Web-app.git
cd Internal-Clinic-Web-app
```

Create a local environment file and replace the example passwords with local development values:

```sh
cp .env.example .env
```

Start the services:

```sh
docker compose up -d
docker compose logs -f frontend
```

When Vite reports that it is ready, open [http://localhost:5173](http://localhost:5173). The frontend, backend placeholder, PostgreSQL, and Redis run in Compose. PostgreSQL and Redis data persist in Docker volumes when the services stop.

To stop the services:

```sh
docker compose down
```

To also delete the local database, Redis, and frontend dependency volumes, run `docker compose down -v`.

The default host ports are `5173`, `3000`, and `5432`. If one is already in use, change `FRONTEND_PORT`, `BACKEND_PORT`, or `POSTGRES_PORT` in `.env`.

## Run only the frontend

From the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). To create and preview a production build:

```sh
npm run build
npm run preview
```

## Requirements and workflow

The [software requirements specification](docs/SRS.md) defines the proposed walk-in workflow: reception confirms or registers a patient, records triage, queues the visit for the doctor, and retains the consultation and prescriptions in the patient history. It includes requirement IDs, acceptance scenarios, and a matrix showing which behaviors exist in the demo, which are represented only in SQL, and which need backend implementation.

## Tests and CI/CD

Contributions must follow the repository-wide [testing policy in AGENTS.md](AGENTS.md): every new feature or behavior change includes meaningful unit tests, and every bug fix includes a regression test. Documentation-only changes do not require runtime tests. [Testing and delivery](docs/TESTING.md) provides the check commands and prerequisites.

Run the frontend checks:

```sh
cd frontend
npm ci
npm run test:coverage
npx playwright install chromium
npm run test:e2e
```

The browser suite builds and type-checks the app, then tests desktop and mobile Chromium against a production preview. From the repository root, test the disposable development stack and production image with Docker:

```sh
sh scripts/test-stack.sh
sh scripts/test-image.sh
```

GitHub Actions validates the workflow/scripts, runs unit/component/browser tests, checks PostgreSQL constraints on a fresh database, and smoke-tests the production image. After all checks pass on a `main` push, it publishes that tested demo image to `ghcr.io/<owner>/<repository>/frontend` with the commit SHA and `main` tags. No live application deployment is configured.

See [testing and delivery](docs/TESTING.md) for commands, reports, CI jobs, and the review–resolve–iterate process. Configure repository branch protection to require the CI checks before merging.

## Current demo limitations

- The backend container is a placeholder and does not provide an API yet. PostgreSQL and Redis start for local development, but the frontend does not use them.
- Patient, appointment, and queue demo data is stored in browser `localStorage`. Queue check-ins do not synchronize between different browsers or devices.
- `db/init.sql` runs when Docker creates a new, empty PostgreSQL data volume. Existing volumes are not reinitialized on subsequent starts.
- Authentication, enforced staff roles, server-backed triage/visit transitions, and audit history remain planned. A queue ticket marked seen does not finalize a clinical encounter.

Do not use real patient data or production credentials in this demo.
