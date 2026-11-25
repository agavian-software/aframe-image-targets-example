const clamp = value => Math.max(0, Math.min(1, value))
const mix = (a, b, t) => a + (b - a) * t
const smooth = (start, end, time) => {
  const t = clamp((time - start) / (end - start))
  return t * t * (3 - 2 * t)
}

module.exports = {clamp, mix, smooth}
