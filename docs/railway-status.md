# Deployment status — September 29, 2026

The website is **not live yet**. Railway rejected GitHub source deployment and CLI upload with `Deploys have been paused temporarily`. Its status page reports an API degradation affecting deployments: https://status.railway.com/.

Prepared and verified:

- Project: `caltrack` (`d88d4da2-7a69-4d2e-a0af-2db2ccb4ea50`)
- Environment: `production` (`712025c1-0860-4f8d-93a6-c6d30608ec5d`)
- Service: `caltrack` (`4ab5eaba-9bd9-44d5-b221-5ddd97bc2c1c`)
- GitHub source: `vaishnavkkl/CalTrack`, branch `main`, release commit `e6da6b2`
- Persistent volume: `caltrack-volume`, 500 MB, mounted at `/data`
- Reserved HTTPS address: https://caltrack-production-23e8.up.railway.app
- Account confirmed as trialing, 30 days remaining and $5 credit at setup; no paid usage subscription was enabled.
- Unique production credentials, `APP_ORIGIN`, and storage variables configured. Private login details: `artifacts/private/hosted-login.txt` (excluded from Git and deployment).
- Local records were not uploaded. First start will create a clean database; current local files remain untouched.

When Railway resumes deployments, run from the project root:

```powershell
npx.cmd --yes @railway/cli up --service caltrack --detach --json
npx.cmd --yes @railway/cli deployment list --service caltrack --json
```

Wait for a successful deployment, then verify `/api/health`, the sign-in page, an authenticated login, and Settings → Data management. An assigned domain does not mean the app has been deployed.

The production build, 29 API tests, responsive UI checks, and full npm audit passed locally. The audit found zero known package vulnerabilities. Login retry limiting, cross-origin request checks, secure cookies, and browser security headers are enabled. Hosted smoke checks remain pending until Railway accepts a deployment.
