import { createSelfGravity } from "./gravity.js"

// Star physics in disk space: screen offset from the galaxy center divided by (semimajor, semiminor).
// Particles feel gravity from the stars, from each other, and from the pointer, so a particle the pointer
// moves keeps its new orbit. The stars feel each other and the particles.

const referenceRadius = 100
const core = 20 // softens each star's pull, so a particle that falls into a star is not flung out
const diskMass = 4 // total mass of all particles, as a multiple of the total star mass before starMassScale
// makes the stars heavier than the disk, so the particles do not pull them off course. Orbit speeds stay the same,
// so a larger scale makes the particles lighter instead, and the disk forms fewer blobs.
const starMassScale = 4
const holeMass = 60000 // pointer black hole
const circularize = 0.1 // per second, how fast a disturbed orbit settles into a circle at its new radius
const maxStep = 1 / 20 // seconds, longest step that keeps orbits stable; inner particles turn about 0.015 rad per step

// orbitSpeed: radians per second at referenceRadius around a lone star; holeRadius: no pointer pull past this distance;
// horizon: softens the pointer pull near the pointer; stars: [{ x, y, mass }], mass as a share of the total star mass
export function createGalaxy({ count, maxRadius, rate, orbitSpeed, holeRadius, horizon, stars: starSpecs }) {
  // stars pull with inverse square gravity, so inner particles orbit faster than outer ones
  const totalStarMass = orbitSpeed * orbitSpeed * referenceRadius ** 3
  const particleMass = diskMass * totalStarMass / (starMassScale * count)
  const selfGravity = createSelfGravity({ size: 32, extent: 320, softening: 30 }) // smaller softening breaks the disk into blobs

  const shares = starSpecs.reduce((sum, s) => sum + s.mass, 0)
  const stars = starSpecs.map((s) => ({ x: s.x, y: s.y, vx: 0, vy: 0, mass: totalStarMass * s.mass / shares }))
  centerStars()

  const posX = new Float32Array(count)
  const posY = new Float32Array(count)
  const velX = new Float32Array(count)
  const velY = new Float32Array(count)
  const diskX = new Float32Array(count)
  const diskY = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    // each particle starts around one star: distribute along the radius, then rotate randomly around the circle
    const star = stars[i % stars.length]
    const r = maxRadius * Math.exp(-rate * Math.random())
    const angle = Math.random() * 2 * Math.PI
    posX[i] = star.x + r * Math.cos(angle)
    posY[i] = star.y + r * Math.sin(angle)
  }

  setStarOrbits()
  selfGravity(posX, posY, count, particleMass, diskX, diskY)
  for (let i = 0; i < count; i++) {
    const star = stars[i % stars.length]
    const w = circularSpeed(i, star)
    velX[i] = star.vx - w * (posY[i] - star.y)
    velY[i] = star.vy + w * (posX[i] - star.x)
  }
  recenter()

  // moves the stars' center of mass to the origin
  function centerStars() {
    const cx = stars.reduce((sum, s) => sum + s.mass * s.x, 0) / totalStarMass
    const cy = stars.reduce((sum, s) => sum + s.mass * s.y, 0) / totalStarMass
    for (const s of stars) {
      s.x -= cx
      s.y -= cy
    }
  }

  // starts each star on a circular orbit around the origin
  function setStarOrbits() {
    for (const s of stars) {
      const r = Math.hypot(s.x, s.y)
      if (r === 0) continue
      const { ax, ay } = starPull(s)
      const w = Math.sqrt(Math.max(0, -(ax * s.x + ay * s.y)) / (r * r))
      s.vx = -w * s.y
      s.vy = w * s.x
    }
  }

  // acceleration on star s from the other stars and the particles, softened the same as a star's pull on a particle
  function starPull(s) {
    let ax = 0
    let ay = 0
    for (const o of stars) {
      if (o === s) continue
      const dx = s.x - o.x
      const dy = s.y - o.y
      const a = -o.mass / (dx * dx + dy * dy + core * core) ** 1.5
      ax += a * dx
      ay += a * dy
    }
    for (let i = 0; i < count; i++) {
      const dx = s.x - posX[i]
      const dy = s.y - posY[i]
      const a = -particleMass / (dx * dx + dy * dy + core * core) ** 1.5
      ax += a * dx
      ay += a * dy
    }
    return { ax, ay }
  }

  // the star whose pull on particle i is strongest
  function dominantStar(i) {
    let best = stars[0]
    let bestPull = 0
    for (const s of stars) {
      const dx = posX[i] - s.x
      const dy = posY[i] - s.y
      const pull = s.mass / (dx * dx + dy * dy + core * core)
      if (pull > bestPull) {
        best = s
        bestPull = pull
      }
    }
    return best
  }

  // angular speed of a circular orbit around star at particle i, in the field of that star and the disk
  function circularSpeed(i, star) {
    const x = posX[i] - star.x
    const y = posY[i] - star.y
    const r2 = x * x + y * y
    if (r2 === 0) return 0
    const inward = star.mass / (r2 + core * core) ** 1.5 - (diskX[i] * x + diskY[i] * y) / r2
    return Math.sqrt(Math.max(0, inward))
  }

  // shifts everything so the center of mass of the stars and particles sits still at the origin.
  // A random disk is lopsided, and the pointer and the circularizing drag add momentum, so without this the galaxy
  // drifts off screen and off the self-gravity grid. Moving the frame does not change the forces.
  function recenter() {
    let x = 0, y = 0, vx = 0, vy = 0
    for (const s of stars) {
      x += s.mass * s.x
      y += s.mass * s.y
      vx += s.mass * s.vx
      vy += s.mass * s.vy
    }
    for (let i = 0; i < count; i++) {
      x += particleMass * posX[i]
      y += particleMass * posY[i]
      vx += particleMass * velX[i]
      vy += particleMass * velY[i]
    }
    const total = totalStarMass * (1 + diskMass / starMassScale)
    x /= total
    y /= total
    vx /= total
    vy /= total
    for (const s of stars) {
      s.x -= x
      s.y -= y
      s.vx -= vx
      s.vy -= vy
    }
    for (let i = 0; i < count; i++) {
      posX[i] -= x
      posY[i] -= y
      velX[i] -= vx
      velY[i] -= vy
    }
  }

  // hole: the pointer position in disk space, or null. centerPull: per second squared, a spring that pulls each star
  // toward the origin, stronger the farther the star is. A long dt (a sped-up simulation) runs as several short steps, since one long Euler step is unstable.
  function step(dt, hole, centerPull) {
    const n = Math.ceil(dt / maxStep)
    for (let i = 0; i < n; i++) substep(dt / n, hole, centerPull)
  }

  function substep(dt, hole, centerPull) {
    // semi-implicit Euler, as for the particles below; the pulls use the particle positions before this step
    const pulls = stars.map(starPull)
    stars.forEach((s, k) => {
      s.vx += (pulls[k].ax - centerPull * s.x) * dt
      s.vy += (pulls[k].ay - centerPull * s.y) * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
    })

    selfGravity(posX, posY, count, particleMass, diskX, diskY)

    for (let i = 0; i < count; i++) {
      const x = posX[i]
      const y = posY[i]
      let ax = diskX[i]
      let ay = diskY[i]
      for (const s of stars) {
        const dx = x - s.x
        const dy = y - s.y
        const a = -s.mass / (dx * dx + dy * dy + core * core) ** 1.5
        ax += a * dx
        ay += a * dy
      }

      if (hole) {
        const dx = x - hole.x
        const dy = y - hole.y
        const d2 = dx * dx + dy * dy
        if (d2 < holeRadius * holeRadius) {
          // softened inverse square, faded to 0 at holeRadius
          const fade = (1 - Math.sqrt(d2) / holeRadius) ** 2
          const a = -holeMass * fade / (d2 + horizon * horizon) ** 1.5
          ax += a * dx
          ay += a * dy
        }
      }

      velX[i] += ax * dt
      velY[i] += ay * dt

      // drag toward the circular orbit around the nearest star, so a slingshot does not throw particles off screen
      const star = dominantStar(i)
      const w = circularSpeed(i, star)
      const k = Math.min(1, circularize * dt)
      velX[i] += (star.vx - w * (y - star.y) - velX[i]) * k
      velY[i] += (star.vy + w * (x - star.x) - velY[i]) * k

      // semi-implicit Euler: move with the new velocity, which keeps orbits stable
      posX[i] += velX[i] * dt
      posY[i] += velY[i] * dt
    }

    recenter()
  }

  return { posX, posY, stars, step }
}
