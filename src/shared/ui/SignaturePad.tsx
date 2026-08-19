import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eraser, RotateCcw, Smartphone, Undo2, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Handwritten signature capture.
//
// Replaces "tick a box and store a random string". A signature that is a
// checkbox proves somebody clicked; a signature that is a drawing proves
// somebody signed, and can be shown back on a printed document.
//
// ONE INPUT PATH. Pointer Events cover mouse, finger and stylus with the same
// handlers — separate mouse/touch listeners would double-fire on hybrid devices
// and drop pressure and pen data entirely.
//
// ROTATION. A phone held upright gives a signing strip barely wider than a
// thumb. The pad rotates its surface a quarter turn on narrow portrait screens
// so the phone's long edge becomes the writing line, which is how a signature
// is actually written. Pointer coordinates are transformed back through the
// same rotation, so the ink lands where the finger is.
// ─────────────────────────────────────────────────────────────────────────────

export interface SignatureResult {
  /** PNG data URL, transparent background, trimmed to the ink. */
  dataUrl: string;
  /** ISO timestamp of the moment it was confirmed. */
  signedAt: string;
  /** How many separate strokes — a single dot is not a signature. */
  strokeCount: number;
}

export interface SignaturePadProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: SignatureResult) => void;
  /** Shown above the line, e.g. "Chileshe K." */
  signerName?: string;
  /** What is being signed for, e.g. "Shift handover · 14:00 - 22:00". */
  context?: string;
}

type Point = { x: number; y: number };

