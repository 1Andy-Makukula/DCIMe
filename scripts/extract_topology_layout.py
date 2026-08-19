#!/usr/bin/env python3
"""
extract_topology_layout.py — lift the hand-drawn SVG geometry into SQL.

The topology drawing in public/topology_engine/renderer/index.html was authored
by hand: 49 node groups at chosen coordinates and 52 cable paths routed to avoid
overlapping each other. That arrangement carries real information — a technician
recognises this diagram — so Stage 3 moves it into the database verbatim rather
than replacing it with a layout algorithm.

This script is the one-way door: run it once, commit the SQL it emits, and the
geometry lives in Postgres from then on. It is re-runnable and deterministic, so
it can be re-run if the source SVG is corrected before the cutover.

    python scripts/extract_topology_layout.py

Writes: supabase/seed/20260814_seed_topology_layout.sql
"""

import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "topology_engine", "renderer", "index.html")
OUT = os.path.join(ROOT, "supabase", "seed", "20260814_seed_topology_layout.sql")

# The 7 floor plates are bare <rect> elements with inline styling — no class,
# no id — which is why the first extraction pass walked straight past them.
# Each maps onto a row already in the `rooms` table; the drawing's label and the
# record's name differ deliberately ("THE SERVER ROOM" vs "Server Room").
PLATE_TO_ROOM = {
    "EXTERIOR YARD":   "Genset Yard",
    "POWER ROOM 1":    "Power Room 1",
    "POWER ROOM 2":    "Power Room 2",
    "IT ROOM 1":       "IT Room 1",
    "IT ROOM 2":       "IT Room 2",
    "THE SERVER ROOM": "Server Room",
    "THE DATA ROOM":   "Data Room",
}

# face-<class> in the SVG -> render_shape in the database.
FACE_TO_SHAPE = {
    "transformer": "transformer",
    "generator":   "generator",
    "tco":         "tco",
    "db":          "db",
    "ups":         "ups",
    "rectifier":   "rectifier",
    "server":      "server",
    "aircon":      "aircon",
    "fss":         "fss",
}
# Cosmetic classes that are not shape identities.
NON_SHAPE = {"left", "right", "top", "inactive"}

# Three nodes cannot be classified from a face-* class alone:
#   node-dragor   drawn with inline magenta styling and no face class. Confirmed
#                 by the facility to be a precision cooling unit, so it adopts
#                 the standard aircon appearance — a deliberate, visible change.
#   node-fm-200   uses face-inactive (a greyed style, not a shape identity).
#                 Fire suppression: drawn, never simulated.
#   node-dg-bus   not a <g> at all. It is the horizontal busbar path itself, so
#                 its position and geometry are injected rather than parsed.
SHAPE_OVERRIDE = {
    "node-dragor": "aircon",
    "node-fm-200": "fss",
}
BUS_NODE = ("node-dg-bus", 1000.0, 150.0, "bus", "dg-bus")


