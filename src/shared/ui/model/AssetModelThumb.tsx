import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AssetModel } from "@/domain/assetModels";
import { isWebGLAvailable, modelThumbnail } from "./modelCache";

// ─────────────────────────────────────────────────────────────────────────────
// A category's model, as a picture, in a grid.
//
// Renders nothing of its own until the card is actually on screen. The site
// overview lists every room and every category in it; loading eight models —
// one of them 20 MB — the moment the route mounts would stall the tab before a
// single reading is drawn.
//
// The icon is not a placeholder, it is the FALLBACK, and it is what shows when
// the model has not arrived, cannot be rendered, or does not exist for this
// category at all. A card must never be a blank square waiting for WebGL.
// ─────────────────────────────────────────────────────────────────────────────

export interface AssetModelThumbProps {
  /** Null where no model depicts this category — the icon then stands alone. */
  model: AssetModel | null;
  /** Rendered while loading, on failure, and when model is null. */
  fallback: ReactNode;
  /** Rendered size in CSS pixels. */
  size?: number;
  /** What the picture shows, for screen readers. */
  alt?: string;
  className?: string;
}

export function AssetModelThumb({
  model, fallback, size = 96, alt, className = ""
}: AssetModelThumbProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  // Only ask for the render once the card is near the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    // No IntersectionObserver (older embedded browsers) means render eagerly
    // rather than never — a missing optimisation beats a missing picture.
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !model || !isWebGLAvailable()) return;
    let cancelled = false;

    modelThumbnail(model, size * 2)
      .then((url) => { if (!cancelled) setSrc(url); })
      // Silent: the icon is already on screen and is a complete answer. A
      // console error per card would bury real problems in decoration noise.
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [visible, model, size]);

  return (
    <div
      ref={ref}
      style={{ width: size, height: size }}
      className={`grid shrink-0 place-items-center ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? model?.label ?? ""}
          width={size}
          height={size}
          className="h-full w-full object-contain"
          // Decorative duplicate of the label beside it; announcing both makes
          // a screen reader say every asset's category twice.
          aria-hidden={alt ? undefined : true}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
