# Max Router — Kiro Local Bridge
# Jalankan PowerShell sebagai Administrator.
# MITM berjalan DI PC Windows; inference diarahkan ke Max Router Railway.
# API key tidak disimpan ke Git.

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/rizki-habibi/max-router.git"
$InstallDir = Join-Path $env:LOCALAPPDATA "MaxRouter-Kiro"
$DataDir = Join-Path $InstallDir "data"
$LocalPort = 3001
$RemoteRouterDefault = "https://max-router-production.up.railway.app"

function Write-Step([string]$m) { Write-Host "[Max Router] $m" -ForegroundColor Cyan }
function Fail([string]$m) { Write-Host "[Max Router] ERROR: $m" -ForegroundColor Red; exit 1 }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Step "Meminta hak Administrator..."
  $argList = "-ExecutionPolicy Bypass -File " + [char]34 + $PSCommandPath + [char]34
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
  exit 0
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "Git tidak ditemukan." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "Node.js/npm tidak ditemukan." }

$router = Read-Host "Max Router Base URL [$RemoteRouterDefault]"
if ([string]::IsNullOrWhiteSpace($router)) { $router = $RemoteRouterDefault }
$router = $router.TrimEnd("/")

$apiKeySecure = Read-Host "API Key Max Router (tidak disimpan ke file)" -AsSecureString
$apiKeyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiKeySecure)
try { $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($apiKeyPtr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($apiKeyPtr) }
if ([string]::IsNullOrWhiteSpace($apiKey)) { Fail "API Key kosong." }

New-Item -ItemType Directory -Force -Path $InstallDir,$DataDir | Out-Null

if (-not (Test-Path (Join-Path $InstallDir ".git"))) {
  Write-Step "Mengunduh Max Router..."
  git clone --depth 1 $RepoUrl $InstallDir
} else {
  Push-Location $InstallDir
  git pull --ff-only
  Pop-Location
}

Push-Location $InstallDir
try {
  if (-not (Test-Path (Join-Path $InstallDir "node_modules"))) {
    Write-Step "Install dependency..."
    npm ci
  }

  Write-Step "Build backend..."
  npm run build --workspace=9router-backend

  $env:PORT = "$LocalPort"
  $env:NODE_ENV = "production"
  $env:DATA_DIR = $DataDir
  $env:INITIAL_PASSWORD = [guid]::NewGuid().ToString("N") + "A9!"
  $env:JWT_SECRET = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
  $env:API_KEY_SECRET = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")

  try {
    $listener = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
      $pids = $listener | Select-Object -ExpandProperty OwningProcess -Unique
      foreach ($pid in $pids) {
        if ($pid -and $pid -ne $PID) { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue }
      }
    }
  } catch {}

  Write-Step "Menjalankan backend lokal..."
  $q = [char]34
  $cmd = 'cd /d ' + $q + $InstallDir + $q + ' && npm start --workspace=9router-backend >> ' + $q + $logPath + $q + ' 2>&1'
  $logPath = Join-Path $DataDir "kiro-bridge.log"
  $cmd = 'cd /d ' + $q + $InstallDir + $q + ' && npm start --workspace=9router-backend >> ' + $q + $logPath + $q + ' 2>&1'
  Start-Process cmd.exe -ArgumentList "/c $cmd" -WindowStyle Minimized | Out-Null

  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try {
      $health = Invoke-RestMethod "http://127.0.0.1:$LocalPort/api/health" -TimeoutSec 3
      if ($health) { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) { Fail "Backend lokal tidak merespons. Lihat $logPath" }

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $loginBody = (@{ password = $env:INITIAL_PASSWORD } | ConvertTo-Json)
  $login = Invoke-WebRequest -Uri "http://127.0.0.1:$LocalPort/api/auth/login" -Method POST -ContentType "application/json" -Body $loginBody -WebSession $session -UseBasicParsing
  if ($login.StatusCode -ne 200) { Fail "Login lokal gagal: $($login.Content)" }

  Write-Step "Mengaktifkan sertifikat + DNS Kiro lokal..."
  $connectBody = @{
    apiKey = $apiKey
    mitmRouterBaseUrl = $router
    connectKiro = $true
    forceKillPort443 = $false
  } | ConvertTo-Json

  $connect = Invoke-WebRequest -Uri "http://127.0.0.1:$LocalPort/api/cli-tools/antigravity-mitm" -Method POST -ContentType "application/json" -Body $connectBody -WebSession $session -UseBasicParsing
  $result = $connect.Content | ConvertFrom-Json
  if ($connect.StatusCode -ne 200 -or $result.success -ne $true) { Fail "Koneksi Kiro gagal: $($connect.Content)" }

  Write-Host ""
  Write-Host "============================================" -ForegroundColor Green
  Write-Host " KIRO BRIDGE AKTIF" -ForegroundColor Green
  Write-Host "============================================" -ForegroundColor Green
  Write-Host "Local MITM : https://127.0.0.1:443"
  Write-Host "Remote Max : $router"
  Write-Host "Kiro DNS   : $($result.kiroConnected)"
  Write-Host "Cert trust : $($result.certTrusted)"
  Write-Host "Dashboard  : http://127.0.0.1:$LocalPort"
  Write-Host "Log        : $logPath"
  Write-Host ""
  Write-Host "Biarkan backend lokal hidup selama Kiro dipakai." -ForegroundColor Yellow
  Write-Host "Jika Kiro masih memakai koneksi lama, restart Kiro." -ForegroundColor Yellow
  Write-Host "Jangan membagikan API key." -ForegroundColor Yellow

  Start-Process "http://127.0.0.1:$LocalPort/dashboard/mitm"
} finally {
  Pop-Location
}
