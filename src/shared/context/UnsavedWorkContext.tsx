import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode
} from "react";

// ─────────────────────────────────────────────────────────────────────────────
// One place that knows whether anything on screen is half-typed.
//
// WHY THIS EXISTS
// A technician fills a round on a phone, in a plant room, one-handed. An
// accidental edge-swipe used to cost the whole hour, and nothing warned them,
// because the reading form is not a route: it is conditional rendering inside
// TechDashboard. A back gesture there does not return to the hour list — it
// leaves /tech altogether and unmounts the form.
//
// WHY NOT useBlocker
// react-router's own guard needs a data router. This app mounts declarative
// <BrowserRouter>, and useBlocker calls useDataRouterContext, which throws
// without one. Migrating the whole route tree to createBrowserRouter to get a
// confirm dialog would be a far larger change than the problem warrants, so
// the three ways out are covered explicitly instead:
//
//   the tab closing or reloading  → beforeunload, below
//   the back gesture / back button → useBackGuard, below
//   a tap on the bottom nav        → confirmLeave, called by the link
//
// WHAT THIS IS NOT
// It is not the safety net. Losing typed work should not depend on a person
// reading a dialog correctly on the second attempt — the readings round also
// persists every keystroke and restores it on return (see useTelemetryData).
// This layer exists for the forms that cannot do that, and as a second chance
// for the one that can.
// ─────────────────────────────────────────────────────────────────────────────

interface UnsavedWorkValue {
  /** Register (or clear) unsaved work under a stable key. */
  setDirty: (key: string, dirty: boolean) => void;
  /** True while any registered form is holding unsaved work. */
  hasUnsavedWork: () => boolean;
  /**
   * Ask before discarding, if there is anything to discard.
   * Returns true when the caller may proceed.
   */
  confirmLeave: (what?: string) => boolean;
  /**
   * Stand the warning down briefly, for a deliberate hand-off to another app.
   *
   * Sharing a report navigates this document to whatsapp://. That fires
   * beforeunload, and the browser's own "Leave site?" dialog then keeps the
   * page visible — which is precisely the signal the share util reads as "no
   * app claimed the scheme", so it falls back to the web link and strands the
   * technician on WhatsApp Web with the app installed on the same phone.
   *
   * The work is not being abandoned here; it is being sent somewhere. Use this
   * only for that, and only around the navigation itself.
   */
  suppressLeaveWarning: (ms?: number) => void;
}

/**
 * Permissive fallback. A subtree mounted outside the provider navigates
 * normally rather than crashing: in a field app a thrown error costs the
 * round, which is the very thing this file exists to prevent.
 */
const FALLBACK: UnsavedWorkValue = {
  setDirty: () => {},
  hasUnsavedWork: () => false,
  confirmLeave: () => true,
  suppressLeaveWarning: () => {}
};

const UnsavedWorkContext = createContext<UnsavedWorkValue>(FALLBACK);

