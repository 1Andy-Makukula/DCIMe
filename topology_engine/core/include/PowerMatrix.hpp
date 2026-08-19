#ifndef POWER_MATRIX_HPP
#define POWER_MATRIX_HPP

#include <string>
#include <unordered_map>
#include <vector>

namespace Topology {

enum BreakerState { CLOSED, OPEN, TRIPPED };
enum TcoPosition { TCO_GRID, TCO_GENERATOR, TCO_NEUTRAL };

// ─────────────────────────────────────────────────────────────────────────────
// The topology graph (Stage 4a)
//
// Until now the cascade was inferred from node TYPE via a two-pass tier sweep,
// with the wiring living in a JavaScript object (directFeederMap in engine.js).
// That cannot express redundancy: a dual-corded rack has two independent
// parents, and "parent dead -> child dead" is simply wrong for it.
//
// Edges are stored as INTEGER INDICES, never pointers. addNode() pushes into a
// std::vector, so any pointer taken before a reallocation dangles the moment
// the next node arrives. Indices survive reallocation, serialise trivially and
// keep the adjacency lists cache-friendly.
// ─────────────────────────────────────────────────────────────────────────────

/** How a node combines multiple upstream feeds. */
enum InputPolicy {
    POLICY_ANY,      // energised if ANY input is live — A/B feeds. The default.
    POLICY_ALL,      // needs every input live — series chains.
    POLICY_PRIORITY  // takes the highest-priority live input — a changeover.
};

struct Edge {
    int         source;       // index into nodes
    int         target;       // index into nodes
    int         priority;     // lower wins at a POLICY_PRIORITY target
    std::string source_port;
    std::string target_port;
};

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

    // ── Graph lifecycle (Stage 4a) ────────────────────────────────────────────
    //
    //   beginLoad() -> addNode()* -> addEdge()* -> buildGraph() -> [frozen]
    //
    // After buildGraph() the STRUCTURE is immutable; only state mutates
    // (telemetry, faults, global flags). Nothing may add a node or edge without
    // going back through beginLoad(). That single rule removes an entire class
    // of index-invalidation bug and makes the contract obvious to a future
    // maintainer.
    void beginLoad();

    // Edges are declared by id and resolved to indices in buildGraph(), so
    // declaration order does not matter. `priority` orders the inputs of a
    // POLICY_PRIORITY target (grid = 1, generator = 2).
    void addEdge(const std::string& source_id,
                 const std::string& target_id,
                 int priority = 1,
                 const std::string& source_port = "OUT",
                 const std::string& target_port = "IN");

    void setInputPolicy(const std::string& id, const std::string& policy);

    /**
     * Registers which rotation pair a generator belongs to.
     *   0 = Pair A, 1 = Pair B, 2 = emergency/standby
     *
     * Pair membership is FACILITY DATA, not an engine constant. It previously
     * lived as literal id comparisons ("node-dg-1" || "node-dg-3"), which broke
     * the moment equipment was renamed — and renaming is exactly what unifying
     * the blueprint and topology identifiers requires.
     *
     * Generators with no registered pair fall back to the legacy id matching, so
     * a caller that never calls this behaves as it always did.
     */
    void setGeneratorPair(const std::string& id, int pair);

    // Resolves edges, builds adjacency, computes a topological order.
    // Returns false if the graph is unusable — an unresolvable edge or a cycle.
    // A cycle is a DATA error, reported through getGraphIssues() rather than
    // left to hang a traversal.
    bool buildGraph();

    bool isGraphBuilt() const { return graph_built; }
    int  getEdgeCount() const { return static_cast<int>(edges.size()); }

    /** Human-readable problems found by buildGraph(). Empty means usable. */
    std::vector<std::string> getGraphIssues() const { return graph_issues; }

    /** Node ids in dependency order — sources first. Empty until buildGraph(). */
    std::vector<std::string> getTopoOrder() const;

    /** Direct upstream feeders of a node, by id. */
    std::vector<std::string> getFeeders(const std::string& id) const;

    /** Direct downstream loads of a node, by id. */
    std::vector<std::string> getLoads(const std::string& id) const;

    // ── Two-phase evaluation (Stage 4b) ───────────────────────────────────────
    //
    // FORWARD pass, topological order: energisation flows downstream, combined
    // at each node by its InputPolicy. This is what makes redundancy real — a
    // POLICY_ANY node with two feeders survives losing either one.
    //
    // REVERSE pass, reverse topological order: load accumulates upstream, so a
    // rack's draw rolls up through its board to the UPS to the generator.
    // Without it there is no headroom figure, and therefore no stranded
    // capacity and no PUE.
    //
    // Both run inside runMatrixUpdate() whenever a graph has been built. With no
    // graph the engine falls back to its original type-tier sweep, so an
    // un-migrated caller behaves exactly as before.

    /** Is this node receiving power this frame? */
    bool isEnergised(const std::string& id) const;

    /** Total downstream kW carried by this node, from the reverse pass. */
    double getAccumulatedLoad(const std::string& id) const;

    /** capacity - accumulated load. Negative means overloaded. */
    double getHeadroom(const std::string& id) const;

    /**
     * For a POLICY_PRIORITY node, which feeder is currently selected — the
     * live input with the lowest priority number. Empty when nothing feeds it.
     * This is what distinguishes "running on mains" from "running on generator"
     * at a changeover.
     */
    std::string getSelectedFeeder(const std::string& id) const;

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

    // ── Graph storage ─────────────────────────────────────────────────────────
    // Edges declared before buildGraph(), still holding string ids.
    struct PendingEdge {
        std::string source_id, target_id, source_port, target_port;
        int priority;
    };
    std::vector<PendingEdge> pending_edges;

    std::vector<Edge>                      edges;
    std::unordered_map<std::string, int>   id_index;     // id -> nodes[] index
    std::vector<std::vector<int>>          out_edges;    // node -> edge indices
    std::vector<std::vector<int>>          in_edges;     // node -> edge indices
    std::vector<InputPolicy>               policies;     // parallel to nodes[]
    std::vector<int>                       topo_order;   // node indices, sources first
    std::vector<std::string>               graph_issues;
    bool                                   graph_built = false;

    // ── Per-frame evaluation state ────────────────────────────────────────────
    std::vector<char>   energised;        // char, not bool: vector<bool> is a bitset
    std::vector<int>    selected_feeder;  // edge index chosen by POLICY_PRIORITY, -1 = none
    std::vector<double> accum_load;       // kW carried, from the reverse pass

    // Node::kw_load serves double duty — the loader writes a RATED draw into it,
    // then the per-type passes overwrite it with the CURRENT draw every frame.
    // The reverse pass needs the rated figure, so buildGraph() snapshots it here
    // before anything can clobber it.
    std::vector<double> rated_kw;

    // Index lookup; -1 when the id is unknown.
    int indexOf(const std::string& id) const;

    /** Forward pass: propagate energisation downstream through input policies. */
    void computeEnergisation();

    /** Reverse pass: accumulate downstream draw upstream, splitting across live feeds. */
    void accumulateLoad();

    /** Is a given generator turning this frame? Mirrors the DG rotation state machine. */
    bool generatorRunning(const std::string& id) const;

    /** Generator id -> rotation pair (0 = A, 1 = B, 2 = emergency). Supplied by
     *  the loader; empty means fall back to legacy id matching. */
    std::unordered_map<std::string, int> generator_pairs;

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
