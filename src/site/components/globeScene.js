// WHAT THIS FILE DOES
// The 3D Earth on the About page (drawn for WorldGlobe.jsx), built directly
// on three.js: the sphere wearing the black-soil picture, a thin
// atmosphere rim, one warm light from just above the visitor's shoulder (so
// the side the visitor sees is lit, and only the far edge falls into a soft
// shade), the arcs from an event to the countries whose food depends on it
// (a faint route and a bright "shipment" dash travelling along it), the
// rings that pulse out from armed conflicts and red alerts, and the
// drag-to-turn controls (which also take a two-finger pinch on a touch
// screen, between the zoom limits WorldGlobe sets with setZoomLimits; the
// wheel and a trackpad pinch are WorldGlobe's own, through setAltitude, so
// a plain scroll can still move the page). It is downloaded only when the
// globe is about to be drawn (WorldGlobe.jsx imports it once the still
// picture is on screen).
//
// It never draws by itself: WorldGlobe owns the one animation loop and
// calls render() only when something changed or moves, so a still globe
// costs nothing. The arcs' few drawing materials are kept and used again
// from one stop to the next, so the graphics card builds their program once
// per visit; dispose() gives everything back, including the key listener
// the drag controls put on the page itself.
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

// The light. The key light's place is in the camera's own space, in Earth
// radii (x to the right, y up, z towards the visitor): a little above and
// to the right of the camera, so the side facing the visitor is lit and the
// Earth still looks round. The ambient light keeps the far edge from going
// black. (three.js divides both by pi for these materials, so PI * 0.5 is
// half of full light.)
const KEY_LIGHT = { landscape: [0.5, 0.9, 1.2], portrait: [0.4, 1.0, 1.2] };
const AMBIENT = Math.PI * 0.5;
const KEY = Math.PI * 1.1;
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

// One arc's drawing material. All arcs share the same shader code, so while
// any of these materials is kept the graphics card keeps the program built
// for it; the scene keeps a few in a pool and hands them out again.
function arcMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: arcVertex,
    fragmentShader: arcFragment,
    uniforms: {
      color: { value: new Vector3(...ARC_COLOUR) },
      opacity: { value: 1 },
      dashOffset: { value: 0 },
      dashSize: { value: 1 },
      gapSize: { value: 0 },
      dashTranslate: { value: 0 },
    },
  });
}

// The points the arc's line passes through, to see where it would cross the
// screen (the same curve as its tube).
const ARC_SAMPLES = 16;

