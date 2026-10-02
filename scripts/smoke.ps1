# End-to-end smoke test for Chika's Game Hub.
# Boots a fresh backend + the gateway (serving the built frontend) and drives
# the full API flow: register -> confirm -> login -> dashboard -> event -> progress -> logout.
param(
  [int]$BackendPort = 3001,
  [int]$GatewayPort = 3000
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Free-Port($port) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    Write-Host "  freeing port $port (pid $($listener.OwningProcess))" -ForegroundColor DarkGray
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
  }
  if ($listeners) { Start-Sleep -Milliseconds 600 }
}

function Assert($condition, $label) {
  if ($condition) { Write-Host "  ok  $label" -ForegroundColor Green }
  else { Write-Host "  FAIL $label" -ForegroundColor Red; $script:failed = $true }
}

function Wait-Ready($url, $timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  $attempt = 0
  $lastError = ''
  while ((Get-Date) -lt $deadline) {
    $attempt++
    try {
      $response = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return $true }
      $lastError = "status $($response.StatusCode)"
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Milliseconds 400
    }
    if ($attempt % 25 -eq 0) {
      Write-Host "  still waiting ($attempt tries): $lastError" -ForegroundColor DarkGray
    }
  }
  Write-Host "  gave up after $attempt tries: $lastError" -ForegroundColor DarkGray
  return $false
}

$failed = $false
foreach ($artifact in @((Join-Path $root 'frontend\dist\index.html'), (Join-Path $root 'gateway\dist\server.js'))) {
  if (-not (Test-Path $artifact)) {
    Write-Host "MISSING $artifact - run 'npm run build' first" -ForegroundColor Red
    exit 1
  }
}
Free-Port $BackendPort
Free-Port $GatewayPort

$env:PORT = "$BackendPort"
$env:DATA_STORE = 'memory'
$env:RL_AUTH_MAX = '500'
$env:NODE_ENV = 'development'

$backendOut = Join-Path $env:TEMP 'chika-smoke-backend.out'
$backendErr = Join-Path $env:TEMP 'chika-smoke-backend.err'
$gatewayOut = Join-Path $env:TEMP 'chika-smoke-gateway.out'
$gatewayErr = Join-Path $env:TEMP 'chika-smoke-gateway.err'
foreach ($file in @($backendOut, $backendErr, $gatewayOut, $gatewayErr)) {
  if (Test-Path $file) { Remove-Item $file -Force }
}

