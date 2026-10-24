// Debug controls in the bottom-right corner: the number of stars, the particle density, a reset, the stars' pull to the center, a toggle for the pointer's pull, and a vertical
// dial that speeds up the simulation, 1× to 64× on a log scale, with a clock of simulated time.
// Double-click the dial to go back to real time.

const maxDoublings = 6 // 2^6 = 64×
const maxStars = 6
const maxDensity = 8 // multiples of the normal particle count
const maxCenterPull = 0.002 // per second squared; a pair of stars orbits each other at about 0.0007

// clock: { scale, elapsed }; pointer: { enabled }; both read by the animation loop.
// sim: { starCount, density, centerPull }; rebuild() makes a new galaxy from sim
export function mountDebugPanel(clock, pointer, sim, rebuild) {
  const root = document.createElement("div")
  root.className = "fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3 font-mono text-xs text-text"
  root.innerHTML = `
    <label class="flex items-center gap-2 opacity-80">
      stars
      <input type="number" data-stars min="1" max="${maxStars}" value="${sim.starCount}"
        class="w-10 bg-transparent text-center">
    </label>
    <label class="flex items-center gap-2 opacity-80">
      density
      <input type="number" data-density min="1" max="${maxDensity}" value="${sim.density}"
        class="w-10 bg-transparent text-center">×
    </label>
    <button type="button" data-reset class="cursor-pointer opacity-80 hover:opacity-100">reset</button>
    <label class="flex flex-col items-center gap-1 opacity-80">
      <span>center <span data-pull-value></span></span>
      <input type="range" data-pull min="0" max="${maxCenterPull}" step="0.00001" value="${sim.centerPull}"
        aria-label="Pull of the stars toward the center" class="w-24 cursor-pointer accent-bottomHighlight">
    </label>
    <label class="flex cursor-pointer items-center gap-2 opacity-80">
      <input type="checkbox" data-pointer ${pointer.enabled ? "checked" : ""} class="cursor-pointer accent-bottomHighlight">
      mouse
    </label>
    <span data-scale class="opacity-80"></span>
    <input type="range" data-speed min="0" max="${maxDoublings}" step="0.01" value="0" aria-label="Simulation speed"
      class="h-40 w-1 cursor-pointer accent-bottomHighlight" style="writing-mode: vertical-lr; direction: rtl">
    <span data-elapsed class="opacity-60"></span>`

  // keep dial drags from also pulling stars into the pointer
  for (const type of ["pointerdown", "pointermove"]) root.addEventListener(type, (e) => e.stopPropagation())

  root.querySelector("[data-stars]").addEventListener("change", (e) => {
    sim.starCount = e.target.value = clampInt(e.target.value, maxStars)
    rebuild()
  })
  root.querySelector("[data-density]").addEventListener("change", (e) => {
    sim.density = e.target.value = clampInt(e.target.value, maxDensity)
    rebuild()
  })
  root.querySelector("[data-reset]").addEventListener("click", rebuild)
  const pull = root.querySelector("[data-pull]")
  const pullValue = root.querySelector("[data-pull-value]")
  const showPull = () => { pullValue.textContent = (sim.centerPull * 1e4).toFixed(1) }
  pull.addEventListener("input", () => {
    sim.centerPull = Number(pull.value)
    showPull()
  })
  showPull()
  root.querySelector("[data-pointer]").addEventListener("change", (e) => { pointer.enabled = e.target.checked })

  const dial = root.querySelector("[data-speed]")
  const scaleLabel = root.querySelector("[data-scale]")
  const elapsedLabel = root.querySelector("[data-elapsed]")
  dial.addEventListener("input", () => { clock.scale = 2 ** Number(dial.value) })
  dial.addEventListener("dblclick", () => {
    dial.value = 0
    clock.scale = 1
  })

  const render = () => {
    scaleLabel.textContent = `${clock.scale.toFixed(clock.scale < 10 ? 1 : 0)}×`
    elapsedLabel.textContent = formatElapsed(clock.elapsed)
    requestAnimationFrame(render)
  }
  requestAnimationFrame(render)

  document.body.append(root)
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`
}

function clampInt(value, max) {
  return Math.min(max, Math.max(1, Math.round(Number(value)) || 1))
}
