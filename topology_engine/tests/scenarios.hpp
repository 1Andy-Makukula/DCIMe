// topology_engine/tests/scenarios.hpp
//
// The seed topology and the scenario list, shared by golden_gen and run_tests
// so the generator and the checker can never drift apart.
//
// seed_facility() mirrors seedInitialTopology() in
// public/topology_engine/renderer/engine.js exactly. When Stage 2 moves the
// topology into Supabase, THIS function is what gets replaced by a database
// load — and these fixtures are what prove the replacement changed nothing.

#ifndef SCENARIOS_HPP
#define SCENARIOS_HPP

#include "../core/include/PowerMatrix.hpp"

#include <string>
#include <vector>

namespace Scenarios {

using Topology::Node;
using Topology::PowerMatrix;

// Mirrors the defaultNode object in engine.js.
inline Node make(const std::string& id,
                 const std::string& type,
                 const std::string& name,
                 double capacity = 0.0,
                 double voltage  = 0.0,
                 double current  = 0.0,
                 double kw_load  = 0.0) {
    Node n;
    n.id               = id;
    n.type             = type;
    n.name             = name;
    n.is_active        = true;
    n.is_faulted       = false;
    n.capacity         = capacity;
    n.load_pct         = 0.0;
    n.voltage          = voltage;
    n.current          = current;
    n.kw_load          = kw_load;
    n.runtime_minutes  = 0.0;
    n.status           = "ONLINE";
    return n;
}

// 48 nodes, in the same order engine.js adds them.
inline void seed_facility(PowerMatrix& pm) {
    // Grid & generators
    pm.addNode(make("node-grid-tx", "grid_tx", "ZESCO Grid Feed", 750.0, 11000.0, 24.0));
    for (int i = 1; i <= 4; ++i) {
        pm.addNode(make("node-dg-" + std::to_string(i), "generator",
                        "Generator DG-" + std::to_string(i), 1000.0, 0.0, 0.0, 0.0));
    }
    pm.addNode(make("node-dg-hq", "generator", "HQ Standby Gen", 1500.0, 0.0, 0.0, 0.0));

    // Changeover
    pm.addNode(make("node-tco-1", "tco", "TCO 1"));
    pm.addNode(make("node-tco-2", "tco", "TCO 2"));

    // Distribution boards
    pm.addNode(make("node-main-main-db", "main_db", "MAIN MAIN DB"));
    pm.addNode(make("node-maindb-1",     "main_db", "MAIN DB 1"));
    pm.addNode(make("node-maindb-2",     "main_db", "MAIN DB 2"));
    pm.addNode(make("node-ac-ups-db-a",  "main_db", "AC UPS DB A"));
    pm.addNode(make("node-dc-rect-db-a", "main_db", "DC RECTIFIER DB A"));
    pm.addNode(make("node-aircon-db-a",  "main_db", "AIRCON UNITS DB A"));
    pm.addNode(make("node-ac-ups-db-b",  "main_db", "AC UPS DB B"));
    pm.addNode(make("node-dc-rect-db-b", "main_db", "DC RECTIFIER DB B"));
    pm.addNode(make("node-aircon-db-b",  "main_db", "AIRCON UNITS DB B"));
    pm.addNode(make("node-ac-server-db", "main_db", "AC SERVER DB"));
    pm.addNode(make("node-dc-server-db", "main_db", "DC SERVER DB"));

    // Conversion
    pm.addNode(make("node-ups-1",       "ups",       "Vertiv UPS 1",         200.0,  415.0,  120.0));
    pm.addNode(make("node-ups-2",       "ups",       "Vertiv UPS 2",         200.0,  415.0,  110.0));
    pm.addNode(make("node-rectifier-1", "rectifier", "NetSure Rectifier 1", 5000.0,   54.2, 1167.0));
    pm.addNode(make("node-rectifier-2", "rectifier", "NetSure Rectifier 2", 5000.0,   54.2, 1050.0));

    // IT load
    for (int i = 1; i <= 6; ++i) {
        pm.addNode(make("node-vertiv-" + std::to_string(i), "server",
                        "Vertiv Rack " + std::to_string(i)));
    }
    pm.addNode(make("node-dragor", "server", "Dragor Rack"));

    // Cooling
    for (int i = 1; i <= 7; ++i) {
        pm.addNode(make("node-sr-ac-" + std::to_string(i), "cooling",
                        "Emerson AC-" + std::to_string(i)));
    }
    pm.addNode(make("node-pr1-ac-1", "cooling", "PR1 PAC-1"));
    pm.addNode(make("node-pr1-ac-2", "cooling", "PR1 PAC-2"));
    pm.addNode(make("node-pr1-ac-3", "cooling", "PR1 PAC-3"));
    pm.addNode(make("node-pr2-ac-1", "cooling", "PR2 PAC-1"));
    pm.addNode(make("node-pr2-ac-2", "cooling", "PR2 PAC-2"));
    pm.addNode(make("node-it1-ac-1", "cooling", "IT1 PAC-1"));
    pm.addNode(make("node-it1-ac-2", "cooling", "IT1 PAC-2"));
    pm.addNode(make("node-it2-ac-1", "cooling", "IT2 PAC-1"));
    pm.addNode(make("node-it2-ac-2", "cooling", "IT2 PAC-2"));
    pm.addNode(make("node-dr-ac-1",  "cooling", "DR PAC-1"));
    pm.addNode(make("node-dr-ac-2",  "cooling", "DR PAC-2"));
}

// ── Scenario definitions ──────────────────────────────────────────────────
//
// Each scenario: seed the facility, apply a setup, then advance the engine a
// fixed number of ticks at a fixed dt. The engine contains no clock and no
// RNG, so a given (setup, dt, steps) triple is exactly reproducible.

struct Scenario {
    std::string name;
    std::string description;
    void (*setup)(PowerMatrix&);
    int    steps;
    double dt;      // seconds per tick
};

inline void s_baseline(PowerMatrix&) {
    // Nominal: grid live, nothing faulted.
}

inline void s_grid_fail(PowerMatrix& pm) {
    pm.setGridActive(false);
}

inline void s_grid_fail_no_auto(PowerMatrix& pm) {
    pm.setDgAuto(false);
    pm.setGridActive(false);
}

inline void s_dg1_fault(PowerMatrix& pm) {
    pm.setGridActive(false);
    pm.toggleNodeFault("node-dg-1", true);
}

inline void s_ups1_fault(PowerMatrix& pm) {
    pm.toggleNodeFault("node-ups-1", true);
}

inline void s_both_ups_fault(PowerMatrix& pm) {
    pm.toggleNodeFault("node-ups-1", true);
    pm.toggleNodeFault("node-ups-2", true);
}

inline void s_rectifier1_fault(PowerMatrix& pm) {
    pm.toggleNodeFault("node-rectifier-1", true);
}

inline void s_fire_alarm(PowerMatrix& pm) {
    pm.setFireAlarmActive(true);
}

inline void s_cooling_loss(PowerMatrix& pm) {
    pm.setCoolingActive(false);
}

inline void s_tco1_fault(PowerMatrix& pm) {
    pm.toggleNodeFault("node-tco-1", true);
}

// 10 scenarios. Short runs (1 tick) capture the immediate cascade; longer runs
// exercise the generator rotation and fuel/battery integrators.
inline std::vector<Scenario> all() {
    return {
        { "baseline",           "Grid live, nothing faulted",                 s_baseline,          1,   1.0 },
        { "grid_fail_instant",  "Grid drops, before generators spool",        s_grid_fail,         1,   1.0 },
        { "grid_fail_settled",  "Grid down 120s, Pair A running",             s_grid_fail,       120,   1.0 },
        { "grid_fail_rotation", "Grid down past shift length, pair rotates",  s_grid_fail,       600,   1.0 },
        { "grid_fail_no_auto",  "Grid drops with DG auto disabled",           s_grid_fail_no_auto, 30,  1.0 },
        { "dg1_fault",          "Grid down and DG-1 faulted",                 s_dg1_fault,       120,   1.0 },
        { "ups1_fault",         "UPS 1 faulted, grid live",                   s_ups1_fault,        1,   1.0 },
        { "both_ups_fault",     "Both UPS faulted, grid live",                s_both_ups_fault,    1,   1.0 },
        { "rectifier1_fault",   "Rectifier 1 faulted, grid live",             s_rectifier1_fault,  1,   1.0 },
        { "fire_alarm",         "Fire alarm active (EPO path)",               s_fire_alarm,        5,   1.0 },
        { "cooling_loss",       "Cooling disabled, thermal rise",             s_cooling_loss,     60,   1.0 },
        { "tco1_fault",         "TCO 1 faulted, grid live",                   s_tco1_fault,        1,   1.0 },
    };
}

// Runs one scenario to completion on a fresh engine.
inline void run(const Scenario& sc, PowerMatrix& pm) {
    seed_facility(pm);
    pm.resetAll();          // clears faults + globals; nodes are retained
    sc.setup(pm);
    for (int i = 0; i < sc.steps; ++i) {
        pm.updateState(sc.dt);
        pm.runMatrixUpdate();
    }
}

} // namespace Scenarios

#endif // SCENARIOS_HPP