$backend = Start-Process node -ArgumentList '--require', 'ts-node/register/transpile-only', 'src/main.ts' `
  -WorkingDirectory (Join-Path $root 'backend') -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr

$env:PORT = "$GatewayPort"
$env:API_TARGET = "http://127.0.0.1:$BackendPort"
$env:FRONTEND_DIR = Join-Path $root 'frontend\dist'
$gatewayScript = Join-Path $root 'gateway\dist\server.js'
$gateway = Start-Process node -ArgumentList ('"{0}"' -f $gatewayScript) -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $gatewayOut -RedirectStandardError $gatewayErr

function Show-Logs($label, $out, $err) {
  Write-Host "--- $label stdout ---" -ForegroundColor DarkGray
  Get-Content $out -ErrorAction SilentlyContinue | Select-Object -Last 15 | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
  Write-Host "--- $label stderr ---" -ForegroundColor DarkGray
  Get-Content $err -ErrorAction SilentlyContinue | Select-Object -Last 15 | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
}

try {
  Write-Host "Waiting for backend on :$BackendPort ..." -ForegroundColor Cyan
  if (-not (Wait-Ready "http://127.0.0.1:$BackendPort/api/games" 90)) {
    Show-Logs 'backend' $backendOut $backendErr
    throw "backend never came up (exited=$($backend.HasExited))"
  }
  Write-Host "Waiting for gateway on :$GatewayPort ..." -ForegroundColor Cyan
  if (-not (Wait-Ready "http://127.0.0.1:$GatewayPort/" 60)) {
    Show-Logs 'gateway' $gatewayOut $gatewayErr
    throw "gateway never came up (exited=$($gateway.HasExited))"
  }

  $base = "http://127.0.0.1:$GatewayPort"

  # --- static frontend ---
  $landing = Invoke-WebRequest "$base/" -UseBasicParsing
  Assert ($landing.StatusCode -eq 200 -and $landing.Content -match "Chika's Game Hub") 'gateway serves the landing page'
  Assert ((Invoke-WebRequest "$base/login" -UseBasicParsing).Content -match 'Members Login') 'gateway serves /login'
  Assert ((Invoke-WebRequest "$base/register" -UseBasicParsing).Content -match 'Create Account') 'gateway serves /register'
  Assert ((Invoke-WebRequest "$base/dashboard" -UseBasicParsing).Content -match 'Game Dashboard') 'gateway serves /dashboard'
  Assert ((Invoke-WebRequest "$base/favicon.svg" -UseBasicParsing).StatusCode -eq 200) 'static assets are served'

  # --- catalogue ---
  $games = Invoke-RestMethod "$base/api/games"
  Assert ($games.success -and $games.data.games.Count -ge 10) "GET /api/games returns $($games.data.games.Count) games"

  # --- validation rejection ---
  try {
    Invoke-RestMethod "$base/api/auth/register" -Method Post -ContentType 'application/json' -Body '{}' | Out-Null
    Assert $false 'invalid registration is rejected'
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert ($code -eq 400) "invalid registration returns 400 (got $code)"
  }

  # --- registration flow ---
  $today = (Get-Date).ToString('yyyy-MM-dd')
  $registration = @{
    parent = @{ firstName = 'Ada'; lastName = 'Lovelace'; relationship = 'mother'; email = 'ada@example.com' }
    child = @{ firstName = 'Mia'; age = 7; grade = 'grade_1' }
    preferences = @{ learningGoals = @('math', 'reading'); readingLevel = 'early_reader'; gameplayStyle = 'story' }
    consent = @{ consentData = $true; termsConsent = $true; signatureFullName = 'Ada Lovelace'; signatureDate = $today }
  } | ConvertTo-Json -Depth 6

  $staged = Invoke-RestMethod "$base/api/auth/register" -Method Post -ContentType 'application/json' -Body $registration
  Assert ($staged.success -and $staged.data.username -match '^[a-z]{3}\d{5}$') "register staged username $($staged.data.username)"

  $confirmed = Invoke-RestMethod "$base/api/auth/register/confirm" -Method Post -ContentType 'application/json' `
    -Body (@{ username = $staged.data.username; accept = $true } | ConvertTo-Json)
  $token = $confirmed.data.token
  Assert ($confirmed.success -and $token) 'confirm activates the account and returns a token'
  Assert ($confirmed.data.profile.child.firstName -eq 'Mia') 'profile carries the child record'

  # --- dashboard ---
  $headers = @{ Authorization = "Bearer $token" }
  $dashboard = Invoke-RestMethod "$base/api/dashboard" -Headers $headers
  Assert ($dashboard.success -and $dashboard.data.sections.Count -ge 1) "dashboard has $($dashboard.data.sections.Count) learning sections"
  Assert ($dashboard.data.teamLabel -in @('Pre-readers Team', 'Mid Age Team', 'Puzzlers Team')) "dashboard team = $($dashboard.data.teamLabel)"
  Assert ($dashboard.data.games.Count -ge 5) "dashboard offers $($dashboard.data.games.Count) games"

  # --- gameplay events + progress ---
  $event = @{ gameId = $dashboard.data.games[0].id; eventType = 'level_complete'; level = 3; score = 30 } | ConvertTo-Json
  $logged = Invoke-RestMethod "$base/api/game/event" -Method Post -ContentType 'application/json' -Headers $headers -Body $event
  Assert ($logged.success) 'POST /api/game/event accepted'

  $progress = Invoke-RestMethod "$base/api/game/progress" -Headers $headers
  $row = $progress.data.byGame | Where-Object { $_.gameId -eq $dashboard.data.games[0].id }
  Assert ($row -and $row.maxLevel -eq 3) 'progress reflects the logged level'

  # --- session lifecycle ---
  $me = Invoke-RestMethod "$base/api/auth/me" -Headers $headers
  Assert ($me.success -and $me.data.username -eq $staged.data.username) 'GET /auth/me returns the profile'

  $logout = Invoke-RestMethod "$base/api/auth/logout" -Method Post -Headers $headers
  Assert ($logout.success) 'POST /auth/logout succeeded'

  try {
    Invoke-RestMethod "$base/api/dashboard" -Headers $headers | Out-Null
    Assert $false 'revoked token is rejected'
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert ($code -eq 401) "revoked token returns 401 (got $code)"
  }

  # --- login error copy ---
  try {
    Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{ username = 'zzz12345' } | ConvertTo-Json) | Out-Null
    Assert $false 'unknown username is rejected'
  } catch {
    $raw = $_.ErrorDetails.Message
    if (-not $raw) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $raw = $reader.ReadToEnd()
    }
    $body = $raw | ConvertFrom-Json
    Assert ($body.error.message -eq 'User Does Not Exist - Try Again') "login failure message is exact (got '$($body.error.message)')"
  }
} catch {
  Write-Host "  FAIL $($_.Exception.Message)" -ForegroundColor Red
  $failed = $true
} finally {
  foreach ($process in @($backend, $gateway)) {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

if ($failed) { Write-Host "`nSMOKE TEST FAILED" -ForegroundColor Red; exit 1 }
Write-Host "`nSMOKE TEST PASSED" -ForegroundColor Green; exit 0
