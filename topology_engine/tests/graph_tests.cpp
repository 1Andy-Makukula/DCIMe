// topology_engine/tests/graph_tests.cpp
//
// Stage 4a: structural tests for the topology graph.
//
// These check the GRAPH — indices, adjacency, topological order, cycle
// detection — not the cascade. runMatrixUpdate() is unchanged at this stage, so
// the golden fixtures must still pass untouched; that separation is what makes
// the Stage 4b behaviour change reviewable rather than a leap.
//
//   .\test_engine.ps1 -Graph

#include "../core/include/PowerMatrix.hpp"
#include "scenarios.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

using Topology::Node;
using Topology::PowerMatrix;

static int passed = 0;
static int failed = 0;

static void check(bool cond, const std::string& name, const std::string& detail = "") {
    if (cond) {
        std::printf("  PASS  %s\n", name.c_str());
        ++passed;
    } else {
        std::printf("  FAIL  %s%s%s\n", name.c_str(),
                    detail.empty() ? "" : " - ", detail.c_str());
        ++failed;
    }
}

static bool contains(const std::vector<std::string>& v, const std::string& s) {
    return std::find(v.begin(), v.end(), s) != v.end();
}

/** Position of an id within the topological order; -1 if absent. */
static int posIn(const std::vector<std::string>& order, const std::string& id) {
    for (size_t i = 0; i < order.size(); ++i) if (order[i] == id) return static_cast<int>(i);
    return -1;
}

// ── 1. A trivial chain ───────────────────────────────────────────────────────
static void test_linear_chain() {
    std::printf("\nlinear chain  grid -> db -> rack\n");
    PowerMatrix pm;
    pm.beginLoad();
    pm.addNode(Scenarios::make("grid", "grid_tx", "Grid"));
    pm.addNode(Scenarios::make("db",   "main_db", "DB"));
    pm.addNode(Scenarios::make("rack", "server",  "Rack"));
    pm.addEdge("grid", "db");
    pm.addEdge("db",   "rack");

    const bool ok = pm.buildGraph();
    check(ok, "buildGraph succeeds");
    check(pm.isGraphBuilt(), "graph reports built");
    check(pm.getEdgeCount() == 2, "edge count is 2");

    const auto order = pm.getTopoOrder();
    check(order.size() == 3, "all 3 nodes ordered");
    check(posIn(order, "grid") < posIn(order, "db"), "grid precedes db");
    check(posIn(order, "db")   < posIn(order, "rack"), "db precedes rack");

    check(pm.getFeeders("rack").size() == 1 && pm.getFeeders("rack")[0] == "db",
          "rack is fed by db");
    check(pm.getLoads("grid").size() == 1 && pm.getLoads("grid")[0] == "db",
          "grid feeds db");
    check(pm.getFeeders("grid").empty(), "grid is a source");
}

// ── 2. Dual-cord convergence ────────────────────────────────────────────────
// The structure redundancy depends on: one node, two independent feeders.
static void test_dual_feed() {
    std::printf("\ndual feed  ups1 + ups2 -> rack\n");
    PowerMatrix pm;
    pm.beginLoad();
    pm.addNode(Scenarios::make("ups1", "ups",    "UPS 1"));
    pm.addNode(Scenarios::make("ups2", "ups",    "UPS 2"));
    pm.addNode(Scenarios::make("rack", "server", "Rack"));
    pm.setInputPolicy("rack", "ANY");
    pm.addEdge("ups1", "rack", 1, "OUT", "PSU_A");
    pm.addEdge("ups2", "rack", 2, "OUT", "PSU_B");

    check(pm.buildGraph(), "buildGraph succeeds");

    const auto feeders = pm.getFeeders("rack");
    check(feeders.size() == 2, "rack has 2 feeders", std::to_string(feeders.size()));
    check(contains(feeders, "ups1") && contains(feeders, "ups2"),
          "both UPS feed the rack");

    const auto order = pm.getTopoOrder();
    check(posIn(order, "ups1") < posIn(order, "rack") &&
          posIn(order, "ups2") < posIn(order, "rack"),
          "both feeders precede the rack in topo order");
}

