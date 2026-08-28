import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import {
  ThermometerSnowflake, Zap, Fuel, Battery, PlugZap, Server, ShieldCheck,
  DoorOpen, AlertTriangle, RefreshCw, ChevronRight, Boxes
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FreshnessPill, MetricTile } from "@/shared/ui";
import { AssetModelThumb, preloadThumbnails } from "@/shared/ui/model";
import { CATEGORIES, type CategoryDef, type DbCategory } from "@/domain/categories";
import { toneOfDomain, dominantDomain, DOMAIN_NEUTRAL } from "@/domain/wayfinding";
import { ago, describeFreshness, worstFreshness } from "@/domain/freshness";
import { modelsFor, type AssetModel } from "@/domain/assetModels";
import { useSiteFreshness, type FreshAsset } from "../hooks/useSiteFreshness";

// ─────────────────────────────────────────────────────────────────────────────
// Level 1: the whole site, by where things are.
//
// WHY THIS SCREEN EXISTS
// The seven analytics tabs are all MEASURE-major: each one assumes you already
// know you want to look at temperature, or fuel, or the UPS. None of them
// answers the question somebody actually arrives with — "is anything wrong, and
// where" — so a reader had to guess which tab would explain a problem they
// could not yet name.
//
// FRESHNESS IS THE HEADLINE, NOT A FOOTNOTE
// The first thing on the screen is how current the site is, because a dashboard
// of confident figures that stopped updating yesterday is worse than an empty
// one. Everything below it inherits that: a room card says how stale its worst
// asset is before it says anything about what the readings were.
// ─────────────────────────────────────────────────────────────────────────────

const ICONS: Record<string, LucideIcon> = {
  ThermometerSnowflake, Zap, Fuel, Battery, PlugZap, Server, ShieldCheck
};

/** Which browsable category a raw registry category belongs to. */
function categoryOf(dbCategory: string): CategoryDef | undefined {
  return CATEGORIES.find((c) =>
    c.dbCategories.includes(dbCategory.toUpperCase() as DbCategory));
}

interface CategoryGroup {
  def:       CategoryDef;
  assets:    FreshAsset[];
  models:    AssetModel[];
  partial:   number;
  behind:    number;
}

