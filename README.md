
  # DCIMe_Engine

The 4 Strict Rules of Engagement
Absolute Separation of Concerns (Dumb UI): A React component (like a Button or a Form field) will never know about Supabase or the database. It will only receive data via props and emit actions via events (e.g., onSubmit).

The Entity & Service Layer: All API calls to Supabase will be isolated in dedicated "Service" files. The UI will call a custom React Hook (e.g., useTelemetry()), which talks to the Service, which talks to the Database.

No Inline Styling: We strictly use the Tailwind CSS classes defined in your styles/ directory. No style={{ color: 'red' }} allowed.

Strict Typing: Every piece of data entering or leaving the system will be verified by a TypeScript Interface or a validation schema (like Zod).

These are the strict C++ Engineering Standards—the exact rules of engagement—we forged while building the DCIMe engine. These rules guarantee that the system remains an enterprise-grade simulation rather than a brittle student project.

### **The Golden Rule**

**Prioritize long-term scalability, strict architectural consistency, and zero spoon-feeding. No shortcuts. We build this professionally.**

---

### **1. The Abstraction Rule (Physical-to-Digital Mapping)**

C++ is not a text document; it is a physical simulation of the data center floor.

* **Structs/Classes** are paper blueprints.
* **Objects** (`myGenerator1`) are physical 500kg machines bolted to the floor in RAM.
* **Pointers** (`*`) are physical extension cords.
* You cannot plug a cable into a concept; you must plug it into a physical address (`&`).

### **2. The Header Fortress (Namespace Discipline)**

* **Never use `using namespace std;` inside a header (`.h`) file.** It causes massive, cascading security clashes in large libraries.
* Always use strict scoping (`std::string`, `std::cout`, `std::vector`) inside the blueprint files to protect the library's boundaries.

### **3. The Security Vault (Encapsulation)**

* Critical machine variables (`ID`, `model`, `location`, `status`) must be locked inside the `protected:` or `private:` section of the Parent struct.
* They can **only** be assigned once upon creation via the Constructor. This prevents any rogue function or tired technician from accidentally typing `myGenerator1.ID = "wrong_name"` in the main execution loop.

### **4. The Gatekeeper (Hostile Input Sanitization)**

* Assume all human input is hostile and prone to error.
* Never let raw user data touch the engine logic directly. Trap users in infinite `while(true)` loops until they provide mathematically and physically possible telemetry (e.g., fuel cannot be 105%).
* Always flush garbage memory using `cin.clear()` and `cin.ignore(10000, '\n')` when a user enters letters instead of numbers.

### **5. The Pointer Mechanics (`&`, `*`, `->`)**

* **The Ampersand (`&`):** "Find the Coordinates." Used to grab the exact memory location of a machine so something else can plug into it.
* **The Pointer (`*`):** "The Empty Cable." Initialized strictly to `nullptr` until physically connected.
* **The Arrow (`->`):** "Travel the Cord." Used to walk down a live connection and read the internal diagnostic screen of the machine on the other end.

### **6. The "True Source" Principle (No Blind Spots)**

* Never trust the immediate upstream machine if it has a battery (like a UPS).
* To verify power, algorithms must recursively traverse the topology (using a `while` loop to follow the cables backward) until they hit a machine with no upstream cable. You only declare "Stable Power" if the absolute root source is online.

### **7. Efficiency & Passing by Reference**

* When moving massive objects or file streams (like `std::ofstream& outFile`), do not copy them. Pass them by reference (`&`). We hand the function the map to the existing file rather than duplicating the entire hard drive payload in RAM.

### **8. Frictionless Prototyping (The Password Exception)**

* While the engine architecture is strictly secured, leave authentication details and passwords as plain text in the database schemas during the current development and prototyping phase. Avoid using pre-hashed passwords right now to eliminate troubleshooting friction while we test the core telemetry ingestion.

---

These rules are the concrete foundation of your C++ topology. As we move into wiring the React UI and the Supabase API to this engine, these exact standards will ensure the backend never crashes, no matter what the frontend throws at it.
  