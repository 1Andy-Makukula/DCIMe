class SCADASoundManager {
    constructor() {
        this.ctx = null;
        this.gridOsc = null;
        this.genOsc = null;
        this.genFilter = null;
        this.gridGain = null;
        this.genGain = null;
        this.spoolInterval = null;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();

            // Grid hum: 50Hz sine wave (deep low-end)
            this.gridOsc = this.ctx.createOscillator();
            this.gridOsc.type = "sine";
            this.gridOsc.frequency.setValueAtTime(50, this.ctx.currentTime);
            this.gridGain = this.ctx.createGain();
            this.gridGain.gain.setValueAtTime(0.04, this.ctx.currentTime); // very subtle
            this.gridOsc.connect(this.gridGain);
            this.gridGain.connect(this.ctx.destination);
            this.gridOsc.start();

            // Generator rumble: sawtooth + lowpass filter
            this.genOsc = this.ctx.createOscillator();
            this.genOsc.type = "sawtooth";
            this.genOsc.frequency.setValueAtTime(10, this.ctx.currentTime); // start low
            this.genFilter = this.ctx.createBiquadFilter();
            this.genFilter.type = "lowpass";
            this.genFilter.frequency.setValueAtTime(120, this.ctx.currentTime); // cut harmonics

            this.genGain = this.ctx.createGain();
            this.genGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // initially silent

            this.genOsc.connect(this.genFilter);
            this.genFilter.connect(this.genGain);
            this.genGain.connect(this.ctx.destination);
            this.genOsc.start();

            this.isInitialized = true;
        } catch(e) {
            console.warn("Web Audio API not supported in this browser:", e);
        }
    }

    setGridActive(active) {
        if (!this.isInitialized) return;
        const targetGain = active ? 0.04 : 0.0;
        this.gridGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
    }

    spoolGen(status) {
        if (!this.isInitialized) return;
        if (status === "starting") {
            // spool up sound: ramp frequency and volume up
            if (this.spoolInterval) clearInterval(this.spoolInterval);
            let freq = 10;
            let volume = 0;
            this.genGain.gain.setValueAtTime(0, this.ctx.currentTime);
            this.spoolInterval = setInterval(() => {
                if (freq < 60) freq += 1.5;
                if (volume < 0.12) volume += 0.005;
                this.genOsc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                this.genGain.gain.setValueAtTime(volume, this.ctx.currentTime);
                if (freq >= 60 && volume >= 0.12) {
                    clearInterval(this.spoolInterval);
                }
            }, 100);
        } else if (status === "running") {
            if (this.spoolInterval) clearInterval(this.spoolInterval);
            this.genOsc.frequency.setTargetAtTime(60, this.ctx.currentTime, 0.1);
            this.genGain.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.2);
        } else {
            // standby (off)
            if (this.spoolInterval) clearInterval(this.spoolInterval);
            this.genGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.3);
        }
    }

    playTripSound() {
        if (!this.isInitialized) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(180, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const svg = document.getElementById("svg-canvas");
    if (!svg) return;

    // Initialize sound manager on first click (browser policy requirement)
    const soundManager = new SCADASoundManager();
    document.addEventListener("click", () => {
        soundManager.init();
    }, { once: true });

    // Handle user role query parameter and update navigation button
    const urlParams = new URLSearchParams(window.location.search);
    const userRole = urlParams.get("role") || "FIELD_TECH";
    const btnBack = document.getElementById("btn-back-dashboard");
    if (btnBack) {
        btnBack.href = userRole === "ADMIN" ? "/admin" : "/tech";
    }

    // =========================================================================
    // SVG PAN & ZOOM INTERACTION
    // =========================================================================
    let isDragging = false;
    let startX, startY;
    let viewBox = { x: 0, y: 0, w: 7400, h: 4000 };

    const updateViewBox = () => {
        svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    };

    svg.addEventListener("wheel", (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1;
        if (viewBox.w * zoomFactor < 400 || viewBox.w * zoomFactor > 12000) return;

        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const svgMouseX = viewBox.x + (mouseX / rect.width) * viewBox.w;
        const svgMouseY = viewBox.y + (mouseY / rect.height) * viewBox.h;

        viewBox.w *= zoomFactor;
        viewBox.h *= zoomFactor;
        viewBox.x = svgMouseX - (mouseX / rect.width) * viewBox.w;
        viewBox.y = svgMouseY - (mouseY / rect.height) * viewBox.h;

        updateViewBox();
    }, { passive: false });

    svg.addEventListener("mousedown", (e) => {
        if (e.button !== 0 && e.button !== 1) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        svg.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const rect = svg.getBoundingClientRect();
        viewBox.x -= (dx / rect.width) * viewBox.w;
        viewBox.y -= (dy / rect.height) * viewBox.h;

        startX = e.clientX;
        startY = e.clientY;
        updateViewBox();
    });

    window.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            svg.style.cursor = "grab";
        }
    });
class JSPowerMatrix {
    // 8 sim-minutes per shift (480s). Change DG_SHIFT_SECONDS to 28800 for real 8-hour shifts.
    static get DG_SHIFT_SECONDS() { return 480.0; }

    constructor() {
        this.nodes = [];
        this.grid_active = true;
        this.fire_alarm_active = false;
        this.cooling_active = true;
        this.dg_auto = true;
        this.fuel_liters = 1000.0;
        this.ambient_temp = 21.0;
        this.gen_status = "standby";
        this.battery_soc = 100.0;
        // DG pair rotation state
        this.dg_pair_status = "standby"; // "standby"|"pair_a_starting"|"pair_a_running"|"pair_b_starting"|"pair_b_running"
        this.active_dg_pair = 0;          // 0=Pair A (DG1&DG3), 1=Pair B (DG2&DG4)
        this.gen_startup_timer = 0.0;
        this.pair_run_seconds = 0.0;
        this.dg_run_hours = [0.0, 0.0, 0.0, 0.0];
    }

    addNode(node) {
        const idx = this.nodes.findIndex(n => n.id === node.id);
        const nodeCopy = {
            id: node.id, type: node.type, name: node.name,
            is_active: node.is_active ?? true, is_faulted: node.is_faulted ?? false,
            capacity: node.capacity ?? 0.0, load_pct: node.load_pct ?? 0.0,
            voltage: node.voltage ?? 0.0, current: node.current ?? 0.0,
            kw_load: node.kw_load ?? 0.0, runtime_minutes: node.runtime_minutes ?? 0.0,
            status: node.status ?? "ONLINE"
        };
        if (idx !== -1) { this.nodes[idx] = nodeCopy; } else { this.nodes.push(nodeCopy); }
    }

    updateNodeTelemetry(id, voltage, current) {
        const node = this.nodes.find(n => n.id === id);
        if (node) { node.voltage = voltage; node.current = current; }
    }

    toggleNodeFault(id, faulted) {
        const node = this.nodes.find(n => n.id === id);
        if (node) node.is_faulted = faulted;
    }

    clearAllFaults() {
        this.nodes.forEach(n => n.is_faulted = false);
        this.fuel_liters = 1000.0; this.battery_soc = 100.0; this.ambient_temp = 21.0;
    }

