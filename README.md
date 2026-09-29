# CalTrack

CalTrack is a procurement intelligence workspace for discovering, evaluating, and managing California public-sector technology opportunities.

## Features

- Cal eProcure connector with normalized opportunity records
- Description-aware discovery for solicitations listed only by RFO/event number
- Broad IT services coverage with permanent hardware-procurement exclusion
- Open opportunities only, with deadlines normalized to Pacific Time
- Search, filtering, sorting, relevance scoring, and deadline tracking
- Central RFO feed with source documents, bookmarks, notes, tags, archive, and CSV export
- Multi-source registry and collection health monitoring for Cal eProcure, OpenGov, PlanetBids, EUNA, and approved feeds
- Resource Review go/no-go queue with standardized no-bid reasons
- Structured role requirements and sourcing briefs published to the Candidate Sourcing team
- Candidate submissions, shortlisting, and qualification review per RFO
- Response documentation checklist with owners and readiness status
- Multi-file or combined-package uploads with categories, checklist mapping, version history, and authenticated downloads
- Super-admin per-file review, change requests, approval notes, and final submission gate
- Two server-enforced roles: Bid manager and Sourcing member
- Duplicate-aware updates using solicitation numbers and source URLs
- Persistent SQLite storage with migrations, backups, and restore tooling
- Secure authenticated access

## Project structure

```text
caltrack/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── connectors/
│   │   │   ├── migrations/
│   │   │   └── *.mjs
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   └── app/
│       ├── index.html
│       ├── package.json
│       └── vite.config.ts
├── docs/
├── .env.example
├── package.json
└── package-lock.json
```

The repository uses npm workspaces. Application code is contained under `apps/`; the root contains only shared project configuration and documentation.

## Requirements

- Node.js 22.5 or newer
- npm 10 or newer

## Local development

From PowerShell or Command Prompt in the project root:

```bash
copy .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

On macOS or Linux, use `cp .env.example .env`.

Open `http://localhost:5173`.

For later runs, after dependencies and the database are initialized, only this is required:

```bash
npm run dev
```

Keep that terminal open while using the application. Press `Ctrl+C` to stop both the API and web server.

## Multi-source RFO intake

Cal eProcure is collected through its native connector. Approved portal feeds, partner integrations, or a small scheduled collector can send normalized OpenGov, PlanetBids/VendorLine, EUNA/Bonfire, and other records to:

```text
POST http://localhost:8787/api/integrations/opportunities
X-CalTrack-API-Key: your-INTEGRATION_API_KEY
Content-Type: application/json
```

Set `INTEGRATION_API_KEY` to a separate long random key. Records pass through deadline, IT-relevance, duplicate, and hardware-exclusion checks before entering the RFO intelligence feed. A normal portal webpage or vendor login URL is not a feed; use only official APIs, permitted exports, licensed aggregators, or collection methods allowed by the source.

The application does not store vendor usernames or passwords.

Development credentials are created by the seed for each workflow role:

```text
Bid manager:                  superadmin / superadmin123
Bid manager (legacy login):   admin / admin123
Sourcing member:              user / user123
```

Set `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` before initializing a production database.

## Commands

Every root command delegates to the appropriate workspace:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API and web application |
| `npm run build` | Type-check and build the web application |
| `npm start` | Start the production API |
| `npm test` | Run connector tests |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Initialize application data |
| `npm run db:backup` | Create a database backup |
| `npm run db:restore -- path/to/backup.db` | Restore a validated backup |

## Runtime architecture



```text
React + Vite
    │
    │ /api
    ▼
Node HTTP API
    ├── authentication and sessions
    ├── opportunity services
    ├── portal and collection services
    └── connector adapters
    ▼
SQLite
```

See [Architecture](docs/ARCHITECTURE.md) and [Deployment](docs/DEPLOYMENT.md) for implementation and hosting details.

## Adding a connector

Add the source adapter under `apps/api/src/connectors/` and register it in `apps/api/src/collector.mjs`. Keep source-specific fetching and parsing inside the adapter; filtering, duplicate detection, persistence, and job logging remain in the shared collector.

## Simplified workspace

Start in Find RFOs, select Prepare this bid, then qualify and prepare the response. Candidates remain available for staffing. Workspace settings contains sources, collection history, and preferences. RFO titles wrap in full; drag the name-column edge or focus it and use the arrow keys to resize. Double-click the edge to reset. Width is saved in this browser.

The RFO list fits the screen by default, with deadlines beside the title. Choose **Fit columns to screen** to return from a custom width. On phones, records stack with their deadlines visible. The header's minus/plus controls adjust page zoom from 75% to 125%; select the percentage to reset. Zoom and light/dark preferences are saved in this browser.

Prepare bids separates **Decision**, **Contract details**, and **People** while retaining edits when switching sections. **Remove from preparation** is available in the queue and selected-bid header. Removing a bid keeps the original RFO, saved notes, candidates, and files; add it again through Find RFOs when needed.

Migration 015 merges existing admin accounts into the Bid manager role (`super_admin`), including final review and submission permissions. Sourcing members (`sourcing_user`) retain restricted access. Restart the API to apply the migration; existing users should sign in again.

IT eligibility now requires technology evidence in the title or description. Generic consulting, staffing, subscriptions, and data collection alone do not qualify. Metadata and custom ranking keywords cannot bypass this gate. Existing records are filtered on feed reads without deleting their saved workflows.
