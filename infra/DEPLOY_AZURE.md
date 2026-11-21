# Deploying DMS Backend to Azure

This setup deploys the full DMS backend stack to **Azure Container Apps (Consumption, scale-to-zero)** + **Azure Database for PostgreSQL Flexible Server (Burstable `Standard_B1ms`)** using **Bicep** and **GitHub Actions** with **OIDC Federated Credentials** and **GitHub Container Registry (`ghcr.io`)**.

## Architecture

- **`dms-backend`** (Azure Container App, external HTTPS ingress on port `3000`)
- **`dms-solver`** (`python-solver`, Azure Container App, internal-only HTTP ingress on port `8090`, reached by backend at `http://dms-solver`)
- **`dms-pg-<hash>`** (Azure Database for PostgreSQL Flexible Server v15, `Standard_B1ms`, SSL required)
- **Container Images**: `ghcr.io/haodv178/dms-backend` and `ghcr.io/haodv178/dms-python-solver` (public GHCR packages)

---

## One-Time Azure Setup (Run in Azure Cloud Shell)

You do **not** need `az` CLI installed locally. Open [Azure Cloud Shell](https://shell.azure.com/) (Bash) and run the commands below.

### 1. Set Variables & Create Resource Group

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
RG_NAME="rg-dms-backend"
LOCATION="southeastasia"
APP_NAME="dms-github-deploy"
GITHUB_REPO="haodv178/dms"

az group create --name "$RG_NAME" --location "$LOCATION"
```

### 2. Create Entra ID App Registration + OIDC Federated Credential

```bash
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
az ad sp create --id "$APP_ID"

# Grant Contributor on the resource group
az role assignment create \
  --assignee "$APP_ID" \
  --role Contributor \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG_NAME"

# Allow GitHub Actions on branch `main` to authenticate via OIDC (no client secret needed)
az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"github-main\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${GITHUB_REPO}:ref:refs/heads/main\",
  \"description\": \"GitHub Actions deploy from main\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"

echo "=== Copy these 3 values into GitHub Repository Secrets ==="
echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$TENANT_ID"
echo "AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
```

### 3. Register Required Resource Providers (if new Azure subscription)

```bash
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait
az provider register --namespace Microsoft.DBforPostgreSQL --wait
```

---

## 4. Configure GitHub Repository Secrets & Variables

In your GitHub repo (`haodv178/dms`), go to **Settings → Secrets and variables → Actions**:

### Secrets (Required)

| Secret | Value |
| --- | --- |
| `AZURE_CLIENT_ID` | Output from Step 2 |
| `AZURE_TENANT_ID` | Output from Step 2 |
| `AZURE_SUBSCRIPTION_ID` | Output from Step 2 |
| `POSTGRES_ADMIN_PASSWORD` | Strong password (8–128 chars, upper + lower + number + symbol; avoid spaces) |
| `JWT_SECRET` | Random 64-char hex string (e.g. `openssl rand -hex 32`) |

### Variables (Optional)

| Variable | Default | Description |
| --- | --- | --- |
| `AZURE_RESOURCE_GROUP` | `rg-dms-backend` | Target Azure Resource Group |
| `AZURE_LOCATION` | `southeastasia` | Azure region (`eastasia`, `japaneast`, `eastus`, etc.) |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Comma-separated allowed CORS origins (set to your deployed frontend URL, e.g. `https://dms-web.vercel.app`) |

---

## 5. First Deployment & Making GHCR Packages Public

1. Push your changes to `main` (or manually run **Actions → Deploy DMS Backend to Azure → Run workflow**).
2. The `build-and-push` job will publish `dms-backend` and `dms-python-solver` to `ghcr.io/haodv178/...`.
3. **If your GitHub repository is private**:
   - On the very first run, GitHub creates the two packages as **private** by default, so `deploy-azure` may fail to pull the images until they are made public.
   - Go to **GitHub Profile → Packages → `dms-backend` → Package settings → Danger Zone → Change visibility → Public** (repeat for `dms-python-solver`).
   - Re-run the `deploy-azure` job — Azure Container Apps will then pull both images with no credentials needed.
4. Once `deploy-azure` succeeds, open the **Workflow Run Summary** to copy your **Backend URL** (`https://dms-backend.<env>.southeastasia.azurecontainerapps.io`).

---

## 6. Connect Your Frontend

In your frontend host (Azure Static Web Apps, Vercel, Netlify, etc.):
1. Set `VITE_API_BASE_URL` to `https://<your-backend-fqdn>/api`.
2. Add your deployed frontend URL to the `FRONTEND_ORIGIN` GitHub Repository Variable (e.g., `https://your-frontend.vercel.app,http://localhost:5173`) and re-run the workflow so CORS updates on the backend.

---

## Troubleshooting

- **PostgreSQL quota / capacity error in `southeastasia` (common on Azure for Students)**:
  Set the `AZURE_LOCATION` GitHub variable (or `workflow_dispatch` input) to `eastasia`, `japaneast`, or `eastus`, and re-run.
- **Inspect backend logs in Azure Cloud Shell**:
  ```bash
  az containerapp logs show --name dms-backend --resource-group rg-dms-backend --follow
  ```
- **Cold-start delay**:
  Because `minReplicas: 0` saves cost, the first request after ~5 minutes of inactivity takes a few seconds while the container wakes up.
