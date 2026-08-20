# migrate_supabase.ps1
# DCIMe V2 — apply the V2 migrations to Supabase, in dependency order.
#
# WHY NOT `supabase db push`
# The CLI replays EVERY migration from the beginning, because this database was
# built by hand rather than through the CLI and has no migration history. That
# fails on 20260625_admin_wiring.sql, which seeds equipment whose categories the
# constraint added later rejects. The pre-V2 schema is already live and must not
# be replayed — so this script applies only the V2 migrations, in order.
#
# Every V2 migration is idempotent, so re-running is safe and is the intended
# way to recover from a partial run.
#
# Usage:
#   .\migrate_supabase.ps1 -ConnectionString "postgresql://..."   # migrations
#   .\migrate_supabase.ps1 -ConnectionString "..." -Seed          # + sandbox data
#   .\migrate_supabase.ps1 -ConnectionString "..." -DryRun        # list only
#   .\migrate_supabase.ps1 -ConnectionString "..." -Verify        # run checks
#
# The connection string comes from the Supabase dashboard:
#   Project Settings -> Database -> Connection string -> URI
# Use the SESSION POOLER string. The transaction pooler cannot run the DDL and
# multi-statement transactions these migrations rely on.
# ─────────────────────────────────────────────────────────────────────────────

