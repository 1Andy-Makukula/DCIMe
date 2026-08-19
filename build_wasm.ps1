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

# ── Why a FIXED memory size instead of ALLOW_MEMORY_GROWTH ───────────────────
# With ALLOW_MEMORY_GROWTH=1, Chrome backs WebAssembly.Memory with a RESIZABLE
# ArrayBuffer. TextDecoder.decode() refuses those outright:
#     Failed to execute 'decode' on 'TextDecoder':
#     The provided ArrayBuffer value must not be resizable
# Every string crossing the boundary hits it, so vector_Node.get() throws on the
# first read — which is what blanked the topology panel.
#
# Emscripten 6 dropped TEXTDECODER=0 (the JS fallback), so the only remaining
# fix is to stop the buffer being resizable: fixed INITIAL_MEMORY, no growth.
#
# THE TRADE: memory is now a hard ceiling — exceeding it aborts rather than
# grows. 64 MB against roughly 200 bytes per node and edge leaves headroom for
# ~300k elements. The largest facility modelled here has 60. This is not a
# constraint anyone will meet, but it IS a cliff rather than a slope, so if a
# future graph is orders of magnitude larger, raise this number deliberately.
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
    -s EXPORT_ES6=1 `
    -s EXPORT_NAME='"TopologyEngine"' `
    -s ALLOW_MEMORY_GROWTH=0 `
    -s INITIAL_MEMORY=67108864 `
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
