#Requires -Version 5.1
<#
  ABM Social Simulation launcher
  Usage: .\start.ps1 [dev|docker|backend|frontend|test|menu]
#>

param([string]$Mode = "menu")
$ErrorActionPreference = "Continue"

# Resolve project root robustly
$ProjectRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
Set-Location $ProjectRoot

$host.UI.RawUI.WindowTitle = "ABM Social Simulation"

# ---- helpers ----
function Wait-Key {
    Write-Host "`nPress any key to close this window..." -ForegroundColor DarkGray
    $null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Find-Python {
    foreach ($cmd in @("python", "python3", "py")) {
        try { $v = & $cmd --version 2>&1; if ($LASTEXITCODE -eq 0) { return $cmd } } catch {}
    }
    return $null
}

# ---- banner ----
Write-Host ""
Write-Host "  ==================================================" -ForegroundColor Blue
Write-Host "   Social Simulation: Inequality Equilibrium" -ForegroundColor Blue
Write-Host "   Mijs & Usmani (2024) Social Forces" -ForegroundColor Blue
Write-Host "   ABM Interactive Demo" -ForegroundColor Blue
Write-Host "  ==================================================" -ForegroundColor Blue
Write-Host ""

# ---- check dependencies ----
Write-Host "Checking dependencies..." -ForegroundColor White
$script:PythonCmd = Find-Python
$ok = $true

if ($script:PythonCmd) {
    $v = & $script:PythonCmd --version 2>&1
    Write-Host "  [OK] Python: $v" -ForegroundColor Green
} else {
    Write-Host "  [MISS] Python 3.11+ not found" -ForegroundColor Red
    $ok = $false
}

try {
    $v = node --version 2>&1
    Write-Host "  [OK] Node.js: $v" -ForegroundColor Green
} catch {
    Write-Host "  [MISS] Node.js 18+" -ForegroundColor Red
    $ok = $false
}

try {
    $v = npm --version 2>&1
    Write-Host "  [OK] npm: v$v" -ForegroundColor Green
} catch {
    Write-Host "  [MISS] npm" -ForegroundColor Red
    $ok = $false
}

try {
    $v = docker --version 2>&1
    Write-Host "  [OK] Docker available" -ForegroundColor Green
} catch {
    Write-Host "  [OPT] Docker (only needed for docker mode)" -ForegroundColor DarkGray
}

if (-not $ok) {
    Write-Host ""
    Write-Host "Missing required dependencies. Install them first:" -ForegroundColor Red
    Write-Host "  Python: https://www.python.org/downloads/"
    Write-Host "  Node.js: https://nodejs.org/"
    Wait-Key
    exit 1
}
Write-Host ""

# ---- install functions ----
function Install-Backend {
    Write-Host "Installing Python dependencies..." -ForegroundColor White
    Set-Location "$ProjectRoot/backend"
    if (-not (Test-Path "venv")) {
        & $script:PythonCmd -m venv venv 2>&1 | Out-Null
    }
    $activate = Join-Path $ProjectRoot "backend/venv/Scripts/Activate.ps1"
    if (Test-Path $activate) { . $activate 2>$null }
    & $script:PythonCmd -m pip install -q -r requirements.txt 2>&1 | Out-Null
    Write-Host "  [OK] Backend ready" -ForegroundColor Green
    Set-Location $ProjectRoot
}

function Install-Frontend {
    Write-Host "Installing frontend dependencies..." -ForegroundColor White
    Set-Location "$ProjectRoot/frontend"
    cmd /c "npm install --silent" 2>&1 | Out-Null
    Write-Host "  [OK] Frontend ready" -ForegroundColor Green
    Set-Location $ProjectRoot
}

# ---- cleanup old backend ----
function Clear-Backend {
    Write-Host "Cleaning up old backend processes..." -ForegroundColor DarkGray
    $pids = netstat -ano 2>$null | Select-String ":8000" | Select-String "LISTENING"
    foreach ($line in $pids) {
        $procId = ($line -split '\s+')[-1]
        if ($procId -and $procId -match '^\d+$') {
            try {
                Stop-Process -Id $procId -Force -ErrorAction Stop
                Write-Host "  Stopped old backend PID: $procId" -ForegroundColor DarkGray
            } catch {
                Write-Host "  Could not stop PID: $procId" -ForegroundColor DarkGray
            }
        }
    }
    Start-Sleep -Milliseconds 500
}

# ---- start functions ----
function Start-Docker {
    Write-Host "Starting with Docker Compose..." -ForegroundColor White
    docker compose up --build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Docker failed. Is Docker Desktop running?" -ForegroundColor Red
        Wait-Key
    }
}