export function UnsavedWorkProvider({ children }: { children: ReactNode }) {
  // A ref, not state, and deliberately so: this changes on the first keystroke
  // of every field, and re-rendering the whole tech shell on each one to keep
  // a boolean in sync would be felt on the cheap handsets this runs on.
  // Nothing renders from it — the nav bar and the gesture handler both only
  // need to ASK, at the moment someone tries to leave.
  const dirtyKeys = useRef<Set<string>>(new Set());

  // A timestamp rather than a boolean, so a hand-off that never completes
  // cannot leave the round permanently unguarded — the stand-down expires by
  // itself whether or not anyone remembers to lift it.
  const suppressedUntil = useRef(0);

  const isSuppressed = () => Date.now() < suppressedUntil.current;

  const setDirty = useCallback((key: string, dirty: boolean) => {
    if (dirty) dirtyKeys.current.add(key);
    else dirtyKeys.current.delete(key);
  }, []);

  const hasUnsavedWork = useCallback(() => dirtyKeys.current.size > 0, []);

  // Five seconds: long enough to cover the scheme navigation and the share
  // util's 1.5s fallback to the web link, short enough that a tap which goes
  // nowhere leaves the round guarded again almost immediately.
  const suppressLeaveWarning = useCallback((ms = 5000) => {
    suppressedUntil.current = Date.now() + ms;
  }, []);

  const confirmLeave = useCallback((what = "the readings you have entered") => {
    if (isSuppressed()) return true;
    if (dirtyKeys.current.size === 0) return true;
    return window.confirm(
      `You have not saved ${what}.\n\n` +
      `Leaving this page now discards it.\n\n` +
      `Tap Cancel to go back and save first, or OK to leave anyway.`
    );
  }, []);

  // The tab closing, reloading, or the address bar going somewhere else. The
  // browser supplies its own wording and ignores ours; assigning returnValue
  // is what makes the prompt appear at all, and every current browser still
  // requires it alongside preventDefault.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSuppressed()) return;
      if (dirtyKeys.current.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
    <UnsavedWorkContext.Provider
      value={{ setDirty, hasUnsavedWork, confirmLeave, suppressLeaveWarning }}
    >
      {children}
    </UnsavedWorkContext.Provider>
  );
}

export function useUnsavedWork(): UnsavedWorkValue {
  return useContext(UnsavedWorkContext);
}

/**
 * Declare that this form is holding unsaved work.
 *
 * The key is per-form, not per-field, so two forms open at once cannot clear
 * each other's flag. Unregistering on unmount matters: a form that navigated
 * away must not leave the nav bar believing there is still something to lose.
 */
export function useUnsavedWorkFlag(key: string, isDirty: boolean) {
  const { setDirty } = useUnsavedWork();
  useEffect(() => {
    setDirty(key, isDirty);
    return () => setDirty(key, false);
  }, [key, isDirty, setDirty]);
}

/**
 * Turn the back gesture into "return to the previous step", and ask first if
 * that would throw away typed work.
 *
 * It works by parking one extra history entry while the form is open, so the
 * gesture has something of ours to consume instead of leaving the shell. The
 * URL never changes, so react-router sees no navigation; the router's own
 * state is carried onto the entry rather than replaced, so its bookkeeping
 * stays intact.
 *
 * @param active  whether the form is open and should hold the back gesture
 * @param onBack  what "back" should actually do — usually returning a step
 */
export function useBackGuard(active: boolean, onBack: () => void) {
  const { confirmLeave } = useUnsavedWork();

  // Kept in a ref so a changing callback identity cannot tear down and rebuild
  // the history entry underneath the person using it.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;

    const park = () => {
      window.history.pushState(
        { ...(window.history.state ?? {}), dcimeBackGuard: true },
        ""
      );
    };

    let parked = false;
    let releasing = false;

    park();
    parked = true;

    const onPop = () => {
      if (releasing) {
        // The popstate our own cleanup scheduled, not a gesture. This handler
        // outlived the effect purely to swallow this one event; now it goes.
        window.removeEventListener("popstate", onPop);
        return;
      }
      // Our entry has just been consumed by the gesture or the back button.
      parked = false;
      if (confirmLeave()) {
        onBackRef.current();
      } else {
        // Staying put. Park another entry so the NEXT gesture is caught too —
        // the one that gets swiped twice is exactly the one that loses a round.
        park();
        parked = true;
      }
    };

    window.addEventListener("popstate", onPop);

    return () => {
      if (!parked) {
        // The gesture already spent it; nothing to give back.
        window.removeEventListener("popstate", onPop);
        return;
      }
      // Closing for some other reason — submitted, or Back was tapped. The
      // parked entry must not outlive the form, or entries accumulate: after
      // a few rounds the back button would need pressing once per round
      // before it left the shell. Releasing it schedules a popstate, so the
      // handler above stays installed just long enough to swallow that.
      releasing = true;
      window.history.back();
    };
  }, [active, confirmLeave]);
}