    setGridActive(active) {
        this.grid_active = active;
        if (active) {
            this.dg_pair_status = "standby"; this.gen_status = "standby";
            this.gen_startup_timer = 0.0; this.pair_run_seconds = 0.0;
            this.active_dg_pair = 0; this.dg_run_hours = [0.0, 0.0, 0.0, 0.0];
        }
    }
    setFireAlarmActive(active) { this.fire_alarm_active = active; }
    setCoolingActive(active) { this.cooling_active = active; }
    setDgAuto(active) { this.dg_auto = active; }

    resetAll() {
        this.grid_active = true; this.fire_alarm_active = false;
        this.cooling_active = true; this.dg_auto = true;
        this.fuel_liters = 1000.0; this.ambient_temp = 21.0;
        this.gen_status = "standby"; this.gen_startup_timer = 0.0;
        this.battery_soc = 100.0; this.dg_pair_status = "standby";
        this.active_dg_pair = 0; this.pair_run_seconds = 0.0;
        this.dg_run_hours = [0.0, 0.0, 0.0, 0.0];
        this.clearAllFaults();
    }

    getNodes() { return this.nodes; }
    getNode(id) { return this.nodes.find(n => n.id === id) || {}; }
    getGridActive() { return this.grid_active; }
    getFireAlarmActive() { return this.fire_alarm_active; }
    getCoolingActive() { return this.cooling_active; }
    getDgAuto() { return this.dg_auto; }
    getFuelLiters() { return this.fuel_liters; }
    getAmbientTemp() { return this.ambient_temp; }
    getBatterySoc() { return this.battery_soc; }
    getGenStatus() { return this.gen_status; }
    getDgPairStatus() { return this.dg_pair_status; }
    getDgRunHours(idx) { return this.dg_run_hours[idx] || 0.0; }
    getActiveDgPair() { return this.active_dg_pair; }
    getPairRunSeconds() { return this.pair_run_seconds; }

    updateState(dt) {
        const SHIFT = JSPowerMatrix.DG_SHIFT_SECONDS;

        // ==========================================================
        // 1. DG PAIR ROTATION STATE MACHINE
        // ==========================================================
        if (!this.grid_active && this.dg_auto && this.fuel_liters > 0 && !this.fire_alarm_active) {

            if (this.dg_pair_status === "standby") {
                this.dg_pair_status = "pair_a_starting";
                this.active_dg_pair = 0;
                this.gen_status = "starting";
                this.gen_startup_timer = 0.0;
                this.pair_run_seconds = 0.0;

            } else if (this.dg_pair_status === "pair_a_starting") {
                this.gen_startup_timer += dt;
                if (this.gen_startup_timer >= 3.5) {
                    this.dg_pair_status = "pair_a_running";
                    this.gen_status = "running";
                    this.gen_startup_timer = 0.0;
                }

            } else if (this.dg_pair_status === "pair_a_running") {
                this.pair_run_seconds += dt;
                this.dg_run_hours[0] += dt / 3600.0; // DG1
                this.dg_run_hours[2] += dt / 3600.0; // DG3
                this.fuel_liters = Math.max(0, this.fuel_liters - dt * (0.030 + 180.0 * 0.00005));
                if (this.pair_run_seconds >= SHIFT && this.fuel_liters > 0) {
                    this.dg_pair_status = "pair_b_starting";
                    this.active_dg_pair = 1;
                    this.gen_startup_timer = 0.0;
                }

            } else if (this.dg_pair_status === "pair_b_starting") {
                this.gen_startup_timer += dt;
                this.dg_run_hours[0] += dt / 3600.0; // Pair A still running during handover
                this.dg_run_hours[2] += dt / 3600.0;
                this.fuel_liters = Math.max(0, this.fuel_liters - dt * 0.045); // 3 gens
                if (this.gen_startup_timer >= 3.5) {
                    this.dg_pair_status = "pair_b_running";
                    this.gen_status = "running";
                    this.gen_startup_timer = 0.0;
                    this.pair_run_seconds = 0.0;
                }

            } else if (this.dg_pair_status === "pair_b_running") {
                this.pair_run_seconds += dt;
                this.dg_run_hours[1] += dt / 3600.0; // DG2
                this.dg_run_hours[3] += dt / 3600.0; // DG4
                this.fuel_liters = Math.max(0, this.fuel_liters - dt * (0.030 + 180.0 * 0.00005));
                if (this.pair_run_seconds >= SHIFT && this.fuel_liters > 0) {
                    this.dg_pair_status = "pair_a_starting";
                    this.active_dg_pair = 0;
                    this.gen_startup_timer = 0.0;
                    this.gen_status = "starting";
                    this.pair_run_seconds = 0.0;
                }
            }

            if (this.fuel_liters <= 0) {
                this.dg_pair_status = "standby"; this.gen_status = "standby";
                this.pair_run_seconds = 0.0; this.gen_startup_timer = 0.0;
            }

        } else if (this.grid_active || this.fire_alarm_active) {
            if (this.dg_pair_status !== "standby") {
                this.dg_pair_status = "standby"; this.gen_status = "standby";
                this.gen_startup_timer = 0.0; this.pair_run_seconds = 0.0;
            }
        }

        // ==========================================================
        // 2. Battery SOC
        // ==========================================================
        const gen_running = (this.dg_pair_status === "pair_a_running" || this.dg_pair_status === "pair_b_running");
        const charger_online = this.grid_active || gen_running;
        if (!charger_online) {
            let ups_load = 0;
            this.nodes.forEach(n => { if (n.type === "ups" && n.is_active) ups_load += n.kw_load || 0; });
            this.battery_soc = Math.max(0, this.battery_soc - dt * (0.025 + ups_load * 0.0005));
        } else {
            if (this.battery_soc < 100) this.battery_soc = Math.min(100, this.battery_soc + dt * 0.08);
        }

        // ==========================================================
        // 3. Thermal
        // ==========================================================
        const cooling_on = this.cooling_active && (this.grid_active || gen_running) && !this.fire_alarm_active;
        if (!cooling_on) {
            let srv = 0;
            this.nodes.forEach(n => { if (n.type === "server" && n.is_active) srv += n.kw_load || 0; });
            this.ambient_temp = Math.min(45, this.ambient_temp + dt * (0.05 + srv * 0.001));
        } else if (this.ambient_temp > 21) {
            this.ambient_temp = Math.max(21, this.ambient_temp - dt * 0.08);
        }

        this.runMatrixUpdate();
    }

