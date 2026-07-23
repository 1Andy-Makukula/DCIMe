# build_wasm.ps1
# DCIMe Engine — WASM Build Script (PowerShell)
# Activates the local emsdk environment, then compiles PowerMatrix + bridge to WASM.
#
# Usage: .\build_wasm.ps1
# Output: public/topology_engine/renderer/topology_engine.{js,wasm}
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── 1. Activate emsdk ────────────────────────────────────────────────────────
$EmsdkEnvScript = Join-Path $Root "emsdk\emsdk_env.ps1"
if (-not (Test-Path $EmsdkEnvScript)) {
    Write-Error "emsdk_env.ps1 not found at: $EmsdkEnvScript"
    exit 1
}
Write-Host "[build_wasm] Activating emsdk..." -ForegroundColor Cyan
. $EmsdkEnvScript

# ── 2. Verify emcc is available ───────────────────────────────────────────────
if (-not (Get-Command emcc -ErrorAction SilentlyContinue)) {
    Write-Error "emcc not found after activating emsdk. Is emsdk installed and activated? Run: .\emsdk\emsdk install latest && .\emsdk\emsdk activate latest"
    exit 1
}
$emccVersion = emcc --version 2>&1 | Select-Object -First 1
Write-Host "[build_wasm] Using: $emccVersion" -ForegroundColor Green

# ── 3. Compile ───────────────────────────────────────────────────────────────
$SrcCore    = Join-Path $Root "topology_engine\core\src\PowerMatrix.cpp"
$SrcBridge  = Join-Path $Root "topology_engine\bindings\wasm_bridge.cpp"
$OutDir     = Join-Path $Root "public\topology_engine\renderer"
$OutJs      = Join-Path $OutDir "topology_engine.js"

Write-Host "[build_wasm] Compiling C++ → WASM..." -ForegroundColor Cyan
Write-Host "  Sources : PowerMatrix.cpp + wasm_bridge.cpp"
Write-Host "  Output  : $OutJs"
Write-Host ""

emcc `
    $SrcCore `
    $SrcBridge `
    -I (Join-Path $Root "topology_engine\core\include") `
    -O2 `
    -std=c++17 `
    --bind `
    -s WASM=1 `
    -s MODULARIZE=1 `
    -s EXPORT_NAME='"TopologyEngine"' `
    -s ALLOW_MEMORY_GROWTH=1 `
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' `
    -o $OutJs

if ($LASTEXITCODE -ne 0) {
    Write-Error "[build_wasm] Compilation FAILED (exit code $LASTEXITCODE)"
    exit $LASTEXITCODE
}

# ── 4. Sync to renderer source dir ───────────────────────────────────────────
$RendererSrc = Join-Path $Root "topology_engine\renderer"
if (Test-Path $RendererSrc) {
    Copy-Item "$OutDir\topology_engine.js"   $RendererSrc -Force
    Copy-Item "$OutDir\topology_engine.wasm" $RendererSrc -Force
    Write-Host "[build_wasm] Synced output to topology_engine/renderer/" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[build_wasm] Done. Output files:" -ForegroundColor Green
Get-ChildItem $OutDir -Filter "topology_engine.*" | ForEach-Object {
    $size = "{0:N0} bytes" -f $_.Length
    Write-Host "  $($_.Name)  ($size)"
}