function Start-Dev {
    Clear-Backend
    Write-Host "Starting in dev mode..." -ForegroundColor White
    Write-Host "  Backend:  http://localhost:8000" -ForegroundColor Blue
    Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Blue
    Write-Host "  Press Ctrl+C in terminal to stop" -ForegroundColor Yellow
    Write-Host ""

    $be = Start-Process -FilePath $script:PythonCmd `
        -ArgumentList "-m","uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--reload" `
        -WorkingDirectory "$ProjectRoot/backend" `
        -NoNewWindow -PassThru

    $fe = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c","npm run dev" `
        -WorkingDirectory "$ProjectRoot/frontend" `
        -NoNewWindow -PassThru

    Write-Host "  Backend PID: $($be.Id)   Frontend PID: $($fe.Id)" -ForegroundColor DarkGray
    Write-Host "  Opening browser at http://localhost:5173 ..." -ForegroundColor White

    Start-Sleep 3
    Start-Process "http://localhost:5173"

    try {
        while (-not $be.HasExited -and -not $fe.HasExited) {
            Start-Sleep 2
        }
    } finally {
        if (-not $be.HasExited)  { Stop-Process $be -Force -ErrorAction SilentlyContinue }
        if (-not $fe.HasExited)  { Stop-Process $fe -Force -ErrorAction SilentlyContinue }
    }
}

function Start-BackendOnly {
    Clear-Backend
    Write-Host "Starting backend only..." -ForegroundColor White
    Write-Host "  API:  http://localhost:8000" -ForegroundColor Blue
    Write-Host "  Docs: http://localhost:8000/docs" -ForegroundColor Blue
    Write-Host ""
    Set-Location "$ProjectRoot/backend"
    & $script:PythonCmd -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
}

function Start-FrontendOnly {
    Write-Host "Starting frontend only..." -ForegroundColor White
    Write-Host "  URL: http://localhost:5173" -ForegroundColor Blue
    Write-Host "  (requires backend on localhost:8000)" -ForegroundColor DarkGray
    Write-Host ""
    Set-Location "$ProjectRoot/frontend"
    cmd /c "npm run dev"
}

function Start-Tests {
    Write-Host "Running backend tests..." -ForegroundColor White
    Write-Host ""
    Set-Location "$ProjectRoot/backend"
    & $script:PythonCmd -m pytest tests/ -v --tb=short
    Write-Host ""
}

# ---- menu ----
function Show-Menu {
    Write-Host "Select startup mode:" -ForegroundColor White
    Write-Host ""
    Write-Host "  [1] Dev mode (hot-reload, recommended)"
    Write-Host "  [2] Docker Compose"
    Write-Host "  [3] Backend API only"
    Write-Host "  [4] Frontend only"
    Write-Host "  [5] Run tests"
    Write-Host "  [6] Open browser (backend must be running)"
    Write-Host "  [q] Quit"
    Write-Host ""

    $choice = Read-Host "Enter option"

    switch ($choice) {
        "1" { Install-Backend; Install-Frontend; Start-Dev }
        "2" { Start-Docker }
        "3" { Install-Backend; Start-BackendOnly }
        "4" { Install-Frontend; Start-FrontendOnly }
        "5" { Install-Backend; Start-Tests }
        "6" { Start-Process "http://localhost:5173"; Write-Host "Browser opened" -ForegroundColor Green }
        "q" { Write-Host "Bye."; return }
        default { Write-Host "Invalid option" -ForegroundColor Red; Show-Menu }
    }
}

# ======== main ========
try {
    switch ($Mode) {
        "docker"   { Start-Docker }
        "dev"      { Install-Backend; Install-Frontend; Start-Dev }
        "backend"  { Install-Backend; Start-BackendOnly }
        "frontend" { Install-Frontend; Start-FrontendOnly }
        "test"     { Install-Backend; Start-Tests }
        default    { Show-Menu }
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
} finally {
    Wait-Key
}
