// WHAT THIS FILE DOES
// Paints the real Earth under the About page's globe (EarthGlobe.jsx draws
// everything else over it, on its own canvas): NASA's Blue Marble picture
// of the whole Earth in August 2004 (public domain; the copies are
// public/site/world/earth-true-<width>.webp), wrapped on a sphere by a small
// WebGL program and seen exactly as d3-geo's orthographic projection sees
// it, so the grid, the black soil, the lines and the dots drawn over it sit
// on the right places.
//
// How: one triangle covers the canvas. For every pixel the program works
// out which place on the Earth lies under it (the same steps as
// shaderPlace in earthMath.js, which the tests check against d3-geo) and
// takes that place's colour from the picture. Then the look, so the globe
// sits calmly on the light page and the dots and lines stand out: the
// picture a little lighter (NASA's deep sea is nearly black) and a little
// less saturated, the sea a calmer blue, a soft light from the upper left,
// a gentle shade towards the edge, a thin veil of air at the very edge, and
// a smooth (anti-aliased) rim. Where the picture's two edges meet (180
// degrees), the program reads it as one piece, so no line shows there.
//
//   const earth = createEarthPainter(canvas, { onLost, onRestored })
//                         null when the browser has no WebGL 2 (or the
//                         program does not build): the globe then shows
//                         its drawn Earth
//   earth.maxTexture      the widest picture the graphics card takes
//   earth.setPicture(img) puts the picture (an <img> or a canvas) on the
//                         graphics card; true when it worked
//   earth.ready           a picture is on the card and drawing works
//   earth.draw(centre, size, dpr)  draws the disc for that turn
//   earth.lost            the browser took the graphics away (the card was
//                         reset, or too many pages use WebGL); onLost is
//                         called then, and onRestored once it is back and
//                         the picture is on the card again
//   earth.look            the look's numbers (LOOK below), for trying
//                         others in the browser (EarthGlobe's debug hooks)
//   earth.dispose()
//
// WHO EDITS IT
// Whoever works on the About page's globe.

import { shaderView } from "./earthMath.js";

// The look, set by eye on the About page beside the owner's reference
// picture (hgis.uw.edu's calm globe), in true colours, and made calmer on
// 1 November 2026 (lighter, softer, less contrast between the lit side and
// the edge, closer to the reference's quiet feel; the lines, the dots and
// the tinted countries still stand out from the sea, the deserts and the
// forests by 3:1 or more):
//   lift        the picture's colours raised to this power (under 1 lightens
//               the dark parts most: the sea and the forests)
//   saturation  1 keeps NASA's colours, 0 makes them grey
//   sea         added to the sea (where blue leads the picture), so it reads
//               as a calm blue rather than near black
//   light       how much lighter the side facing the light (upper left) is
//               than the far side
//   edge        how much darker the disc grows towards its edge
//   air         the veil of air at the edge: its colour and its strength
export const LOOK = Object.freeze({
  lift: 0.72,
  saturation: 0.6,
  sea: [0.12, 0.16, 0.2],
  light: 0.16,
  edge: 0.16,
  air: [0.85, 0.9, 0.95, 0.45],
});

const OPTIONS = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false, // the program smooths the rim itself
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: "low-power",
};

const VERTEX = `#version 300 es
in vec2 a_corner;
void main() {
  gl_Position = vec4(a_corner, 0.0, 1.0);
}
`;

const FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D u_picture;
uniform vec2 u_middle;   // the disc's middle, device pixels from the lower left
uniform float u_radius;  // the disc's radius, device pixels
uniform vec2 u_tilt;     // sine and cosine of the latitude in the middle
uniform float u_lng;     // the longitude in the middle, radians
uniform vec2 u_tone;     // lift, saturation
uniform vec3 u_sea;      // added to the sea
uniform vec2 u_shade;    // light, edge
uniform vec4 u_air;      // the air's colour and strength

out vec4 o_colour;

const float PI = 3.141592653589793;
const vec3 LIGHT = vec3(-0.4706, 0.5294, 0.7059); // from the upper left, in front

void main() {
  // The place under this pixel: shaderPlace in earthMath.js, step for step.
  vec2 p = (gl_FragCoord.xy - u_middle) / u_radius;
  float d2 = dot(p, p);
  float toward = sqrt(max(1.0 - d2, 0.0));
  float x = toward * u_tilt.y - p.y * u_tilt.x;
  float z = toward * u_tilt.x + p.y * u_tilt.y;
  float y = p.x;
  float lat = asin(clamp(z, -1.0, 1.0));
  float lng = atan(y, x) + u_lng;
  vec2 uv = vec2(fract(lng / (2.0 * PI) + 0.5), 0.5 - lat / PI);

  // The picture's colour there. How fast u changes from pixel to pixel picks
  // the picture's sharpness; at the seam (180 degrees) u jumps from 1 to 0,
  // so there the rate is taken from a copy of u that does not jump.
  float u2 = fract(uv.x + 0.5);
  vec2 du = vec2(dFdx(uv.x), dFdy(uv.x));
  vec2 du2 = vec2(dFdx(u2), dFdy(u2));
  if (abs(du2.x) + abs(du2.y) < abs(du.x) + abs(du.y)) du = du2;
  vec2 dv = vec2(dFdx(uv.y), dFdy(uv.y));
  vec3 c = textureGrad(u_picture, uv, vec2(du.x, dv.x), vec2(du.y, dv.y)).rgb;

  // The look.
  c = pow(c, vec3(u_tone.x));
  float sea = smoothstep(0.02, 0.12, c.b - max(c.r, c.g));
  c += u_sea * sea;
  float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(grey), c, u_tone.y);
  float sun = dot(vec3(p, toward), LIGHT);
  c *= 1.0 + u_shade.x * (sun - 0.55);
  float rim = 1.0 - toward;
  c *= 1.0 - u_shade.y * rim * rim;
  c = mix(c, u_air.rgb, u_air.a * rim * rim * rim);

  // A smooth rim: how much of this pixel lies inside the disc.
  float inside = clamp((1.0 - sqrt(d2)) * u_radius + 0.5, 0.0, 1.0);
  o_colour = vec4(clamp(c, 0.0, 1.0) * inside, inside);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`the Earth's program did not build: ${log}`);
  }
  return shader;
}

