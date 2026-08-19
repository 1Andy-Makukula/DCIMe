// topology_engine/tests/golden_gen.cpp
//
// Regenerates the golden fixtures from the CURRENT engine behaviour.
//
// Run this ONLY when you have deliberately changed what the engine should do,
// and always review `git diff topology_engine/tests/fixtures/` afterwards. An
// unexpected line in that diff is the bug this whole stage exists to catch.
//
//   cmake --build build --target golden_gen
//   ./build/golden_gen

#include "fixture_io.hpp"
#include "scenarios.hpp"

#include <cstdio>
#include <string>

#ifndef FIXTURE_DIR
#define FIXTURE_DIR "."
#endif

int main(int argc, char** argv) {
    // Fixture directory: argv[1] wins, else the compile-time default.
    const std::string dir = (argc > 1) ? argv[1] : FIXTURE_DIR;
    const auto scenarios  = Scenarios::all();
    int written = 0;

    std::printf("Regenerating %d fixtures into %s\n\n",
                (int)scenarios.size(), dir.c_str());

    for (const auto& sc : scenarios) {
        Topology::PowerMatrix pm;
        Scenarios::run(sc, pm);

        const std::string text = Fixture::serialise(pm, sc.name);
        const std::string path = dir + "/" + sc.name + ".txt";

        if (!Fixture::write_file(path, text)) {
            std::fprintf(stderr, "  FAILED to write %s\n", path.c_str());
            return 1;
        }
        std::printf("  wrote %-22s (%d steps @ %.1fs)  %s\n",
                    (sc.name + ".txt").c_str(), sc.steps, sc.dt,
                    sc.description.c_str());
        ++written;
    }

    std::printf("\n%d fixture(s) written. Review `git diff` before committing.\n",
                written);
    return 0;
}