    runMatrixUpdate() {
        const gen_running = (this.dg_pair_status === "pair_a_running" || this.dg_pair_status === "pair_b_running");
        const power_available = this.grid_active || gen_running;
        let power_path_a_active = power_available;
        let power_path_b_active = power_available;
        if (this.fire_alarm_active) { power_path_a_active = false; power_path_b_active = false; }

        this.nodes.forEach(node => {
            node.is_active = true; node.status = "ONLINE";

            if (this.fire_alarm_active) {
                node.is_active = false; node.status = "EMERGENCY SHUTDOWN";
                node.load_pct = 0; node.kw_load = 0; return;
            }
            if (node.is_faulted) {
                node.is_active = false; node.status = "FAULTED";
                node.load_pct = 0; node.kw_load = 0; return;
            }

            if (node.type === "grid_tx") {
                node.is_active = this.grid_active;
                node.status = this.grid_active ? "ONLINE" : "OFFLINE";
                node.kw_load = this.grid_active ? 450 : 0;
                return;
            }

            if (node.type === "generator") {
                const isPairA = (node.id === "node-dg-1" || node.id === "node-dg-3");
                const isPairB = (node.id === "node-dg-2" || node.id === "node-dg-4");
                if (node.id === "node-dg-hq") {
                    node.is_active = this.fuel_liters < 100 && !this.grid_active && gen_running;
                    node.status = node.is_active ? "EMERGENCY HQ" : "STANDBY"; node.kw_load = node.is_active ? 250 : 0; return;
                }
                if (isPairA) {
                    const running = this.dg_pair_status === "pair_a_running" || this.dg_pair_status === "pair_b_starting";
                    node.is_active = running; node.kw_load = running ? 90 : 0;
                    node.status = running ? "RUNNING" : (this.dg_pair_status === "pair_a_starting" ? "STARTING..." : "STANDBY");
                } else if (isPairB) {
                    const running = this.dg_pair_status === "pair_b_running";
                    node.is_active = running; node.kw_load = running ? 90 : 0;
                    node.status = running ? "RUNNING" : (this.dg_pair_status === "pair_b_starting" ? "STARTING..." : "STANDBY");
                }
                return;
            }

            if (node.type === "tco") {
                if (this.grid_active) { node.is_active = true; node.status = "MAINS FEED"; }
                else if (gen_running) { node.is_active = true; node.status = "GENERATOR BACKUP"; }
                else if (this.dg_pair_status.includes("starting")) { node.is_active = false; node.status = "GENERATORS STARTING..."; }
                else { node.is_active = false; node.status = "NO VOLTAGE"; }
                return;
            }

            if (node.type === "main_db") {
                if (node.id === "node-main-main-db") {
                    node.is_active = power_available;
                    node.status = node.is_active ? (this.grid_active ? "415V MAINS" : "415V GENERATOR") : "NO VOLTAGE"; return;
                }
                const mainDbActive = (this.getNode("node-main-main-db") || {}).is_active;
                if (node.id.includes("-2") || node.id.includes("-db-a")) {
                    node.is_active = power_path_a_active && !(this.getNode("node-tco-1") || {}).is_faulted && mainDbActive;
                } else {
                    node.is_active = power_path_b_active && !(this.getNode("node-tco-2") || {}).is_faulted && mainDbActive;
                }
                node.status = node.is_active ? "415V AC" : "NO VOLTAGE"; return;
            }

            if (node.type === "ups") {
                const srcDb = node.id === "node-ups-2" ? this.getNode("node-ac-ups-db-a") : this.getNode("node-ac-ups-db-b");
                const srcActive = srcDb && srcDb.is_active;
                if (!srcActive) {
                    node.is_active = this.battery_soc > 0;
                    node.status = node.is_active ? "BATTERY DISCHARGING" : "BATTERY DRAINED";
                } else {
                    node.is_active = true;
                    node.status = this.battery_soc < 100 ? "CHARGING" : "ONLINE";
                }
                if (node.is_active) {
                    const s = (Math.sqrt(3) * node.voltage * node.current) / 1000.0;
                    node.load_pct = (s / node.capacity) * 100.0; node.kw_load = s * 0.9;
                    node.runtime_minutes = Math.min(1440, (this.battery_soc / 100.0) * (200.0 * 551.2) / Math.max(node.kw_load * 1000.0, 1.0) * 60.0);
                } else { node.load_pct = 0; node.kw_load = 0; node.runtime_minutes = 0; }
                return;
            }

            if (node.type === "rectifier") {
                const srcDb = node.id === "node-rectifier-2" ? this.getNode("node-dc-rect-db-a") : this.getNode("node-dc-rect-db-b");
                const srcActive = srcDb && srcDb.is_active;
                node.is_active = srcActive;
                node.status = srcActive ? "ONLINE" : "NO VOLTAGE";
                node.load_pct = srcActive ? (node.current / node.capacity) * 100.0 : 0;
                node.kw_load = srcActive ? (node.voltage * node.current) / 1000.0 : 0;
                return;
            }

            if (node.type === "cooling") {
                const useDbA = node.id.includes("ac-1") || node.id.includes("ac-2") || node.id.includes("ac-6") || node.id.includes("ac-7");
                const srcDb = useDbA ? this.getNode("node-aircon-db-a") : this.getNode("node-aircon-db-b");
                const srcActive = srcDb && srcDb.is_active && this.cooling_active;
                node.is_active = srcActive; node.voltage = this.ambient_temp; node.current = 21.0;
                node.status = srcActive ? "COOLING ONLINE" : "OFFLINE"; node.kw_load = srcActive ? 12.5 : 0; return;
            }

            if (node.type === "server") {
                const has_ac = (this.getNode("node-ac-server-db") || {}).is_active;
                const has_dc = (this.getNode("node-dc-server-db") || {}).is_active;
                if (node.id === "node-vertiv-1" || node.id === "node-vertiv-2") { node.is_active = has_ac; }
                else if (node.id === "node-dragor") { node.is_active = power_path_b_active && !(this.getNode("node-tco-2") || {}).is_faulted; }
                else { node.is_active = has_dc; }
                node.status = node.is_active ? "LOAD OK" : "BLACKOUT";
                node.kw_load = node.is_active ? 8.5 : 0; return;
            }
        });
    }
}



    // =========================================================================
    // DYNAMIC WASM ENGINE INITIALIZER / LOAD HANDLER
    // =========================================================================
    let engine = null;

    const initEngineInstance = () => {
        // Check if WebAssembly compiled binary script has loaded
        if (window.Module && window.Module.PowerMatrix) {
            engine = new Module.PowerMatrix();
            document.getElementById("wasm-indicator").textContent = "C++ WASM ACTIVE";
            document.getElementById("wasm-indicator").style.color = "#10b981";
        } else {
            engine = new JSPowerMatrix();
            document.getElementById("wasm-indicator").textContent = "JS EMULATION ACTIVE";
            document.getElementById("wasm-indicator").style.color = "#f59e0b";
        }

        // Seed nodes
        seedInitialTopology();
        updateUIState();
    };

    // Load Wasm helper using modern dynamic ES6 import
    const loadWasmLoaderScript = () => {
        import("./topology_engine.js")
            .then((module) => {
                const factory = module.default;
                factory().then((instance) => {
                    window.Module = instance;
                    initEngineInstance();
                }).catch((err) => {
                    console.warn("Failed to instantiate Wasm factory module:", err);
                    initEngineInstance();
                });
            })
            .catch((err) => {
                console.log("ES6 WASM module not loaded/compiled, running high-fidelity JS emulation:", err);
                initEngineInstance();
            });
    };

    // =========================================================================
    // SEED MODEL NODES
    // =========================================================================
    const seedInitialTopology = () => {
        const addNodeToEngine = (fields) => {
            const defaultNode = {
                id: "",
                type: "",
                name: "",
                is_active: true,
                is_faulted: false,
                capacity: 0.0,
                load_pct: 0.0,
                voltage: 0.0,
                current: 0.0,
                kw_load: 0.0,
                runtime_minutes: 0.0,
                status: "ONLINE"
            };
            const mergedNode = Object.assign({}, defaultNode, fields);
            engine.addNode(mergedNode);
        };

        // Grid & Generators
        addNodeToEngine({ id: "node-grid-tx", type: "grid_tx", name: "ZESCO Grid Feed", capacity: 750.0, voltage: 11000.0, current: 24.0 });
        for (let i = 1; i <= 4; i++) {
            addNodeToEngine({ id: `node-dg-${i}`, type: "generator", name: `Generator DG-${i}`, capacity: 1000.0, kw_load: 0.0 });
        }
        addNodeToEngine({ id: "node-dg-hq", type: "generator", name: "HQ Standby Gen", capacity: 1500.0, kw_load: 0.0 });

        // TCOs
        addNodeToEngine({ id: "node-tco-1", type: "tco", name: "TCO 1" });
        addNodeToEngine({ id: "node-tco-2", type: "tco", name: "TCO 2" });

        // Distribution Boards
        addNodeToEngine({ id: "node-main-main-db", type: "main_db", name: "MAIN MAIN DB" });
        addNodeToEngine({ id: "node-maindb-1", type: "main_db", name: "MAIN DB 1" });
        addNodeToEngine({ id: "node-maindb-2", type: "main_db", name: "MAIN DB 2" });
        addNodeToEngine({ id: "node-ac-ups-db-a", type: "main_db", name: "AC UPS DB A" });
        addNodeToEngine({ id: "node-dc-rect-db-a", type: "main_db", name: "DC RECTIFIER DB A" });
        addNodeToEngine({ id: "node-aircon-db-a", type: "main_db", name: "AIRCON UNITS DB A" });
        addNodeToEngine({ id: "node-ac-ups-db-b", type: "main_db", name: "AC UPS DB B" });
        addNodeToEngine({ id: "node-dc-rect-db-b", type: "main_db", name: "DC RECTIFIER DB B" });
        addNodeToEngine({ id: "node-aircon-db-b", type: "main_db", name: "AIRCON UNITS DB B" });
        addNodeToEngine({ id: "node-ac-server-db", type: "main_db", name: "AC SERVER DB" });
        addNodeToEngine({ id: "node-dc-server-db", type: "main_db", name: "DC SERVER DB" });

        // UPS & Rectifiers
        addNodeToEngine({ id: "node-ups-1", type: "ups", name: "Vertiv UPS 1", capacity: 200.0, voltage: 415.0, current: 120.0 });
        addNodeToEngine({ id: "node-ups-2", type: "ups", name: "Vertiv UPS 2", capacity: 200.0, voltage: 415.0, current: 110.0 });
        addNodeToEngine({ id: "node-rectifier-1", type: "rectifier", name: "NetSure Rectifier 1", capacity: 5000.0, voltage: 54.2, current: 1167.0 });
        addNodeToEngine({ id: "node-rectifier-2", type: "rectifier", name: "NetSure Rectifier 2", capacity: 5000.0, voltage: 54.2, current: 1050.0 });

        // Servers (Racks)
        for (let i = 1; i <= 6; i++) {
            addNodeToEngine({ id: `node-vertiv-${i}`, type: "server", name: `Vertiv Rack ${i}` });
        }
        addNodeToEngine({ id: "node-dragor", type: "server", name: "Dragor Rack" });

        // Cooling (Aircons)
        for (let i = 1; i <= 7; i++) {
            addNodeToEngine({ id: `node-sr-ac-${i}`, type: "cooling", name: `Emerson AC-${i}` });
        }
        addNodeToEngine({ id: "node-pr1-ac-1", type: "cooling", name: "PR1 PAC-1" });
        addNodeToEngine({ id: "node-pr1-ac-2", type: "cooling", name: "PR1 PAC-2" });
        addNodeToEngine({ id: "node-pr1-ac-3", type: "cooling", name: "PR1 PAC-3" });
        addNodeToEngine({ id: "node-pr2-ac-1", type: "cooling", name: "PR2 PAC-1" });
        addNodeToEngine({ id: "node-pr2-ac-2", type: "cooling", name: "PR2 PAC-2" });
        addNodeToEngine({ id: "node-it1-ac-1", type: "cooling", name: "IT1 PAC-1" });
        addNodeToEngine({ id: "node-it1-ac-2", type: "cooling", name: "IT1 PAC-2" });
        addNodeToEngine({ id: "node-it2-ac-1", type: "cooling", name: "IT2 PAC-1" });
        addNodeToEngine({ id: "node-it2-ac-2", type: "cooling", name: "IT2 PAC-2" });
        addNodeToEngine({ id: "node-dr-ac-1", type: "cooling", name: "DR PAC-1" });
        addNodeToEngine({ id: "node-dr-ac-2", type: "cooling", name: "DR PAC-2" });
    };

    // =========================================================================
    // DYNAMIC UPSTREAM PATH TRACING ALGORITHM
    // =========================================================================
    let activeTraceNode = null;

    const getUpstreamTrace = (nodeId) => {
        // Maps linking nodes to their physical paths and supply devices
        const directFeederMap = {
            "node-main-main-db": { paths: ["grid-to-main"], devs: ["node-grid-tx"] },
            "node-tco-1": { paths: ["main-to-tco1"], devs: ["node-main-main-db"] },
            "node-tco-2": { paths: ["main-to-tco2"], devs: ["node-main-main-db"] },
            "node-maindb-2": { paths: ["tco1-to-maindb2"], devs: ["node-tco-1"] },
            "node-maindb-1": { paths: ["tco2-to-maindb1"], devs: ["node-tco-2"] },
            "node-ac-ups-db-a": { paths: ["maindb2-to-upsdba"], devs: ["node-maindb-2"] },
            "node-dc-rect-db-a": { paths: ["maindb2-to-rectdba"], devs: ["node-maindb-2"] },
            "node-aircon-db-a": { paths: ["maindb2-to-acdba"], devs: ["node-maindb-2"] },
            "node-ac-ups-db-b": { paths: ["maindb1-to-upsdbb"], devs: ["node-maindb-1"] },
            "node-dc-rect-db-b": { paths: ["maindb1-to-rectdbb"], devs: ["node-maindb-1"] },
            "node-aircon-db-b": { paths: ["maindb1-to-acdbb"], devs: ["node-maindb-1"] },
            "node-ups-2": { paths: ["upsdba-to-ups2"], devs: ["node-ac-ups-db-a"] },
            "node-rectifier-2": { paths: ["rectdba-to-rect2"], devs: ["node-dc-rect-db-a"] },
            "node-ups-1": { paths: ["upsdbb-to-ups1"], devs: ["node-ac-ups-db-b"] },
            "node-rectifier-1": { paths: ["rectdbb-to-rect1"], devs: ["node-dc-rect-db-b"] },
            "node-ac-server-db": { paths: ["ups2-to-acserverdb", "ups1-to-acserverdb"], devs: ["node-ups-2", "node-ups-1"] },
            "node-dc-server-db": { paths: ["rect2-to-dcserverdb", "rect1-to-dcserverdb"], devs: ["node-rectifier-2", "node-rectifier-1"] },
            "node-vertiv-1": { paths: ["acserverdb-to-vertiv1"], devs: ["node-ac-server-db"] },
            "node-vertiv-2": { paths: ["acserverdb-to-vertiv2"], devs: ["node-ac-server-db"] },
            "node-vertiv-3": { paths: ["dcserverdb-to-vertiv3"], devs: ["node-dc-server-db"] },
            "node-vertiv-4": { paths: ["dcserverdb-to-vertiv4"], devs: ["node-dc-server-db"] },
            "node-vertiv-5": { paths: ["dcserverdb-to-vertiv5"], devs: ["node-dc-server-db"] },
            "node-vertiv-6": { paths: ["dcserverdb-to-vertiv6"], devs: ["node-dc-server-db"] },
            "node-dragor": { paths: ["tco2-to-dragor"], devs: ["node-tco-2"] },
            "node-sr-ac-1": { paths: ["acdba-to-ac1"], devs: ["node-aircon-db-a"] },
            "node-sr-ac-2": { paths: ["acdba-to-ac2"], devs: ["node-aircon-db-a"] },
            "node-sr-ac-6": { paths: ["acdba-to-ac6"], devs: ["node-aircon-db-a"] },
            "node-sr-ac-7": { paths: ["acdba-to-ac7"], devs: ["node-aircon-db-a"] },
            "node-sr-ac-3": { paths: ["acdbb-to-ac3"], devs: ["node-aircon-db-b"] },
            "node-sr-ac-4": { paths: ["acdbb-to-ac4"], devs: ["node-aircon-db-b"] },
            "node-sr-ac-5": { paths: ["acdbb-to-ac5"], devs: ["node-aircon-db-b"] },
            "node-pr1-ac-1": { paths: ["acdbb-to-pr1ac1"], devs: ["node-aircon-db-b"] },
            "node-pr1-ac-2": { paths: ["acdbb-to-pr1ac2"], devs: ["node-aircon-db-b"] },
            "node-pr1-ac-3": { paths: ["acdbb-to-pr1ac3"], devs: ["node-aircon-db-b"] },
            "node-pr2-ac-1": { paths: ["acdbb-to-pr2ac1"], devs: ["node-aircon-db-b"] },
            "node-pr2-ac-2": { paths: ["acdbb-to-pr2ac2"], devs: ["node-aircon-db-b"] },
            "node-it1-ac-1": { paths: ["acdbb-to-it1ac1"], devs: ["node-aircon-db-b"] },
            "node-it1-ac-2": { paths: ["acdbb-to-it1ac2"], devs: ["node-aircon-db-b"] },
            "node-it2-ac-1": { paths: ["acdbb-to-it2ac1"], devs: ["node-aircon-db-b"] },
            "node-it2-ac-2": { paths: ["acdbb-to-it2ac2"], devs: ["node-aircon-db-b"] },
            "node-dr-ac-1": { paths: ["acdbb-to-drac1"], devs: ["node-aircon-db-b"] },
            "node-dr-ac-2": { paths: ["acdbb-to-drac2"], devs: ["node-aircon-db-b"] },
        };

        const activePaths = new Set();
        const activeDevs = new Set([nodeId]);

        const traverse = (currentId) => {
            const entry = directFeederMap[currentId];
            if (!entry) return;

            entry.devs.forEach(dev => {
                if (!activeDevs.has(dev)) {
                    // Check generator backup diversion logic
                    const _dgRunning = (typeof engine.getDgPairStatus === "function")
                        ? (engine.getDgPairStatus().includes("running") || engine.getDgPairStatus().includes("starting"))
                        : engine.getGenStatus() === "running";
                    if (dev === "node-main-main-db" && !engine.getGridActive() && _dgRunning) {
                        // Divert to standby generator bus paths
                        activePaths.add(currentId === "node-tco-1" ? "dg-to-tco1" : "dg-to-tco2");
                        activePaths.add("dg-bus");
                        activePaths.add("dg-collector");
                        // Only highlight the active pair's DG nodes
                        const pairStatus = typeof engine.getDgPairStatus === "function" ? engine.getDgPairStatus() : "";
                        const activeDGs = (pairStatus === "pair_b_running") ? [2, 4] : [1, 3];
                        activeDGs.forEach(j => activeDevs.add(`node-dg-${j}`));
                        activeDevs.add("node-dg-hq");
                    } else {
                        activeDevs.add(dev);
                        traverse(dev);
                    }
                }
            });

            entry.paths.forEach(p => activePaths.add(p));
        };

        traverse(nodeId);
        return { devices: Array.from(activeDevs), paths: Array.from(activePaths) };
    };

    // =========================================================================
    // UI REDRAWING LOOP
    // =========================================================================
    const updateUIState = () => {
        if (!engine) return;

        // --- 1. Sidebar Global Telemetry Counters ---
        const gridPill = document.getElementById("grid-status-pill");
        const telGrid = document.getElementById("tel-grid-status");
        const telGen = document.getElementById("tel-gen-status");
        const telFuel = document.getElementById("tel-fuel");
        const telBattery = document.getElementById("tel-battery");
        const telTemp = document.getElementById("tel-temp");
        const telFire = document.getElementById("tel-fire");

        const gridActive = engine.getGridActive();
        const fireAlarm = engine.getFireAlarmActive();
        const fuel = engine.getFuelLiters();
        const temp = engine.getAmbientTemp();
        const genStatus = engine.getGenStatus();
        // New DG pair rotation state
        const dgPairStatus = (typeof engine.getDgPairStatus === "function") ? engine.getDgPairStatus() : (genStatus === "running" ? "pair_a_running" : "standby");
        const dgGenRunning = dgPairStatus === "pair_a_running" || dgPairStatus === "pair_b_running";
        const dgGenStarting = dgPairStatus.includes("starting");

        // Grid Status Pill
        if (gridPill) {
            if (fireAlarm) {
                gridPill.className = "status-pill status-outage";
                gridPill.textContent = "EMERGENCY SHUTDOWN";
                gridPill.style.background = "#ef4444";
            } else if (gridActive) {
                gridPill.className = "status-pill status-mains";
                gridPill.textContent = "Mains Power Active";
                gridPill.style.background = "";
            } else if (dgGenStarting) {
                gridPill.className = "status-pill status-starting";
                const activePair = dgPairStatus.includes("pair_a") ? "DG1 & DG3" : "DG2 & DG4";
                gridPill.textContent = `${activePair} Starting...`;
                gridPill.style.background = "#ff6d00";
            } else if (dgGenRunning) {
                gridPill.className = "status-pill status-backup";
                const pairLabel = dgPairStatus === "pair_a_running" ? "Pair A (DG1 & DG3)" : "Pair B (DG2 & DG4)";
                gridPill.textContent = `Generator Backup — ${pairLabel}`;
                gridPill.style.background = "";
            } else {
                gridPill.className = "status-pill status-outage";
                gridPill.textContent = "Battery Backup Active (Outage)";
                gridPill.style.background = "#ef4444";
            }
        }

        if (telGrid) {
            telGrid.textContent = gridActive ? "ONLINE" : "OFFLINE";
            telGrid.className = gridActive ? "tel-val font-bold text-green" : "tel-val font-bold text-red";
            telGrid.style.color = gridActive ? "#10b981" : "#ef4444";
        }

        if (telGen) {
            if (dgGenRunning) {
                const pairLabel = dgPairStatus === "pair_a_running" ? "PAIR A RUNNING" : "PAIR B RUNNING";
                const shiftPct = (typeof engine.getPairRunSeconds === "function") ? ((engine.getPairRunSeconds() / 480.0) * 100.0).toFixed(0) : "--";
                telGen.textContent = `${pairLabel} (${shiftPct}% shift)`;
                telGen.style.color = "#ff6d00";
            } else if (dgGenStarting) {
                telGen.textContent = "GENERATORS STARTING...";
                telGen.style.color = "#ffd600";
            } else {
                telGen.textContent = "STANDBY";
                telGen.style.color = "#64748b";
            }
        }

        if (telFuel) {
            const fuelPct = ((fuel / 1000.0) * 100.0).toFixed(0);
            telFuel.textContent = `${fuel.toFixed(1)} L (${fuelPct}%)`;
            telFuel.style.color = (fuel < 200.0) ? "#ef4444" : "#f8fafc";
        }

        if (telBattery) {
            // Get average remaining minutes from UPS 1
            const ups1 = engine.getNode("node-ups-1");
            const batterySoc = engine.getBatterySoc();
            const runtimeMin = (ups1 && typeof ups1.runtime_minutes === "number") ? ups1.runtime_minutes : 0.0;
            telBattery.textContent = `${(batterySoc || 0.0).toFixed(0)}% (${runtimeMin.toFixed(0)}m)`;
            telBattery.style.color = (batterySoc < 30.0) ? "#ef4444" : "#f8fafc";
        }

        if (telTemp) {
            telTemp.textContent = `${temp.toFixed(1)}°C`;
            telTemp.style.color = (temp > 35.0) ? "#ef4444" : "#10b981";
        }

        if (telFire) {
            telFire.textContent = fireAlarm ? "FIRE ALARM / TRIP" : "SAFE";
            telFire.style.color = fireAlarm ? "#ef4444" : "#10b981";
        }

        // --- DG Pair Rotation HUD ---
        const telDgPair = document.getElementById("tel-dg-pair");
        const telDgPairAHrs = document.getElementById("tel-dg-pair-a-hrs");
        const telDgPairBHrs = document.getElementById("tel-dg-pair-b-hrs");
        const telShiftBar = document.getElementById("tel-shift-bar");

        if (telDgPair) {
            if (dgPairStatus === "standby") {
                telDgPair.textContent = "— STANDBY";
                telDgPair.style.color = "#64748b";
            } else if (dgPairStatus === "pair_a_starting" || dgPairStatus === "pair_a_running") {
                telDgPair.textContent = "PAIR A (DG1 & DG3)";
                telDgPair.style.color = "#ff6d00";
            } else if (dgPairStatus === "pair_b_starting" || dgPairStatus === "pair_b_running") {
                telDgPair.textContent = "PAIR B (DG2 & DG4)";
                telDgPair.style.color = "#ffd600";
            }
        }

        if (telDgPairAHrs && typeof engine.getDgRunHours === "function") {
            const h1 = engine.getDgRunHours(0); const h3 = engine.getDgRunHours(2);
            telDgPairAHrs.textContent = `${h1.toFixed(2)}h / ${h3.toFixed(2)}h`;
        }
        if (telDgPairBHrs && typeof engine.getDgRunHours === "function") {
            const h2 = engine.getDgRunHours(1); const h4 = engine.getDgRunHours(3);
            telDgPairBHrs.textContent = `${h2.toFixed(2)}h / ${h4.toFixed(2)}h`;
        }
        if (telShiftBar && typeof engine.getPairRunSeconds === "function") {
            const shiftPct = Math.min(100, (engine.getPairRunSeconds() / 480.0) * 100.0);
            telShiftBar.style.width = `${shiftPct}%`;
            telShiftBar.style.background = shiftPct > 80 ? "#ffd600" : "#ff6d00";
        }

        // Update audio based on DG pair state
        soundManager.spoolGen(dgGenRunning ? "running" : (dgGenStarting ? "starting" : "standby"));
        soundManager.setGridActive(gridActive);

        // --- 2. Equipment Node Elements Redraw ---
        const rawNodes = engine.getNodes();
        let nodes = [];
        if (typeof rawNodes.size === "function") {
            for (let i = 0; i < rawNodes.size(); i++) {
                nodes.push(rawNodes.get(i));
            }
        } else {
            nodes = rawNodes;
        }
        nodes.forEach(node => {
            const svgNode = svg.querySelector(`#${node.id}`);
            if (!svgNode) return;

            const statusText = svgNode.querySelector(".node-status");
            const faces = svgNode.querySelectorAll(".cube-face");

            // Apply warning coloring / animation if faulted or offline
            if (node.is_faulted) {
                faces.forEach(f => {
                    f.style.stroke = "#ef4444";
                    f.style.fill = "rgba(239, 68, 68, 0.1)";
                    f.style.filter = "drop-shadow(0 0 10px rgba(239, 68, 68, 0.7))";
                });
                if (statusText) {
                    statusText.textContent = "FAULTED";
                    statusText.style.fill = "#ef4444";
                }
            } else if (!node.is_active) {
                faces.forEach(f => {
                    f.style.stroke = "#475569";
                    f.style.fill = "rgba(71, 85, 105, 0.1)";
                    f.style.filter = "none";
                });
                if (statusText) {
                    statusText.textContent = node.status;
                    statusText.style.fill = "#64748b";
                }
            } else {
                // Restore nominal colors
                faces.forEach(f => {
                    f.style.stroke = "";
                    f.style.fill = "";
                    f.style.filter = "";
                });

                if (statusText) {
                    statusText.style.fill = "";
                    if (node.type === "ups") {
                        const lp = typeof node.load_pct === "number" ? node.load_pct : 0.0;
                        const rm = typeof node.runtime_minutes === "number" ? node.runtime_minutes : 0.0;
                        statusText.textContent = `${lp.toFixed(0)}% / ${rm.toFixed(0)}m`;
                        statusText.style.fill = "#00e5ff";
                    } else if (node.type === "rectifier") {
                        const cur = typeof node.current === "number" ? node.current : 0.0;
                        const lp = typeof node.load_pct === "number" ? node.load_pct : 0.0;
                        statusText.textContent = `${cur.toFixed(0)}A (${lp.toFixed(0)}%)`;
                        statusText.style.fill = "#10b981";
                    } else if (node.type === "cooling") {
                        const volt = typeof node.voltage === "number" ? node.voltage : 0.0;
                        statusText.textContent = `${volt.toFixed(1)}°C`;
                    } else if (node.type === "generator") {
                        statusText.textContent = "RUNNING";
                        statusText.style.fill = "#ff6d00";
                    } else {
                        statusText.textContent = node.status;
                    }
                }
            }
        });

        // --- 3. Path Wiring Lines Redraw ---
        svg.querySelectorAll("path[data-path-id]").forEach(path => {
            const pathId = path.getAttribute("data-path-id");
            let isPathActive = true;

            // Grid Path
            if (pathId === "grid-to-main" && !gridActive) isPathActive = false;

            // Backup Gen Path — activate when any DG pair is running or starting
            if (pathId.startsWith("dg-")) {
                isPathActive = dgGenRunning || dgGenStarting;
            }

            // Path A — active if grid OR DGs provide power through TCO-1
            if (pathId === "main-to-tco1") {
                isPathActive = gridActive || dgGenRunning;
            }
            if (pathId.startsWith("tco1-") || pathId.startsWith("maindb2-") || pathId.startsWith("upsdba-") || pathId.startsWith("rectdba-") || pathId.startsWith("acdba-")) {
                const maindb2 = engine.getNode("node-maindb-2");
                isPathActive = maindb2 && maindb2.is_active;
            }

            // Path B — active if grid OR DGs provide power through TCO-2
            if (pathId === "main-to-tco2") {
                isPathActive = gridActive || dgGenRunning;
            }
            if (pathId.startsWith("tco2-") || pathId.startsWith("maindb1-") || pathId.startsWith("upsdbb-") || pathId.startsWith("rectdbb-") || pathId.startsWith("acdbb-")) {
                const maindb1 = engine.getNode("node-maindb-1");
                isPathActive = maindb1 && maindb1.is_active;
            }

            // Downstream specific branches
            if (pathId === "ups2-to-acserverdb" && !engine.getNode("node-ups-2").is_active) isPathActive = false;
            if (pathId === "rect2-to-dcserverdb" && !engine.getNode("node-rectifier-2").is_active) isPathActive = false;
            if (pathId === "ups1-to-acserverdb" && !engine.getNode("node-ups-1").is_active) isPathActive = false;
            if (pathId === "rect1-to-dcserverdb" && !engine.getNode("node-rectifier-1").is_active) isPathActive = false;

            if (pathId.startsWith("acserverdb-")) {
                isPathActive = engine.getNode("node-ac-server-db").is_active;
            }
            if (pathId.startsWith("dcserverdb-")) {
                isPathActive = engine.getNode("node-dc-server-db").is_active;
            }
            if (pathId === "tco2-to-dragor") {
                isPathActive = engine.getNode("node-tco-2").is_active;
            }

            if (fireAlarm) isPathActive = false;

            // Apply classes
            if (isPathActive) {
                path.classList.add("animated-flow");
                
                // Calculate dynamic animation flow speed based on active capacity load
                let speed = "1.5s"; // default nominal flow
                if (pathId === "grid-to-main" || pathId === "main-to-tco1" || pathId === "main-to-tco2") {
                    const gridTx = engine.getNode("node-grid-tx");
                    const loadPct = (gridTx && typeof gridTx.load_pct === "number") ? gridTx.load_pct : 50.0;
                    speed = `${Math.max(0.4, 2.5 - (loadPct / 100.0) * 2.0)}s`;
                } else if (pathId.includes("ups2") || pathId.includes("upsdba") || pathId === "ups2-to-acserverdb") {
                    const ups2 = engine.getNode("node-ups-2");
                    const loadPct = (ups2 && typeof ups2.load_pct === "number") ? ups2.load_pct : 60.0;
                    speed = `${Math.max(0.4, 2.2 - (loadPct / 100.0) * 1.7)}s`;
                } else if (pathId.includes("ups1") || pathId.includes("upsdbb") || pathId === "ups1-to-acserverdb") {
                    const ups1 = engine.getNode("node-ups-1");
                    const loadPct = (ups1 && typeof ups1.load_pct === "number") ? ups1.load_pct : 55.0;
                    speed = `${Math.max(0.4, 2.2 - (loadPct / 100.0) * 1.7)}s`;
                } else if (pathId.includes("rect2") || pathId.includes("rectdba") || pathId === "rect2-to-dcserverdb") {
                    const rect2 = engine.getNode("node-rectifier-2");
                    const loadPct = (rect2 && typeof rect2.load_pct === "number") ? rect2.load_pct : 40.0;
                    speed = `${Math.max(0.4, 2.2 - (loadPct / 100.0) * 1.7)}s`;
                } else if (pathId.includes("rect1") || pathId.includes("rectdbb") || pathId === "rect1-to-dcserverdb") {
                    const rect1 = engine.getNode("node-rectifier-1");
                    const loadPct = (rect1 && typeof rect1.load_pct === "number") ? rect1.load_pct : 35.0;
                    speed = `${Math.max(0.4, 2.2 - (loadPct / 100.0) * 1.7)}s`;
                }
                
                path.style.animationDuration = speed;

                if (pathId.startsWith("dg-")) {
                    path.style.stroke = "#ff6d00";
                } else {
                    path.style.stroke = "";
                }
            } else {
                path.classList.remove("animated-flow");
                path.style.stroke = "#475569";
                path.style.animationDuration = "";
            }
        });
    };

    // =========================================================================
    // EVENT HANDLING & SIMULATOR CLI BUTTON CONTROLS
    // =========================================================================
    const btnKillGrid = document.getElementById("sim-kill-grid");
    const btnKillUps1 = document.getElementById("sim-kill-ups-1");
    const btnKillUps2 = document.getElementById("sim-kill-ups-2");
    const btnKillRect1 = document.getElementById("sim-kill-rect-1");
    const btnKillRect2 = document.getElementById("sim-kill-rect-2");
    const btnFailCooling = document.getElementById("sim-fail-cooling");
    const btnFireAlarm = document.getElementById("sim-fire-alarm");
    const btnReset = document.getElementById("sim-reset");

    btnKillGrid.addEventListener("click", () => {
        const gridActive = engine.getGridActive();
        engine.setGridActive(!gridActive);
        btnKillGrid.textContent = gridActive ? "🔄 Restore ZESCO Grid" : "⚡ Kill ZESCO Grid";
        soundManager.playTripSound();
        soundManager.setGridActive(!gridActive);
    });

    btnKillUps1.addEventListener("click", () => {
        const ups1 = engine.getNode("node-ups-1");
        engine.toggleNodeFault("node-ups-1", !ups1.is_faulted);
        btnKillUps1.textContent = !ups1.is_faulted ? "🔄 Restore UPS 1" : "🔋 Isolate UPS 1";
        soundManager.playTripSound();
    });

    btnKillUps2.addEventListener("click", () => {
        const ups2 = engine.getNode("node-ups-2");
        engine.toggleNodeFault("node-ups-2", !ups2.is_faulted);
        btnKillUps2.textContent = !ups2.is_faulted ? "🔄 Restore UPS 2" : "🔋 Isolate UPS 2";
        soundManager.playTripSound();
    });

    btnKillRect1.addEventListener("click", () => {
        const rect1 = engine.getNode("node-rectifier-1");
        engine.toggleNodeFault("node-rectifier-1", !rect1.is_faulted);
        btnKillRect1.textContent = !rect1.is_faulted ? "🔄 Restore Rectifier 1" : "🔌 Isolate Rectifier 1";
        soundManager.playTripSound();
    });

    btnKillRect2.addEventListener("click", () => {
        const rect2 = engine.getNode("node-rectifier-2");
        engine.toggleNodeFault("node-rectifier-2", !rect2.is_faulted);
        btnKillRect2.textContent = !rect2.is_faulted ? "🔄 Restore Rectifier 2" : "🔌 Isolate Rectifier 2";
        soundManager.playTripSound();
    });

    btnFailCooling.addEventListener("click", () => {
        const coolActive = engine.getCoolingActive();
        engine.setCoolingActive(!coolActive);
        btnFailCooling.textContent = coolActive ? "🔄 Restore Cooling Loop" : "❄️ Fail Cooling Loop";
        soundManager.playTripSound();
    });

    btnFireAlarm.addEventListener("click", () => {
        const fireActive = engine.getFireAlarmActive();
        engine.setFireAlarmActive(!fireActive);
        btnFireAlarm.textContent = fireActive ? "🚨 Trigger Fire Alarm" : "🔄 Clear Fire Alarm";
        btnFireAlarm.style.background = fireActive ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)";
        btnFireAlarm.style.borderColor = fireActive ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)";
        btnFireAlarm.style.color = fireActive ? "#ef4444" : "#10b981";
        
        soundManager.playTripSound();
        soundManager.setGridActive(fireActive); // grid hum turns on if fire alarm is cleared
        soundManager.spoolGen("standby"); // cut gens
    });

    btnReset.addEventListener("click", () => {
        engine.resetAll();
        btnKillGrid.textContent = "⚡ Kill ZESCO Grid";
        btnKillUps1.textContent = "🔋 Isolate UPS 1";
        btnKillUps2.textContent = "🔋 Isolate UPS 2";
        btnKillRect1.textContent = "🔌 Isolate Rectifier 1";
        btnKillRect2.textContent = "🔌 Isolate Rectifier 2";
        btnFailCooling.textContent = "❄️ Fail Cooling Loop";
        btnFireAlarm.textContent = "🚨 Trigger Fire Alarm";
        btnFireAlarm.style.background = "rgba(239, 68, 68, 0.1)";
        btnFireAlarm.style.borderColor = "rgba(239, 68, 68, 0.3)";
        btnFireAlarm.style.color = "#ef4444";
        clearTrace();
        
        soundManager.playTripSound();
        soundManager.setGridActive(true);
        soundManager.spoolGen("standby");
    });

    // =========================================================================
    // FLOATING POPUP OPTIONS CONTEXT MENU
    // =========================================================================
    const contextMenu = document.getElementById("equipment-context-menu");
    const menuTitle = document.getElementById("context-node-name");
    const btnTrace = document.getElementById("btn-trace-path");
    const btnIsolate = document.getElementById("btn-isolate-node");
    const btnRestore = document.getElementById("btn-restore-node");
    const btnClose = document.getElementById("btn-close-menu");
    let targetedNodeId = null;

    svg.addEventListener("click", (e) => {
        const nodeGroup = e.target.closest(".node-group");
        if (nodeGroup) {
            e.stopPropagation();
            targetedNodeId = nodeGroup.id;
            const node = engine.getNode(targetedNodeId);

            menuTitle.textContent = nodeGroup.querySelector(".node-label").textContent;

            // Set isolate/restore options depending on node fault state
            if (node.is_faulted) {
                btnIsolate.classList.add("hidden");
                btnRestore.classList.remove("hidden");
            } else {
                btnIsolate.classList.remove("hidden");
                btnRestore.classList.add("hidden");
            }

            contextMenu.style.left = `${e.clientX + 10}px`;
            contextMenu.style.top = `${e.clientY + 10}px`;
            contextMenu.classList.remove("hidden");
        } else {
            contextMenu.classList.add("hidden");
        }
    });

    btnClose.addEventListener("click", () => contextMenu.classList.add("hidden"));

    btnTrace.addEventListener("click", () => {
        if (!targetedNodeId) return;
        contextMenu.classList.add("hidden");
        activeTraceNode = targetedNodeId;

        const { devices, paths } = getUpstreamTrace(targetedNodeId);

        // Highlight visual route
        svg.querySelectorAll(".node-group").forEach(n => {
            if (!devices.includes(n.id)) n.classList.add("faded");
            else n.classList.remove("faded");
        });
        svg.querySelectorAll("path[data-path-id]").forEach(p => {
            const pathId = p.getAttribute("data-path-id");
            if (!paths.includes(pathId)) p.classList.add("faded");
            else p.classList.remove("faded");
        });

        const traceBanner = document.getElementById("trace-banner");
        const traceMsg = document.getElementById("trace-message");
        const nodeLabel = document.getElementById(targetedNodeId).querySelector(".node-label").textContent;
        traceMsg.textContent = `Tracing route supplying ${nodeLabel}`;
        traceBanner.classList.remove("hidden");
    });

    const clearTrace = () => {
        activeTraceNode = null;
        svg.querySelectorAll(".node-group").forEach(n => n.classList.remove("faded"));
        svg.querySelectorAll("path[data-path-id]").forEach(p => p.classList.remove("faded"));
        document.getElementById("trace-banner").classList.add("hidden");
    };

    document.getElementById("btn-clear-trace").addEventListener("click", clearTrace);

    btnIsolate.addEventListener("click", () => {
        if (targetedNodeId) {
            engine.toggleNodeFault(targetedNodeId, true);
            contextMenu.classList.add("hidden");
            updateUIState();
        }
    });

    btnRestore.addEventListener("click", () => {
        if (targetedNodeId) {
            engine.toggleNodeFault(targetedNodeId, false);
            contextMenu.classList.add("hidden");
            updateUIState();
        }
    });

    // =========================================================================
    // DYNAMIC TICK CLOCK SYSTEM
    // =========================================================================
    const telemetryInterval = setInterval(() => {
        if (engine) {
            const oldGenStatus = engine.getGenStatus();
            // dt = 1.0 seconds elapsed
            engine.updateState(1.0);
            const newGenStatus = engine.getGenStatus();
            if (oldGenStatus !== newGenStatus) {
                soundManager.spoolGen(newGenStatus);
            }
            updateUIState();
        }
    }, 1000);

    // Initial trigger
    loadWasmLoaderScript();
});
