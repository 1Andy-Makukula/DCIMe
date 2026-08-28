import type * as THREE_NS from "three";
import type { GLTFLoader as GLTFLoaderType } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AssetModel } from "@/domain/assetModels";

// ─────────────────────────────────────────────────────────────────────────────
// Loading the equipment models once, and turning them into pictures.
//
// WHY THUMBNAILS RATHER THAN A CANVAS PER CARD
// A browser allows a limited number of live WebGL contexts — around sixteen in
// Chrome — and silently DISCARDS the oldest when a page asks for more. A site
// overview showing eight equipment categories, each in its own canvas, sits
// right on that limit; add a room breakdown below it and cards start rendering
// blank with no error anywhere.
//
// So a model is rendered ONCE, through a single shared offscreen renderer, into
// a data URL that is cached for the session. A grid then displays ordinary
// <img> elements: no context per card, no per-frame cost, and the picture is
// identical every time. Live interactive canvases are reserved for the one
// place a person actually rotates something — the asset detail view.
//
// WHY three IS IMPORTED AT RUNTIME, NOT AT THE TOP
// three is roughly 600 kB. Imported statically it lands in the main bundle and
// every technician loading the field portal on mobile data in a plant room pays
// for a 3D viewer that only the admin analytics screens ever open. The type
// import above is erased at build time; the real module is fetched the first
// time something actually asks for a model.
//
// WHY THE GEOMETRY IS CACHED SEPARATELY FROM THE PICTURE
// Seven air conditioners in a room are one CRAC model. Parsing that file seven
// times to draw seven identical thumbnails would be seven multi-megabyte
// decodes for one image. loadModel() de-duplicates by URL and returns the same
// parsed scene, so the cost is paid once per file per session.
// ─────────────────────────────────────────────────────────────────────────────

/** Parsed scenes, keyed by URL. Shared by every caller in the session. */
const scenes = new Map<string, Promise<THREE_NS.Group>>();

/** Rendered pictures, keyed by URL and size. */
const thumbnails = new Map<string, Promise<string>>();

let threeModule: Promise<typeof THREE_NS> | null = null;
let loaderPromise: Promise<GLTFLoaderType> | null = null;
let renderer: THREE_NS.WebGLRenderer | null = null;
let webglChecked = false;
let webglOk = false;

/** The three module, fetched once and shared. */
export function three(): Promise<typeof THREE_NS> {
  if (!threeModule) threeModule = import("three");
  return threeModule;
}

/**
 * Whether this browser can render at all.
 *
 * Checked by actually asking for a context rather than sniffing the user agent:
 * remote desktop sessions and locked-down machines report a modern browser and
 * still refuse WebGL, and a thrown exception mid-render is a much worse way to
 * find out. Deliberately synchronous so a component can decide whether to show
 * its fallback without waiting on a 600 kB download.
 */
export function isWebGLAvailable(): boolean {
  if (webglChecked) return webglOk;
  webglChecked = true;
  try {
    const canvas = document.createElement("canvas");
    webglOk = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    webglOk = false;
  }
  return webglOk;
}

function getLoader(): Promise<GLTFLoaderType> {
  if (!loaderPromise) {
    loaderPromise = import("three/examples/jsm/loaders/GLTFLoader.js")
      .then((m) => new m.GLTFLoader());
  }
  return loaderPromise;
}

/**
 * The one renderer every thumbnail goes through.
 *
 * preserveDrawingBuffer is required: without it the colour buffer may be
 * cleared before toDataURL() reads it, and thumbnails come back transparent on
 * some drivers while working perfectly on others.
 */
async function getRenderer(size: number): Promise<THREE_NS.WebGLRenderer> {
  const THREE = await three();
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true
    });
    // Capped rather than devicePixelRatio: these are decorative thumbnails and
    // a 3x retina render of eight models is real time on a laptop GPU.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }
  renderer.setSize(size, size, false);
  return renderer;
}

