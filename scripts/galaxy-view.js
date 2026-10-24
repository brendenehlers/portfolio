// Draws a galaxy (posX, posY, starX, starY in disk space) on a canvas: WebGL points, or 2D arcs where WebGL is missing.
// Disk space maps to the screen as center + (semimajor * x, semiminor * y). A particle's brightness depends on its
// radius and angle in disk space, and its color is colors[i % colors.length].

const starRadius = 5 // css px

// style: { colors, pointSize (css px radius), semimajor, semiminor, brightnessFalloff }
export function createGalaxyView(canvas, style) {
  // an invalid color leaves a canvas's fillStyle unchanged, so it draws in the previous particle's color; keep that look
  const palette = resolvePalette(style.colors)
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false })
  return gl ? createWebGLView(canvas, gl, style, palette) : create2DView(canvas, style, palette)
}

// palette entries as [r, g, b] in 0..1, resolved the way a canvas resolves fillStyle
function resolvePalette(colors) {
  const ctx = document.createElement("canvas").getContext("2d")
  ctx.fillStyle = "#000"
  return colors.map((c) => {
    ctx.fillStyle = c
    const hex = ctx.fillStyle
    return [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255)
  })
}

function brightness(x, y, falloff) {
  const r = Math.hypot(x, y)
  // |sin(angle / 2 + π / 4)| = sqrt((1 + sin angle) / 2)
  const side = r === 0 ? Math.SQRT1_2 : Math.sqrt(Math.max(0, (1 + y / r) / 2))
  return (0.7 * side + 0.3) * Math.exp(-r / falloff)
}

function resizeToDisplay(canvas) {
  const dpr = window.devicePixelRatio || 1
  const width = Math.round(canvas.clientWidth * dpr)
  const height = Math.round(canvas.clientHeight * dpr)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  return dpr
}

const vertexShader = `
attribute float aX;
attribute float aY;
attribute vec3 aColor;
uniform vec2 uCenter;     // css px
uniform vec2 uAxes;       // semimajor, semiminor
uniform vec2 uViewport;   // css px
uniform float uRadius;    // device px
uniform float uFalloff;   // 0: draw at full brightness
varying vec4 vColor;
varying float vRadius;
void main() {
  vec2 screen = uCenter + uAxes * vec2(aX, aY);
  gl_Position = vec4(screen / uViewport * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
  float b = 1.0;
  if (uFalloff > 0.0) {
    float r = length(vec2(aX, aY));
    // straight north, length() can come out a hair under |aY|, and the sqrt of a negative is NaN, which draws opaque
    float side = r > 0.0 ? sqrt(max(0.0, (1.0 + aY / r) / 2.0)) : 0.70710678;
    b = (0.7 * side + 0.3) * exp(-r / uFalloff);
  }
  vColor = vec4(aColor, b);
  vRadius = uRadius;
  gl_PointSize = 2.0 * uRadius + 2.0; // a pixel of margin for the antialiased edge
}`

const fragmentShader = `
precision mediump float;
varying vec4 vColor;
varying float vRadius;
void main() {
  float d = length(gl_PointCoord - 0.5) * (2.0 * vRadius + 2.0);
  float edge = clamp(vRadius - d + 0.5, 0.0, 1.0);
  if (edge <= 0.0) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * edge);
}`

function createWebGLView(canvas, gl, style, palette) {
  let program, loc, xBuffer, yBuffer, colorBuffer, white
  let colorCount = -1 // particles the color buffer was built for

  function init() {
    program = gl.createProgram()
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexShader], [gl.FRAGMENT_SHADER, fragmentShader]]) {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
    gl.useProgram(program)
    loc = {}
    for (const name of ["aX", "aY", "aColor"]) loc[name] = gl.getAttribLocation(program, name)
    for (const name of ["uCenter", "uAxes", "uViewport", "uRadius", "uFalloff"]) loc[name] = gl.getUniformLocation(program, name)
    xBuffer = gl.createBuffer()
    yBuffer = gl.createBuffer()
    colorBuffer = gl.createBuffer()
    white = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, white)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 1, 1]), gl.STATIC_DRAW)
    colorCount = -1
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 1)
  }

  let lost = false
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault()
    lost = true
  })
  canvas.addEventListener("webglcontextrestored", () => {
    init()
    lost = false
  })
  init()

  function attribute(name, buffer, data, size) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    if (data) gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(loc[name])
    gl.vertexAttribPointer(loc[name], size, gl.FLOAT, false, 0, 0)
  }

  // galaxy: { posX, posY, starX, starY }; center: css px
  function draw(galaxy, center) {
    if (lost) return
    const dpr = resizeToDisplay(canvas)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(loc.uCenter, center.x, center.y)
    gl.uniform2f(loc.uAxes, style.semimajor, style.semiminor)
    gl.uniform2f(loc.uViewport, canvas.width / dpr, canvas.height / dpr)

    // stars: white, full brightness, a constant color attribute
    attribute("aX", xBuffer, galaxy.starX, 1)
    attribute("aY", yBuffer, galaxy.starY, 1)
    gl.disableVertexAttribArray(loc.aColor)
    gl.vertexAttrib3f(loc.aColor, 1, 1, 1)
    gl.uniform1f(loc.uRadius, starRadius * dpr)
    gl.uniform1f(loc.uFalloff, 0)
    gl.drawArrays(gl.POINTS, 0, galaxy.starX.length)

    const count = galaxy.posX.length
    if (colorCount !== count) {
      const colors = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) colors.set(palette[i % palette.length], i * 3)
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW)
      colorCount = count
    }
    attribute("aX", xBuffer, galaxy.posX, 1)
    attribute("aY", yBuffer, galaxy.posY, 1)
    attribute("aColor", colorBuffer, null, 3)
    gl.uniform1f(loc.uRadius, style.pointSize * dpr)
    gl.uniform1f(loc.uFalloff, style.brightnessFalloff)
    gl.drawArrays(gl.POINTS, 0, count)
  }

  return { draw }
}

function create2DView(canvas, style, palette) {
  const ctx = canvas.getContext("2d")
  const fills = palette.map((rgb) => `rgb(${rgb.map((c) => Math.round(c * 255)).join(",")})`)

  function circle(x, y, r) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    ctx.fill()
  }

  function draw(galaxy, center) {
    const dpr = resizeToDisplay(canvas)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr)

    ctx.fillStyle = "#fff"
    for (let s = 0; s < galaxy.starX.length; s++) {
      circle(center.x + style.semimajor * galaxy.starX[s], center.y + style.semiminor * galaxy.starY[s], starRadius)
    }

    const { posX, posY } = galaxy
    for (let i = 0; i < posX.length; i++) {
      ctx.fillStyle = fills[i % fills.length]
      ctx.globalAlpha = brightness(posX[i], posY[i], style.brightnessFalloff)
      circle(center.x + style.semimajor * posX[i], center.y + style.semiminor * posY[i], style.pointSize)
    }
  }

  return { draw }
}
