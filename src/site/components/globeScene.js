// WHAT THIS FILE DOES
// The 3D Earth on the About page (drawn for WorldGlobe.jsx), built directly
// on three.js: the sphere wearing the black-soil picture, a thin
// atmosphere rim, one warm light that keeps the side under the page's
// words in shade, the arcs from an event to the countries that buy its
// food (a faint route and a bright "shipment" dash travelling along it),
// the rings that pulse out from armed conflicts and red alerts, and the
// drag-to-turn controls. It is downloaded only when the globe is about to
// be drawn (WorldGlobe.jsx imports it after the page's first paint).
//
// It never draws by itself: WorldGlobe owns the one animation loop and
// calls render() only when something changed or moves, so a still globe
// costs nothing.
//
// The scene's axes and units are three-globe's (the library the first
// globe used), so the earlier tuning carries over: radius 100, y towards
// the north pole, longitude 0 towards +z, camera "altitude" in Earth radii.
// The atmosphere's shader and the arcs' curve and dash shader are adapted
// from three-globe (MIT licence, Vasco Asturiano).
//
// WHO EDITS IT
// Whoever works on the globe's look. Colours are hex here because the
// shaders cannot read the site's CSS variables; the page's colours are in
// src/site/site.css.

import {
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CubicBezierCurve3,
  DirectionalLight,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FOV, toVector } from "./globeMath.js";

export const RADIUS = 100;

const KEY_LIGHT = { landscape: [2.6, 0.6, 0.2], portrait: [0.9, 2.6, 0.5] }; // camera space, in radii
const ARC_COLOUR = [0xf1 / 255, 0xe3 / 255, 0xbf / 255]; // #f1e3bf, written as the screen shows it
const ATMOSPHERE = { color: "#a9c1d6", altitude: 0.13 };
const RING = { maxDeg: 3.4, degPerSec: 1.3, altitude: 0.0025, segments: 64 };
const RING_LIFE_MS = (RING.maxDeg / RING.degPerSec) * 1000;
const SHIP_MS = 2200; // a shipment dash runs the length of its arc in 2.2 s

function polar(lat, lng, altitude = 0) {
  const [x, y, z] = toVector(lat, lng);
  const r = RADIUS * (1 + altitude);
  return new Vector3(x * r, y * r, z * r);
}

function viewOf(position) {
  const r = position.length();
  const phi = Math.acos(Math.max(-1, Math.min(1, position.y / r)));
  const theta = Math.atan2(position.z, position.x);
  let lng = 90 - (theta * 180) / Math.PI;
  lng = ((lng + 180) % 360 + 360) % 360 - 180;
  return { lat: 90 - (phi * 180) / Math.PI, lng, altitude: r / RADIUS - 1 };
}

// ---------- The atmosphere: a glow just outside the limb ----------

const glowVertex = `
uniform float hollowRadius;
varying vec3 vVertexWorldPosition;
varying vec3 vVertexNormal;
varying float vCameraDistanceToObjCenter;
varying float vVertexAngularDistanceToHollowRadius;
void main() {
  vVertexNormal = normalize(normalMatrix * normal);
  vVertexWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 objCenterViewPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vCameraDistanceToObjCenter = length(objCenterViewPosition);
  float edgeAngle = atan(hollowRadius / vCameraDistanceToObjCenter);
  float vertexAngle = acos(dot(normalize(modelViewMatrix * vec4(position, 1.0)), normalize(objCenterViewPosition)));
  vVertexAngularDistanceToHollowRadius = vertexAngle - edgeAngle;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const glowFragment = `
