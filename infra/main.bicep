@description('Azure region for all resources (e.g. southeastasia, eastasia, japaneast, eastus).')
param location string = 'southeastasia'

@description('Short prefix for resource names (lowercase alphanumeric).')
@minLength(2)
@maxLength(12)
param appName string = 'dms'

@description('Container image for the Node.js backend (e.g. ghcr.io/<owner>/dms-backend:<tag>).')
param backendImage string

@description('Container image for the Python OR-Tools solver (e.g. ghcr.io/<owner>/dms-python-solver:<tag>).')
param solverImage string

@description('PostgreSQL administrator username.')
param postgresAdminLogin string = 'dmsadmin'

@description('PostgreSQL administrator password (8-128 chars, upper/lower/number/symbol).')
@secure()
param postgresAdminPassword string

@description('PostgreSQL database name.')
param postgresDbName string = 'dms_db'

@description('JWT signing secret for the backend.')
@secure()
param jwtSecret string

@description('Comma-separated list of allowed frontend origins for CORS (e.g. https://your-app.vercel.app,http://localhost:5173).')
param frontendOrigin string = 'http://localhost:5173'

var suffix = uniqueString(resourceGroup().id)
var logAnalyticsName = toLower('${appName}-logs-${suffix}')
var containerAppEnvName = toLower('${appName}-env-${suffix}')
var postgresServerName = toLower('${appName}-pg-${suffix}')
var solverAppName = toLower('${appName}-solver')
var backendAppName = toLower('${appName}-backend')

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '15'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

resource postgresAllowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = {
  parent: postgresServer
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2022-12-01' = {
  parent: postgresServer
  name: postgresDbName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource solverApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: solverAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 8090
        allowInsecure: true
        transport: 'auto'
      }
    }
    template: {
      containers: [
        {
          name: 'python-solver'
          image: solverImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/'
                port: 8090
              }
              initialDelaySeconds: 5
              periodSeconds: 5
              failureThreshold: 12
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: 8090
              }
              periodSeconds: 30
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
}

var databaseUrl = 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgresServer.properties.fullyQualifiedDomainName}:5432/${postgresDbName}?schema=public&sslmode=require'

resource backendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: backendAppName
  location: location
  dependsOn: [
    postgresDatabase
    postgresAllowAzureServices
  ]
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        allowInsecure: false
        transport: 'auto'
      }
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'dms-backend'
          image: backendImage
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'JWT_SECRET'
              secretRef: 'jwt-secret'
            }
            {
              name: 'PYTHON_SOLVER_URL'
              value: 'http://${solverApp.name}'
            }
            {
              name: 'FRONTEND_ORIGIN'
              value: frontendOrigin
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/api/health'
                port: 3000
              }
              initialDelaySeconds: 5
              periodSeconds: 5
              failureThreshold: 20
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 3000
              }
              periodSeconds: 30
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '30'
              }
            }
          }
        ]
      }
    }
  }
}

output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output solverInternalUrl string = 'http://${solverApp.name}'
output postgresHost string = postgresServer.properties.fullyQualifiedDomainName
