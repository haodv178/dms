# AGENTS.md

Project-level architecture, infrastructure, and deployment context for AI coding agents.
(For frontend UI/Astryx component rules, also read `frontend/AGENTS.md`.)

## Repository Structure

- `frontend/` — Vite 6 + React 19 + TypeScript SPA (hash routing, `VITE_API_BASE_URL` build-time env var).
- `backend/` — Node.js / Express + Prisma API (port `3000`, health check at `/api/health`).
- `python-solver/` — Python OR-Tools routing solver (port `8090`, health check at `/`).
- `infra/` — Azure Bicep IaC (`main.bicep`, `main.bicepparam`) and full deployment runbook (`DEPLOY_AZURE.md`).
- `.github/workflows/` — GitHub Actions CI/CD workflows for Azure deployment.
- `docker-compose.yml`, `start.sh`, `stop.sh` — Local development stack.

## Azure Infrastructure (`infra/main.bicep`)

All production resources are provisioned in a single Azure Resource Group (default: `rg-dms-backend`):

- **`dms-frontend`** — Azure Static Web Apps (`Microsoft.Web/staticSites`, **Free** tier, control-plane region `eastasia`, global CDN HTTPS, `stagingEnvironmentPolicy: 'Disabled'`).
- **`dms-backend`** — Azure Container App (Consumption, `southeastasia`, external HTTPS ingress on port `3000`, `minReplicas: 0`, `maxReplicas: 2`).
- **`dms-solver`** — Azure Container App (Consumption, `southeastasia`, internal-only ingress on port `8090`, `minReplicas: 0`, `maxReplicas: 2`), called by `dms-backend` via `PYTHON_SOLVER_URL`.
- **`dms-pg-<hash>`** — Azure Database for PostgreSQL Flexible Server v15 (`Standard_B1ms`, `southeastasia`, SSL required).
- **Container Registry** — Public GitHub Container Registry packages: `ghcr.io/haodv178/dms-backend` and `ghcr.io/haodv178/dms-python-solver`.

## CI/CD Workflows

Both workflows authenticate to Azure via **Entra ID OIDC Federated Credentials** (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) scoped to `refs/heads/main` only (production-only, no PR preview environments):

1. **`.github/workflows/deploy-backend-azure.yml`**
   - Triggers on `push` to `main` touching `backend/**`, `python-solver/**`, `infra/**`, or the workflow file (plus `workflow_dispatch`).
   - Builds and pushes `dms-backend` and `dms-python-solver` images (`linux/amd64`) to GHCR, deploys `infra/main.bicep`, and smoke-tests `/api/health`.
2. **`.github/workflows/deploy-frontend-azure.yml`**
   - Triggers on `push` to `main` touching `frontend/**` or the workflow file (plus `workflow_dispatch`).
   - Dynamically fetches `dms-backend`'s FQDN (`VITE_API_BASE_URL=https://<backend-fqdn>/api`) and `dms-frontend`'s SWA deployment token via `az` CLI, builds `frontend/` on Node 22, deploys `frontend/dist` via `@azure/static-web-apps-cli@2 --env production`, and smoke-tests the live URL.

## Key Invariants & Gotchas

- **CORS auto-wiring**: `infra/main.bicep` automatically prepends `https://${frontendApp.properties.defaultHostname}` to `dms-backend`'s `FRONTEND_ORIGIN` env var (alongside any extra origins from the `frontendOrigin` parameter, e.g., `http://localhost:5173`). Do not remove this wiring.
- **Cross-origin auth cookies**: `backend/src/lib/auth.ts` sets `HttpOnly; Secure; SameSite=None` on refresh cookies in production so `*.azurestaticapps.net` can authenticate against `*.azurecontainerapps.io`. Keep `credentials: true` in `backend/src/index.ts` and `withCredentials: true` in `frontend/src/api/httpClient.ts`.
- **SWA config**: Keep `frontend/public/staticwebapp.config.json` (Vite copies it into `frontend/dist/` for SPA fallback routing and response headers).
- **Local Docker Compose**: Keep `frontend/Dockerfile` and `frontend/nginx.conf` intact — they are still used for local `docker-compose.yml`, even though production frontend runs on Azure Static Web Apps.
- **First-run / infra dependency**: `dms-frontend` is provisioned by `infra/main.bicep` (run via `deploy-backend-azure.yml`). If `infra/main.bicep` hasn't been deployed yet, `deploy-frontend-azure.yml` will fail until the backend/infra workflow creates `dms-frontend`.
- **Cold starts**: Both `dms-backend` and `dms-solver` scale to zero (`minReplicas: 0`), so the first API request after inactivity may take a few seconds.
- **Full runbook & troubleshooting**: See `infra/DEPLOY_AZURE.md` (OIDC setup, required providers `Microsoft.App`, `Microsoft.OperationalInsights`, `Microsoft.DBforPostgreSQL`, `Microsoft.Web`, secrets/variables, and troubleshooting).
