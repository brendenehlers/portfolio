import { createSelfGravity } from "./gravity.js"

// Star physics in disk space: screen offset from the galaxy center divided by (semimajor, semiminor).
// Gravity from the galaxy center, the other stars, and the pointer changes each star's velocity,
// so a star the pointer moves keeps its new orbit.

const referenceRadius = 100
const core = 20 // softens the central pull, so a star that falls to the center is not flung out
const diskMass = 4 // total mass of all stars, as a multiple of the central mass
const holeMass = 60000 // pointer black hole
const circularize = 0.1 // per second, how fast a disturbed orbit settles into a circle at its new radius

// orbitSpeed: radians per second at referenceRadius; holeRadius: no pointer pull past this distance;
// horizon: softens the pointer pull near the pointer
export function createGalaxy({ count, maxRadius, rate, orbitSpeed, holeRadius, horizon }) {
  // galaxy center pulls with inverse square gravity, so inner stars orbit faster than outer ones
  const centralMass = orbitSpeed * orbitSpeed * referenceRadius ** 3
  const starMass = diskMass * centralMass / count
  const selfGravity = createSelfGravity({ size: 32, extent: 320, softening: 30 }) // smaller softening breaks the disk into blobs

  const posX = new Float32Array(count)
  const posY = new Float32Array(count)
  const velX = new Float32Array(count)
  const velY = new Float32Array(count)
  const diskX = new Float32Array(count)
  const diskY = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    // distribute the points along the radius, then rotate them randomly around the circle
    const r = maxRadius * Math.exp(-rate * Math.random())
    const angle = Math.random() * 2 * Math.PI
    posX[i] = r * Math.cos(angle)
    posY[i] = r * Math.sin(angle)
  }

  selfGravity(posX, posY, count, starMass, diskX, diskY)
  for (let i = 0; i < count; i++) {
    const w = circularSpeed(i)
    velX[i] = -w * posY[i]
    velY[i] = w * posX[i]
  }

  // angular speed of a circular orbit at star i in the field of the center and the disk
  function circularSpeed(i) {
    const x = posX[i]
    const y = posY[i]
    const r2 = x * x + y * y
    if (r2 === 0) return 0
    const inward = centralMass / (r2 + core * core) ** 1.5 - (diskX[i] * x + diskY[i] * y) / r2
    return Math.sqrt(Math.max(0, inward))
  }

  // hole: the pointer position in disk space, or null
  function step(dt, hole) {
    selfGravity(posX, posY, count, starMass, diskX, diskY)

    for (let i = 0; i < count; i++) {
      const x = posX[i]
      const y = posY[i]
      const central = -centralMass / (x * x + y * y + core * core) ** 1.5
      let ax = central * x + diskX[i]
      let ay = central * y + diskY[i]

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

      // drag toward the circular orbit at the current radius, so a slingshot does not throw stars off screen
      const w = circularSpeed(i)
      const k = Math.min(1, circularize * dt)
      velX[i] += (-w * y - velX[i]) * k
      velY[i] += (w * x - velY[i]) * k

      // semi-implicit Euler: move with the new velocity, which keeps orbits stable
      posX[i] += velX[i] * dt
      posY[i] += velY[i] * dt
    }
  }

  return { posX, posY, step }
}
