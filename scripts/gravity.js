// Disk self-gravity with a particle-mesh solver: spread each particle's mass onto a grid,
// convolve the grid with a softened 1/r potential through an FFT, and keep the force on the grid.
// Cost grows with the grid size, not with the number of particle pairs.

// size: cells per side (power of 2), extent: half-width of the square grid, softening: in the same units as extent.
// solve() fills accX, accY: the acceleration at each cell center, row-major, cell (i, j) centered at
// (-extent + (i + 0.5) * h, -extent + (j + 0.5) * h). Callers sample it with bilinear weights.
export function createSelfGravity({ size, extent, softening }) {
  const n = size * 2 // zero-padded so the FFT convolution does not wrap around
  const h = (2 * extent) / size
  const re = new Float64Array(n * n)
  const im = new Float64Array(n * n)
  const kernelRe = new Float64Array(n * n)
  const kernelIm = new Float64Array(n * n)
  const accX = new Float32Array(size * size)
  const accY = new Float32Array(size * size)
  const fft = createFFT(n)

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = (i < size ? i : i - n) * h
      const dy = (j < size ? j : j - n) * h
      kernelRe[j * n + i] = -1 / Math.sqrt(dx * dx + dy * dy + softening * softening)
    }
  }
  fft.transform2d(kernelRe, kernelIm, n, false)

  // mass is per particle
  function solve(posX, posY, count, mass) {
    re.fill(0)
    im.fill(0)

    // cloud-in-cell: each particle's mass goes to the 4 cells around it, weighted by overlap
    for (let p = 0; p < count; p++) {
      const gx = (posX[p] + extent) / h - 0.5
      const gy = (posY[p] + extent) / h - 0.5
      const i = Math.floor(gx)
      const j = Math.floor(gy)
      if (i < 0 || j < 0 || i >= size - 1 || j >= size - 1) continue
      const fx = gx - i
      const fy = gy - j
      const k = j * n + i
      re[k] += (1 - fx) * (1 - fy)
      re[k + 1] += fx * (1 - fy)
      re[k + n] += (1 - fx) * fy
      re[k + n + 1] += fx * fy
    }

    // only the first `size` rows hold mass, and only the first `size` rows of the result are read
    fft.transform2d(re, im, size, false)
    for (let k = 0; k < n * n; k++) {
      const r = re[k] * kernelRe[k] - im[k] * kernelIm[k]
      im[k] = re[k] * kernelIm[k] + im[k] * kernelRe[k]
      re[k] = r
    }
    fft.transform2d(re, im, size, true)

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
  }

  return { solve, accX, accY, size, extent, h }
}

// radix-2 FFT of length n with precomputed twiddles and bit reversal; the inverse is scaled by 1/n
function createFFT(n) {
  const cos = new Float64Array(n / 2)
  const sin = new Float64Array(n / 2)
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos(2 * Math.PI * k / n)
    sin[k] = Math.sin(2 * Math.PI * k / n)
  }
  const reversed = new Uint16Array(n)
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    reversed[i] = j
  }

  // in place on re[offset + m * stride], m = 0..n-1
  function transform(re, im, offset, stride, inverse) {
    for (let i = 1; i < n; i++) {
      const j = reversed[i]
      if (i < j) {
        const a = offset + i * stride
        const b = offset + j * stride
        let t = re[a]; re[a] = re[b]; re[b] = t
        t = im[a]; im[a] = im[b]; im[b] = t
      }
    }
    const sign = inverse ? 1 : -1
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1
      const step = n / len
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wRe = cos[k * step]
          const wIm = sign * sin[k * step]
          const a = offset + (i + k) * stride
          const b = a + half * stride
          const tRe = re[b] * wRe - im[b] * wIm
          const tIm = re[b] * wIm + im[b] * wRe
          re[b] = re[a] - tRe
          im[b] = im[a] - tIm
          re[a] += tRe
          im[a] += tIm
        }
      }
    }
    if (inverse) {
      for (let m = 0; m < n; m++) {
        re[offset + m * stride] /= n
        im[offset + m * stride] /= n
      }
    }
  }

  // 2D transform of an n×n row-major grid where only rows 0..rows-1 matter: the forward pass skips the rows that are
  // all zeros, and the inverse pass skips the rows nobody reads
  function transform2d(re, im, rows, inverse) {
    if (!inverse) for (let r = 0; r < rows; r++) transform(re, im, r * n, 1, false)
    for (let c = 0; c < n; c++) transform(re, im, c, n, inverse)
    if (inverse) for (let r = 0; r < rows; r++) transform(re, im, r * n, 1, true)
  }

  return { transform2d }
}
