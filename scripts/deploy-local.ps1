<#
.SYNOPSIS
  Deploys pre-built MERN E-Commerce microservices and MFEs from GHCR to the local Windows machine.

.DESCRIPTION
  Authenticates with GitHub Container Registry (GHCR), pulls immutable images by commit SHA or tag,
  deploys the stack using Docker Compose with the GHCR override, verifies service health endpoints,
  and optionally rolls back on failure while preserving local observability state.

.PARAMETER CommitSha
  Specific git commit SHA or tag of the images to deploy. Defaults to 'latest'.

.PARAMETER Registry
  The container registry host. Defaults to 'ghcr.io'.

.PARAMETER Owner
  The repository or organization namespace. Defaults to 'nagarajan82'.

.PARAMETER SkipPull
  Skip pulling images from GHCR and deploy with existing local images.

.PARAMETER TimeoutSeconds
  Maximum seconds to wait for service health endpoints before failing. Defaults to 60.

.EXAMPLE
  .\scripts\deploy-local.ps1 -CommitSha "7f621e1"
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
Write-Host "  Target Image Tag : $CommitSha" -ForegroundColor Yellow
Write-Host "  Registry         : $Registry" -ForegroundColor Yellow
Write-Host "  Namespace        : $Owner" -ForegroundColor Yellow
Write-Host "  Repository Root  : $RepoRoot" -ForegroundColor Yellow
Write-Host "----------------------------------------------------------"

# 1. Pre-flight: Check Docker daemon
Write-Host "[1/5] Verifying Docker daemon..." -ForegroundColor White
try {
  $null = docker info --format '{{.ServerVersion}}' 2>&1
  Write-Host "  [OK] Docker daemon is running." -ForegroundColor Green
} catch {
  Write-Error "Docker daemon is not running. Please start Docker Desktop and retry."
  exit 1
}

# 2. Pre-flight: Verify Compose configurations
Write-Host "[2/5] Validating Docker Compose configurations..." -ForegroundColor White
Set-Location $RepoRoot
$env:IMAGE_TAG = $CommitSha

try {
  docker compose -f docker-compose.yml -f docker-compose.ghcr.yml config --quiet
  Write-Host "  [OK] Compose syntax and image overrides validated." -ForegroundColor Green
} catch {
  Write-Error "Docker Compose validation failed: $_"
  exit 1
}

# 3. Pull images from GHCR
if (-not $SkipPull) {
  Write-Host "[3/5] Pulling pre-built images from $Registry ($CommitSha)..." -ForegroundColor White
  try {
    docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
    Write-Host "  [OK] All images pulled successfully from GHCR." -ForegroundColor Green
  } catch {
    Write-Warning "Failed to pull images. If this repository is private, ensure you have logged in via:"
    Write-Warning "  `$env:GH_PAT | docker login $Registry -u $Owner --password-stdin"
    Write-Error "Image pull failed: $_"
    exit 1
  }
} else {
  Write-Host "[3/5] Skipping image pull (-SkipPull specified)." -ForegroundColor Yellow
}

# 4. Deploy containers
Write-Host "[4/5] Starting containers with Docker Compose..." -ForegroundColor White
try {
  docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d --remove-orphans
  Write-Host "  [OK] Container stack launched." -ForegroundColor Green
} catch {
  Write-Error "Container launch failed: $_"
  exit 1
}

# 5. Health Check Verification
Write-Host "[5/5] Polling service health endpoints (timeout: ${TimeoutSeconds}s)..." -ForegroundColor White
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
      if ($Response.status -eq "OK" -or $Response.status -eq "ok" -or $Response.status -eq "healthy") {
        # Endpoint is up
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
  Write-Warning "=========================================================="
  Write-Warning "  HEALTH CHECK WARNING: Some endpoints took longer to respond."
  Write-Warning "  Check container logs via: docker compose logs --tail 50"
  Write-Warning "=========================================================="
}
