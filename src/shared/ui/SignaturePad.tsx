import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Eraser, PenLine, Undo2, X } from "lucide-react";

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
// NO ROTATION. An earlier version turned the surface a quarter turn on narrow
// screens to lengthen the writing line. It cost more than it bought: the
// rotated box stood ~660px tall on a phone, which pushed the footer — and with
// it the confirm button — off the bottom of the screen, so a signature could be
// drawn but never submitted. The pad is upright everywhere now, and the sheet
// simply takes the width it is given.
//
// TRIMMED OUTPUT. The exported PNG is cropped to the ink. Exporting the whole
// canvas embeds a mostly-empty image, which then renders as a tiny mark inside
// whatever field displays it — the signature has to fill its box.
//
// PORTALLED. Rendered into document.body rather than in place. Two reasons,
// both of which produced the same symptom — a pad with no visible buttons:
//   1. The technician's bottom navigation was z-[9999] and this was z-[100],
//      so the nav painted over the footer and Submit/Clear were simply behind
//      it. Both now use the named layers in styles/layers.css.
//   2. z-index alone is not enough: any ancestor with a transform, filter,
//      backdrop-filter or opacity creates a stacking context that traps a
//      child no matter how high its z-index. A portal to body cannot be
//      trapped by anything.
// ─────────────────────────────────────────────────────────────────────────────

export interface SignatureResult {
  /** PNG data URL, transparent background, cropped to the ink. */
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
  /** Overrides the confirm button label, e.g. "Countersign". */
  confirmLabel?: string;
}

type Point = { x: number; y: number };

const INK = "#0f172a";

