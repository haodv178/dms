using './main.bicep'

param location = 'southeastasia'
param staticWebAppLocation = 'eastasia'
param appName = 'dms'
param backendImage = 'ghcr.io/haodv178/dms-backend:latest'
param solverImage = 'ghcr.io/haodv178/dms-python-solver:latest'
param postgresAdminLogin = 'dmsadmin'
param postgresDbName = 'dms_db'
param frontendOrigin = 'http://localhost:5173'
// Pass postgresAdminPassword and jwtSecret securely via CLI flags or GitHub Actions secrets:
//   --parameters postgresAdminPassword=... jwtSecret=...
