import { useEffect, useRef, useState, type ReactNode } from "react";
import type * as THREE_NS from "three";
import type { AssetModel } from "@/domain/assetModels";
import { hex } from "@/shared/theme/palette";
import { STATUS_TONE, type ReadingStatus } from "@/domain/readingStatus";
import { isWebGLAvailable, loadModel, three, lightScene } from "./modelCache";

// ─────────────────────────────────────────────────────────────────────────────
// The one model a person can actually turn around.
//
// ONE OF THESE PER SCREEN
// This holds a live WebGL context, and a browser will silently discard the
// oldest once a page holds too many. Grids use AssetModelThumb, which is a
// picture; this is for the asset detail view, where somebody has chosen a
// single machine and wants to look at it.
//
// THE RENDER LOOP STOPS WHEN NOBODY IS LOOKING
// Scrolled out of view and the loop is torn down. A permanently spinning canvas
// on an admin dashboard is a laptop fan on a desk nobody is sitting at.
//
// STATUS IS A LIGHT, NOT A REPAINT
// A breach tints the scene's rim light rather than recolouring the model's own
// materials. Repainting the body would misrepresent the equipment — a red UPS
// is a UPS somebody has painted red — whereas a machine lit red reads as a
// machine in an alarm state, which is what actually happened.
// ─────────────────────────────────────────────────────────────────────────────

export interface AssetModelViewProps {
  model: AssetModel | null;
  /** Colours the rim light. Null leaves the scene neutral. */
  status?: ReadingStatus | null;
  height?: number;
  /** Slow idle rotation, paused while the viewer is dragging. */
  spin?: boolean;
  /** Shown when there is no model, or WebGL is unavailable. */
  fallback?: ReactNode;
  className?: string;
}

/** Which token lights the scene for each state. */
const STATUS_LIGHT: Record<ReadingStatus, string> = {
  ok:      "--color-ok-400",
  warn:    "--color-warn-400",
  breach:  "--color-danger-500",
  unknown: "--color-neutral-400"
};

export function AssetModelView({
  model, status = null, height = 260, spin = true, fallback, className = ""
}: AssetModelViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rimRef   = useRef<THREE_NS.DirectionalLight | null>(null);
  const [failed, setFailed] = useState(false);

  // Rebuilds only when the MODEL changes. Status is applied through the ref
  // below, so changing it recolours the light without tearing down the scene
  // and losing wherever the viewer had rotated to.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !model || !isWebGLAvailable()) return;

    let disposed = false;
    let frameId = 0;
    let renderer: THREE_NS.WebGLRenderer | null = null;
    let controls: { update(): void; dispose(): void; autoRotate: boolean;
                    addEventListener(t: string, f: () => void): void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;

    (async () => {
      const [THREE, { OrbitControls }, source] = await Promise.all([
        three(),
        import("three/examples/jsm/controls/OrbitControls.js"),
        loadModel(model.url)
      ]).catch((e) => { throw e; });

      if (disposed) return;

      const scene = new THREE.Scene();
      await lightScene(scene);
      if (disposed) return;

      const rim = new THREE.DirectionalLight(0xffffff, 0.0);
      rim.position.set(-4, 2, -4);
      scene.add(rim);
      rimRef.current = rim;

      const object = source.clone(true);
      scene.add(object);

      // Same framing rule as the thumbnails: the models are authored at wildly
      // different scales and must all arrive the same size on screen.
      const box = new THREE.Box3().setFromObject(object);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = sphere.radius || 1;

      const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
      const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
      camera.position
        .copy(sphere.center)
        .addScaledVector(new THREE.Vector3(1, 0.62, 1).normalize(), distance * 1.3);
      camera.near = Math.max(distance - radius * 4, 0.01);
      camera.far  = distance + radius * 4;

      const width = mount.clientWidth || 300;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = `${height}px`;
      renderer.domElement.style.cursor = "grab";

      const orbit = new OrbitControls(camera, renderer.domElement);
      orbit.target.copy(sphere.center);
      orbit.enableDamping = true;
      orbit.enablePan = false;
      // Zoom is disabled deliberately: the value of this view is recognising the
      // machine, and a viewer who scrolls the page over the canvas should scroll
      // the page rather than silently zoom into a housing.
      orbit.enableZoom = false;
      orbit.autoRotate = spin;
      orbit.autoRotateSpeed = 0.6;
      orbit.update();
      controls = orbit;

      let running = false;
      const loop = () => {
        if (disposed || !renderer) return;
        orbit.update();
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(loop);
      };
      const start = () => { if (!running) { running = true; loop(); } };
      const stop  = () => { running = false; cancelAnimationFrame(frameId); };

      // Only render while genuinely on screen.
      if (typeof IntersectionObserver !== "undefined") {
        io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) start();
          else stop();
        });
        io.observe(mount);
      } else {
        start();
      }

      // Dragging beats idle rotation: a viewer who has taken hold of the model
      // should not have it drift under their finger.
      orbit.addEventListener("start", () => { orbit.autoRotate = false; });
      orbit.addEventListener("end",   () => { orbit.autoRotate = spin; });

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          if (!renderer || !mount.clientWidth) return;
          renderer.setSize(mount.clientWidth, height, false);
          camera.aspect = mount.clientWidth / height;
          camera.updateProjectionMatrix();
        });
        resizeObserver.observe(mount);
      }
    })().catch(() => { if (!disposed) setFailed(true); });

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      io?.disconnect();
      resizeObserver?.disconnect();
      controls?.dispose();
      // The context has to be released explicitly. Without this, navigating
      // between assets leaks one context per visit and the canvases eventually
      // stop drawing with nothing in the console to explain it.
      if (renderer) {
        renderer.domElement.remove();
        renderer.dispose();
        renderer.forceContextLoss();
      }
      rimRef.current = null;
    };
  }, [model, height, spin]);

  // Status changes recolour the existing light in place.
  useEffect(() => {
    const rim = rimRef.current;
    if (!rim) return;
    if (!status || status === "unknown") {
      rim.intensity = 0;
      return;
    }
    rim.color.set(hex(`var(${STATUS_LIGHT[status]})`, "#ffffff"));
    // Enough to read as a coloured edge, not enough to repaint the machine.
    rim.intensity = status === "breach" ? 2.4 : 1.4;
  }, [status]);

  if (!model || failed || !isWebGLAvailable()) {
    return (
      <div
        style={{ height }}
        className={`grid place-items-center rounded-2xl border border-dashed border-neutral-200 ${className}`}
      >
        {fallback}
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      style={{ height }}
      className={`overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 ${className}`}
      // The canvas is decoration around data that is already on the page in
      // words and numbers; it carries nothing a screen reader needs.
      aria-hidden="true"
      title={status ? STATUS_TONE[status].label : model.label}
    />
  );
}
