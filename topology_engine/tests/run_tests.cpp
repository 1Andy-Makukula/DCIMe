// topology_engine/tests/run_tests.cpp
//
// Replays every scenario against its checked-in fixture.
//
// No external test framework. CTest (built into CMake) is the runner; a
// non-zero exit code is the failure signal. For ~12 scenarios a dependency on
// GoogleTest or Catch2 would add a network fetch and build complexity for
// assertions we can express in twenty lines.
//
//   cmake --build build --target run_tests
//   ctest --test-dir build --output-on-failure

#include "fixture_io.hpp"
#include "scenarios.hpp"

#include <cstdio>
#include <string>
#include <vector>

#ifndef FIXTURE_DIR
#define FIXTURE_DIR "."
#endif

int main(int argc, char** argv) {
    // Fixture directory: argv[1] wins, else the compile-time default. Passing
    // it at runtime avoids escaping a Windows path into a C string literal.
    const std::string dir = (argc > 1) ? argv[1] : FIXTURE_DIR;
    const auto scenarios  = Scenarios::all();

    int passed = 0, failed = 0, missing = 0;

    std::printf("PowerMatrix golden tests - %d scenario(s)\n", scenarios.size());
    std::printf("fixtures: %s\n\n", dir.c_str());

    for (const auto& sc : scenarios) {
        const std::string path = dir + "/" + sc.name + ".txt";

        std::string expected_text;
        if (!Fixture::read_file(path, expected_text)) {
            std::printf("  MISSING  %-22s  (no fixture at %s)\n",
                        sc.name.c_str(), path.c_str());
            ++missing;
            continue;
        }

        Topology::PowerMatrix pm;
        Scenarios::run(sc, pm);
        const std::string actual_text = Fixture::serialise(pm, sc.name);

        std::vector<std::string> diffs;
        const bool ok = Fixture::compare(Fixture::parse(expected_text),
                                         Fixture::parse(actual_text),
                                         diffs);

        if (ok) {
            std::printf("  PASS     %-22s  %s\n",
                        sc.name.c_str(), sc.description.c_str());
            ++passed;
        } else {
            std::printf("  FAIL     %-22s  %d difference(s)\n",
                        sc.name.c_str(), (int)diffs.size());
            // Cap the output; a structural change can differ on all 48 nodes
            // and burying the first real clue helps nobody.
            const size_t cap = diffs.size() < 12 ? diffs.size() : 12;
            for (size_t i = 0; i < cap; ++i) {
                std::printf("%s\n", diffs[i].c_str());
            }
            if (diffs.size() > cap) {
                std::printf("  ... and %d more\n", diffs.size() - cap);
            }
            ++failed;
        }
    }

    std::printf("\n%d passed, %d failed, %d missing\n", passed, failed, missing);

    if (missing > 0 && failed == 0 && passed == 0) {
        std::printf("\nNo fixtures found. Generate them first:\n"
                    "  cmake --build build --target golden_gen && ./build/golden_gen\n");
    }
    return (failed == 0 && missing == 0) ? 0 : 1;
}
