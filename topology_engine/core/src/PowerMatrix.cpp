#include "PowerMatrix.hpp"
#include <cmath>
#include <algorithm>

namespace Topology {

// 8 real minutes per shift for simulation demo (480 seconds).
// Change to 28800.0 for true 8-hour real-time shifts.
const double PowerMatrix::DG_SHIFT_SECONDS = 480.0;

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
        for (int i = 0; i < 4; i++) dg_run_hours[i] = 0.0;
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

            // Fuel drain for 2 running generators
            double drain_rate = 0.030 + (180.0 * 0.00005); // 2 gens at ~90kW each
            fuel_liters -= dt * drain_rate;
            if (fuel_liters < 0.0) fuel_liters = 0.0;

            // Rotate to Pair B after shift duration
            if (pair_run_seconds >= DG_SHIFT_SECONDS && fuel_liters > 0.0) {
                // Start Pair B (DG2 & DG4) alongside — brief parallel run
                dg_pair_status = "pair_b_starting";
                active_dg_pair = 1;
                gen_startup_timer = 0.0;
            }

        } else if (dg_pair_status == "pair_b_starting") {
            gen_startup_timer += dt;
            // Pair A still running during Pair B spool
            dg_run_hours[0] += dt / 3600.0;
            dg_run_hours[2] += dt / 3600.0;
            double drain_rate = 0.045; // 3 gens running during handover
            fuel_liters -= dt * drain_rate;
            if (fuel_liters < 0.0) fuel_liters = 0.0;

            if (gen_startup_timer >= 3.5) {
                // Pair B online, Pair A shuts down
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

            double drain_rate = 0.030 + (180.0 * 0.00005);
            fuel_liters -= dt * drain_rate;
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

void PowerMatrix::runMatrixUpdate() {
    // Is there ANY source of power (grid OR any active DG pair)?
    bool gen_running = (dg_pair_status == "pair_a_running" || dg_pair_status == "pair_b_running");
    bool power_available = grid_active || gen_running;

    bool power_path_a_active = power_available;
    bool power_path_b_active = power_available;

    if (fire_alarm_active) {
        power_path_a_active = false;
        power_path_b_active = false;
    }

    for (auto& node : nodes) {
        node.is_active = true;
        node.status = "ONLINE";

        // Global Fire Suppression shutdown
        if (fire_alarm_active) {
            node.is_active = false;
            node.status = "EMERGENCY SHUTDOWN";
            node.load_pct = 0.0;
            node.kw_load = 0.0;
            continue;
        }

        // Manual isolations
        if (node.is_faulted) {
            node.is_active = false;
            node.status = "FAULTED";
            node.load_pct = 0.0;
            node.kw_load = 0.0;
            continue;
        }

        // --- 1. Commercial Grid ---
        if (node.type == "grid_tx") {
            node.is_active = grid_active;
            if (grid_active) {
                node.status = "ONLINE";
                node.kw_load = 450.0;
            } else {
                node.status = "OFFLINE";
                node.kw_load = 0.0;
            }
            continue;
        }

        // --- 2. Generator Nodes (per-DG status based on active pair) ---
        if (node.type == "generator") {
            // Determine which pair this DG belongs to
            // Pair A: node-dg-1, node-dg-3
            // Pair B: node-dg-2, node-dg-4
            // node-dg-hq: only activates if fuel < 100L (emergency HQ gen)
            bool is_pair_a = (node.id == "node-dg-1" || node.id == "node-dg-3");
            bool is_pair_b = (node.id == "node-dg-2" || node.id == "node-dg-4");
            bool is_hq = (node.id == "node-dg-hq");

            if (is_hq) {
                node.is_active = (fuel_liters < 100.0 && !grid_active && gen_running);
                node.status = node.is_active ? "EMERGENCY HQ" : "STANDBY";
                node.kw_load = node.is_active ? 250.0 : 0.0;
                continue;
            }

            if (is_pair_a) {
                if (dg_pair_status == "pair_a_running" || dg_pair_status == "pair_b_starting") {
                    node.is_active = true;
                    node.status = "RUNNING";
                    node.kw_load = 90.0;
                } else if (dg_pair_status == "pair_a_starting") {
                    node.is_active = true;
                    node.status = "STARTING...";
                    node.kw_load = 0.0;
                } else {
                    node.is_active = false;
                    node.status = "STANDBY";
                    node.kw_load = 0.0;
                }
            } else if (is_pair_b) {
                if (dg_pair_status == "pair_b_running") {
                    node.is_active = true;
                    node.status = "RUNNING";
                    node.kw_load = 90.0;
                } else if (dg_pair_status == "pair_b_starting") {
                    node.is_active = true;
                    node.status = "STARTING...";
                    node.kw_load = 0.0;
                } else {
                    node.is_active = false;
                    node.status = "STANDBY";
                    node.kw_load = 0.0;
                }
            }
            continue;
        }

        // --- 3. TCOs (Changeover Switches) ---
        if (node.type == "tco") {
            if (grid_active) {
                node.status = "MAINS FEED";
                node.is_active = true;
            } else if (gen_running) {
                node.status = "GENERATOR BACKUP";
                node.is_active = true;
            } else if (dg_pair_status == "pair_a_starting" || dg_pair_status == "pair_b_starting") {
                node.status = "GENERATORS STARTING...";
                node.is_active = false; // TCO stays open during spool
            } else {
                node.is_active = false;
                node.status = "NO VOLTAGE";
            }
            continue;
        }

        // --- 4. Main & Sub Distribution Boards ---
        if (node.type == "main_db") {
            // node-main-main-db: the root DB fed by grid OR DG bus
            if (node.id == "node-main-main-db") {
                node.is_active = power_available;
                node.status = node.is_active ? (grid_active ? "415V MAINS" : "415V GENERATOR") : "NO VOLTAGE";
                continue;
            }

            // Path A DBs (fed via TCO-1 → Main DB-2 branch)
            if (node.id.find("-2") != std::string::npos || node.id.find("-db-a") != std::string::npos) {
                node.is_active = power_path_a_active && !getNode("node-tco-1").is_faulted && getNode("node-main-main-db").is_active;
            } else {
                // Path B DBs
                node.is_active = power_path_b_active && !getNode("node-tco-2").is_faulted && getNode("node-main-main-db").is_active;
            }

            node.status = node.is_active ? "415V AC" : "NO VOLTAGE";
            continue;
        }

        // --- 5. UPS Modules ---
        if (node.type == "ups") {
            bool source_db_active = false;
            if (node.id == "node-ups-2") {
                source_db_active = getNode("node-ac-ups-db-a").is_active;
            } else {
                source_db_active = getNode("node-ac-ups-db-b").is_active;
            }

            if (!source_db_active) {
                if (battery_soc > 0.0) {
                    node.is_active = true;
                    node.status = "BATTERY DISCHARGING";
                } else {
                    node.is_active = false;
                    node.status = "BATTERY DRAINED";
                }
            } else {
                node.is_active = true;
                node.status = (battery_soc < 100.0) ? "CHARGING" : "ONLINE";
            }

            if (node.is_active) {
                double s_apparent = (std::sqrt(3.0) * node.voltage * node.current) / 1000.0;
                node.load_pct = (s_apparent / node.capacity) * 100.0;
                node.kw_load = s_apparent * 0.9;
                node.runtime_minutes = (battery_soc / 100.0) * (200.0 * 551.2) / (std::max(node.kw_load * 1000.0, 1.0)) * 60.0;
                if (node.runtime_minutes > 1440.0) node.runtime_minutes = 1440.0;
            } else {
                node.load_pct = 0.0;
                node.kw_load = 0.0;
                node.runtime_minutes = 0.0;
            }
            continue;
        }

        // --- 6. Rectifier Modules ---
        if (node.type == "rectifier") {
            bool source_db_active = false;
            if (node.id == "node-rectifier-2") {
                source_db_active = getNode("node-dc-rect-db-a").is_active;
            } else {
                source_db_active = getNode("node-dc-rect-db-b").is_active;
            }

            if (source_db_active) {
                node.is_active = true;
                node.status = "ONLINE";
                node.load_pct = (node.current / node.capacity) * 100.0;
                node.kw_load = (node.voltage * node.current) / 1000.0;
            } else {
                node.is_active = false;
                node.status = "NO VOLTAGE";
                node.load_pct = 0.0;
                node.kw_load = 0.0;
            }
            continue;
        }

        // --- 7. Cooling Systems ---
        if (node.type == "cooling") {
            bool source_db_active = false;
            if (node.id.find("ac-1") != std::string::npos || node.id.find("ac-2") != std::string::npos ||
                node.id.find("ac-6") != std::string::npos || node.id.find("ac-7") != std::string::npos) {
                source_db_active = getNode("node-aircon-db-a").is_active;
            } else {
                source_db_active = getNode("node-aircon-db-b").is_active;
            }

            if (source_db_active && cooling_active) {
                node.is_active = true;
                node.voltage = ambient_temp;
                node.current = 21.0;
                node.status = "COOLING ONLINE";
                node.kw_load = 12.5;
            } else {
                node.is_active = false;
                node.status = "OFFLINE";
                node.kw_load = 0.0;
                node.voltage = ambient_temp;
            }
            continue;
        }

        // --- 8. Server Racks ---
        if (node.type == "server") {
            bool has_ac_power = getNode("node-ac-server-db").is_active;
            bool has_dc_power = getNode("node-dc-server-db").is_active;

            if (node.id == "node-vertiv-1" || node.id == "node-vertiv-2") {
                node.is_active = has_ac_power;
            } else if (node.id == "node-dragor") {
                node.is_active = power_path_b_active && !getNode("node-tco-2").is_faulted;
            } else {
                node.is_active = has_dc_power;
            }

            if (node.is_active) {
                node.status = "LOAD OK";
                node.kw_load = 8.5;
            } else {
                node.status = "BLACKOUT";
                node.kw_load = 0.0;
            }
            continue;
        }
    }
}

} // namespace Topology