function arcMesh(arc, autoScale, material) {
  const curve = arcCurve({ lat: arc.startLat, lng: arc.startLng }, { lat: arc.endLat, lng: arc.endLng }, autoScale);
  const geometry = new TubeGeometry(curve, TUBE_SEGMENTS, arc.stroke / 2, TUBE_SIDES, false);
  const count = geometry.attributes.position.count;
  const rel = new Float32Array(count);
  // From the far end back to the start, so the dashes travel outwards.
  for (let i = 0; i < count; i++) rel[i] = 1 - Math.floor(i / (TUBE_SIDES + 1)) / TUBE_SEGMENTS;
  geometry.setAttribute("relDistance", new BufferAttribute(rel, 1));
  const u = material.uniforms;
  u.opacity.value = arc.opacity;
  u.dashOffset.value = arc.dashOffset || 0;
  u.dashSize.value = arc.dashSize ?? 1;
  u.gapSize.value = arc.gapSize ?? 0;
  u.dashTranslate.value = 0;
  const mesh = new Mesh(geometry, material);
  mesh.userData = { arc, points: curve.getPoints(ARC_SAMPLES), blocked: false };
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
  // The page the canvas lives on: the drag controls listen for keys there,
  // and dispose() must reach it even after the page has taken the canvas out.
  const doc = canvas.ownerDocument;

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
  // (so the side the visitor sees stays lit whichever way the globe turns).
  scene.add(new AmbientLight(0xffffff, AMBIENT));
  const key = new DirectionalLight(0xfff1dc, KEY);
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
  // Zoom: a two-finger pinch on a touch screen goes through the controls
  // (fast, between the limits below). The wheel does not: its listener is
  // taken off, so a plain scroll moves the page, and WorldGlobe decides
  // when a wheel or a trackpad pinch zooms the globe instead (setAltitude).
  controls.enableZoom = true;
  controls.zoomSpeed = 1.6;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minPolarAngle = (25 * Math.PI) / 180; // latitude 65° north
  controls.maxPolarAngle = (155 * Math.PI) / 180; // latitude 65° south
  controls.target.set(0, 0, 0);
  canvas.removeEventListener("wheel", controls._onMouseWheel);
  // A finger moving up or down scrolls the page; sideways it turns the
  // globe; two fingers pinching reach the controls (so "pinch-zoom" is not
  // left to the browser, which would zoom the page).
  canvas.style.touchAction = "pan-y";

  const setView = ({ lat, lng, altitude }) => {
    camera.position.copy(polar(lat, lng, altitude));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  };
  if (view) setView(view);

  // The camera's height above the ground, in Earth radii (0.2 shows about
  // one country), keeping the place it looks at.
  const getAltitude = () => camera.position.length() / RADIUS - 1;
  const setAltitude = (altitude) => {
    camera.position.setLength(RADIUS * (1 + Math.max(0.01, altitude)));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  };
  // Where a pinch may take the camera: near and far altitudes. The far
  // limit keeps a little slack above the layout's own height, because a
  // flight between two stops rises up to 15% on the way (globeMath.js
  // viewAlong) and the controls clamp the camera whenever they move it.
  const setZoomLimits = ({ near, far }) => {
    controls.minDistance = RADIUS * (1 + near);
    controls.maxDistance = RADIUS * (1 + far * 1.16);
  };
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
  const spareArcMaterials = []; // kept for the next stop's arcs (see arcMaterial)
  let shippingNow = true;
  function setArcs(list) {
    for (const mesh of arcs) {
      arcGroup.remove(mesh);
      mesh.geometry.dispose();
      spareArcMaterials.push(mesh.material);
    }
    arcs = (list || []).map((arc) => arcMesh(arc, arc.autoScale ?? 0.32, spareArcMaterials.pop() || arcMaterial()));
    for (const mesh of arcs) {
      showArc(mesh);
      arcGroup.add(mesh);
    }
  }

  // A shipment dash shows only while the tour runs; any arc that would cross
  // the page's words is hidden (fitArcs).
  function showArc(mesh) {
    mesh.visible = !mesh.userData.blocked && (mesh.userData.arc.kind !== "ship" || shippingNow);
  }

  // shipping: dashes run; routeOpacity: the faint line under them; bright:
  // the buyer whose row the pointer is on.
  function styleArcs({ routeOpacity, shipping, bright = null }) {
    shippingNow = shipping;
    for (const mesh of arcs) {
      const { arc } = mesh.userData;
      const lit = bright && arc.iso3 === bright;
      mesh.material.uniforms.opacity.value = lit ? 1 : arc.kind === "ship" ? arc.opacity : routeOpacity;
      showArc(mesh);
    }
  }

  // Hides every arc that crosses(points) says crosses something (the words,
  // the controls): it gets the arc's line as points on the canvas (x, y in
  // CSS pixels, and whether each is on the side facing the camera), and is
  // asked again whenever the camera moves, so a turned Earth never draws an
  // arc over the words. A route and its shipment share one answer.
  function fitArcs(crosses) {
    const answers = new Map();
    for (const mesh of arcs) {
      const buyer = mesh.userData.arc.iso3 || mesh.id;
      if (!answers.has(buyer)) answers.set(buyer, !!crosses(mesh.userData.points.map(projectPoint)));
      mesh.userData.blocked = answers.get(buyer);
      showArc(mesh);
    }
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
  // The drag controls put a key listener on the page (to notice the Control
  // key); they take it off the canvas's own page, which is no longer this
  // document once the page has removed the canvas, so it is taken off here
  // too (otherwise the page would keep the whole scene alive).
  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener("webglcontextlost", onLost);
    controls.dispose();
    if (doc) {
      if (typeof controls._interceptControlDown === "function") doc.removeEventListener("keydown", controls._interceptControlDown, { capture: true });
      if (typeof controls._interceptControlUp === "function") doc.removeEventListener("keyup", controls._interceptControlUp, { capture: true });
    }
    setArcs([]);
    for (const m of spareArcMaterials) m.dispose();
    spareArcMaterials.length = 0;
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
    getAltitude,
    setAltitude,
    setZoomLimits,
    setDragSpeed,
    textureFrom,
    setSkin,
    setWater,
    upload,
    setArcs,
    fitArcs,
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
