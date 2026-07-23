#ifndef POWER_MATRIX_HPP
#define POWER_MATRIX_HPP

#include <string>
#include <vector>

namespace Topology {

enum BreakerState { CLOSED, OPEN, TRIPPED };
enum TcoPosition { TCO_GRID, TCO_GENERATOR, TCO_NEUTRAL };

struct Node {
    std::string id;
    std::string type; // "grid_tx", "tco", "main_db", "ups", "rectifier", "cooling", "server", "generator"
    std::string name;
    bool is_active;
    bool is_faulted;
    double capacity;        // Max capacity (e.g. 200.0 kVA or 5000.0 Amps)
    double load_pct;        // Calculated load percentage
    double voltage;         // Voltage (AC phase-to-phase or DC)
    double current;         // Current (Amps)
    double kw_load;         // Calculated real power load (kW)
    double runtime_minutes; // Battery runtime remaining
    std::string status;     // "ONLINE", "NO VOLTAGE", "FAULTED", "BLACKOUT", etc.
};

class PowerMatrix {
public:
    PowerMatrix();
    ~PowerMatrix() = default;

    // Node configuration
    void addNode(const Node& node);
    void updateNodeTelemetry(const std::string& id, double voltage, double current);
    void toggleNodeFault(const std::string& id, bool faulted);
    void clearAllFaults();

    // Simulation controls
    void updateState(double dt);
    // Two-pass topological update (C-4 fix — see PowerMatrix.cpp for details).
    // Pass 1: source-tier nodes (grid_tx, generator, tco, main_db).
    // Pass 2: consumer-tier nodes (ups, rectifier, cooling, server).
    void runMatrixUpdate();

    // Setters & Getters
    void setGridActive(bool active);
    void setFireAlarmActive(bool active);
    void setCoolingActive(bool active);
    void setDgAuto(bool auto_active);
    void resetAll();

    std::vector<Node> getNodes() const;
    Node getNode(const std::string& id) const;

    bool getGridActive() const { return grid_active; }
    bool getFireAlarmActive() const { return fire_alarm_active; }
    bool getCoolingActive() const { return cooling_active; }
    bool getDgAuto() const { return dg_auto; }
    double getFuelLiters() const { return fuel_liters; }
    double getAmbientTemp() const { return ambient_temp; }
    double getBatterySoc() const { return battery_soc; }
    std::string getGenStatus() const { return gen_status; }

    // ── New DG pair rotation getters ──────────────────────────────────────────
    // Returns "standby", "pair_a_starting", "pair_a_running", "pair_b_starting", "pair_b_running"
    std::string getDgPairStatus() const { return dg_pair_status; }
    // Returns accumulated run-hours for DG unit by index.
    // C-5: dg_run_hours is declared as double[4] — valid indices are 0, 1, 2, 3
    //      (DG1=0, DG2=1, DG3=2, DG4=3).  Any other value returns 0.0 safely.
    //      JS/WASM callers must validate idx before calling: 0 <= idx <= 3.
    double getDgRunHours(int idx) const {
        // Explicit contract: [0,3] are the only valid indices for dg_run_hours[4]
        if (idx < 0 || idx > 3) return 0.0;
        return dg_run_hours[idx];
    }
    // Returns which pair is currently active: 0 = Pair A (DG1&3), 1 = Pair B (DG2&4)
    int getActiveDgPair() const { return active_dg_pair; }
    // Returns how many sim-seconds have elapsed on the current running pair
    double getPairRunSeconds() const { return pair_run_seconds; }

private:
    std::vector<Node> nodes;

    // Global states
    bool grid_active;
    bool fire_alarm_active;
    bool cooling_active;
    bool dg_auto;
    double fuel_liters;
    double ambient_temp;
    std::string gen_status;    // "standby", "starting", "running" — legacy, keep for compat
    double battery_soc;        // shared UPS state of charge

    // ── DG pair rotation state ────────────────────────────────────────────────
    std::string dg_pair_status; // "standby" | "pair_a_starting" | "pair_a_running" | "pair_b_starting" | "pair_b_running"
    int active_dg_pair;         // 0 = Pair A (DG1&3), 1 = Pair B (DG2&4)
    double gen_startup_timer;   // seconds elapsed during current spool-up phase
    double pair_run_seconds;    // total seconds current active pair has been running
    double dg_run_hours[4];     // individual run-hour accumulators for DG0-DG3

    // Shift length (seconds). Default = 28800 (8 real hours).
    // For demo/simulation, change to e.g. 480 (8 sim-minutes).
    static const double DG_SHIFT_SECONDS;

    // M-10: Fuel drain rates (L/s) — authoritative definitions are in PowerMatrix.cpp.
    // Declared here for visibility; defined as file-scope constexpr in the .cpp.
    //   PAIR     : 2 generators running simultaneously  (steady-state) ≈ 140 L/hr
    //   HANDOVER : 3-generator overlap during pair rotation            ≈ 162 L/hr
};

} // namespace Topology

#endif // POWER_MATRIX_HPP
