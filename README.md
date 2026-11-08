# Internal Clinic Web App

A clinic operations demo with a React frontend, a PostgreSQL schema, and a Docker Compose development environment. The backend service is currently a placeholder; the frontend uses sample data stored in the current browser.

## Prerequisites

For the full local stack:

- Git
- Docker Desktop with Docker Compose v2, or Docker Engine with the Compose plugin
- Free local ports `5173` (frontend), `3000` (backend placeholder), and `5432` (PostgreSQL)

For running only the frontend without Docker:

- Node.js `22.12+` and npm (Vite also supports Node.js `20.19+`)

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

## Current demo limitations

- The backend container is a placeholder and does not provide an API yet. PostgreSQL and Redis start for local development, but the frontend does not use them.
- Patient, appointment, and queue demo data is stored in browser `localStorage`. Queue check-ins do not synchronize between different browsers or devices.
- `db/init.sql` runs when Docker creates a new, empty PostgreSQL data volume. Existing volumes are not reinitialized on subsequent starts.

Do not use real patient data or production credentials in this demo.