uniform vec3 color;
uniform float coefficient;
uniform float power;
uniform float hollowRadius;
varying vec3 vVertexNormal;
varying vec3 vVertexWorldPosition;
varying float vCameraDistanceToObjCenter;
varying float vVertexAngularDistanceToHollowRadius;
void main() {
  if (vCameraDistanceToObjCenter < hollowRadius) discard;
  if (vVertexAngularDistanceToHollowRadius < 0.0) discard;
  vec3 worldCameraToVertex = vVertexWorldPosition - cameraPosition;
  vec3 viewCameraToVertex = normalize((viewMatrix * vec4(worldCameraToVertex, 0.0)).xyz);
  float intensity = pow(coefficient + dot(vVertexNormal, viewCameraToVertex), power);
  gl_FragColor = vec4(color, intensity);
}`;

function atmosphere(sphereGeometry) {
  const geometry = sphereGeometry.clone();
  const pos = geometry.attributes.position.array;
  const nor = geometry.attributes.normal.array;
  const grown = new Float32Array(pos.length);
  const size = RADIUS * ATMOSPHERE.altitude;
  for (let i = 0; i < pos.length; i++) grown[i] = pos[i] + nor[i] * size;
  geometry.setAttribute("position", new BufferAttribute(grown, 3));
  const material = new ShaderMaterial({
    depthWrite: false,
    transparent: true,
    side: BackSide,
    vertexShader: glowVertex,
    fragmentShader: glowFragment,
    uniforms: {
      coefficient: { value: 0.1 },
      color: { value: new Color(ATMOSPHERE.color) },
      power: { value: 3.5 },
      hollowRadius: { value: RADIUS },
    },
  });
  return new Mesh(geometry, material);
}

// ---------- Arcs: a tube along a raised curve, drawn in dashes ----------

const arcVertex = `
uniform float dashTranslate;
attribute float relDistance;
varying float vRelDistance;
void main() {
  vRelDistance = relDistance + dashTranslate;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const arcFragment = `
uniform vec3 color;
uniform float opacity;
uniform float dashOffset;
uniform float dashSize;
uniform float gapSize;
varying float vRelDistance;
void main() {
  if (vRelDistance < dashOffset) discard;
  if (mod(vRelDistance - dashOffset, dashSize + gapSize) > dashSize) discard;
  gl_FragColor = vec4(color, opacity);
}`;

const TUBE_SEGMENTS = 64;
const TUBE_SIDES = 6;

// Along the great circle, lifted in proportion to its length (three-globe's
// arcAltitudeAutoScale), as a cubic curve through two raised points.
function arcCurve(start, end, autoScale) {
  const a = new Vector3(...toVector(start.lat, start.lng));
  const b = new Vector3(...toVector(end.lat, end.lng));
  const angle = a.angleTo(b);
  const lift = (angle / 2) * autoScale * 1.5;
  const along = (t) => {
    if (angle < 1e-6) return a.clone();
    const s = Math.sin(angle);
    return a.clone().multiplyScalar(Math.sin((1 - t) * angle) / s).add(b.clone().multiplyScalar(Math.sin(t * angle) / s));
  };
  const at = (v, altitude) => v.clone().normalize().multiplyScalar(RADIUS * (1 + altitude));
  return new CubicBezierCurve3(at(a, 0), at(along(0.25), lift), at(along(0.75), lift), at(b, 0));
}

function arcMesh(arc, autoScale) {
  const curve = arcCurve({ lat: arc.startLat, lng: arc.startLng }, { lat: arc.endLat, lng: arc.endLng }, autoScale);
  const geometry = new TubeGeometry(curve, TUBE_SEGMENTS, arc.stroke / 2, TUBE_SIDES, false);
  const count = geometry.attributes.position.count;
  const rel = new Float32Array(count);
  // From the far end back to the start, so the dashes travel outwards.
  for (let i = 0; i < count; i++) rel[i] = 1 - Math.floor(i / (TUBE_SIDES + 1)) / TUBE_SEGMENTS;
  geometry.setAttribute("relDistance", new BufferAttribute(rel, 1));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: arcVertex,
    fragmentShader: arcFragment,
    uniforms: {
      color: { value: new Vector3(...ARC_COLOUR) },
      opacity: { value: arc.opacity },
      dashOffset: { value: arc.dashOffset || 0 },
      dashSize: { value: arc.dashSize ?? 1 },
      gapSize: { value: arc.gapSize ?? 0 },
      dashTranslate: { value: 0 },
    },
  });
  const mesh = new Mesh(geometry, material);
  mesh.userData = { arc };
  mesh.renderOrder = arc.kind === "ship" ? 3 : 2;
  return mesh;
}

// ---------- The scene ----------

