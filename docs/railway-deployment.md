# Railway deployment

CalTrack runs as one Node 24 service: the API serves the compiled React frontend, and SQLite plus uploads are stored on an attached Railway volume. No separate database service is needed.

## Required configuration

- Attach a persistent volume at `/data` **before the first deployment**.
- Keep a single service replica because SQLite and local uploads share that volume.
- Set `NODE_ENV=production`, `DB_PATH=/data/caltrack.db`, and `RESPONSE_FILES_PATH=/data/uploads`.
- Set `ADMIN_USERNAME`, `ADMIN_EMAIL`, a strong unique `ADMIN_PASSWORD`, and a random `SESSION_SECRET` (at least 32 bytes). The administrator is created only when the database has no users. Changing the initial password variable does not reset an existing user's password.
- Railway supplies `PORT`. The Dockerfile builds the frontend and starts the API. `/api/health` is the health check.
- Generate a Railway HTTPS domain for the service. Frontend and API use the same origin and secure session cookies.
- Set `APP_ORIGIN` to the exact Railway HTTPS origin so browser-origin checks accept the hosted site.
- Local data, secrets, build artifacts, and backups are excluded from deployment uploads. A new volume starts with an empty workspace and the configured administrator, without local demo accounts.

## Update the service

Run `npm run build` and `npm test`, then `railway up --service caltrack` from the linked project root. Do not delete the volume during redeployment. Account authentication uses `railway login`.

`railway.json` currently provides the build and health-check configuration. Railway's CLI reports this format will be retired on December 1, 2026; migrate with `railway config migrate` before then.

## Storage and backups

In Settings → Data management, search/filter uploaded files, download them, or permanently delete individual response files and resumes. Candidate profiles and bids remain. Full data reset also removes resumes; it preserves users and portal settings.

Resume uploads accept PDF, DOC, and DOCX up to 5 MB. File extension and basic signatures are checked; this is not a malware scan. Downloads require an authenticated bid manager or the candidate's submitting user.

Back up both the database and `/data/uploads`. For a manual file backup, stop writes and checkpoint SQLite before copying the database; copying a live `.db` without its WAL can omit recent changes. Railway volume snapshots include the volume contents. Do not use a clean redeployment as a backup strategy.

## Free usage limits

Railway's current trial provides $5 credit for up to 30 days, then $1/month of free credit. Usage and account restrictions apply, so continuous operation is not guaranteed to remain free. Trial volumes can be deleted 30 days after credits expire. Review account usage and export important data before credits expire; upgrading requires the owner's decision.

Sources: https://docs.railway.com/pricing/free-trial and https://docs.railway.com/volumes/reference.