export function createEarthPainter(canvas, { onLost, onRestored } = {}) {
  let gl = null;
  try {
    gl = canvas.getContext("webgl2", OPTIONS);
  } catch {
    gl = null;
  }
  if (!gl || gl.isContextLost()) return null;

  const painter = {
    ready: false,
    lost: false,
    maxTexture: 0,
    look: { ...LOOK, sea: [...LOOK.sea], air: [...LOOK.air] },
    error: null,
    setPicture,
    draw,
    dispose,
  };
  let program = null;
  let where = null; // the uniforms' places in the program
  let buffer = null;
  let vao = null;
  let texture = null;
  let picture = null; // kept, to put back on the card after a lost context

  // The program, the triangle and the picture's place on the card.
  function build() {
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`the Earth's program did not link: ${gl.getProgramInfoLog(program)}`);
    }
    where = {};
    for (const name of ["u_picture", "u_middle", "u_radius", "u_tilt", "u_lng", "u_tone", "u_sea", "u_shade", "u_air"]) {
      where[name] = gl.getUniformLocation(program, name);
    }
    // One triangle twice the canvas's size covers all of it.
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, "a_corner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    painter.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
  }

  // The picture onto the card, with its smaller copies (mipmaps) for the
  // parts seen side-on near the edge, and sharper reading at a slant where
  // the card can.
  function upload() {
    if (!picture) return false;
    if (texture) gl.deleteTexture(texture);
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // east of 180 degrees is the picture's west edge again
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const slant = gl.getExtension("EXT_texture_filter_anisotropic");
    if (slant) gl.texParameterf(gl.TEXTURE_2D, slant.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(slant.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
    return !gl.isContextLost();
  }

  function setPicture(image) {
    picture = image;
    if (painter.lost) return false;
    painter.ready = upload();
    return painter.ready;
  }

  function draw(centre, size, dpr) {
    if (!painter.ready || painter.lost || !size) return false;
    const view = shaderView(centre, size, dpr, canvas.height);
    const look = painter.look;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(where.u_picture, 0);
    gl.uniform2f(where.u_middle, view.middle[0], view.middle[1]);
    gl.uniform1f(where.u_radius, view.radius);
    gl.uniform2f(where.u_tilt, view.tilt[0], view.tilt[1]);
    gl.uniform1f(where.u_lng, view.lng);
    gl.uniform2f(where.u_tone, look.lift, look.saturation);
    gl.uniform3f(where.u_sea, look.sea[0], look.sea[1], look.sea[2]);
    gl.uniform2f(where.u_shade, look.light, look.edge);
    gl.uniform4f(where.u_air, look.air[0], look.air[1], look.air[2], look.air[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    return true;
  }

  // A lost context: the canvas goes blank and the globe shows its drawn
  // Earth; when the browser gives the context back, everything is built
  // again and the picture put back.
  function whenLost(event) {
    event.preventDefault(); // asks the browser to give it back
    painter.lost = true;
    painter.ready = false;
    texture = null;
    onLost?.();
  }
  function whenRestored() {
    painter.lost = false;
    try {
      build();
      painter.ready = upload();
    } catch (error) {
      painter.error = String(error?.message || error);
      painter.ready = false;
    }
    if (painter.ready) onRestored?.();
  }

  function dispose() {
    canvas.removeEventListener("webglcontextlost", whenLost);
    canvas.removeEventListener("webglcontextrestored", whenRestored);
    painter.ready = false;
    if (!gl.isContextLost()) {
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (vao) gl.deleteVertexArray(vao);
      if (program) gl.deleteProgram(program);
    }
    texture = buffer = vao = program = null;
    picture = null;
    // A canvas that has left the page (the visitor went to another page)
    // hands its WebGL context back at once, as browsers keep only a few;
    // one still on the page (React setting the globe up again on the same
    // canvas) keeps it.
    window.setTimeout(() => {
      if (!canvas.isConnected && !gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
    }, 0);
  }

  try {
    build();
  } catch {
    dispose();
    return null;
  }
  canvas.addEventListener("webglcontextlost", whenLost);
  canvas.addEventListener("webglcontextrestored", whenRestored);
  return painter;
}
