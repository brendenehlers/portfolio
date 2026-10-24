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
// sim seconds between self-gravity solves within one frame. The disk field is softened over 30 px and changes over
// seconds, so at high speed particles sample a field up to this old, at their current positions.
const meshInterval = 0.2

// orbitSpeed: radians per second at referenceRadius around a lone star; holeRadius: no pointer pull past this distance;
// horizon: softens the pointer pull near the pointer; stars: [{ x, y, mass }], mass as a share of the total star mass.
// Returns posX, posY, starX, starY (live arrays, read only) and advance().
export function createGalaxy({ count, maxRadius, rate, orbitSpeed, holeRadius, horizon, stars: starSpecs }) {
  // stars pull with inverse square gravity, so inner particles orbit faster than outer ones
  const totalStarMass = orbitSpeed * orbitSpeed * referenceRadius ** 3
  const particleMass = diskMass * totalStarMass / (starMassScale * count)
  const mesh = createSelfGravity({ size: 32, extent: 320, softening: 30 }) // smaller softening breaks the disk into blobs

  const starCount = starSpecs.length
  const shares = starSpecs.reduce((sum, s) => sum + s.mass, 0)
  const sx = Float64Array.from(starSpecs, (s) => s.x)
  const sy = Float64Array.from(starSpecs, (s) => s.y)
  const svx = new Float64Array(starCount)
  const svy = new Float64Array(starCount)
  const sm = Float64Array.from(starSpecs, (s) => totalStarMass * s.mass / shares)
  const sax = new Float64Array(starCount)
  const say = new Float64Array(starCount)
  const starX = new Float32Array(starCount)
  const starY = new Float32Array(starCount)

  const posX = new Float32Array(count)
  const posY = new Float32Array(count)
  const velX = new Float32Array(count)
  const velY = new Float32Array(count)

  let diskAX = 0 // sampleDisk's result
  let diskAY = 0
  let sinceMesh = 0
  let msPerSubstep = 0.3 // running average of the wall time of one substep, for the budget

  centerStars()
  for (let i = 0; i < count; i++) {
    // each particle starts around one star: distribute along the radius, then rotate randomly around the circle
    const s = i % starCount
    const r = maxRadius * Math.exp(-rate * Math.random())
    const angle = Math.random() * 2 * Math.PI
    posX[i] = sx[s] + r * Math.cos(angle)
    posY[i] = sy[s] + r * Math.sin(angle)
  }
  setStarOrbits()
  mesh.solve(posX, posY, count, particleMass)
  for (let i = 0; i < count; i++) {
    const s = i % starCount
    const x = posX[i] - sx[s]
    const y = posY[i] - sy[s]
    const r2 = x * x + y * y
    const q = r2 + core * core
    const w = circularSpeed(sm[s] / (q * Math.sqrt(q)), x, y, r2, posX[i], posY[i])
    velX[i] = svx[s] - w * y
    velY[i] = svy[s] + w * x
  }
  recenter()
  starX.set(sx)
  starY.set(sy)

  // moves the stars' center of mass to the origin
  function centerStars() {
    let cx = 0
    let cy = 0
    for (let s = 0; s < starCount; s++) {
      cx += sm[s] * sx[s]
      cy += sm[s] * sy[s]
    }
    for (let s = 0; s < starCount; s++) {
      sx[s] -= cx / totalStarMass
      sy[s] -= cy / totalStarMass
    }
  }

  // starts each star on a circular orbit around the origin, in the field of the other stars and the particles
  function setStarOrbits() {
    starForces()
    for (let i = 0; i < count; i++) {
      for (let s = 0; s < starCount; s++) {
        const dx = posX[i] - sx[s]
        const dy = posY[i] - sy[s]
        const q = dx * dx + dy * dy + core * core
        const a = particleMass / (q * Math.sqrt(q))
        sax[s] += a * dx
        say[s] += a * dy
      }
    }
    for (let s = 0; s < starCount; s++) {
      const r2 = sx[s] * sx[s] + sy[s] * sy[s]
      if (r2 === 0) continue
      const w = Math.sqrt(Math.max(0, -(sax[s] * sx[s] + say[s] * sy[s])) / r2)
      svx[s] = -w * sy[s]
      svy[s] = w * sx[s]
    }
  }

  // sets sax, say to the stars' pull on each other, softened the same as a star's pull on a particle
  function starForces() {
    sax.fill(0)
    say.fill(0)
    for (let s = 0; s < starCount; s++) {
      for (let o = s + 1; o < starCount; o++) {
        const dx = sx[o] - sx[s]
        const dy = sy[o] - sy[s]
        const q = dx * dx + dy * dy + core * core
        const inv = 1 / (q * Math.sqrt(q))
        sax[s] += sm[o] * inv * dx
        say[s] += sm[o] * inv * dy
        sax[o] -= sm[s] * inv * dx
        say[o] -= sm[s] * inv * dy
      }
    }
  }

  // the disk field at (x, y), bilinear in the mesh grid like the cloud-in-cell deposit, written to diskAX, diskAY
  function sampleDisk(x, y) {
    const gx = (x + mesh.extent) / mesh.h - 0.5
    const gy = (y + mesh.extent) / mesh.h - 0.5
    const i = Math.floor(gx)
    const j = Math.floor(gy)
    if (i < 0 || j < 0 || i >= mesh.size - 1 || j >= mesh.size - 1) {
      diskAX = 0
      diskAY = 0
      return
    }
    const fx = gx - i
    const fy = gy - j
    const k = j * mesh.size + i
    const { accX, accY, size } = mesh
    const w00 = (1 - fx) * (1 - fy)
    const w10 = fx * (1 - fy)
    const w01 = (1 - fx) * fy
    const w11 = fx * fy
    diskAX = w00 * accX[k] + w10 * accX[k + 1] + w01 * accX[k + size] + w11 * accX[k + size + 1]
    diskAY = w00 * accY[k] + w10 * accY[k + 1] + w01 * accY[k + size] + w11 * accY[k + size + 1]
  }

  // angular speed of a circular orbit around a star, in the field of that star and the disk.
  // starInv: the star's mass / (r2 + core²)^1.5; (x, y): offset from the star; (px, py): the particle
  function circularSpeed(starInv, x, y, r2, px, py) {
    if (r2 === 0) return 0
    sampleDisk(px, py)
    return Math.sqrt(Math.max(0, starInv - (diskAX * x + diskAY * y) / r2))
  }

  // shifts everything so the center of mass of the stars and particles sits still at the origin.
  // A random disk is lopsided, and the pointer and the circularizing drag add momentum, so without this the galaxy
  // drifts off screen and off the self-gravity grid. Moving the frame does not change the forces.
  function recenter() {
    let x = 0, y = 0, vx = 0, vy = 0
    for (let s = 0; s < starCount; s++) {
      x += sm[s] * sx[s]
      y += sm[s] * sy[s]
      vx += sm[s] * svx[s]
      vy += sm[s] * svy[s]
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
    for (let s = 0; s < starCount; s++) {
      sx[s] -= x
      sy[s] -= y
      svx[s] -= vx
      svy[s] -= vy
    }
    for (let i = 0; i < count; i++) {
      posX[i] -= x
      posY[i] -= y
      velX[i] -= vx
      velY[i] -= vy
    }
  }

  // Semi-implicit Euler for stars and particles together: every force comes from the positions at the start of the
  // step, so one loop over the stars per particle gives the star's pull, the particle's pull back on the star,
  // the dominant star, and the circular speed around it.
  function substep(dt, hole, centerPull) {
    starForces()
    const k = Math.min(1, circularize * dt)
    const c2 = core * core
    const holeR2 = holeRadius * holeRadius

    for (let i = 0; i < count; i++) {
      const x = posX[i]
      const y = posY[i]
      sampleDisk(x, y)
      const dax = diskAX
      const day = diskAY
      let ax = dax
      let ay = day

      let best = 0
      let bestPull = -1
      let bestInv = 0
      let bdx = 0
      let bdy = 0
      let bd2 = 0
      for (let s = 0; s < starCount; s++) {
        const dx = x - sx[s]
        const dy = y - sy[s]
        const d2 = dx * dx + dy * dy
        const q = d2 + c2
        const inv = 1 / (q * Math.sqrt(q))
        const a = sm[s] * inv
        ax -= a * dx
        ay -= a * dy
        sax[s] += particleMass * inv * dx
        say[s] += particleMass * inv * dy
        const pull = sm[s] / q
        if (pull > bestPull) {
          best = s
          bestPull = pull
          bestInv = a
          bdx = dx
          bdy = dy
          bd2 = d2
        }
      }

      if (hole) {
        const dx = x - hole.x
        const dy = y - hole.y
        const d2 = dx * dx + dy * dy
        if (d2 < holeR2) {
          // softened inverse square, faded to 0 at holeRadius
          const fade = (1 - Math.sqrt(d2) / holeRadius) ** 2
          const a = -holeMass * fade / (d2 + horizon * horizon) ** 1.5
          ax += a * dx
          ay += a * dy
        }
      }

      let vx = velX[i] + ax * dt
      let vy = velY[i] + ay * dt

      // drag toward the circular orbit around the nearest star, so a slingshot does not throw particles off screen
      const w = bd2 === 0 ? 0 : Math.sqrt(Math.max(0, bestInv - (dax * bdx + day * bdy) / bd2))
      vx += (svx[best] - w * bdy - vx) * k
      vy += (svy[best] + w * bdx - vy) * k

      // semi-implicit Euler: move with the new velocity, which keeps orbits stable
      velX[i] = vx
      velY[i] = vy
      posX[i] = x + vx * dt
      posY[i] = y + vy * dt
    }

    for (let s = 0; s < starCount; s++) {
      svx[s] += (sax[s] - centerPull * sx[s]) * dt
      svy[s] += (say[s] - centerPull * sy[s]) * dt
      sx[s] += svx[s] * dt
      sy[s] += svy[s] * dt
    }
  }

  // Runs up to simDt sim seconds within budgetMs of wall time and returns the sim seconds it ran.
  // hole: the pointer position in disk space, or null. centerPull: per second squared, a spring that pulls each star
  // toward the origin, stronger the farther the star is.
  function advance(simDt, { hole, centerPull, budgetMs }) {
    const { n, dt } = planSubsteps(simDt, msPerSubstep, budgetMs)
    const start = performance.now()
    // solve at least once per frame: at 1× that matches a solve every substep, and the grid never lags a recenter
    sinceMesh = meshInterval
    for (let i = 0; i < n; i++) {
      if (sinceMesh >= meshInterval) {
        mesh.solve(posX, posY, count, particleMass)
        sinceMesh = 0
      }
      substep(dt, hole, centerPull)
      sinceMesh += dt
    }
    if (n > 0) msPerSubstep += ((performance.now() - start) / n - msPerSubstep) * 0.2
    recenter()
    starX.set(sx)
    starY.set(sy)
    return n * dt
  }

  return { posX, posY, starX, starY, advance }
}

// How many substeps of what length to run for simDt sim seconds. A substep is never longer than maxStep, which keeps
// orbits stable, so when the budget cannot pay for all of simDt the sim runs slower than asked for this frame instead
// of the frame running long. Unrun time is dropped, not carried over, so one slow frame does not make the next slower.
export function planSubsteps(simDt, msPerSubstep, budgetMs) {
  if (simDt <= 0) return { n: 0, dt: 0 }
  const wanted = Math.ceil(simDt / maxStep)
  const affordable = Math.max(1, Math.floor(budgetMs / msPerSubstep))
  if (wanted <= affordable) return { n: wanted, dt: simDt / wanted }
  return { n: affordable, dt: maxStep }
}
