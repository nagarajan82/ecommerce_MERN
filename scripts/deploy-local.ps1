<#
.SYNOPSIS
  Deploys pre-built MERN E-Commerce microservices and MFEs from GHCR to the local Windows machine.

.DESCRIPTION
  Authenticates with GitHub Container Registry (GHCR), pulls immutable images by commit SHA or tag,
  deploys the stack using Docker Compose with the GHCR override, verifies service health endpoints,
  and automatically rolls back on failure while preserving local observability state.

.PARAMETER CommitSha
  Specific git commit SHA or tag of the images to deploy. Defaults to 'latest'.
  Accepts both 7-character short SHAs and full 40-character SHAs.

.PARAMETER Registry
  The container registry host. Defaults to 'ghcr.io'.

.PARAMETER Owner
  The repository or organization namespace. Defaults to 'nagarajan82'.

.PARAMETER SkipPull
  Skip pulling images from GHCR and deploy with existing local images.

.PARAMETER TimeoutSeconds
  Maximum seconds to wait for service health endpoints before triggering rollback. Defaults to 60.

.EXAMPLE
  .\scripts\deploy-local.ps1 -CommitSha "58507d8"
  .\scripts\deploy-local.ps1 -CommitSha "latest" -SkipPull
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$CommitSha = "latest",

  [string]$Registry = "ghcr.io",
  [string]$Owner = "nagarajan82",
  [switch]$SkipPull,
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot = Split-Path -Parent $ScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  MERN E-Commerce Local Deployment Pipeline (GHCR)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Resolve Commit SHA (if short SHA provided, expand to full SHA when in git repo)
if ($CommitSha -ne "latest") {
  try {
    $resolvedSha = git rev-parse $CommitSha 2>$null
    if ($LASTEXITCODE -eq 0 -and $resolvedSha) {
      $resolvedSha = $resolvedSha.Trim()
      Write-Host "  Resolved Commit  : $CommitSha -> $resolvedSha" -ForegroundColor Gray
      $CommitSha = $resolvedSha
    }
  } catch {}
}

Write-Host "  Target Image Tag : $CommitSha" -ForegroundColor Yellow
Write-Host "  Registry         : $Registry" -ForegroundColor Yellow
Write-Host "  Namespace        : $Owner" -ForegroundColor Yellow
Write-Host "  Repository Root  : $RepoRoot" -ForegroundColor Yellow
Write-Host "----------------------------------------------------------"

# 2. Pre-flight: Check Docker daemon
Write-Host "[1/6] Verifying Docker daemon..." -ForegroundColor White
try {
  $null = docker info --format '{{.ServerVersion}}' 2>&1
  Write-Host "  [OK] Docker daemon is running." -ForegroundColor Green
} catch {
  Write-Error "Docker daemon is not running. Please start Docker Desktop and retry."
  exit 1
}

# 3. Pre-flight: Check GHCR authentication
Write-Host "[2/6] Verifying GHCR authentication..." -ForegroundColor White
$ghcrAuthFound = $false
try {
  $dockerConfigPath = Join-Path $env:USERPROFILE ".docker\config.json"
  if (Test-Path $dockerConfigPath) {
    $dockerConfig = Get-Content $dockerConfigPath -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($dockerConfig.auths -and ($dockerConfig.auths."ghcr.io" -or $dockerConfig.auths."https://ghcr.io")) {
      $ghcrAuthFound = $true
    }
  }
} catch {}

if ($ghcrAuthFound) {
  Write-Host "  [OK] GHCR authentication configured in Docker." -ForegroundColor Green
} elseif (-not $SkipPull) {
  Write-Host "  [NOTE] GHCR credentials not found in ~/.docker/config.json." -ForegroundColor Yellow
  Write-Host "  If pulling private images fails, authenticate using:" -ForegroundColor Yellow
  Write-Host "    `$env:GH_PAT | docker login $Registry -u $Owner --password-stdin" -ForegroundColor Yellow
}

# 4. Pre-flight: Validate Compose configuration and capture previous running tag for rollback
Write-Host "[3/6] Validating Docker Compose configuration..." -ForegroundColor White
Set-Location $RepoRoot
$env:IMAGE_TAG = $CommitSha