export function SignaturePad({
  open, onClose, onConfirm, signerName, context
}: SignaturePadProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  const activeRef  = useRef<Point[] | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);

  // A quarter turn is applied only where it helps: a narrow, taller-than-wide
  // viewport. On a tablet or desktop the surface is already wide enough.
  const [rotated, setRotated] = useState(false);
  useEffect(() => {
    if (!open) return;
    const decide = () => setRotated(window.innerWidth < 640 && window.innerHeight > window.innerWidth);
    decide();
    window.addEventListener("resize", decide);
    window.addEventListener("orientationchange", decide);
    return () => {
      window.removeEventListener("resize", decide);
      window.removeEventListener("orientationchange", decide);
    };
  }, [open]);

  /** Repaints every stroke. Called on resize, undo and clear. */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    ctx.lineWidth   = 2.4;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "#0f172a";

    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      if (stroke.length === 1) {
        // A deliberate dot still has to appear.
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = "#0f172a";
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      // Quadratic curves through the midpoints. Straight lineTo between raw
      // samples renders visibly faceted, especially on a slow finger.
      for (let i = 1; i < stroke.length - 1; i++) {
        const mid = {
          x: (stroke[i].x + stroke[i + 1].x) / 2,
          y: (stroke[i].y + stroke[i + 1].y) / 2
        };
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, mid.x, mid.y);
      }
      const last = stroke[stroke.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
  }, []);

  /** Sizes the backing store to the element, accounting for pixel density. */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    // The rect of a rotated element is its bounding box, so the canvas is sized
    // from its layout box instead — that is unaffected by the transform.
    const w = canvas.offsetWidth  || width;
    const h = canvas.offsetHeight || height;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    redraw();
  }, [redraw]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(resize, 0);   // after layout settles
    window.addEventListener("resize", resize);
    return () => { window.clearTimeout(id); window.removeEventListener("resize", resize); };
  }, [open, rotated, resize]);

  /**
   * Client coordinates -> canvas coordinates, undoing the CSS rotation.
   *
   * Rotating about the element centre means a plain left/top subtraction is
   * wrong: the browser reports the position within the rotated bounding box.
   * Rotating the offset back by the same angle recovers the true point.
   */
  const toCanvas = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const a  = ((rotated ? -90 : 0) * Math.PI) / 180;
    const rx = dx * Math.cos(a) - dy * Math.sin(a);
    const ry = dx * Math.sin(a) + dy * Math.cos(a);
    return { x: rx + canvas.offsetWidth / 2, y: ry + canvas.offsetHeight / 2 };
  }, [rotated]);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Capture keeps the stroke alive if the finger leaves the canvas, so a
    // signature running off the edge does not break into fragments.
    e.currentTarget.setPointerCapture(e.pointerId);
    activeRef.current = [toCanvas(e)];
    strokesRef.current.push(activeRef.current);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current) return;
    activeRef.current.push(toCanvas(e));
    redraw();
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    activeRef.current = null;
    setStrokeCount(strokesRef.current.length);
  };

  const undo = () => {
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    redraw();
  };

  const clear = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    redraw();
  };

  useEffect(() => { if (open) clear(); }, [open]);   // never inherit old ink

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) return;
    onConfirm({
      dataUrl: canvas.toDataURL("image/png"),
      signedAt: new Date().toISOString(),
      strokeCount: strokesRef.current.length
    });
  };

  if (!open) return null;

  const hasInk = strokeCount > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-900/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sign"
    >
      <div className="flex items-start justify-between p-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">
            Signature
          </p>
          {signerName && (
            <p className="truncate text-[15px] font-black text-white">{signerName}</p>
          )}
          {context && (
            <p className="mt-0.5 truncate text-[11px] text-white/60">{context}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Cancel"
          className="rounded-xl p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {rotated && (
        <p className="flex items-center justify-center gap-2 pb-2 text-[11px] font-semibold text-white/70">
          <Smartphone size={13} className="rotate-90" />
          Turn your phone sideways to sign
        </p>
      )}

      <div className="flex flex-1 items-center justify-center px-4 pb-4">
        <div
          className="relative w-full overflow-hidden rounded-3xl bg-white shadow-2xl"
          style={
            rotated
              // Swapped extents plus a quarter turn: the surface fills the
              // screen's long axis while the page itself stays upright.
              ? {
                  width:  "min(78vh, 40rem)",
                  height: "min(70vw, 22rem)",
                  transform: "rotate(90deg)"
                }
              : { height: "min(60vh, 22rem)" }
          }
        >
          {/* The signing line, drawn under the ink so it reads as paper. */}
          <div className="pointer-events-none absolute inset-x-8 bottom-12 border-b-2 border-dashed border-slate-200" />
          <span className="pointer-events-none absolute bottom-5 left-8 font-mono text-[10px] uppercase tracking-widest text-slate-300">
            Sign above the line
          </span>

          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            // touch-action:none is what stops the page scrolling and pinch-
            // zooming under the finger while a signature is being written.
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-slate-900/40 p-4">
        <div className="flex gap-2">
          <button
            onClick={undo}
            disabled={!hasInk}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:bg-white/10 disabled:opacity-30"
          >
            <Undo2 size={14} /> Undo
          </button>
          <button
            onClick={clear}
            disabled={!hasInk}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:bg-white/10 disabled:opacity-30"
          >
            <Eraser size={14} /> Clear
          </button>
        </div>

        <button
          onClick={confirm}
          disabled={!hasInk}
          className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[12px] font-black uppercase tracking-wider text-slate-900 transition-colors disabled:bg-white/20 disabled:text-white/40"
        >
          <Check size={15} /> {hasInk ? "Confirm signature" : "Sign to continue"}
        </button>
      </div>
    </div>
  );
}

/**
 * A signature on a form: an empty line until signed, the mark itself after.
 * Clicking either opens the pad.
 */
export function SignatureField({
  value, onClick, label, className = ""
}: {
  value: string | null;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full flex-col items-center justify-end rounded-2xl border-2 border-dashed p-3 transition-colors ${
        value ? "border-ok-200 bg-ok-50/30" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      } ${className}`}
      style={{ minHeight: "6.5rem" }}
    >
      {value ? (
        <img src={value} alt={`${label} signature`} className="max-h-16 w-auto object-contain" />
      ) : (
        <span className="flex flex-1 items-center gap-1.5 text-[11px] font-bold text-gray-400 group-hover:text-gray-600">
          <RotateCcw size={13} /> Tap to sign
        </span>
      )}
      <span className="mt-2 w-full border-t border-gray-300 pt-1.5 font-mono text-[9px] uppercase tracking-widest text-gray-400">
        {label}
      </span>
    </button>
  );
}
