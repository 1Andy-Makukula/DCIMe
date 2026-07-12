#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include "../core/include/PowerMatrix.hpp"

using namespace emscripten;
using namespace Topology;

EMSCRIPTEN_BINDINGS(topology_engine) {
    value_object<Node>("Node")
        .field("id", &Node::id)
        .field("type", &Node::type)
        .field("name", &Node::name)
        .field("is_active", &Node::is_active)
        .field("is_faulted", &Node::is_faulted)
        .field("capacity", &Node::capacity)
        .field("load_pct", &Node::load_pct)
        .field("voltage", &Node::voltage)
        .field("current", &Node::current)
        .field("kw_load", &Node::kw_load)
        .field("runtime_minutes", &Node::runtime_minutes)
        .field("status", &Node::status);

    register_vector<Node>("vector_Node");

    class_<PowerMatrix>("PowerMatrix")
        .constructor<>()
        .function("addNode", &PowerMatrix::addNode)
        .function("updateNodeTelemetry", &PowerMatrix::updateNodeTelemetry)
        .function("toggleNodeFault", &PowerMatrix::toggleNodeFault)
        .function("clearAllFaults", &PowerMatrix::clearAllFaults)
        .function("updateState", &PowerMatrix::updateState)
        .function("runMatrixUpdate", &PowerMatrix::runMatrixUpdate)
        .function("setGridActive", &PowerMatrix::setGridActive)
        .function("setFireAlarmActive", &PowerMatrix::setFireAlarmActive)
        .function("setCoolingActive", &PowerMatrix::setCoolingActive)
        .function("setDgAuto", &PowerMatrix::setDgAuto)
        .function("resetAll", &PowerMatrix::resetAll)
        .function("getNodes", &PowerMatrix::getNodes)
        .function("getNode", &PowerMatrix::getNode)
        .function("getGridActive", &PowerMatrix::getGridActive)
        .function("getFireAlarmActive", &PowerMatrix::getFireAlarmActive)
        .function("getCoolingActive", &PowerMatrix::getCoolingActive)
        .function("getDgAuto", &PowerMatrix::getDgAuto)
        .function("getFuelLiters", &PowerMatrix::getFuelLiters)
        .function("getAmbientTemp", &PowerMatrix::getAmbientTemp)
        .function("getBatterySoc", &PowerMatrix::getBatterySoc)
        .function("getGenStatus", &PowerMatrix::getGenStatus)
        // ── New DG pair rotation getters ──────────────────────────────────────
        .function("getDgPairStatus", &PowerMatrix::getDgPairStatus)
        .function("getDgRunHours", &PowerMatrix::getDgRunHours)
        .function("getActiveDgPair", &PowerMatrix::getActiveDgPair)
        .function("getPairRunSeconds", &PowerMatrix::getPairRunSeconds);
}
#endif
