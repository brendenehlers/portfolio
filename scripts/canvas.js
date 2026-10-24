import { createGalaxy } from "./galaxy.js"
import { createGalaxyView } from "./galaxy-view.js"
import { mountDebugPanel } from "./debug-panel.js"

// config params
const count = 2500 // number of points
const maxRadius = 300 // how far the points can go out when being generated
const semimajor = 1.5 // controls how far the points go on the x-axis
const semiminor = 1 // controls how far the points go on the y-axis
const rate = 2.3 // how fast the starting density falls off with radius
const brightnessFalloff = 200
const starSpacing = 90 // with several stars, the radius of the ring they start on
const colors = ["#be4bff", "#d742ff", "#e3bcff", "#f5bfff", "#c1a1c3", "#f", "#f", "#f", "#f", "#f"]

// how fast the points move, in radians per second, for a star 100px from the center
const orbitSpeed = (isSmallScreen() ? 6 : 3) * Math.PI / 180

// enabled: whether the pointer pulls on the stars, toggled from the debug panel
const pointer = { x: 0, y: 0, active: false, enabled: true }

// scale: simulation seconds per real second; elapsed: simulation seconds since the galaxy was made
const clock = { scale: 1, elapsed: 0 }
// starCount: the big points, which orbit each other; centerPull: per second squared, a gentle spring that pulls
// each star toward the galaxy center; both changed from the debug panel
const sim = { starCount: 1, centerPull: 0.0002 }
let galaxy
// the debug panel is shown only with ?debug=1
if (new URLSearchParams(location.search).get("debug") === "1") {
  mountDebugPanel(clock, pointer, sim, (n) => {
    sim.starCount = n
    buildGalaxy()
  })
}

window.addEventListener("pointermove", (e) => {
  pointer.x = e.clientX
  pointer.y = e.clientY
  pointer.active = true
})
window.addEventListener("pointerdown", (e) => {
  pointer.x = e.clientX
  pointer.y = e.clientY
  pointer.active = true
})
for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
  window.addEventListener(type, (e) => {
    // a mouse stays over the page after pointerup, a finger does not
    if (type !== "pointerup" || e.pointerType !== "mouse") pointer.active = false
  })
}
document.addEventListener("mouseleave", () => { pointer.active = false })

const canvas = document.createElement("canvas")
canvas.className = "block h-full w-full"
document.getElementById("canvas").append(canvas)
const view = createGalaxyView(canvas, { colors, pointSize: isSmallScreen() ? 0.5 : 1, semimajor, semiminor, brightnessFalloff })
buildGalaxy()

let last = performance.now()
let frameMs = 1000 / 60 // running average of the time between frames
requestAnimationFrame(function frame(now) {
  const elapsed = now - last
  last = now
  frameMs += (elapsed - frameMs) * 0.1
  const dt = Math.min(elapsed, 50) / 1000

  // the galaxy center, in css px
  const center = { x: Math.floor(window.innerWidth / 2), y: Math.floor(5 * window.innerHeight / 8) }
  const hole = pointer.enabled && pointer.active
    ? { x: (pointer.x - center.x) / semimajor, y: (pointer.y - center.y) / semiminor }
    : null
  // physics may use half of a frame; past that the simulation runs slower instead of dropping frames
  clock.elapsed += galaxy.advance(dt * clock.scale, { hole, centerPull: sim.centerPull, budgetMs: Math.min(8, frameMs / 2) })
  view.draw(galaxy, center)
  requestAnimationFrame(frame)
})

function buildGalaxy() {
  const stars = Array.from({ length: sim.starCount }, (_, k) => {
    const angle = 2 * Math.PI * k / sim.starCount
    const r = sim.starCount > 1 ? starSpacing : 0
    return { x: r * Math.cos(angle), y: r * Math.sin(angle), mass: 1 }
  })
  galaxy = createGalaxy({
    count, maxRadius, rate, orbitSpeed, stars,
    holeRadius: isSmallScreen() ? 140 : 220,
    horizon: isSmallScreen() ? 6 : 10,
  })
  clock.elapsed = 0
}

function isSmallScreen() {
  return window.innerWidth < 600
}