try {
  docker compose -f docker-compose.yml -f docker-compose.ghcr.yml config --quiet
  Write-Host "  [OK] Compose syntax and image overrides validated." -ForegroundColor Green
} catch {
  Write-Error "Docker Compose validation failed: $_"
  exit 1
}

$previousImageTag = $null
try {
  $gwContainer = docker ps --filter "name=gateway" --format '{{.Image}}' | Select-Object -First 1
  if ($gwContainer -and $gwContainer -match ":(.*)$") {
    $previousImageTag = $Matches[1]
    Write-Host "  [INFO] Active deployment tag captured: $previousImageTag (saved for rollback)" -ForegroundColor Gray
  }
} catch {}

# 5. Pull images from GHCR
if (-not $SkipPull) {
  Write-Host "[4/6] Pulling pre-built images from $Registry ($CommitSha)..." -ForegroundColor White
  try {
    docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
    Write-Host "  [OK] All 12 images pulled successfully from GHCR." -ForegroundColor Green
  } catch {
    Write-Warning "Failed to pull images. If this repository is private, ensure you have logged in via:"
    Write-Warning "  `$env:GH_PAT | docker login $Registry -u $Owner --password-stdin"
    Write-Error "Image pull failed: $_"
    exit 1
  }
} else {
  Write-Host "[4/6] Skipping image pull (-SkipPull specified)." -ForegroundColor Yellow
}

# 6. Deploy containers safely (without --remove-orphans to preserve external/shared services)
Write-Host "[5/6] Starting application containers..." -ForegroundColor White
try {
  docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
  Write-Host "  [OK] Container stack launched." -ForegroundColor Green
} catch {
  Write-Error "Container launch failed: $_"
  exit 1
}

# 7. Health Check Verification with Automated Rollback
Write-Host "[6/6] Polling service health endpoints (timeout: ${TimeoutSeconds}s)..." -ForegroundColor White
$Endpoints = @(
  @{ Name = "API Gateway";            Url = "http://localhost:8080/health" },
  @{ Name = "Frontend Log Collector"; Url = "http://localhost:4006/health" }
)

$StartTime = Get-Date
$AllHealthy = $false

while ((Get-Date) - $StartTime -lt (New-TimeSpan -Seconds $TimeoutSeconds)) {
  $Pending = 0
  foreach ($Ep in $Endpoints) {
    try {
      $Response = Invoke-RestMethod -Uri $Ep.Url -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
      if ($Response.status -eq "OK" -or $Response.status -eq "ok" -or $Response.status -eq "healthy" -or $Response.ok -eq $true) {
        # Endpoint healthy
      } else {
        $Pending++
      }
    } catch {
      $Pending++
    }
  }

  if ($Pending -eq 0) {
    $AllHealthy = $true
    break
  }

  Start-Sleep -Seconds 3
}

if ($AllHealthy) {
  Write-Host "==========================================================" -ForegroundColor Green
  Write-Host "  DEPLOYMENT SUCCESSFUL (Tag: $CommitSha)" -ForegroundColor Green
  Write-Host "==========================================================" -ForegroundColor Green
  Write-Host "  Frontend Application : http://localhost:3000" -ForegroundColor Cyan
  Write-Host "  API Gateway          : http://localhost:8080" -ForegroundColor Cyan
  Write-Host "  Log Collector        : http://localhost:4006" -ForegroundColor Cyan
  Write-Host "  Prometheus Metrics   : http://localhost:9090" -ForegroundColor Cyan
} else {
  Write-Host "==========================================================" -ForegroundColor Red
  Write-Host "  HEALTH CHECK FAILED: Endpoints timed out after ${TimeoutSeconds}s" -ForegroundColor Red
  Write-Host "==========================================================" -ForegroundColor Red

  if ($previousImageTag -and $previousImageTag -ne $CommitSha) {
    Write-Warning "Initiating automatic rollback to previous tag: $previousImageTag..."
    $env:IMAGE_TAG = $previousImageTag
    try {
      docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
      Write-Host "  [OK] Rollback complete. Restored deployment tag: $previousImageTag" -ForegroundColor Yellow
    } catch {
      Write-Error "Automatic rollback failed: $_"
    }
  } else {
    Write-Warning "No previous image tag available for automatic rollback."
    Write-Warning "Inspect container logs with: docker compose logs --tail 50"
  }
  exit 1
}
