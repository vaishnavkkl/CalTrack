# CalTrack architecture

## Design goals

CalTrack is designed around a focused procurement workflow and efficient operation. Authentication, persistence, collection, relevance, and UI modules remain separate without introducing unnecessary infrastructure.

## Runtime boundaries

### Web

`apps/web/src/app` contains the React application. Its operational modules are:

1. Dashboard
2. RFO intelligence feed
3. Bid Decisions
4. Talent Sourcing
5. Response Center
6. Source Registry
7. Collection Activity
8. Settings

The browser never accesses the database directly. All durable mutations use `/api`.

### API

`apps/api/src/index.mjs` provides the same-origin JSON API. Allowlisted opportunity mutation fields prevent arbitrary column updates. Cookie sessions are HTTP-only, same-site, expire after 12 hours, and are stored in process memory. Restarting the API clears active sessions without affecting application data.

### Database

SQLite is the default database for this focused workload. It is persistent, transactional, portable, inexpensive, and easy to back up. Write-ahead logging and foreign keys are enabled. SQL migrations are ordered under `apps/api/src/migrations`.

If horizontally scaled API instances become a requirement, introduce a repository interface around the current prepared statements and add a PostgreSQL implementation.

## Opportunity identity

The database enforces a unique `(source_portal, solicitation_number)` pair. Collection additionally checks `source_url`. A matching record is updated, preserving:

- first collected date
- user notes, tags, status, and bookmark
- last checked and last updated timestamps
- current source status

## Connector contract

A connector owns only source-specific behavior:

1. Fetch using the portal’s expected session flow
2. Parse the source response
3. Return normalized fields

The collector then applies shared IT relevance filtering, duplicate checks, persistence, and job logging. This prevents a portal change from affecting other connectors.

## Bid workflow

Every opportunity receives one `bid_workflows` record through a database trigger. Bid manager records the go/no-go outcome and standardized rejection reason, defines required roles, and publishes an approved sourcing brief. Candidate Sourcing submits profiles against that brief. Bid manager owns candidate shortlisting, the response-document checklist, and the versioned response package. Bid manager downloads and evaluates each uploaded file, records approvals or requested changes, and controls final package approval and submission.

Response-file metadata and review history are stored in SQLite while file content is stored under `RESPONSE_FILES_PATH`. Downloads are authenticated and limited to management roles. File type, per-file size, batch size, and normalized storage paths are validated before atomic metadata insertion. Database backups create a matching response-files snapshot.

The opportunity and workflow records remain separate so source refreshes can update public procurement facts without overwriting internal decisions, staffing, or response work.

## California and relevance guardrails

Automated sources are registered as California public-sector portals in Portal Controls. Cal eProcure is intrinsically California state procurement. The collector then requires an IT term and rejects common non-IT categories before persistence. Configurable keywords are stored in settings; the next collection iteration can move the shared regular expressions into a settings-driven scoring service without changing connectors.

## Security model

- Two server-enforced roles: `super_admin` (Bid manager) and `sourcing_user` (Sourcing member). Migration 015 merges legacy `admin` accounts into `super_admin`.
- Candidate Sourcing receives only pursued and published RFOs; source URLs, buyer contacts, documents, internal notes, and workflow ownership are removed by the API
- Only Bid managers can change decisions, resource requirements, candidates, or response documentation
- Only Bid manager can approve, mark submitted, or delete an opportunity
- Password hashing with Node `scrypt`
- Parameterized SQL queries
- HTTP-only, same-site session cookies; `Secure` in production
- Field allowlists and request-size limits
- Required production secrets
- Same-origin frontend/API deployment recommended
