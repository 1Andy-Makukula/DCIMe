cmake_minimum_required(VERSION 3.10)
project(TopologyEngine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Include directories
include_directories(include)

# Source files
set(SOURCES
    src/PowerMatrix.cpp
    ../bindings/wasm_bridge.cpp
)

# WebAssembly compilation check when using Emscripten compiler (em++ / emcc)
if(EMSCRIPTEN)
    add_executable(topology_engine_wasm ${SOURCES})
    
    set_target_properties(topology_engine_wasm PROPERTIES OUTPUT_NAME "topology_engine")
    set_target_properties(topology_engine_wasm PROPERTIES SUFFIX ".js")

    target_compile_options(topology_engine_wasm PRIVATE
        "-s" "WASM=1"
        "-s" "EXPORT_ES6=1"
        "-s" "MODULARIZE=1"
        "-s" "EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    )
    
    target_link_options(topology_engine_wasm PRIVATE
        "-s" "WASM=1"
        "-s" "EXPORT_ES6=1"
        "-s" "MODULARIZE=1"
        "-s" "EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
        "--bind"
    )
else()
    # ── Native build (Stage 0: the safety net) ────────────────────────────
    # The engine compiles for the host as well as for WASM, so the physics can
    # be tested in milliseconds without a browser. The WASM target above is
    # untouched by anything below.
    add_library(topology_engine STATIC src/PowerMatrix.cpp)

    enable_testing()

    set(TESTS_DIR    "${CMAKE_CURRENT_SOURCE_DIR}/../tests")
    set(FIXTURES_DIR "${TESTS_DIR}/fixtures")

    # Regenerates golden fixtures. Run deliberately, never in CI.
    add_executable(golden_gen "${TESTS_DIR}/golden_gen.cpp")
    target_link_libraries(golden_gen PRIVATE topology_engine)
    target_compile_definitions(golden_gen PRIVATE FIXTURE_DIR="${FIXTURES_DIR}")

    # Replays every scenario against its checked-in fixture.
    add_executable(run_tests "${TESTS_DIR}/run_tests.cpp")
    target_link_libraries(run_tests PRIVATE topology_engine)
    target_compile_definitions(run_tests PRIVATE FIXTURE_DIR="${FIXTURES_DIR}")

    add_test(NAME powermatrix_golden COMMAND run_tests)
endif()
