#include "PowerMatrix.hpp"
#include <cmath>
#include <algorithm>
#include <unordered_map>  // C-4: required for O(1) node lookup map

namespace Topology {

// 8 real minutes per shift for simulation demo (480 seconds).
// Change to 28800.0 for true 8-hour real-time shifts.
const double PowerMatrix::DG_SHIFT_SECONDS = 480.0;

// ── M-10: Named fuel drain constants (replaces magic numbers) ────────────────
// Derived from site-measured diesel consumption at rated 90 kW load per unit.
//   Pair steady-state : 2 generators running simultaneously  → ~140 L/hr total
//   Pair handover     : brief 3-generator overlap             → ~162 L/hr total
static constexpr double FUEL_DRAIN_PAIR_LPS     = 0.039; // L/s — 2 gens running
static constexpr double FUEL_DRAIN_HANDOVER_LPS = 0.045; // L/s — 3 gens overlap

PowerMatrix::PowerMatrix()
    : grid_active(true),
      fire_alarm_active(false),
      cooling_active(true),
      dg_auto(true),
      fuel_liters(1000.0),
      ambient_temp(21.0),
      gen_status("standby"),
      battery_soc(100.0),
      dg_pair_status("standby"),
      active_dg_pair(0),
      gen_startup_timer(0.0),
      pair_run_seconds(0.0) {
    dg_run_hours[0] = 0.0;
    dg_run_hours[1] = 0.0;
    dg_run_hours[2] = 0.0;
    dg_run_hours[3] = 0.0;
}

void PowerMatrix::addNode(const Node& node) {
    auto it = std::find_if(nodes.begin(), nodes.end(), [&](const Node& n) {
        return n.id == node.id;
    });
    if (it != nodes.end()) {
        *it = node;
    } else {
        nodes.push_back(node);
    }
}

void PowerMatrix::updateNodeTelemetry(const std::string& id, double voltage, double current) {
    for (auto& node : nodes) {
        if (node.id == id) {
            node.voltage = voltage;
            node.current = current;
            break;
        }
    }
}

void PowerMatrix::toggleNodeFault(const std::string& id, bool faulted) {
    for (auto& node : nodes) {
        if (node.id == id) {
            node.is_faulted = faulted;
            break;
        }
    }
    if (id == "node-grid-tx") {
        setGridActive(!faulted);
    }
}

void PowerMatrix::clearAllFaults() {
    for (auto& node : nodes) {
        node.is_faulted = false;
    }
    fuel_liters = 1000.0;
    battery_soc = 100.0;
    ambient_temp = 21.0;
}

void PowerMatrix::setGridActive(bool active) {
    grid_active = active;
    // If grid is restored, put DGs back to standby
    if (active) {
        dg_pair_status = "standby";
        gen_status = "standby";
        gen_startup_timer = 0.0;
        pair_run_seconds = 0.0;
        active_dg_pair = 0;
        // NOTE: dg_run_hours are intentionally NOT reset here — they are
        // cumulative audit accumulators that persist across grid events.
        // Only resetAll() clears them for a full simulation restart.
    }
}

void PowerMatrix::setFireAlarmActive(bool active) {
    fire_alarm_active = active;
}

void PowerMatrix::setCoolingActive(bool active) {
    cooling_active = active;
}

void PowerMatrix::setDgAuto(bool auto_active) {
    dg_auto = auto_active;
}

void PowerMatrix::resetAll() {
    grid_active = true;
    fire_alarm_active = false;
    cooling_active = true;
    dg_auto = true;
    fuel_liters = 1000.0;
    ambient_temp = 21.0;
    gen_status = "standby";
    gen_startup_timer = 0.0;
    battery_soc = 100.0;
    dg_pair_status = "standby";
    active_dg_pair = 0;
    pair_run_seconds = 0.0;
    for (int i = 0; i < 4; i++) dg_run_hours[i] = 0.0;
    clearAllFaults();
}

std::vector<Node> PowerMatrix::getNodes() const {
    return nodes;
}

Node PowerMatrix::getNode(const std::string& id) const {
    for (const auto& node : nodes) {
        if (node.id == id) {
            return node;
        }
    }
    return Node{};
}

void PowerMatrix::updateState(double dt) {
    // ==========================================================================
    // 1. DG PAIR ROTATION STATE MACHINE
    // ==========================================================================
    if (!grid_active && dg_auto && fuel_liters > 0.0 && !fire_alarm_active) {

        if (dg_pair_status == "standby") {
            // Grid just failed — start Pair A (DG1 & DG3, indices 0 & 2)
            dg_pair_status = "pair_a_starting";
            active_dg_pair = 0;
            gen_status = "starting";
            gen_startup_timer = 0.0;
            pair_run_seconds = 0.0;

        } else if (dg_pair_status == "pair_a_starting") {
            gen_startup_timer += dt;
            if (gen_startup_timer >= 3.5) {
                dg_pair_status = "pair_a_running";
                gen_status = "running";
                gen_startup_timer = 0.0;
            }

        } else if (dg_pair_status == "pair_a_running") {
            pair_run_seconds += dt;
            // Accumulate run hours for DG1 (idx 0) and DG3 (idx 2)
            dg_run_hours[0] += dt / 3600.0;
            dg_run_hours[2] += dt / 3600.0;

            // M-10: use named constant instead of inline magic number
            fuel_liters -= dt * FUEL_DRAIN_PAIR_LPS;
            if (fuel_liters < 0.0) fuel_liters = 0.0;

            // Rotate to Pair B after shift duration
            if (pair_run_seconds >= DG_SHIFT_SECONDS && fuel_liters > 0.0) {
                dg_pair_status = "pair_b_starting";
                active_dg_pair = 1;
                gen_startup_timer = 0.0;
            }

        } else if (dg_pair_status == "pair_b_starting") {
            gen_startup_timer += dt;
            // Pair A still running during Pair B spool
            dg_run_hours[0] += dt / 3600.0;
            dg_run_hours[2] += dt / 3600.0;

            // M-10: handover drain rate (3 generators briefly overlap)
            fuel_liters -= dt * FUEL_DRAIN_HANDOVER_LPS;
            if (fuel_liters < 0.0) fuel_liters = 0.0;

            if (gen_startup_timer >= 3.5) {
                dg_pair_status = "pair_b_running";
                gen_status = "running";
                gen_startup_timer = 0.0;
                pair_run_seconds = 0.0;
            }

        } else if (dg_pair_status == "pair_b_running") {
            pair_run_seconds += dt;
            // Accumulate run hours for DG2 (idx 1) and DG4 (idx 3)
            dg_run_hours[1] += dt / 3600.0;
            dg_run_hours[3] += dt / 3600.0;

            // M-10: use named constant instead of inline magic number
            fuel_liters -= dt * FUEL_DRAIN_PAIR_LPS;
            if (fuel_liters < 0.0) fuel_liters = 0.0;

            // Rotate back to Pair A after shift duration
            if (pair_run_seconds >= DG_SHIFT_SECONDS && fuel_liters > 0.0) {
                dg_pair_status = "pair_a_starting";
                active_dg_pair = 0;
                gen_startup_timer = 0.0;
                gen_status = "starting";
            }
        }

        // Fuel starvation — shut everything down
        if (fuel_liters <= 0.0) {
            dg_pair_status = "standby";
            gen_status = "standby";
            pair_run_seconds = 0.0;
            gen_startup_timer = 0.0;
        }

    } else if (grid_active || fire_alarm_active) {
        // Grid restored or fire alarm — all DGs standby
        if (dg_pair_status != "standby") {
            dg_pair_status = "standby";
            gen_status = "standby";
            gen_startup_timer = 0.0;
            pair_run_seconds = 0.0;
        }
    }

    // ==========================================================================
    // 2. Battery State of Charge (SOC)
    // ==========================================================================
    bool charger_online = grid_active || (gen_status == "running");
    if (!charger_online) {
        double total_ups_load_kw = 0.0;
        for (const auto& node : nodes) {
            if (node.type == "ups" && node.is_active) {
                total_ups_load_kw += node.kw_load;
            }
        }
        double discharge_factor = 0.02 + (total_ups_load_kw * 0.0005);
        battery_soc -= dt * discharge_factor;
        if (battery_soc < 0.0) battery_soc = 0.0;
    } else {
        if (battery_soc < 100.0) {
            battery_soc += dt * 0.05;
            if (battery_soc > 100.0) battery_soc = 100.0;
        }
    }

    // ==========================================================================
    // 3. Thermal Model
    // ==========================================================================
    bool is_cooling_running = cooling_active && (grid_active || gen_status == "running");
    if (fire_alarm_active) is_cooling_running = false;

    if (!is_cooling_running) {
        double server_load = 0.0;
        for (const auto& node : nodes) {
            if (node.type == "server" && node.is_active) {
                server_load += node.kw_load;
            }
        }
        ambient_temp += dt * (0.05 + server_load * 0.001);
        if (ambient_temp > 45.0) ambient_temp = 45.0;
    } else {
        if (ambient_temp > 21.0) {
            ambient_temp -= dt * 0.08;
            if (ambient_temp < 21.0) ambient_temp = 21.0;
        }
    }

    // Recalculate routing matrix
    runMatrixUpdate();
}

// =============================================================================
// C-4 FIX: runMatrixUpdate — Two-pass topological update with O(1) lookup map
// =============================================================================
// PREVIOUS BUG: The original single-pass loop called getNode() (an O(n) scan)
// for every node that needed to read an upstream node's state. This caused:
//   1. O(n²) complexity on every tick.
//   2. A one-frame state lag: if node B depended on node A, and A appeared
//      *after* B in the nodes[] vector, B would read A's *previous-frame*
//      is_active value because A hadn't been updated yet in that pass.
//
// FIX: Two-pass strategy + O(1) index map.
//   Pass 1: Source tier  — grid_tx, generator, tco, main_db
void PowerMatrix::runMatrixUpdate() {

    // ── Pre-pass: build O(1) index map ───────────────────────────────────────
    std::unordered_map<std::string, size_t> nodeIdx;
    nodeIdx.reserve(nodes.size());
    for (size_t i = 0; i < nodes.size(); ++i) {
        nodeIdx[nodes[i].id] = i;
    }

    // Safe O(1) read accessors into the nodes[] vector.
    // Because Pass 1 updates source-tier nodes before Pass 2 reads them,
    // these always return the current-frame value — zero lag.
    auto getActiveFor = [&](const std::string& id) -> bool {
        auto it = nodeIdx.find(id);
        return (it != nodeIdx.end()) ? nodes[it->second].is_active : false;
    };
    auto getFaultedFor = [&](const std::string& id) -> bool {
        auto it = nodeIdx.find(id);
        return (it != nodeIdx.end()) ? nodes[it->second].is_faulted : false;
    };

    // ── Derived global states ─────────────────────────────────────────────────
    const bool gen_running    = (dg_pair_status == "pair_a_running" ||
                                 dg_pair_status == "pair_b_running");
    const bool power_available = grid_active || gen_running;

    bool power_path_a_active = power_available && !fire_alarm_active;
    bool power_path_b_active = power_available && !fire_alarm_active;

    // ── PASS 1: Source tier ───────────────────────────────────────────────────
    // Types: grid_tx, generator, tco, main_db (excluding server DBs)
    // These depend ONLY on external state (grid_active, dg_pair_status, etc.)
    // and are safe to update in any order within this pass.
    for (auto& node : nodes) {
        // Skip consumer-tier nodes and dependent server DBs — handled in Pass 2
        if (node.type == "ups"      || node.type == "rectifier" ||
            node.type == "cooling"  || node.type == "server"    ||
            node.id == "node-ac-server-db" || node.id == "node-dc-server-db") {
            continue;
        }

        // Defaults — overridden below per type
        node.is_active = true;
        node.status    = "ONLINE";

        // Global Fire Suppression: all nodes go dark
        if (fire_alarm_active) {
            node.is_active = false;
            node.status    = "EMERGENCY SHUTDOWN";
            node.load_pct  = 0.0;
            node.kw_load   = 0.0;
            continue;
        }

        // Manual fault isolation
        if (node.is_faulted) {
            node.is_active = false;
            node.status    = "FAULTED";
            node.load_pct  = 0.0;
            node.kw_load   = 0.0;
            continue;
        }

        // --- 1. Commercial Grid transformer ---
        if (node.type == "grid_tx") {
            node.is_active = grid_active;
            node.status    = grid_active ? "ONLINE" : "OFFLINE";
            node.kw_load   = grid_active ? 450.0 : 0.0;
            continue;
        }

        // --- 2. Generator nodes ---
        if (node.type == "generator") {
            const bool is_pair_a = (node.id == "node-dg-1" || node.id == "node-dg-3");
            const bool is_pair_b = (node.id == "node-dg-2" || node.id == "node-dg-4");
            const bool is_hq     = (node.id == "node-dg-hq");

            if (is_hq) {
                // Emergency HQ generator — activates when site fuel drops below 100 L
                node.is_active = (fuel_liters < 100.0 && !grid_active && gen_running);
                node.status    = node.is_active ? "EMERGENCY HQ" : "STANDBY";
                node.kw_load   = node.is_active ? 250.0 : 0.0;
                continue;
            }

            if (is_pair_a) {
                if (dg_pair_status == "pair_a_running" || dg_pair_status == "pair_b_starting") {
                    node.is_active = true;  node.status = "RUNNING";     node.kw_load = 90.0;
                } else if (dg_pair_status == "pair_a_starting") {
                    node.is_active = true;  node.status = "STARTING..."; node.kw_load = 0.0;
                } else {
                    node.is_active = false; node.status = "STANDBY";     node.kw_load = 0.0;
                }
            } else if (is_pair_b) {
                if (dg_pair_status == "pair_b_running") {
                    node.is_active = true;  node.status = "RUNNING";     node.kw_load = 90.0;
                } else if (dg_pair_status == "pair_b_starting") {
                    node.is_active = true;  node.status = "STARTING..."; node.kw_load = 0.0;
                } else {
                    node.is_active = false; node.status = "STANDBY";     node.kw_load = 0.0;
                }
            }
            continue;
        }

        // --- 3. TCO (Transfer Changeover) switches ---
        if (node.type == "tco") {
            if (grid_active) {
                node.status    = "MAINS FEED";
                node.is_active = true;
            } else if (gen_running) {
                node.status    = "GENERATOR BACKUP";
                node.is_active = true;
            } else if (dg_pair_status == "pair_a_starting" ||
                       dg_pair_status == "pair_b_starting") {
                // TCO stays open (de-energised) while generators are spooling
                node.status    = "GENERATORS STARTING...";
                node.is_active = false;
            } else {
                node.is_active = false;
                node.status    = "NO VOLTAGE";
            }
            continue;
        }

        // --- 4. Main & Sub Distribution Boards ---
        if (node.type == "main_db") {
            // Root DB — fed directly by grid or DG bus
            if (node.id == "node-main-main-db") {
                node.is_active = power_available;
                node.status    = node.is_active
                    ? (grid_active ? "415V MAINS" : "415V GENERATOR")
                    : "NO VOLTAGE";
                continue;
            }

            // Path A DBs (fed via TCO-1 → Main DB-2 branch)
            const bool main_db_active = power_available; // resolved above, no re-read needed
            if (node.id.find("-2") != std::string::npos ||
                node.id.find("-db-a") != std::string::npos) {
                node.is_active = power_path_a_active
                    && !getFaultedFor("node-tco-1")
                    && main_db_active;
            } else {
                node.is_active = power_path_b_active
                    && !getFaultedFor("node-tco-2")
                    && main_db_active;
            }
            node.status = node.is_active ? "415V AC" : "NO VOLTAGE";
            continue;
        }
    }

    // ── PASS 2: Consumer tier & Dependent DBs ──────────────────────────────────
    
    // Sub-pass 2A: UPS & Rectifiers (resolve first)
    for (auto& node : nodes) {
        if (node.type != "ups" && node.type != "rectifier") {
            continue;
        }

        node.is_active = true;
        node.status    = "ONLINE";

        if (fire_alarm_active) {
            node.is_active = false;
            node.status    = "EMERGENCY SHUTDOWN";
            node.load_pct  = 0.0;
            node.kw_load   = 0.0;
            continue;
        }

        if (node.is_faulted) {
            node.is_active = false;
            node.status    = "FAULTED";
            node.load_pct  = 0.0;
            node.kw_load   = 0.0;
            continue;
        }

        // --- 5. UPS Modules ---
        if (node.type == "ups") {
            const bool source_db_active = (node.id == "node-ups-2")
                ? getActiveFor("node-ac-ups-db-a")
                : getActiveFor("node-ac-ups-db-b");

            if (!source_db_active) {
                // No AC input — run on battery
                if (battery_soc > 0.0) {
                    node.is_active = true;
                    node.status    = "BATTERY DISCHARGING";
                } else {
                    node.is_active = false;
                    node.status    = "BATTERY DRAINED";
                }
            } else {
                node.is_active = true;
                node.status    = (battery_soc < 100.0) ? "CHARGING" : "ONLINE";
            }

            if (node.is_active) {
                const double s_apparent = (std::sqrt(3.0) * node.voltage * node.current) / 1000.0;
                node.load_pct        = (s_apparent / node.capacity) * 100.0;
                node.kw_load         = s_apparent * 0.9;
                node.runtime_minutes = (battery_soc / 100.0) * (200.0 * 551.2)
                    / (std::max(node.kw_load * 1000.0, 1.0)) * 60.0;
                if (node.runtime_minutes > 1440.0) node.runtime_minutes = 1440.0;
            } else {
                node.load_pct        = 0.0;
                node.kw_load         = 0.0;
                node.runtime_minutes = 0.0;
            }
            continue;
        }

        // --- 6. Rectifier Modules ---
        if (node.type == "rectifier") {
            const bool source_db_active = (node.id == "node-rectifier-2")
                ? getActiveFor("node-dc-rect-db-a")
                : getActiveFor("node-dc-rect-db-b");

            if (source_db_active) {
                node.is_active = true;
                node.status    = (battery_soc < 100.0) ? "FLOAT CHARGING" : "ONLINE";
                node.load_pct  = (node.current / node.capacity) * 100.0;
                node.kw_load   = (node.voltage * node.current) / 1000.0;
            } else {
                // DC Battery String Backup (rectifiers share the DC battery bus in parallel)
                if (battery_soc > 0.0) {
                    node.is_active = true;
                    node.status    = "-48V DC BATTERY BACKUP";
                    node.load_pct  = (node.current / node.capacity) * 100.0;
                    node.kw_load   = (node.voltage * node.current) / 1000.0;
                } else {
                    node.is_active = false;
                    node.status    = "BATTERY DRAINED";
                    node.load_pct  = 0.0;
                    node.kw_load   = 0.0;
                }
            }
            continue;
        }
    }

    // Sub-pass 2B: Dependent Server Distribution Boards (node-ac-server-db & node-dc-server-db)
    for (auto& node : nodes) {
        if (node.id != "node-ac-server-db" && node.id != "node-dc-server-db") {
            continue;
        }

        node.is_active = true;
        node.status    = "ONLINE";

        if (fire_alarm_active) {
            node.is_active = false;
            node.status    = "EMERGENCY SHUTDOWN";
            node.load_pct  = 0.0;
            node.kw_load   = 0.0;
            continue;
        }

        if (node.is_faulted) {
            node.is_active = false;
            node.status    = "FAULTED";
            node.load_pct  = 0.0;
            node.kw_load   = 0.0;
            continue;
        }

        if (node.id == "node-ac-server-db") {
            const bool ups1_active = getActiveFor("node-ups-1");
            const bool ups2_active = getActiveFor("node-ups-2");
            node.is_active = ups1_active || ups2_active;
            node.status    = node.is_active ? "415V AC" : "NO VOLTAGE";
        } else if (node.id == "node-dc-server-db") {
            const bool rect1_active = getActiveFor("node-rectifier-1");
            const bool rect2_active = getActiveFor("node-rectifier-2");
            node.is_active = rect1_active || rect2_active;
            node.status    = node.is_active ? "-48V DC" : "NO VOLTAGE";
        }
    }

    // Sub-pass 2C: Servers & Cooling (resolve last, depending on sub-pass 2A/2B states)
    for (auto& node : nodes) {
        if (node.type != "server" && node.type != "cooling") {
            continue;
        }

        node.is_active = true;
        node.status    = "ONLINE";

        if (fire_alarm_active) {
            node.is_active = false;
            node.status    = "EMERGENCY SHUTDOWN";
            node.load_pct  = 0.0;
            node.kw_load   = 0.0;
            continue;
        }

        if (node.is_faulted) {
            node.is_active = false;
            node.status    = "FAULTED";
            node.load_pct  = 0.0;
            node.kw_load   = 0.0;
            continue;
        }

        // --- 7. Cooling / Air-Con Systems ---
        if (node.type == "cooling") {
            const bool useDbA =
                (node.id.find("ac-1") != std::string::npos ||
                 node.id.find("ac-2") != std::string::npos ||
                 node.id.find("ac-6") != std::string::npos ||
                 node.id.find("ac-7") != std::string::npos);
            const bool source_db_active = useDbA
                ? getActiveFor("node-aircon-db-a")
                : getActiveFor("node-aircon-db-b");

            if (source_db_active && cooling_active) {
                node.is_active = true;
                node.voltage   = ambient_temp;
                node.current   = 21.0;
                node.status    = "COOLING ONLINE";
                node.kw_load   = 12.5;
            } else {
                node.is_active = false;
                node.status    = "OFFLINE";
                node.kw_load   = 0.0;
                node.voltage   = ambient_temp;
            }
            continue;
        }

        // --- 8. Server Racks ---
        if (node.type == "server") {
            const bool has_ac_power = getActiveFor("node-ac-server-db");
            const bool has_dc_power = getActiveFor("node-dc-server-db");

            if (node.id == "node-vertiv-1" || node.id == "node-vertiv-2") {
                node.is_active = has_ac_power;
            } else if (node.id == "node-dragor") {
                // Dragor is powered directly from Path B, bypassing UPS
                node.is_active = power_path_b_active && !getFaultedFor("node-tco-2");
            } else {
                node.is_active = has_dc_power;
            }

            if (node.is_active) {
                node.status  = "LOAD OK";
                node.kw_load = 8.5;
            } else {
                node.status  = "BLACKOUT";
                node.kw_load = 0.0;
            }
            continue;
        }
    }
}

} // namespace Topology