export function FacilityOverview() {
  const { rooms, unplaced, all, summary, isLoading, error, refresh } = useSiteFreshness();

  // Grouped by what a person browses by, not by the raw registry value —
  // ENVIRONMENT and AIRCON are one subject to a reader and two rows here would
  // split the room's temperature story in half.
  const categories = useMemo<CategoryGroup[]>(() => {
    const byId = new Map<string, CategoryGroup>();
    for (const a of all) {
      const def = categoryOf(a.category);
      if (!def) continue;
      let g = byId.get(def.id);
      if (!g) {
        g = { def, assets: [], models: [], partial: 0, behind: 0 };
        byId.set(def.id, g);
      }
      g.assets.push(a);
    }
    for (const g of byId.values()) {
      g.models  = modelsFor(g.assets.map((a) => a.category));
      g.partial = g.assets.filter((a) => a.isPartial).length;
      g.behind  = g.assets.filter(
        (a) => a.freshness === "stale" || a.freshness === "cold" || a.freshness === "never"
      ).length;
    }
    return [...byId.values()].sort((a, b) => b.assets.length - a.assets.length);
  }, [all]);

  // Warmed once the shape of the screen is known, so pictures are ready before
  // the cards are scrolled to. Heavy models are skipped inside preload.
  useEffect(() => {
    preloadThumbnails(modelsFor(all.map((a) => a.category)), 192);
  }, [all]);

  if (isLoading) {
    return (
      <div className="grid min-h-[24rem] place-items-center text-[12px] font-bold uppercase tracking-wider text-neutral-400">
        Reading the site…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[20rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-danger-500" />
        <p className="text-[13px] font-bold text-neutral-800">Could not read the site</p>
        <p className="max-w-md text-[12px] text-neutral-500">{error}</p>
        <button
          onClick={refresh}
          className="mt-1 flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-neutral-600 hover:bg-neutral-50"
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  const behindBadly = summary.freshness === "cold" || summary.freshness === "never";

  return (
    <div className="min-h-screen space-y-6 bg-neutral-50/50 p-6 text-neutral-800">

      {/* ── The headline: is this site being logged at all ──────────────── */}
      <section
        className={`flex flex-wrap items-start justify-between gap-4 rounded-3xl border p-5 shadow-sm ${
          behindBadly
            ? "border-danger-200 bg-danger-50"
            : summary.freshness === "stale" || summary.freshness === "due"
              ? "border-warn-200 bg-warn-50"
              : "border-neutral-100 bg-white"
        }`}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/70 text-neutral-600">
            <Boxes size={20} />
          </span>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Facility
            </span>
            <h2 className="mt-0.5 text-lg font-black uppercase tracking-tight text-neutral-900">
              {summary.lastReading
                ? `Last reading ${ago(summary.lastReading)}`
                : "Nothing has ever been recorded here"}
            </h2>
            <p className="mt-1 max-w-2xl text-[12px] font-semibold text-neutral-600">
              {describeFreshness(summary.lastReading, "hourly")}
              {summary.behind > 0 && (
                <> {summary.behind} of {summary.assets} assets have missed rounds.</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <FreshnessPill
            freshness={summary.freshness}
            lastReading={summary.lastReading}
            showWhenLive
            withAge
          />
          <button
            onClick={refresh}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 text-[11px] font-black uppercase tracking-wider text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </section>

      {/* ── What the numbers amount to ─────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricTile label="Assets" value={summary.assets} decimals={0}
          footnote={`${rooms.length} room${rooms.length === 1 ? "" : "s"}`} />
        <MetricTile label="Behind on rounds" value={summary.behind} decimals={0}
          status={summary.behind > 0 ? "breach" : "ok"}
          footnote="Stale or no longer logging" />
        <MetricTile label="Partial last round" value={summary.partial} decimals={0}
          status={summary.partial > 0 ? "warn" : "ok"}
          footnote="Fewer readings than normal" />
        <MetricTile label="Never read" value={summary.never} decimals={0}
          status={summary.never > 0 ? "warn" : null}
          footnote="Registered but never logged" />
      </section>

      {/* ── By category ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionTitle eyebrow="By kind" title="Equipment on this site" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((g) => {
            const Icon = ICONS[g.def.icon] ?? Zap;
            const tone = toneOfDomain(g.def.id);
            const worst = worstFreshness(g.assets.map((a) => a.freshness));
            const last  = g.assets.reduce<Date | null>(
              (acc, a) => (a.lastReading && (!acc || a.lastReading > acc) ? a.lastReading : acc),
              null
            );
            return (
              <Link
                key={g.def.id}
                to={`/admin/analytics/detail/${g.def.id}`}
                className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-3 pl-4 shadow-sm transition-colors hover:border-neutral-300"
              >
                {/* The subject's signature colour, at the edge. */}
                <span className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} aria-hidden="true" />
                <AssetModelThumb
                  model={g.models[0] ?? null}
                  size={64}
                  alt={g.def.label}
                  fallback={
                    <span className={`grid h-16 w-16 place-items-center rounded-xl ${tone.iconBg} ${tone.icon}`}>
                      <Icon size={24} />
                    </span>
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-black text-neutral-900">{g.def.label}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                    {g.assets.length} asset{g.assets.length === 1 ? "" : "s"}
                    {g.partial > 0 && ` · ${g.partial} partial`}
                  </p>
                  <div className="mt-1.5">
                    <FreshnessPill freshness={worst} lastReading={last} withAge />
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-neutral-300 transition-colors group-hover:text-neutral-500"
                />
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── By room, in the order the site is walked ───────────────────── */}
      <section className="space-y-3">
        <SectionTitle
          eyebrow="By place"
          title="Rooms"
          aside={
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              In walking order
            </span>
          }
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => {
            // A room of seven air conditioners is a thermal room and is
            // coloured as one. A room holding a UPS, a rectifier and two air
            // conditioners has no single subject, and picking whichever is most
            // numerous would be a confident claim about a mixed room.
            const roomDomain = dominantDomain(room.assets.map((a) => a.category));
            const tone = roomDomain ? toneOfDomain(roomDomain) : DOMAIN_NEUTRAL;
            return (
            <Link
              key={room.id}
              to={`/admin/analytics/facility/room/${room.id}`}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 pl-5 shadow-sm transition-colors hover:border-neutral-300"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} aria-hidden="true" />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-black text-neutral-900">{room.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                    {room.assets.length} asset{room.assets.length === 1 ? "" : "s"}
                    {room.partialCount > 0 && ` · ${room.partialCount} partial`}
                  </p>
                </div>
                <DoorOpen size={16} className={`shrink-0 ${tone.icon}`} />
              </div>

              {/* The kinds of machine in this room, one picture per kind. */}
              <div className="flex items-center gap-1.5">
                {room.models.slice(0, 4).map((m) => (
                  <AssetModelThumb
                    key={m.url}
                    model={m}
                    size={44}
                    fallback={
                      <span className="grid h-11 w-11 place-items-center rounded-lg bg-neutral-100 text-neutral-400">
                        <Boxes size={16} />
                      </span>
                    }
                    className="rounded-lg bg-neutral-50"
                  />
                ))}
                {room.models.length > 4 && (
                  <span className="font-mono text-[10px] font-bold text-neutral-400">
                    +{room.models.length - 4}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <FreshnessPill
                  freshness={room.freshness}
                  lastReading={room.lastReading}
                  withAge
                  showWhenLive
                />
                <ChevronRight
                  size={16}
                  className="shrink-0 text-neutral-300 transition-colors group-hover:text-neutral-500"
                />
              </div>
            </Link>
            );
          })}
        </div>

        {unplaced.length > 0 && (
          <p className="text-[11px] font-semibold text-neutral-400">
            {unplaced.length} asset{unplaced.length === 1 ? " is" : "s are"} not assigned to a
            room and {unplaced.length === 1 ? "does" : "do"} not appear above.
          </p>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ eyebrow, title, aside }: {
  eyebrow: string; title: string; aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
          {eyebrow}
        </span>
        <h3 className="text-sm font-black uppercase tracking-tight text-neutral-900">{title}</h3>
      </div>
      {aside}
    </div>
  );
}

export default FacilityOverview;