/** The parsed scene for a model, loaded at most once per URL. */
export function loadModel(url: string): Promise<THREE_NS.Group> {
  const hit = scenes.get(url);
  if (hit) return hit;

  const pending = getLoader().then(
    (gltfLoader) =>
      new Promise<THREE_NS.Group>((resolve, reject) => {
        gltfLoader.load(
          url,
          (gltf) => resolve(gltf.scene),
          undefined,
          (err) => reject(err instanceof Error ? err : new Error(`Could not load ${url}`))
        );
      })
  );

  // Cached before it settles so concurrent callers share one request. A failure
  // is evicted, or a transient network error would poison the model for the
  // rest of the session.
  scenes.set(url, pending);
  pending.catch(() => scenes.delete(url));
  return pending;
}

/**
 * Frames the whole object regardless of the units it was authored in.
 *
 * The models come from different sources and are not on a common scale — the
 * sensor is a few centimetres across and the generator is metres. Fitting to
 * the bounding sphere means every category is drawn the same size on screen,
 * which is what makes a row of category cards look deliberate.
 */
export async function frameObject(
  object: THREE_NS.Object3D,
  camera: THREE_NS.PerspectiveCamera
): Promise<THREE_NS.Vector3 | null> {
  const THREE = await three();
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const centre = sphere.center;
  const radius = sphere.radius || 1;

  // A three-quarter view: a straight-on elevation of a rectangular box reads as
  // a grey rectangle and tells nobody what they are looking at.
  const dir = new THREE.Vector3(1, 0.62, 1).normalize();
  const distance = radius / Math.sin((camera.fov * Math.PI) / 360);

  camera.position.copy(centre).addScaledVector(dir, distance * 1.25);
  camera.near = Math.max(distance - radius * 4, 0.01);
  camera.far = distance + radius * 4;
  camera.updateProjectionMatrix();
  camera.lookAt(centre);

  return centre;
}

/** Neutral studio lighting — the model carries its own colour, we only reveal it. */
export async function lightScene(scene: THREE_NS.Scene): Promise<void> {
  const THREE = await three();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(-4, 1, -3);
  scene.add(fill);
}

/**
 * A model as a PNG data URL, rendered once and cached.
 *
 * Rejects rather than returning a placeholder: the caller already has a lucide
 * icon to fall back to, and a broken-image glyph is worse than the icon that
 * was there before the model existed.
 */
export function modelThumbnail(model: AssetModel, size = 160): Promise<string> {
  const key = `${model.url}@${size}`;
  const hit = thumbnails.get(key);
  if (hit) return hit;

  if (!isWebGLAvailable()) {
    return Promise.reject(new Error("WebGL is not available"));
  }

  const pending = (async () => {
    const THREE = await three();
    const source = await loadModel(model.url);

    const scene = new THREE.Scene();
    await lightScene(scene);

    // Cloned so a thumbnail render can never mutate the shared cached scene —
    // the detail viewer tints materials on the same object.
    const object = source.clone(true);
    scene.add(object);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    await frameObject(object, camera);

    const r = await getRenderer(size);
    r.render(scene, camera);
    const url = r.domElement.toDataURL("image/png");

    // The scene is discarded; only the picture is kept. Holding the clone would
    // multiply the geometry already cached in loadModel() by every size asked for.
    scene.clear();
    return url;
  })();

  thumbnails.set(key, pending);
  pending.catch(() => thumbnails.delete(key));
  return pending;
}

/**
 * Warms the cache for a set of models without blocking anything.
 *
 * Called by a screen that knows what it is about to show, so the pictures are
 * ready before the cards scroll into view. Failures are swallowed on purpose:
 * this is an optimisation, and nothing downstream should break because a
 * decorative render did not happen.
 */
export function preloadThumbnails(models: readonly AssetModel[], size = 160): void {
  for (const m of models) {
    // Heavy models are deliberately not warmed in bulk. rack.glb is 20 MB and
    // preloading it alongside seven others would stall the tab on a phone
    // tethered in a plant room.
    if (m.heavy) continue;
    modelThumbnail(m, size).catch(() => undefined);
  }
}
