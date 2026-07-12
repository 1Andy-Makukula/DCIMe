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
    # Fallback to standard library compilation for desktop environments
    add_library(topology_engine STATIC src/PowerMatrix.cpp)
endif()