// ── 3. A cycle is a data error, never a hang ────────────────────────────────
static void test_cycle_detection() {
    std::printf("\ncycle  a -> b -> c -> a\n");
    PowerMatrix pm;
    pm.beginLoad();
    pm.addNode(Scenarios::make("a", "main_db", "A"));
    pm.addNode(Scenarios::make("b", "main_db", "B"));
    pm.addNode(Scenarios::make("c", "main_db", "C"));
    pm.addEdge("a", "b");
    pm.addEdge("b", "c");
    pm.addEdge("c", "a");

    const bool ok = pm.buildGraph();
    check(!ok, "buildGraph reports failure");
    check(!pm.isGraphBuilt(), "graph is not marked built");

    const auto issues = pm.getGraphIssues();
    bool cycle_reported = false;
    for (const auto& i : issues) if (i.rfind("CYCLE:", 0) == 0) cycle_reported = true;
    check(cycle_reported, "a CYCLE issue is reported",
          issues.empty() ? "no issues at all" : issues[0]);
}

// ── 4. Dangling and self-referential edges ──────────────────────────────────
static void test_bad_edges() {
    std::printf("\nmalformed edges\n");
    PowerMatrix pm;
    pm.beginLoad();
    pm.addNode(Scenarios::make("a", "main_db", "A"));
    pm.addEdge("a", "ghost");     // unknown target
    pm.addEdge("phantom", "a");   // unknown source
    pm.addEdge("a", "a");         // self loop

    pm.buildGraph();
    const auto issues = pm.getGraphIssues();

    int dangling = 0, selfloop = 0;
    for (const auto& i : issues) {
        if (i.rfind("DANGLING_EDGE:", 0) == 0) ++dangling;
        if (i.rfind("SELF_LOOP:", 0)     == 0) ++selfloop;
    }
    check(dangling == 2, "both dangling edges reported", std::to_string(dangling));
    check(selfloop == 1, "self loop reported",           std::to_string(selfloop));
    check(pm.getEdgeCount() == 0, "no malformed edge enters the graph",
          std::to_string(pm.getEdgeCount()));
}

// ── 5. Declaration order must not matter ────────────────────────────────────
static void test_edge_before_node() {
    std::printf("\nedges declared before their nodes\n");
    PowerMatrix pm;
    pm.beginLoad();
    pm.addEdge("grid", "db");                       // declared first
    pm.addNode(Scenarios::make("grid", "grid_tx", "Grid"));
    pm.addNode(Scenarios::make("db",   "main_db", "DB"));

    check(pm.buildGraph(), "buildGraph succeeds with edges declared first");
    check(pm.getEdgeCount() == 1, "edge resolved");
    check(pm.getFeeders("db").size() == 1, "db has its feeder");
}

// ── 6. The real facility ────────────────────────────────────────────────────
// Mirrors the sandbox seeded in Postgres: 50 nodes, 51 edges, generators on a
// common paralleling bus feeding both changeovers.
static void test_real_topology() {
    std::printf("\nreal facility  generators -> bus -> changeovers\n");
    PowerMatrix pm;
    pm.beginLoad();
    Scenarios::seed_facility(pm);
    pm.addNode(Scenarios::make("node-dg-bus", "main_db", "DG Paralleling Bus"));

    // Generators parallel onto the shared bus, exactly as index.html draws it.
    pm.addEdge("node-dg-1",  "node-dg-bus", 1);
    pm.addEdge("node-dg-2",  "node-dg-bus", 2);
    pm.addEdge("node-dg-3",  "node-dg-bus", 3);
    pm.addEdge("node-dg-4",  "node-dg-bus", 4);
    pm.addEdge("node-dg-hq", "node-dg-bus", 5);
    // Grid path, and the bus backing both changeovers.
    pm.addEdge("node-grid-tx",      "node-main-main-db", 1);
    pm.addEdge("node-main-main-db", "node-tco-1", 1);
    pm.addEdge("node-main-main-db", "node-tco-2", 1);
    pm.addEdge("node-dg-bus",       "node-tco-1", 2);
    pm.addEdge("node-dg-bus",       "node-tco-2", 2);
    pm.setInputPolicy("node-tco-1", "PRIORITY");
    pm.setInputPolicy("node-tco-2", "PRIORITY");

    check(pm.buildGraph(), "buildGraph succeeds on the real topology");
    check(pm.getGraphIssues().empty(), "no graph issues");

    const auto busFeeders = pm.getFeeders("node-dg-bus");
    check(busFeeders.size() == 5, "all 5 generators feed the bus",
          std::to_string(busFeeders.size()));

    const auto busLoads = pm.getLoads("node-dg-bus");
    check(busLoads.size() == 2, "the bus feeds both changeovers",
          std::to_string(busLoads.size()));

    const auto tco1 = pm.getFeeders("node-tco-1");
    check(tco1.size() == 2 && contains(tco1, "node-main-main-db") && contains(tco1, "node-dg-bus"),
          "TCO 1 has grid and generator inputs");

    const auto order = pm.getTopoOrder();
    check(order.size() == 49, "all 49 nodes ordered", std::to_string(order.size()));
    check(posIn(order, "node-dg-1")  < posIn(order, "node-dg-bus"), "DG-1 precedes the bus");
    check(posIn(order, "node-dg-bus") < posIn(order, "node-tco-1"), "bus precedes TCO 1");
}

