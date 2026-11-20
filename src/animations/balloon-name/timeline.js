const smooth = (start, end, time) => {
  const x = Math.max(0, Math.min(1, (time - start) / (end - start)))
  return x * x * (3 - 2 * x)
}
const mix = (a, b, x) => a + (b - a) * x

const splitName = (name) => {
  const text = String(name ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase()
  const letters = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(text), part => part.segment)
    : Array.from(text)
  return letters.slice(0, 32)
}

const getNameLayout = (name) => {
  const letters = splitName(name)
  const width = Math.min(0.19, 1.5 / Math.max(1, letters.length) * 0.88)
  const step = width / 0.88
  return letters.map((letter, index) => ({letter, width, x: (index - (letters.length - 1) / 2) * step}))
}

const getBalloonFrame = (elapsed, duration = 6) => {
  const time = Math.max(0, elapsed) * 6 / duration
  return {
    time,
    left: smooth(0, 2, time),
    right: smooth(0.12, 2, time),
    banner: smooth(4, 5, time),
    celebration: smooth(5, 5.2, time) * (1 - smooth(5.65, 6, time)),
    bob: Math.sin(time * 1.35) * 0.009,
  }
}

const getLetterFrame = (index, count, time) => {
  // Every name, including long names, finishes by the four-second boundary.
  const start = 2 + index / Math.max(1, count - 1) * 0.95
  const rise = smooth(start, start + 1.05, time)
  return {
    rise,
    opacity: smooth(start, start + 0.18, time),
    bob: Math.sin(time * 1.5 + index * 0.72) * 0.011 * rise,
    rotation: Math.sin(time * 1.15 + index * 0.83) * 0.035 * rise,
  }
}

const getBalloonParticle = (index, time) => {
  const seed = ((index * 67 + 11) % 97) / 97
  const scatter = ((index * 43 + 37) % 89) / 89
  const lift = ((index * 31 + 7) % 83) / 83
  const burst = time >= 5 && time < 7
  const age = burst ? time - 5 - seed * 0.22 : (time - 7 + index * 0.37) % 3.6
  const life = burst ? 0.75 + scatter * 0.65 : 0.8
  const active = (burst || (time >= 7 && index < 8)) && age >= 0 && age < life
  const progress = Math.max(0, Math.min(1, age / life))
  return {
    x: Math.sin(seed * Math.PI * 2.5) * progress * (0.5 + scatter * 0.45),
    y: 0.18 + progress * (0.35 + lift) - progress * progress * 0.12,
    size: (0.01 + scatter * 0.016) * (burst ? 1 : 0.7),
    rotation: seed * Math.PI + age,
    opacity: active ? Math.sin(progress * Math.PI) * 0.9 : 0,
  }
}

module.exports = {smooth, mix, splitName, getNameLayout, getBalloonFrame, getLetterFrame, getBalloonParticle}
