import { useState } from "react";
import { PenLine, ShieldCheck } from "lucide-react";
import { SignaturePad, type SignatureResult } from "./SignaturePad";

// ─────────────────────────────────────────────────────────────────────────────
// The signature block at the foot of a document.
//
// A handover signed only by the person leaving proves they filled a form in. It
// does not show anyone received it. This renders both parties side by side —
// the mark that was captured in the field, and the countersignature of whoever
// accepted it — and offers the countersign action when it is still missing.
//
// Read-only for the already-signed side: a captured signature is evidence, and
// nothing in the UI should offer to redraw it.
// ─────────────────────────────────────────────────────────────────────────────

export interface SignatureSlot {
  /** e.g. "Submitted by" */
  role:      string;
  /** Who signed, or who is expected to. */
  name:      string | null;
  /** PNG data URL, or null when unsigned. */
  image:     string | null;
  signedAt:  string | null;
}

export interface DocumentSignaturesProps {
  /** The mark captured when the document was raised. Never editable here. */
  author: SignatureSlot;
  /** The accepting party. Signable while `image` is null and `onSign` is given. */
  counter: SignatureSlot;
  /** Omit to render the block read-only, e.g. when printing. */
  onSign?: (result: SignatureResult) => void | Promise<void>;
  /** Context line shown in the pad, e.g. "Shift handover · 2026-08-19". */
  context?: string;
  className?: string;
}

function Slot({ slot, placeholder }: { slot: SignatureSlot; placeholder: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        className={`flex h-20 items-end justify-center rounded-t-xl border border-b-0 px-3 pb-1 ${
          slot.image ? "border-gray-200 bg-white" : "border-dashed border-gray-200 bg-gray-50/60"
        }`}
      >
        {slot.image ? (
          <img
            src={slot.image}
            alt={`${slot.role} signature`}
            className="max-h-16 w-auto max-w-full object-contain"
          />
        ) : (
          <span className="mb-4 text-[10px] font-bold uppercase tracking-wider text-gray-300">
            {placeholder}
          </span>
        )}
      </div>
      <div className="rounded-b-xl border border-t-2 border-gray-200 border-t-gray-300 bg-white px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-widest text-gray-400">{slot.role}</p>
        <p className="truncate text-[11px] font-black text-gray-800">{slot.name ?? "—"}</p>
        <p className="font-mono text-[9px] text-gray-400">
          {slot.signedAt
            ? new Date(slot.signedAt).toLocaleString(undefined, {
                year: "numeric", month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit", hour12: false
              })
            : "Not signed"}
        </p>
      </div>
    </div>
  );
}

export function DocumentSignatures({
  author, counter, onSign, context, className = ""
}: DocumentSignaturesProps) {
  const [padOpen, setPadOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const canSign = !!onSign && !counter.image;

  return (
    <div className={className}>
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
        Signatures
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Slot slot={author}  placeholder="Unsigned" />
        <Slot slot={counter} placeholder={canSign ? "Awaiting countersignature" : "Unsigned"} />
      </div>

      {canSign && (
        <button
          type="button"
          onClick={() => setPadOpen(true)}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400"
        >
          <PenLine size={14} /> {busy ? "Saving..." : "Countersign this document"}
        </button>
      )}

      {counter.image && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl border border-ok-200 bg-ok-50 px-3 py-2 text-[10px] font-bold text-ok-700">
          <ShieldCheck size={13} />
          Countersigned by {counter.name ?? "an administrator"} — this document is closed.
        </p>
      )}

      <SignaturePad
        open={padOpen}
        onClose={() => setPadOpen(false)}
        signerName={counter.name ?? undefined}
        context={context}
        confirmLabel="Countersign"
        onConfirm={async (result) => {
          setPadOpen(false);
          if (!onSign) return;
          setBusy(true);
          try { await onSign(result); } finally { setBusy(false); }
        }}
      />
    </div>
  );
}
