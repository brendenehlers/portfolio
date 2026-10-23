Pts.namespace( window )

let space

// config params
const count = 2500 // number of points
const maxRadius = 300 // how far the points can go out when being generated
const semimajor = 1.5 // controls how far the points go on the x-axis
const semiminor = 1 // controls how far the points go on the y-axis
const rate = 2.3 // used in the expDis function
const brightnessFalloff = 200
const colors = ["#be4bff", "#d742ff", "#e3bcff", "#f5bfff", "#c1a1c3", "#f", "#f", "#f", "#f", "#f"]

const expDisCache = new Map()

let pointSize = 1
if (isSmallScreen()) {
  pointSize = 0.5
}

// how fast the points move, in radians per second
let orbitSpeed = 3 * Const.one_degree
if (isSmallScreen()) {
  orbitSpeed = 6 * Const.one_degree
}

// pointer black hole: its gravity bends the orbits of nearby stars
const gravity = 60000
const gravityRadius = isSmallScreen() ? 140 : 220 // no pull past this distance
const horizon = isSmallScreen() ? 6 : 10 // softens the pull near the pointer
const circularize = 0.8 // per second, how fast a disturbed orbit settles into a circle at its new radius

const pointer = { x: 0, y: 0, active: false }

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

  // star state in orbit space: screen offset from center divided by (semimajor, semiminor)
  const posX = new Float32Array(count)
  const posY = new Float32Array(count)
  const velX = new Float32Array(count)
  const velY = new Float32Array(count)

  for ( let i = 0; i < count; i++ ) {
    // distribute the points along the radius, then rotate them randomly around the circle
    const r = maxRadius * expDis(Math.random(), rate, true)
    const angle = Math.random() * Const.two_pi
    posX[i] = r * Math.cos(angle) / semimajor
    posY[i] = r * Math.sin(angle) / semiminor

    // circular orbit velocity
    velX[i] = -orbitSpeed * posY[i]
    velY[i] = orbitSpeed * posX[i]
  }

  space.add({
    animate: (time, ftime) => {
      const dt = Math.min(ftime, 50) / 1000

      // cause an error in this function to see the initial setup
      form.fillOnly("#fff").point(center, 5, "circle")

      for (let i = 0; i < count; i++) {
        stepStar(i, posX, posY, velX, velY, center, dt)

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

// The galaxy pulls each star toward its center with a force proportional to distance.
// Every orbit in that field has the same period, so an undisturbed galaxy turns as one rigid disk,
// and a star the pointer moves keeps its new orbit.
function stepStar(i, posX, posY, velX, velY, center, dt) {
  if (pointer.active) {
    const dx = center.x + semimajor * posX[i] - pointer.x
    const dy = center.y + semiminor * posY[i] - pointer.y
    const d2 = dx * dx + dy * dy
    if (d2 < gravityRadius * gravityRadius) {
      // softened inverse square, faded to 0 at gravityRadius
      const fade = (1 - Math.sqrt(d2) / gravityRadius) ** 2
      const a = -gravity * fade / (d2 + horizon * horizon) ** 1.5
      velX[i] += a * dx / semimajor * dt
      velY[i] += a * dy / semiminor * dt
    }
  }

  // drag toward the circular orbit at the current radius, so a slingshot does not throw stars off screen
  const k = Math.min(1, circularize * dt)
  velX[i] += (-orbitSpeed * posY[i] - velX[i]) * k
  velY[i] += (orbitSpeed * posX[i] - velY[i]) * k

  // exact step of the central field: the state turns through the angle orbitSpeed * dt
  const c = Math.cos(orbitSpeed * dt)
  const s = Math.sin(orbitSpeed * dt)
  const x = posX[i]
  const y = posY[i]
  posX[i] = x * c + velX[i] / orbitSpeed * s
  posY[i] = y * c + velY[i] / orbitSpeed * s
  velX[i] = velX[i] * c - x * orbitSpeed * s
  velY[i] = velY[i] * c - y * orbitSpeed * s
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