// ── 7. Reload clears the previous graph ─────────────────────────────────────
static void test_reload() {
    std::printf("\nbeginLoad resets structure\n");
    PowerMatrix pm;
    pm.beginLoad();
    pm.addNode(Scenarios::make("a", "main_db", "A"));
    pm.addNode(Scenarios::make("b", "main_db", "B"));
    pm.addEdge("a", "b");
    pm.buildGraph();
    check(pm.getEdgeCount() == 1, "first load has 1 edge");

    pm.beginLoad();
    pm.addNode(Scenarios::make("x", "main_db", "X"));
    pm.buildGraph();
    check(pm.getEdgeCount() == 0, "reload drops the old edges",
          std::to_string(pm.getEdgeCount()));
    check(pm.getTopoOrder().size() == 1, "reload drops the old nodes");
}


// ═════════════════════════════════════════════════════════════════════════════
// STAGE 4b — cascade behaviour through the graph
// ═════════════════════════════════════════════════════════════════════════════

/** A small but faithful slice of the facility: grid + generator bus into a
 *  changeover, two UPS, and a dual-corded rack.
 *
 *  NOTE the generator ids. generatorRunning() still matches "node-dg-1" and
 *  friends by literal id — the same hardcoded-id fragility the graph was meant
 *  to remove, now confined to the DG rotation state machine. Pair membership is
 *  facility data and belongs in the database; tracked as Stage 4c. */
static void buildMiniFacility(PowerMatrix& pm) {
    pm.beginLoad();
    pm.addNode(Scenarios::make("grid", "grid_tx",   "Grid",   750.0, 11000.0, 24.0));
    pm.addNode(Scenarios::make("node-dg-1", "generator", "DG 1", 1000.0));
    pm.addNode(Scenarios::make("node-dg-3", "generator", "DG 3", 1000.0));
    pm.addNode(Scenarios::make("bus",  "main_db",   "DG Bus", 2000.0));
    pm.addNode(Scenarios::make("tco",  "tco",       "TCO",    2000.0));
    pm.addNode(Scenarios::make("ups1", "ups",       "UPS 1",   200.0));
    pm.addNode(Scenarios::make("ups2", "ups",       "UPS 2",   200.0));
    // kw_load here is the RATED draw the loader supplies (in production it comes
    // from dynamic_parameters). buildGraph() snapshots it.
    pm.addNode(Scenarios::make("rack", "server",  "Rack", 20.0, 230.0, 0.0, 10.0));
    pm.addNode(Scenarios::make("pac",  "cooling", "PAC",  30.0,   0.0, 0.0,  6.0));

    pm.addEdge("node-dg-1", "bus", 1, "OUT", "BUS_IN");
    pm.addEdge("node-dg-3", "bus", 2, "OUT", "BUS_IN");
    pm.addEdge("grid", "tco",   1, "OUT",   "GRID_IN");  // priority 1: mains preferred
    pm.addEdge("bus",  "tco",   2, "OUT",   "GEN_IN");   // priority 2: generator backup
    pm.addEdge("tco",  "ups1",  1, "OUT_1", "IN");
    pm.addEdge("tco",  "ups2",  1, "OUT_2", "IN");
    pm.addEdge("ups1", "rack",  1, "OUT",   "PSU_A");    // dual-corded
    pm.addEdge("ups2", "rack",  2, "OUT",   "PSU_B");
    pm.addEdge("tco",  "pac",   1, "OUT_3", "IN");

    pm.setInputPolicy("tco",  "PRIORITY");
    pm.setInputPolicy("rack", "ANY");
    pm.buildGraph();
}

