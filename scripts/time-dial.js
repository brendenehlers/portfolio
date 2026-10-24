// A vertical dial in the bottom-right corner that speeds up the simulation, 1× to 64× on a log scale,
// with a clock of simulated time. Double-click the dial to go back to real time.

const maxDoublings = 6 // 2^6 = 64×

// clock: { scale, elapsed }, read by the animation loop
export function mountTimeDial(clock) {
  const root = document.createElement("div")
  root.className = "fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3 font-mono text-xs text-text"
  root.innerHTML = `
    <span data-scale class="opacity-80"></span>
    <input type="range" min="0" max="${maxDoublings}" step="0.01" value="0" aria-label="Simulation speed"
      class="h-40 w-1 cursor-pointer accent-bottomHighlight" style="writing-mode: vertical-lr; direction: rtl">
    <span data-elapsed class="opacity-60"></span>`

  // keep dial drags from also pulling stars into the pointer
  for (const type of ["pointerdown", "pointermove"]) root.addEventListener(type, (e) => e.stopPropagation())

  const dial = root.querySelector("input")
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
