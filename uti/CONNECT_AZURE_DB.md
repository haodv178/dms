# Connecting to the Azure PostgreSQL Database

The PostgreSQL Flexible Server (`dms-pg-<hash>`) is provisioned by `infra/main.bicep` in resource group `rg-dms-backend` with SSL required and only Azure-internal access enabled by default (`AllowAllAzureServicesAndResourcesWithinAzureIps`).

## Connection Details

| Field | Value |
| --- | --- |
| **Host** | `dms-pg-uxrg5ueztsrkw.postgres.database.azure.com` |
| **Port** | `5432` |
| **Database** | `dms_db` |
| **Username** | `dmsadmin` |
| **Password** | `@123456#` |
| **SSL Mode** | `require` |

## Option 1: Connect from Azure Cloud Shell (No Firewall Change Needed)

Cloud Shell runs inside Azure, so it works with the default firewall rule:

```bash
HOST=$(az postgres flexible-server list -g rg-dms-backend --query "[0].fullyQualifiedDomainName" -o tsv)
PGSSLMODE=require psql -h "$HOST" -p 5432 -U dmsadmin -d dms_db
```

## Option 2: Connect from Your Local Machine (`psql`, DBeaver, TablePlus, DataGrip, Prisma Studio)

1. **Whitelist your public IP** (choose either):
   - **Azure Portal**: `rg-dms-backend` → `dms-pg-<hash>` → **Settings → Networking** → **Add current client IP address** → **Save**.
   - **Azure CLI**:
     ```bash
     SERVER=$(az postgres flexible-server list -g rg-dms-backend --query "[0].name" -o tsv)
     HOST=$(az postgres flexible-server list -g rg-dms-backend --query "[0].fullyQualifiedDomainName" -o tsv)
     echo "Host: $HOST"

     # Replace <YOUR_PUBLIC_IP> with your IP (e.g. from `curl ifconfig.me`)
     az postgres flexible-server firewall-rule create \
       --resource-group rg-dms-backend \
       --name "$SERVER" \
       --rule-name allow-my-ip \
       --start-ip-address <YOUR_PUBLIC_IP> \
       --end-ip-address <YOUR_PUBLIC_IP>
     ```

2. **Connect**:
   - **`psql`**:
     ```bash
     psql "postgresql://dmsadmin:<URL_ENCODED_PASSWORD>@<HOST>:5432/dms_db?sslmode=require"
     ```
     *(If your password contains special characters like `@`, `#`, `/`, or `%`, URL-encode them in the URI or use `PGSSLMODE=require psql -h <HOST> -p 5432 -U dmsadmin -d dms_db` to enter the password interactively.)*
   - **GUI client (DBeaver / TablePlus / DataGrip / pgAdmin)**: Use the host, port `5432`, database `dms_db`, user `dmsadmin`, password, and set **SSL mode = `require`**.
   - **Prisma Studio** (run inside `backend/`):
     ```bash
     DATABASE_URL="postgresql://dmsadmin:<URL_ENCODED_PASSWORD>@<HOST>:5432/dms_db?schema=public&sslmode=require" npx prisma studio
     ```

3. **Remove the temporary firewall rule when finished**:
   ```bash
   az postgres flexible-server firewall-rule delete \
     --resource-group rg-dms-backend \
     --name "$SERVER" \
     --rule-name allow-my-ip --yes
   ```