param(
    [Parameter(Mandatory = $true)]
    [string]$ConnectionString,

    [switch]$Seed,
    [switch]$DryRun,
    [switch]$Verify
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── 1. Locate psql ───────────────────────────────────────────────────────────
$Psql = $null
$found = Get-Command psql -ErrorAction SilentlyContinue
if ($null -ne $found) {
    $Psql = $found.Source
} else {
    foreach ($v in @("18", "17", "16", "15")) {
        $c = "C:\Program Files\PostgreSQL\$v\bin\psql.exe"
        if (Test-Path $c) { $Psql = $c; break }
    }
}
if ($null -eq $Psql) {
    Write-Error "psql not found. Install PostgreSQL client tools, or add psql to PATH."
    exit 1
}
Write-Host "[migrate] psql: $((& $Psql --version) -join '')" -ForegroundColor Green

# ── 2. The V2 migrations, in dependency order ────────────────────────────────
# Ordered explicitly rather than by directory listing: the order below is the
# dependency order, and a filename sort has already been wrong once
# (threshold_alarms calls a function work_items defines).
$Migrations = @(
    "20260811_widen_category_constraint.sql",  # unblocks everything below
    "20260812_reference_layer.sql",            # units, templates, parameter registry
    "20260813_topology_graph.sql",             # nodes, edges, RLS repairs
    "20260814_topology_layout.sql",            # coordinates, room plates
    "20260816_parameter_registry.sql",         # form-driving parameter metadata
    "20260816_room_geometry.sql",
    "20260816_unify_equipment_identity.sql",   # blueprint <-> topology ids
    "20260817_capacity_analysis.sql",          # N+1 headroom
    "20260818_ingestion_health.sql",           # silence detection
    "20260819_commissioning_import.sql",       # staged bulk import
    "20260820a_work_items.sql",                # THE SPINE — must precede the rest
    "20260820b_threshold_alarms.sql",          # needs raise_work_item()
    "20260821_sla_rollup.sql",                 # needs work_items
    "20260822_contractor_findings.sql",        # needs work_items + sla_targets
    "20260823_preventive_schedules.sql",       # needs work_items
    "20260824_scheduled_jobs.sql",             # needs every function above
    "20260825_neutral_identifiers.sql",        # renames data; run before seeds
    "20260827_signatures.sql",                 # signature columns; additive
    "20260828_realtime_publication.sql",       # makes postgres_changes actually fire
    "20260829_countersignatures.sql",          # admin countersign; additive
    "20260830_assignment_and_vendor_status.sql", # offered_to + vendor flags
    "20260831_signer_attribution.sql",         # server stamps who signed
    "20260832_contractor_signature.sql"        # contractors sign for their work
)

# Seeds populate SITE 1 — not a sandbox. They were retargeted when the sandbox
# equipment ids collided with the real ones (equipment_id is a GLOBAL primary
# key, so 'grid_main' can exist exactly once across the whole database).
#
# So these WRITE TO A REAL SITE. They are idempotent and scoped to the rows they
# themselves created — the cable DELETE is restricted to provenance = 'MANUAL'
# so it cannot orphan imported rack cords — but do not run them expecting a
# throwaway site to absorb the damage.
$Seeds = @(
    "20260826_seed_site01_topology.sql",   # equipment, geometry and cabling onto Site 1
    "20260816_seed_blueprint_parameters.sql",
    "20260815_seed_demo_it_load.sql",
    "20260817_seed_cooling_loads.sql"
)

$Verifiers = @(
    "20260812_reference_layer_VERIFY.sql",
    "20260813_topology_graph_VERIFY.sql"
)

# ── 3. Runner ────────────────────────────────────────────────────────────────
function Invoke-SqlFile {
    param([string]$Path, [string]$Label)

    if (-not (Test-Path $Path)) {
        Write-Host "  SKIP    $Label  (not found)" -ForegroundColor DarkGray
        return $true
    }
    if ($DryRun) {
        Write-Host "  would run  $Label" -ForegroundColor Gray
        return $true
    }

    # ON_ERROR_STOP makes psql exit non-zero on the first failure instead of
    # ploughing on and leaving the schema half-applied.
    #
    # ErrorActionPreference is relaxed around the call: PowerShell 5.1 wraps
    # every stderr line from a NATIVE executable in an ErrorRecord, and psql
    # writes its NOTICEs to stderr. Under "Stop" the first harmless NOTICE
    # aborts the script, so success and failure are judged on $LASTEXITCODE --
    # the only thing psql actually uses to report an outcome.
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & $Psql $ConnectionString -v ON_ERROR_STOP=1 -q -f $Path 2>&1
    $ok = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prevEAP

    if ($ok) {
        Write-Host "  OK      $Label" -ForegroundColor Green
        # NOTICEs carry the self-check results these migrations report.
        $output | Where-Object { $_ -match "NOTICE" } |
            ForEach-Object { Write-Host "            $_" -ForegroundColor DarkGray }
    } else {
        Write-Host "  FAILED  $Label" -ForegroundColor Red
        $output | Select-Object -First 12 | ForEach-Object { Write-Host "            $_" -ForegroundColor Red }
    }
    return $ok
}

# ── 4. Connectivity ──────────────────────────────────────────────────────────
if (-not $DryRun) {
    Write-Host "[migrate] Connecting..." -ForegroundColor Cyan
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $probe = & $Psql $ConnectionString -tAc "select current_database();" 2>&1
    $probeOk = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prevEAP
    if (-not $probeOk) {
        Write-Error "Could not connect. Check the connection string (use the SESSION POOLER URI).`n$probe"
        exit 1
    }
    Write-Host "[migrate] Connected to: $probe" -ForegroundColor Green
}

# ── 5. Apply ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[migrate] Migrations ($($Migrations.Count))" -ForegroundColor Cyan
foreach ($m in $Migrations) {
    if (-not (Invoke-SqlFile (Join-Path $Root "supabase\migrations\$m") $m)) {
        Write-Host ""
        Write-Host "[migrate] STOPPED at $m - nothing after it was applied." -ForegroundColor Red
        Write-Host "          Fix the cause and re-run; every migration is idempotent." -ForegroundColor Yellow
        exit 1
    }
}

if ($Seed) {
    Write-Host ""
    Write-Host "[migrate] Seeds ($($Seeds.Count)) - WRITES TO SITE 1, not a sandbox" -ForegroundColor Yellow
    foreach ($s in $Seeds) {
        if (-not (Invoke-SqlFile (Join-Path $Root "supabase\seed\$s") $s)) {
            Write-Host "[migrate] STOPPED seeding at $s." -ForegroundColor Red
            exit 1
        }
    }
}

if ($Verify) {
    Write-Host ""
    Write-Host "[migrate] Verification" -ForegroundColor Cyan
    foreach ($v in $Verifiers) {
        $p = Join-Path $Root "supabase\verify\$v"
        if (-not (Test-Path $p)) { $p = Join-Path $Root "supabase\migrations\$v" }
        if (Test-Path $p) {
            Write-Host "  --- $v ---" -ForegroundColor Gray
            $prevEAP = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            & $Psql $ConnectionString -f $p 2>&1 |
                Where-Object { $_ -match "PASS|FAIL|ERROR" } |
                ForEach-Object {
                    $c = if ($_ -match "FAIL|ERROR") { "Red" } else { "Green" }
                    Write-Host "    $_" -ForegroundColor $c
                }
            $ErrorActionPreference = $prevEAP
        }
    }
}

Write-Host ""
if ($DryRun) {
    Write-Host "[migrate] Dry run complete - nothing was applied." -ForegroundColor Yellow
} else {
    Write-Host "[migrate] Done." -ForegroundColor Green
    Write-Host "          Next: regenerate types so the escape hatches can be removed -" -ForegroundColor Gray
    Write-Host "          npx supabase gen types typescript --project-id <ref> > src/shared/types/database.types.ts" -ForegroundColor Gray
}