def sql_str(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
    if not os.path.isfile(SRC):
        sys.exit(f"source not found: {SRC}")
    html = open(SRC, encoding="utf-8").read()

    # ── Nodes ──────────────────────────────────────────────────────────────
    # Capture each <g id="node-..."> group and everything up to its close, so
    # the face class can be read from inside the group rather than guessed.
    nodes = []
    for m in re.finditer(
        r'<g id="(node-[^"]+)"[^>]*?transform="translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)"(.*?)</g>',
        html, re.S
    ):
        node_id, x, y, body = m.group(1), m.group(2), m.group(3), m.group(4)
        faces = [f for f in re.findall(r"face-([a-z0-9]+)", body) if f not in NON_SHAPE]
        shape = SHAPE_OVERRIDE.get(node_id) or (FACE_TO_SHAPE.get(faces[0]) if faces else None)
        nodes.append((node_id, float(x), float(y), shape))

    # ── Room floor plates ──────────────────────────────────────────────────
    # A plate owns the one label that falls inside it. Pairing by containment
    # rather than document order means reordering the SVG cannot silently
    # mislabel a room.
    svg = html[html.index("<svg"):html.index("</svg>")]

    labels = []
    for m in re.finditer(r'<text(?![^>]*class=)([^>]*)>([^<]+)</text>', svg):
        a, text = m.group(1), m.group(2).strip()
        lx = re.search(r'x="([-\d.]+)"', a)
        ly = re.search(r'y="([-\d.]+)"', a)
        fs = re.search(r'font-size="(\d+)', a)
        if lx and ly:
            labels.append((text, float(lx.group(1)), float(ly.group(1)),
                           int(fs.group(1)) if fs else 28))

    plates = []
    for m in re.finditer(r'<rect(?![^>]*class=)([^>]*)>', svg):
        a = m.group(1)
        def num(k):
            g = re.search(k + r'="([-\d.]+)"', a)
            return float(g.group(1)) if g else None
        x, y, w, hgt = num("x"), num("y"), num("width"), num("height")
        if None in (x, y, w, hgt):
            continue    # the full-bleed grid backdrop, which has no coordinates
        tint = re.search(r'fill="(rgba\([^)]*\))"', a) or re.search(r'fill:\s*(rgba\([^)]*\))', a)
        owned = [l for l in labels
                 if x - 40 <= l[1] <= x + w + 40 and y - 60 <= l[2] <= y + hgt + 40]
        if not owned:
            continue
        text, lx, ly, fs = owned[0]
        room = PLATE_TO_ROOM.get(text)
        if room is None:
            print(f"  WARNING: plate '{text}' has no room mapping; skipped")
            continue
        plates.append((room, text, x, y, w, hgt, lx, ly, fs,
                       tint.group(1) if tint else None))

    # ── Cables ─────────────────────────────────────────────────────────────
    paths = {}
    for m in re.finditer(r'<path\s+data-path-id="([^"]+)"\s+d="([^"]+)"', html):
        paths[m.group(1)] = " ".join(m.group(2).split())

    # The paralleling busbar is a path, not a group — inject it as a node whose
    # own geometry is that path.
    bus_id, bus_x, bus_y, bus_shape, bus_path = BUS_NODE
    nodes.append((bus_id, bus_x, bus_y, bus_shape))
    bus_d = paths.get(bus_path)
    if bus_d is None:
        sys.exit(f"expected a '{bus_path}' path in the SVG for the busbar node")

    # ── Report ─────────────────────────────────────────────────────────────
    print(f"source : {os.path.relpath(SRC, ROOT)}")
    print(f"nodes  : {len(nodes)}")
    print(f"cables : {len(paths)}")
    print(f"rooms  : {len(plates)}")

    missing = [n for n in nodes if n[3] is None]
    if missing:
        print(f"\n  {len(missing)} node(s) with no recognisable shape class:")
        for n in missing:
            print(f"    {n[0]}")

    shapes = Counter(n[3] for n in nodes)
    print(f"\n  shapes: {dict(sorted(shapes.items(), key=lambda kv: str(kv[0])))}")

    dupes = [c for c, k in Counter((n[1], n[2]) for n in nodes).items() if k > 1]
    if dupes:
        print(f"\n  WARNING: {len(dupes)} coordinate(s) used by more than one node: {dupes}")

    # ── Emit ───────────────────────────────────────────────────────────────
    L = []
    L.append("-- ═══════════════════════════════════════════════════════════════════════════")
    L.append("-- 20260814_seed_topology_layout.sql")
    L.append("-- GENERATED by scripts/extract_topology_layout.py — do not hand-edit.")
    L.append("--")
    L.append("-- Geometry lifted verbatim from")
    L.append("-- public/topology_engine/renderer/index.html so the database-driven render")
    L.append("-- is pixel-identical to the hand-drawn original. Any visual difference after")
    L.append("-- the Stage 3 cutover is a bug in the renderer, not a change of design.")
    L.append("--")
    L.append(f"-- {len(nodes)} node positions, {len(paths)} routed cables.")
    L.append("-- Scoped to the SANDBOX site; production sites are untouched.")
    L.append("-- ═══════════════════════════════════════════════════════════════════════════")
    L.append("")
    L.append("BEGIN;")
    L.append("")
    L.append("CREATE TEMP TABLE _layout(equipment_id text PRIMARY KEY, x double precision,")
    L.append("                         y double precision, shape text) ON COMMIT DROP;")
    L.append("")
    L.append("INSERT INTO _layout(equipment_id, x, y, shape) VALUES")
    rows = [f"  ({sql_str(i)}, {x}, {y}, {sql_str(s)})" for i, x, y, s in sorted(nodes)]
    L.append(",\n".join(rows) + ";")
    L.append("")
    L.append("UPDATE public.equipment_registry e")
    L.append("   SET layout_x = l.x, layout_y = l.y, render_shape = l.shape")
    L.append("  FROM _layout l")
    L.append(" WHERE e.equipment_id = l.equipment_id")
    L.append("   AND e.site_uuid = (SELECT id FROM public.sites WHERE site_code = 'SANDBOX');")
    L.append("")
    L.append("-- The busbar is drawn as a line rather than a cube, so its geometry lives")
    L.append("-- on the node itself.")
    L.append("UPDATE public.equipment_registry")
    L.append(f"   SET render_path_d = {sql_str(bus_d)}")
    L.append(f" WHERE equipment_id = {sql_str(bus_id)}")
    L.append("   AND site_uuid = (SELECT id FROM public.sites WHERE site_code = 'SANDBOX');")
    L.append("")
    L.append("-- ── Room floor plates ─────────────────────────────────────────────────────")
    L.append("CREATE TEMP TABLE _plates(room_name text PRIMARY KEY, label text,")
    L.append("  x double precision, y double precision, w double precision, h double precision,")
    L.append("  lx double precision, ly double precision, fs integer, tint text) ON COMMIT DROP;")
    L.append("")
    L.append("INSERT INTO _plates(room_name, label, x, y, w, h, lx, ly, fs, tint) VALUES")
    prows2 = [f"  ({sql_str(r)}, {sql_str(lab)}, {x}, {y}, {w}, {hh}, {lx}, {ly}, {fs}, {sql_str(tint)})"
              for r, lab, x, y, w, hh, lx, ly, fs, tint in sorted(plates)]
    L.append(",\n".join(prows2) + ";")
    L.append("")
    L.append("UPDATE public.rooms rm")
    L.append("   SET layout_x = p.x, layout_y = p.y, layout_w = p.w, layout_h = p.h,")
    L.append("       layout_label = p.label, label_x = p.lx, label_y = p.ly,")
    L.append("       label_size = p.fs, layout_tint = p.tint")
    L.append("  FROM _plates p")
    L.append(" WHERE rm.room_name = p.room_name")
    L.append("   AND rm.site_id = (SELECT id FROM public.sites WHERE site_code = 'SANDBOX');")
    L.append("")
    L.append("-- ── Room assignment follows the drawing ───────────────────────────────────")
    L.append("-- Where a node is DRAWN is surveyed fact; which room it was tagged with is a")
    L.append("-- guess made when the seed was written. So room_id is derived from plate")
    L.append("-- containment, not the other way round. This corrected six nodes on first")
    L.append("-- run, all of them mismatches inherited from the V1 seed.")
    L.append("UPDATE public.equipment_registry e")
    L.append("   SET room_id = rm.id")
    L.append("  FROM public.rooms rm")
    L.append(" WHERE rm.site_id = e.site_uuid")
    L.append("   AND rm.layout_x IS NOT NULL")
    L.append("   AND e.layout_x IS NOT NULL")
    L.append("   AND e.layout_x BETWEEN rm.layout_x AND rm.layout_x + rm.layout_w")
    L.append("   AND e.layout_y BETWEEN rm.layout_y AND rm.layout_y + rm.layout_h")
    L.append("   AND e.site_uuid = (SELECT id FROM public.sites WHERE site_code = 'SANDBOX')")
    L.append("   AND e.room_id IS DISTINCT FROM rm.id;")
    L.append("")
    L.append("CREATE TEMP TABLE _paths(render_path_id text PRIMARY KEY, d text) ON COMMIT DROP;")
    L.append("")
    L.append("INSERT INTO _paths(render_path_id, d) VALUES")
    prows = [f"  ({sql_str(k)}, {sql_str(v)})" for k, v in sorted(paths.items())]
    L.append(",\n".join(prows) + ";")
    L.append("")
    L.append("UPDATE public.equipment_connections c")
    L.append("   SET render_path_d = p.d")
    L.append("  FROM _paths p, public.equipment_registry e")
    L.append(" WHERE c.render_path_id = p.render_path_id")
    L.append("   AND e.equipment_id = c.source_equipment_id")
    L.append("   AND e.site_uuid = (SELECT id FROM public.sites WHERE site_code = 'SANDBOX');")
    L.append("")
    L.append("-- ── Report what landed, and what did not ──────────────────────────────────")
    L.append("DO $$")
    L.append("DECLARE v_site uuid; v_pos int; v_shape int; v_d int; v_nodrawn int; v_rooms int; v_out int;")
    L.append("BEGIN")
    L.append("  SELECT id INTO v_site FROM public.sites WHERE site_code = 'SANDBOX';")
    L.append("  SELECT count(*) INTO v_pos   FROM public.equipment_registry")
    L.append("   WHERE site_uuid = v_site AND layout_x IS NOT NULL;")
    L.append("  SELECT count(*) INTO v_shape FROM public.equipment_registry")
    L.append("   WHERE site_uuid = v_site AND render_shape IS NOT NULL;")
    L.append("  SELECT count(*) INTO v_d FROM public.equipment_connections c")
    L.append("    JOIN public.equipment_registry e ON e.equipment_id = c.source_equipment_id")
    L.append("   WHERE e.site_uuid = v_site AND c.render_path_d IS NOT NULL;")
    L.append("  SELECT count(*) INTO v_nodrawn FROM public.equipment_registry")
    L.append("   WHERE site_uuid = v_site AND engine_type IS NOT NULL AND layout_x IS NULL;")
    L.append("  SELECT count(*) INTO v_rooms FROM public.rooms")
    L.append("   WHERE site_id = v_site AND layout_x IS NOT NULL;")
    L.append("  SELECT count(*) INTO v_out FROM public.topology_layout_issues")
    L.append("   WHERE site_uuid = v_site;")
    L.append("  RAISE NOTICE 'layout: % positioned, % shaped, % cables routed, % rooms plated, % outside a room',")
    L.append("    v_pos, v_shape, v_d, v_rooms, v_out;")
    L.append("  IF v_nodrawn > 0 THEN")
    L.append("    RAISE EXCEPTION '% simulated node(s) have no coordinates - they would be invisible', v_nodrawn;")
    L.append("  END IF;")
    L.append("END $$;")
    L.append("")
    L.append("COMMIT;")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    print(f"\nwrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