static void tick(PowerMatrix& pm) { pm.updateState(1.0); pm.runMatrixUpdate(); }

// ── 8. Dual-cord redundancy: the pitch demo, in C++ ─────────────────────────
static void test_dual_cord_survival() {
    std::printf("\ndual-cord redundancy  (the A -> B demo)\n");
    PowerMatrix pm;
    buildMiniFacility(pm);
    tick(pm);
    check(pm.isEnergised("rack"), "baseline: rack is live");

    pm.toggleNodeFault("ups1", true);
    tick(pm);
    check(!pm.isEnergised("ups1"), "UPS 1 is dead");
    check(pm.isEnergised("ups2"),  "UPS 2 still live");
    check(pm.isEnergised("rack"),  "SCENARIO A: rack SURVIVES on one cord");

    pm.toggleNodeFault("ups2", true);
    tick(pm);
    check(!pm.isEnergised("rack"), "SCENARIO B: rack goes dark once both cords are lost");

    pm.clearAllFaults();
    tick(pm);
    check(pm.isEnergised("rack"), "rack recovers when faults clear");
}

// ── 9. Changeover selects by priority ───────────────────────────────────────
static void test_changeover_priority() {
    std::printf("\nchangeover  mains preferred, generator on failure\n");
    PowerMatrix pm;
    buildMiniFacility(pm);
    tick(pm);
    check(pm.getSelectedFeeder("tco") == "grid",
          "with mains available the TCO selects grid", pm.getSelectedFeeder("tco"));

    pm.setGridActive(false);
    for (int i = 0; i < 120; ++i) tick(pm);
    check(pm.isEnergised("bus"), "generator bus is live after spool-up");
    check(pm.getSelectedFeeder("tco") == "bus",
          "TCO switches to the generator bus", pm.getSelectedFeeder("tco"));
    check(pm.isEnergised("rack"), "load rides through the changeover");
}

// ── 10. Reverse pass: load rolls upstream ───────────────────────────────────
static void test_load_accumulation() {
    std::printf("\nreverse pass  load accumulation and headroom\n");
    PowerMatrix pm;
    buildMiniFacility(pm);
    tick(pm);

    const double ups1 = pm.getAccumulatedLoad("ups1");
    const double ups2 = pm.getAccumulatedLoad("ups2");
    const double tco  = pm.getAccumulatedLoad("tco");

    check(tco > 0.0, "TCO carries a load", std::to_string(tco));
    check(std::abs(ups1 - ups2) < 0.01,
          "load splits evenly across both cords",
          std::to_string(ups1) + " vs " + std::to_string(ups2));

    pm.toggleNodeFault("ups1", true);
    tick(pm);
    const double ups2_after = pm.getAccumulatedLoad("ups2");
    check(ups2_after > ups2 * 1.5,
          "surviving cord picks up the full load — N+1 headroom is real",
          std::to_string(ups2) + " -> " + std::to_string(ups2_after));
    check(pm.getHeadroom("ups2") < pm.getHeadroom("ups1"),
          "headroom on the survivor shrinks");
}

// ── 11. Fire alarm still de-energises everything ────────────────────────────
static void test_fire_alarm() {
    std::printf("\nfire alarm  global de-energisation\n");
    PowerMatrix pm;
    buildMiniFacility(pm);
    tick(pm);
    check(pm.isEnergised("rack"), "live before the alarm");

    pm.setFireAlarmActive(true);
    tick(pm);
    check(!pm.isEnergised("grid"), "grid de-energised");
    check(!pm.isEnergised("tco"),  "changeover de-energised");
    check(!pm.isEnergised("rack"), "rack de-energised");
}

int main() {
    std::printf("PowerMatrix graph tests (Stage 4a + 4b)\n");
    test_linear_chain();
    test_dual_feed();
    test_cycle_detection();
    test_bad_edges();
    test_edge_before_node();
    test_real_topology();
    test_reload();
    test_dual_cord_survival();
    test_changeover_priority();
    test_load_accumulation();
    test_fire_alarm();

    std::printf("\n%d passed, %d failed\n", passed, failed);
    return failed == 0 ? 0 : 1;
}
