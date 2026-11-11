# Internal Clinic Web App

A browser-only React demo of an internal clinic workspace for walk-ins, appointments, patient charts, and prescription drafts. Patient, appointment, and queue data is stored in the current browser with `localStorage`; there is no backend, API, database, or authentication.

## Prerequisites

- Git
- Node.js `22.22.2+` in the Node 22 line, Node.js `24.15+` in the Node 24 line, or Node.js `26+`
- npm

Install Git from [git-scm.com](https://git-scm.com/downloads) and Node.js from [nodejs.org](https://nodejs.org/en/download). Check the installations with:

```sh
git --version
node --version
npm --version
```

## Run locally

Clone the repository and install dependencies:

```sh
git clone https://github.com/trycharoo/Internal-Clinic-Web-app.git
cd Internal-Clinic-Web-app
npm ci
```

Start the development server:

```sh
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build and preview

```sh
npm run build
npm run preview
```

## Tests

```sh
npm ci
npm run typecheck
npm run test:coverage
npx playwright install chromium
npm run test:e2e
```

The browser suite builds and type-checks the app, then tests desktop and mobile Chromium against a production preview. See [testing](docs/TESTING.md) for commands, reports, and the testing policy.

## Requirements and current limits

The [software requirements specification](docs/SRS.md) defines the intended clinic workflow, including the still-planned backend, authorization, and database behavior.

- Patient, appointment, and queue data is stored in browser `localStorage`; it does not synchronize between browsers or devices.
- The displayed doctor identity is sample content. Authentication and enforced staff roles are not implemented.
- There is no API, PostgreSQL database, audit history, or server-backed persistence.
- Do not use real patient data or production credentials in this demo.
