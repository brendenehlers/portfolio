import { createGalaxy } from "./galaxy.js"
import { mountDebugPanel } from "./debug-panel.js"

Pts.namespace( window )

let space

// config params
const count = 2500 // number of points
const maxRadius = 300 // how far the points can go out when being generated
const semimajor = 1.5 // controls how far the points go on the x-axis
const semiminor = 1 // controls how far the points go on the y-axis
const rate = 2.3 // used in the expDis function
const brightnessFalloff = 200
const starSpacing = 90 // with several stars, the radius of the ring they start on
const colors = ["#be4bff", "#d742ff", "#e3bcff", "#f5bfff", "#c1a1c3", "#f", "#f", "#f", "#f", "#f"]

const expDisCache = new Map()

let pointSize = 1
if (isSmallScreen()) {
  pointSize = 0.5
}

// how fast the points move, in radians per second, for a star 100px from the center
let orbitSpeed = 3 * Const.one_degree
if (isSmallScreen()) {
  orbitSpeed = 6 * Const.one_degree
}

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

const createSpace = () => {


  // controls the center points
  const center = new Pt()
  center.x = Math.floor(window.innerWidth / 2)
  center.y = Math.floor(5 * window.innerHeight / 8)

  space = new CanvasSpace("canvas")
    .setup({ resize: true, bgcolor: "black", retina: true })

  const form = space.getForm()

  buildGalaxy()

  space.add({
    animate: (time, ftime) => {
      const dt = Math.min(ftime, 50) / 1000

      // cause an error in this function to see the initial setup
      for (const star of galaxy.stars) {
        form.fillOnly("#fff").point(new Pt(center.x + semimajor * star.x, center.y + semiminor * star.y), 5, "circle")
      }

      const hole = pointer.enabled && pointer.active
        ? { x: (pointer.x - center.x) / semimajor, y: (pointer.y - center.y) / semiminor }
        : null
      galaxy.step(dt * clock.scale, hole, sim.centerPull)
      const { posX, posY } = galaxy
      clock.elapsed += dt * clock.scale

      for (let i = 0; i < count; i++) {
        const screen = new Pt(center.x + semimajor * posX[i], center.y + semiminor * posY[i])
        const r = Math.hypot(posX[i], posY[i])
        const brightness = calcPointBrightness(r, Math.atan2(posY[i], posX[i]))
        form.fillOnly(colors[i % colors.length]).alpha(brightness).point(screen, pointSize, "circle")
      }
    }
  })

  space.play()
}

$(document).ready(() => {
  createSpace()
})

$(window).resize(() => {
  space.removeAll()
  $('canvas').remove()
  createSpace()
})

// equal stars spaced evenly on a ring, or one star at the center
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

function calcPointBrightness(r, angle) {
  const scaledAngle = angle / 2 + (Math.PI / 4)
  let brightness = 0.7 * Math.abs(Math.sin(scaledAngle)) + 0.3

  brightness *= expDis(r / brightnessFalloff, 1)

  return brightness
}

function expDis(x, rate, disableCache) {
  if (rate < 0) {
    throw new Error("rate cannot be less than 0")
  }

  if (x < 0) return 0

  const cacheKey = x.toFixed(2)
  if (!disableCache && (expDisCache && expDisCache.has(cacheKey))) {
    return expDisCache.get(cacheKey)
  }

  // modified to only return [0, 1]
  const res = Math.exp(-(rate * x))

  ;(!disableCache && expDisCache) && expDisCache.set(cacheKey, res)

  return res
}

function isSmallScreen() {
  return window.innerWidth < 600
}