// width, height: the canvas in CSS pixels; offset: where the sphere's centre
// sits from the canvas's centre; view: { lat, lng, altitude }; light:
// "landscape" | "portrait"; fine: a mouse (Phong shading and the water's
// glint) or a finger (plain shading); still: true when drawing the still
// picture (keeps the drawing for reading back, pixel ratio 1).
export function createGlobeScene(host, { width, height, offset = [0, 0], view, light = "landscape", fine = true, dpr = 1, still = false, fov = FOV, onContextLost } = {}) {
  const ratio = still ? 1 : Math.min(1.5, dpr || 1);
  const renderer = new WebGLRenderer({ antialias: still || (dpr || 1) < 1.5, alpha: true, preserveDrawingBuffer: !!still });
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.display = "block";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  let disposed = false;
  const onLost = (event) => {
    event.preventDefault();
    if (!disposed) onContextLost?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, width / height, 1, 4000);
  scene.add(camera);

  // The light: soft all round, and one warm key light carried by the camera
  // (so the shade stays on the words' side whichever way the globe turns).
  scene.add(new AmbientLight(0xffffff, Math.PI * 0.34));
  const key = new DirectionalLight(0xfff1dc, Math.PI * 1.25);
  camera.add(key);
  const aim = new Object3D();
  scene.add(aim);
  key.target = aim;
  const setLight = (mode) => {
    const [x, y, z] = KEY_LIGHT[mode] || KEY_LIGHT.landscape;
    key.position.set(x * RADIUS, y * RADIUS, z * RADIUS);
  };
  setLight(light);

  // The Earth.
  const sphereGeometry = new SphereGeometry(RADIUS, 90, 45);
  const material = fine ? new MeshPhongMaterial({ color: 0xffffff, specular: new Color("#3a4652"), shininess: 16 }) : new MeshLambertMaterial({ color: 0xffffff });
  const earth = new Mesh(sphereGeometry, material);
  earth.rotation.y = -Math.PI / 2; // the picture's longitude 0 faces +z
  scene.add(earth);
  scene.add(atmosphere(sphereGeometry));

  const arcGroup = new Group();
  scene.add(arcGroup);
  const ringGroup = new Group();
  scene.add(ringGroup);

  // Camera and controls.
  let size = { width, height };
  const applyOffset = (o) => {
    const [ox, oy] = o || [0, 0];
    if (ox || oy) camera.setViewOffset(size.width, size.height, -ox, -oy, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  applyOffset(offset);

  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minPolarAngle = (25 * Math.PI) / 180; // latitude 65° north
  controls.maxPolarAngle = (155 * Math.PI) / 180; // latitude 65° south
  controls.target.set(0, 0, 0);
  // The page scrolls under the wheel (zoom is off), and a finger moving up
  // or down scrolls the page too; sideways it turns the globe.
  canvas.removeEventListener("wheel", controls._onMouseWheel);
  canvas.style.touchAction = "pan-y pinch-zoom";

  const setView = ({ lat, lng, altitude }) => {
    camera.position.copy(polar(lat, lng, altitude));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  };
  if (view) setView(view);
  // A drag of the full sphere's width turns it about as far as the finger went.
  const setDragSpeed = () => {
    const alt = camera.position.length() / RADIUS - 1;
    const half = Math.asin(1 / (1 + alt));
    const sphereRadiusPx = (size.height / 2 / Math.tan((camera.fov * Math.PI) / 360)) * Math.tan(half);
    controls.rotateSpeed = size.height / (2 * Math.PI * Math.max(40, sphereRadiusPx));
  };
  setDragSpeed();

  // ---------- Pictures ----------

  // The image arrives decoded (WorldGlobe decodes it while this file loads);
  // it is drawn the right way up by the texture's own transform, so the
  // upload is a plain copy.
  const textures = new Set();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function textureFrom(image, { colour = true } = {}) {
    const texture = new Texture(image);
    texture.flipY = false;
    texture.repeat.set(1, -1);
    texture.offset.set(0, 1);
    if (colour) texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(8, maxAniso);
    texture.needsUpdate = true;
    textures.add(texture);
    return texture;
  }

  function setSkin(texture) {
    material.map = texture;
    material.needsUpdate = true;
  }

  function setWater(texture) {
    if (!fine) return;
    material.specularMap = texture;
    material.needsUpdate = true;
  }

  // Sends a picture to the graphics card now, so the first frame does not.
  function upload(texture) {
    renderer.initTexture(texture);
  }

  // ---------- Arcs ----------

  let arcs = [];
  function setArcs(list) {
    for (const mesh of arcs) {
      arcGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    arcs = (list || []).map((arc) => arcMesh(arc, arc.autoScale ?? 0.32));
    for (const mesh of arcs) arcGroup.add(mesh);
  }

  // shipping: dashes run; routeOpacity: the faint line under them; bright:
  // the buyer whose row the pointer is on.
  function styleArcs({ routeOpacity, shipping, bright = null }) {
    for (const mesh of arcs) {
      const { arc } = mesh.userData;
      const lit = bright && arc.iso3 === bright;
      if (arc.kind === "ship") {
        mesh.visible = shipping;
        mesh.material.uniforms.opacity.value = lit ? 1 : arc.opacity;
      } else {
        mesh.material.uniforms.opacity.value = lit ? 1 : routeOpacity;
      }
    }
  }

  // Points along an arc's curve (to see where it would pass on the screen).
  function arcPoints(arc, count = 12) {
    return arcCurve({ lat: arc.startLat, lng: arc.startLng }, { lat: arc.endLat, lng: arc.endLng }, arc.autoScale ?? 0.32).getPoints(count);
  }

  function moveDashes(ms) {
    const shift = ms / SHIP_MS;
    for (const mesh of arcs) if (mesh.userData.arc.kind === "ship") mesh.material.uniforms.dashTranslate.value = shift % 1e6;
  }

  // ---------- Rings ----------

  const circle = new BufferGeometry();
  {
    const points = new Float32Array((RING.segments + 1) * 3);
    for (let i = 0; i <= RING.segments; i++) {
      const a = (i / RING.segments) * Math.PI * 2;
      points[i * 3] = Math.cos(a);
      points[i * 3 + 1] = Math.sin(a);
    }
    circle.setAttribute("position", new BufferAttribute(points, 3));
  }
  const ringSources = new Map(); // id -> { group, lines: [Line, Line], period, colour, alpha }
  function setRings(list) {
    const keep = new Set((list || []).map((r) => r.id));
    for (const [id, src] of ringSources) {
      if (keep.has(id)) continue;
      ringGroup.remove(src.group);
      for (const line of src.lines) line.material.dispose();
      ringSources.delete(id);
    }
    for (const r of list || []) {
      let src = ringSources.get(r.id);
      if (!src) {
        const group = new Group();
        group.position.copy(polar(r.lat, r.lng, RING.altitude));
        group.lookAt(0, 0, 0);
        const lines = [0, 1].map(() => {
          const line = new Line(circle, new LineBasicMaterial({ color: new Color(r.colour), transparent: true, opacity: 0, depthWrite: false }));
          line.visible = false;
          group.add(line);
          return line;
        });
        ringGroup.add(group);
        src = { group, lines };
        ringSources.set(r.id, src);
      }
      src.period = r.period;
      src.alpha = r.alpha;
      src.phase = r.phase || 0;
      src.shown = r.shown !== false;
    }
  }

  // ms: the rings' own clock. Each source starts a ring every `period` ms;
  // a ring spreads to 3.4° at 1.3°/s and fades out as it goes.
  const curveR = RADIUS * (1 + RING.altitude);
  function moveRings(ms) {
    for (const src of ringSources.values()) {
      const age0 = (((ms - src.phase) % src.period) + src.period) % src.period;
      src.lines.forEach((line, k) => {
        const age = age0 + k * src.period;
        if (!src.shown || age >= RING_LIFE_MS) {
          line.visible = false;
          return;
        }
        const t = age / RING_LIFE_MS;
        const ang = ((t * RING.maxDeg) * Math.PI) / 180;
        line.scale.set(curveR * Math.sin(ang), curveR * Math.sin(ang), 1);
        line.position.z = curveR * (1 - Math.cos(ang));
        line.material.opacity = (1 - t) * src.alpha;
        line.visible = true;
      });
    }
  }

  function showRing(id, shown) {
    const src = ringSources.get(id);
    if (src) src.shown = shown;
  }

  // ---------- Reading the view ----------

  const tmp = new Vector3();
  // A place as a point in the scene (worked out once per marker).
  function point(lat, lng, altitude = 0.006) {
    return polar(lat, lng, altitude);
  }

  // Where a point is on the canvas (CSS pixels from its top-left), and
  // whether it is on the side facing the camera.
  function projectPoint(p) {
    const cam = camera.position;
    const d = cam.length();
    const facing = p.dot(cam) / (p.length() * d);
    tmp.copy(p).project(camera);
    return { x: ((tmp.x + 1) / 2) * size.width, y: ((1 - tmp.y) / 2) * size.height, visible: facing > RADIUS / d + 0.005 };
  }

  function project(lat, lng, altitude = 0.006) {
    return projectPoint(polar(lat, lng, altitude));
  }

  function resize(w, h, o) {
    size = { width: w, height: h };
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    applyOffset(o);
    setDragSpeed();
  }

  // The camera's matrices after the controls or a flight moved it, so the
  // markers are projected from where it is now.
  function syncCamera() {
    camera.updateMatrixWorld();
  }

  function render() {
    if (disposed) return;
    renderer.render(scene, camera);
  }

  function compile() {
    return typeof renderer.compileAsync === "function" ? renderer.compileAsync(scene, camera) : Promise.resolve();
  }

  // Everything this scene made, given back, then the drawing context itself.
  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener("webglcontextlost", onLost);
    controls.dispose();
    setArcs([]);
    setRings([]);
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const list = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of list) m.dispose();
      }
    });
    circle.dispose();
    for (const t of textures) {
      const img = t.image;
      t.dispose();
      if (img && typeof img.close === "function") img.close();
    }
    textures.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }

  return {
    canvas,
    camera,
    controls,
    renderer,
    get size() {
      return size;
    },
    setLight,
    setView,
    getView: () => viewOf(camera.position),
    setDragSpeed,
    textureFrom,
    setSkin,
    setWater,
    upload,
    setArcs,
    arcPoints,
    styleArcs,
    moveDashes,
    setRings,
    moveRings,
    showRing,
    point,
    projectPoint,
    project,
    resize,
    syncCamera,
    render,
    compile,
    dispose,
  };
}
