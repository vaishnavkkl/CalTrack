# Production deployment

## Recommended single-server setup

1. Install Node.js 24 LTS.
2. Copy the repository and run `npm ci`.
3. Create `.env` with production values:

```env
NODE_ENV=production
PORT=8787
DB_PATH=/srv/caltrack/data/caltrack.db
RESPONSE_FILES_PATH=/srv/caltrack/data/response-files
APP_ORIGIN=https://caltrack.example.com
ADMIN_USERNAME=superadmin
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=a-long-unique-initial-password
SESSION_SECRET=a-long-random-secret
```

4. Run `npm run db:migrate` and `npm run db:seed`.
5. Run `npm run build`.
6. Serve `apps/web/dist` from Caddy, nginx, or the hosting platform and reverse-proxy `/api/*` to `127.0.0.1:8787`.
7. Run `npm start` under a process supervisor.
8. Schedule `npm run db:backup` and copy both the database and its matching response-files snapshot off the server.

Keep the frontend and API on the same HTTPS origin so session cookies work without cross-origin configuration.

## Release checklist

- Production secrets are set and are not committed
- HTTPS is enabled
- The data directory is writable only by the application account
- Daily backups complete and a restore has been tested
- Cal eProcure collection timing remains respectful
- `npm test` and `npm run build` pass

## PostgreSQL

SQLite is the production recommendation for the current workload. PostgreSQL becomes appropriate if the product later needs multiple API instances or managed database replication. Implement it behind a repository layer rather than exposing database-specific behavior to React or connectors.
