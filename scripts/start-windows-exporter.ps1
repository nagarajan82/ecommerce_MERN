[CmdletBinding()]
param(
    [string]$Port = "9182",
    [string]$Version = "0.31.9",
    [switch]$Stop,
    [switch]$Status,
    [switch]$Uninstall
)

$serviceName = "windows_exporter"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$binPath = Join-Path $scriptDir "windows_exporter.exe"

# If -Status is requested
if ($Status) {
    Get-Service -Name $serviceName -ErrorAction SilentlyContinue | Format-Table -AutoSize
    return
}

# If -Uninstall is requested
if ($Uninstall) {
    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Host "Stopping and removing Windows service $serviceName..."
        Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
        sc.exe delete $serviceName
        Write-Host "Service $serviceName deleted."
    } else {
        Write-Host "Service $serviceName does not exist."
    }
    return
}

# If -Stop is requested
if ($Stop) {
    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Host "Stopping service $serviceName..."
        Stop-Service -Name $serviceName -Force
        Write-Host "windows_exporter service stopped."
    } else {
        Get-Process -Name "windows_exporter" -ErrorAction SilentlyContinue | Stop-Process -Force
        Write-Host "windows_exporter process stopped."
    }
    return
}

# Check if binary exists
if (-not (Test-Path $binPath)) {
    Write-Host "Downloading windows_exporter v$Version..."
    $url = "https://github.com/prometheus-community/windows_exporter/releases/download/v$Version/windows_exporter-$Version-amd64.exe"
    Invoke-WebRequest -Uri $url -OutFile $binPath -UseBasicParsing
    Write-Host "Downloaded to $binPath"
}

# Configure collectors: cpu, memory, logical_disk, net, system
$collectors = "cpu,memory,logical_disk,net,system"
$listenAddr = "0.0.0.0:$Port"
$binaryPathName = "`"$binPath`" --web.listen-address=$listenAddr --collectors.enabled=$collectors"

$svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host "Registering Windows service $serviceName..."
    New-Service -Name $serviceName -BinaryPathName $binaryPathName -DisplayName "Prometheus Windows Exporter" -StartupType Automatic | Out-Null
    Write-Host "Service $serviceName registered with StartupType Automatic."
}

$svc = Get-Service -Name $serviceName
if ($svc.Status -ne "Running") {
    Write-Host "Starting service $serviceName..."
    Start-Service -Name $serviceName
    Start-Sleep -Seconds 2
}

$svc = Get-Service -Name $serviceName
Write-Host "windows_exporter service is $($svc.Status)."

try {
    $res = Invoke-WebRequest -Uri "http://localhost:$Port/metrics" -UseBasicParsing -TimeoutSec 5
    if ($res.StatusCode -eq 200) {
        Write-Host "SUCCESS: windows_exporter metrics endpoint is UP at http://localhost:$Port/metrics"
    }
} catch {
    Write-Warning "Could not verify endpoint: $($_.Exception.Message)"
}