export function SignaturePad({
  open, onClose, onConfirm, signerName, context, confirmLabel = "Submit signature"
}: SignaturePadProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  const activeRef  = useRef<Point[] | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);

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
    ctx.strokeStyle = INK;
    ctx.fillStyle   = INK;

    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      if (stroke.length === 1) {
        // A deliberate dot still has to appear.
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, 1.2, 0, Math.PI * 2);
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
    if (!width || !height) return;
    canvas.width  = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    redraw();
  }, [redraw]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(resize, 0);   // after layout settles
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
    };
  }, [open, resize]);

  /** Client coordinates -> canvas coordinates. Upright, so a plain offset. */
  const toCanvas = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Capture keeps the stroke alive if the finger leaves the canvas, so a
    // signature running off the edge does not break into fragments.
    e.currentTarget.setPointerCapture(e.pointerId);
    activeRef.current = [toCanvas(e)];
    strokesRef.current.push(activeRef.current);
    // Count immediately rather than on pointerup: the confirm button must
    // enable as soon as there is ink, not only once the pen is lifted.
    setStrokeCount(strokesRef.current.length);
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

  const clear = useCallback(() => {
    strokesRef.current = [];
    activeRef.current = null;
    setStrokeCount(0);
    redraw();
  }, [redraw]);

  useEffect(() => { if (open) clear(); }, [open, clear]);   // never inherit old ink

  /**
   * Crops the canvas to the drawn ink before export.
   *
   * Without this the PNG is the full sheet, so a signature occupying a third of
   * the width comes back as a small mark floating in a large transparent image
   * — and every field that displays it has to show it tiny to fit the padding.
   */
  const exportTrimmed = (canvas: HTMLCanvasElement): string => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas.toDataURL("image/png");

    const { width: w, height: h } = canvas;
    const { data } = ctx.getImageData(0, 0, w, h);

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Alpha only: the ink is opaque and the background was cleared, so a
        // non-zero alpha is a drawn pixel.
        if (data[(y * w + x) * 4 + 3] !== 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return canvas.toDataURL("image/png");   // nothing drawn

    const pad = Math.round(8 * (window.devicePixelRatio || 1));
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(w, maxX + pad) - sx;
    const sh = Math.min(h, maxY + pad) - sy;

    const out = document.createElement("canvas");
    out.width = sw; out.height = sh;
    const octx = out.getContext("2d");
    // If the offscreen context is unavailable, return the FULL canvas. The
    // optional-chain version silently skipped the draw and exported a blank
    // PNG — losing the signature outright, which is far worse than exporting
    // one with too much padding.
    if (!octx) return canvas.toDataURL("image/png");
    octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return out.toDataURL("image/png");
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) return;
    onConfirm({
      dataUrl: exportTrimmed(canvas),
      signedAt: new Date().toISOString(),
      strokeCount: strokesRef.current.length
    });
  };

  // Escape cancels, so the pad never traps someone on a touchscreen PC.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasInk = strokeCount > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex flex-col bg-slate-900/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sign"
    >
      <div className="flex shrink-0 items-start justify-between p-4">
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

      {/* min-h-0 lets this flex child shrink; without it the sheet's height
          would push the footer past the bottom of the viewport, which is
          exactly how the confirm button became unreachable before. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <div className="relative h-full max-h-[26rem] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
          {/* The signing line, drawn under the ink so it reads as paper. */}
          <div className="pointer-events-none absolute inset-x-8 bottom-12 border-b-2 border-dashed border-slate-200" />
          <span className="pointer-events-none absolute bottom-5 left-8 font-mono text-[10px] uppercase tracking-widest text-slate-300">
            Sign above the line
          </span>
          {!hasInk && (
            <span className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-2 text-[12px] font-bold text-slate-300">
              <PenLine size={15} /> Draw your signature here
            </span>
          )}

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

      {/* The controls.
          These were previously styled `opacity-30` and `bg-white/15` while
          disabled, which on a dark backdrop made them invisible — so opening
          the pad looked like it had no Clear and no Submit at all. Disabled now
          means visibly present and obviously inactive, never absent. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/20 bg-slate-950/80 p-4">
        <div className="flex gap-2">
          <button
            onClick={undo}
            disabled={!hasInk}
            className="flex items-center gap-1.5 rounded-xl border-2 border-white/30 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-white/15 disabled:border-white/15 disabled:text-white/45"
          >
            <Undo2 size={14} /> Undo
          </button>
          <button
            onClick={clear}
            disabled={!hasInk}
            className="flex items-center gap-1.5 rounded-xl border-2 border-white/30 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-white/15 disabled:border-white/15 disabled:text-white/45"
          >
            <Eraser size={14} /> Clear
          </button>
        </div>

        <button
          onClick={confirm}
          disabled={!hasInk}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-[12px] font-black uppercase tracking-wider text-white shadow-lg transition-colors hover:bg-brand-600 disabled:border-2 disabled:border-white/25 disabled:bg-white/10 disabled:text-white/60 disabled:shadow-none sm:flex-none"
        >
          <Check size={16} /> {hasInk ? confirmLabel : "Sign to continue"}
        </button>
      </div>
    </div>,
    document.body
  );
}

/**
 * A signature on a form: an empty line until signed, the mark itself after.
 * Clicking either opens the pad.
 *
 * Sized like an input rather than a large drop zone — the signature is one
 * field among several, and the captured mark is cropped to its ink so it fills
 * this box instead of floating in it.
 */
export function SignatureField({
  value, onClick, label, signedAt, className = ""
}: {
  value: string | null;
  onClick: () => void;
  label: string;
  /** ISO timestamp, shown under the mark once signed. */
  signedAt?: string | null;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full flex-col justify-end rounded-2xl border-2 border-dashed px-3 pb-2 pt-2 transition-colors ${
        value
          ? "border-ok-300 bg-ok-50/40 hover:border-ok-400"
          : "border-gray-200 hover:border-brand-300 hover:bg-brand-50/40"
      } ${className}`}
      style={{ minHeight: "5rem" }}
    >
      {value ? (
        <img
          src={value}
          alt={`${label} signature`}
          className="mx-auto max-h-14 w-auto max-w-full object-contain"
        />
      ) : (
        <span className="flex flex-1 items-center justify-center gap-1.5 text-[11px] font-bold text-gray-400 group-hover:text-brand-500">
          <PenLine size={13} /> Tap to sign
        </span>
      )}

      <span className="mt-1.5 flex w-full items-center justify-between gap-2 border-t border-gray-300 pt-1.5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400">
          {label}
        </span>
        {value && signedAt && (
          <span className="font-mono text-[9px] text-gray-400">
            {new Date(signedAt).toLocaleString(undefined, {
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
            })}
          </span>
        )}
      </span>
    </button>
  );
}
