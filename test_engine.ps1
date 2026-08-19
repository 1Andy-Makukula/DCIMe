# test_engine.ps1
# DCIMe Engine — Native Golden Test Runner (PowerShell)
#
# Compiles PowerMatrix for the host with g++ and replays every scenario against
# its checked-in fixture. No browser, no emsdk, no CMake — this mirrors how
# build_wasm.ps1 calls emcc directly.
#
# Usage:
#   .\test_engine.ps1              # build + run the golden tests
#   .\test_engine.ps1 -Graph       # Stage 4a graph structure tests
#   .\test_engine.ps1 -Regenerate  # rewrite fixtures from current behaviour
#
# Exit code 0 = all scenarios match. Non-zero = a regression.
# ─────────────────────────────────────────────────────────────────────────────

param(
    [switch]$Regenerate,
    [switch]$Graph
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── 1. Locate a C++ compiler ─────────────────────────────────────────────────
$Gxx = $null
$found = Get-Command g++ -ErrorAction SilentlyContinue
if ($null -ne $found) {
    $Gxx = $found.Source
} else {
    # Common MinGW install locations
    foreach ($candidate in @("C:\MinGW\bin\g++.exe",
                             "C:\msys64\mingw64\bin\g++.exe",
                             "C:\ProgramData\mingw64\mingw64\bin\g++.exe")) {
        if (Test-Path $candidate) { $Gxx = $candidate; break }
    }
}

if ($null -eq $Gxx) {
    Write-Error "g++ not found. Install MinGW-w64 or add g++ to PATH."
    exit 1
}

$gxxVersion = & $Gxx --version | Select-Object -First 1
Write-Host "[test_engine] Compiler: $gxxVersion" -ForegroundColor Green

# ── 2. Paths ─────────────────────────────────────────────────────────────────
$SrcCore   = Join-Path $Root "topology_engine\core\src\PowerMatrix.cpp"
$IncDir    = Join-Path $Root "topology_engine\core\include"
$TestsDir  = Join-Path $Root "topology_engine\tests"
$Fixtures  = Join-Path $TestsDir "fixtures"
$BuildDir  = Join-Path $Root ".build"

if (-not (Test-Path $BuildDir))  { New-Item -ItemType Directory $BuildDir  | Out-Null }
if (-not (Test-Path $Fixtures))  { New-Item -ItemType Directory $Fixtures  | Out-Null }

if ($Regenerate) {
    $SrcMain = Join-Path $TestsDir "golden_gen.cpp"
    $OutExe  = Join-Path $BuildDir "golden_gen.exe"
    $label   = "golden_gen"
} elseif ($Graph) {
    $SrcMain = Join-Path $TestsDir "graph_tests.cpp"
    $OutExe  = Join-Path $BuildDir "graph_tests.exe"
    $label   = "graph_tests"
} else {
    $SrcMain = Join-Path $TestsDir "run_tests.cpp"
    $OutExe  = Join-Path $BuildDir "run_tests.exe"
    $label   = "run_tests"
}

# ── 3. Compile ───────────────────────────────────────────────────────────────
Write-Host "[test_engine] Compiling $label..." -ForegroundColor Cyan

& $Gxx `
    $SrcCore `
    $SrcMain `
    -I $IncDir `
    -std=c++17 `
    -O1 `
    -Wall `
    -o $OutExe

if ($LASTEXITCODE -ne 0) {
    Write-Error "[test_engine] Compilation FAILED (exit code $LASTEXITCODE)"
    exit $LASTEXITCODE
}

# ── 4. Run ───────────────────────────────────────────────────────────────────
Write-Host ""
if ($Graph) { & $OutExe } else { & $OutExe $Fixtures }
$runExit = $LASTEXITCODE

Write-Host ""
if ($Graph) {
    if ($runExit -eq 0) {
        Write-Host "[test_engine] Graph structure OK." -ForegroundColor Green
    } else {
        Write-Host "[test_engine] GRAPH TESTS FAILED (exit code $runExit)" -ForegroundColor Red
    }
} elseif ($Regenerate) {
    Write-Host "[test_engine] Fixtures regenerated. Review before committing:" -ForegroundColor Yellow
    Write-Host "  git diff topology_engine/tests/fixtures/" -ForegroundColor Gray
} elseif ($runExit -eq 0) {
    Write-Host "[test_engine] All scenarios match." -ForegroundColor Green
} else {
    Write-Host "[test_engine] REGRESSION DETECTED (exit code $runExit)" -ForegroundColor Red
    Write-Host "  If the change was intentional: .\test_engine.ps1 -Regenerate" -ForegroundColor Gray
}

exit $runExit
