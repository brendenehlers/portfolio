// Star-to-star gravity with a particle-mesh solver: spread each star's mass onto a grid,
// convolve the grid with a softened 1/r potential through an FFT, and read the force back.
// Cost grows with the grid size, not with the number of star pairs.

// size: cells per side (power of 2), extent: half-width of the square grid, softening: in the same units as extent
export function createSelfGravity({ size, extent, softening }) {
  const n = size * 2 // zero-padded so the FFT convolution does not wrap around
  const h = (2 * extent) / size
  const re = new Float64Array(n * n)
  const im = new Float64Array(n * n)
  const kernelRe = new Float64Array(n * n)
  const kernelIm = new Float64Array(n * n)
  const accX = new Float32Array(size * size)
  const accY = new Float32Array(size * size)

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = (i < size ? i : i - n) * h
      const dy = (j < size ? j : j - n) * h
      kernelRe[j * n + i] = -1 / Math.sqrt(dx * dx + dy * dy + softening * softening)
    }
  }
  fft2d(kernelRe, kernelIm, n, false)

  // writes the acceleration from all stars on each star into outX, outY; mass is per star
  return function apply(posX, posY, count, mass, outX, outY) {
    re.fill(0)
    im.fill(0)

    for (let s = 0; s < count; s++) {
      const c = cloudCell(posX[s], posY[s])
      if (!c) continue
      const k = c.j * n + c.i
      re[k] += c.w00
      re[k + 1] += c.w10
      re[k + n] += c.w01
      re[k + n + 1] += c.w11
    }

    fft2d(re, im, n, false)
    for (let k = 0; k < n * n; k++) {
      const r = re[k] * kernelRe[k] - im[k] * kernelIm[k]
      im[k] = re[k] * kernelIm[k] + im[k] * kernelRe[k]
      re[k] = r
    }
    fft2d(re, im, n, true)

    // re now holds the potential; force is minus its gradient
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const k = j * n + i
        const left = i > 0 ? re[k - 1] : re[k]
        const right = i < size - 1 ? re[k + 1] : re[k]
        const up = j > 0 ? re[k - n] : re[k]
        const down = j < size - 1 ? re[k + n] : re[k]
        accX[j * size + i] = -mass * (right - left) / (2 * h)
        accY[j * size + i] = -mass * (down - up) / (2 * h)
      }
    }

    for (let s = 0; s < count; s++) {
      const c = cloudCell(posX[s], posY[s])
      if (!c) {
        outX[s] = 0
        outY[s] = 0
        continue
      }
      const k = c.j * size + c.i
      outX[s] = c.w00 * accX[k] + c.w10 * accX[k + 1] + c.w01 * accX[k + size] + c.w11 * accX[k + size + 1]
      outY[s] = c.w00 * accY[k] + c.w10 * accY[k + 1] + c.w01 * accY[k + size] + c.w11 * accY[k + size + 1]
    }
  }

  // cloud-in-cell: the 4 grid cells around a point and their weights, or null outside the grid
  function cloudCell(x, y) {
    const gx = (x + extent) / h - 0.5
    const gy = (y + extent) / h - 0.5
    const i = Math.floor(gx)
    const j = Math.floor(gy)
    if (i < 0 || j < 0 || i >= size - 1 || j >= size - 1) return null
    const fx = gx - i
    const fy = gy - j
    return {
      i, j,
      w00: (1 - fx) * (1 - fy), w10: fx * (1 - fy),
      w01: (1 - fx) * fy, w11: fx * fy,
    }
  }
}

function fft2d(re, im, n, inverse) {
  const rowRe = new Float64Array(n)
  const rowIm = new Float64Array(n)
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const k = pass === 0 ? a * n + b : b * n + a
        rowRe[b] = re[k]
        rowIm[b] = im[k]
      }
      fft(rowRe, rowIm, inverse)
      for (let b = 0; b < n; b++) {
        const k = pass === 0 ? a * n + b : b * n + a
        re[k] = rowRe[b]
        im[k] = rowIm[b]
      }
    }
  }
}

// in-place iterative radix-2 FFT; the inverse is scaled by 1/n
function fft(re, im, inverse) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / len
    const wRe = Math.cos(angle)
    const wIm = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let uRe = 1
      let uIm = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tRe = re[b] * uRe - im[b] * uIm
        const tIm = re[b] * uIm + im[b] * uRe
        re[b] = re[a] - tRe
        im[b] = im[a] - tIm
        re[a] += tRe
        im[a] += tIm
        const next = uRe * wRe - uIm * wIm
        uIm = uRe * wIm + uIm * wRe
        uRe = next
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
  }
}
