const clamp = value => Math.max(0, Math.min(1, value))
const smooth = (start, end, time) => {
  const p = clamp((time - start) / (end - start))
  return p * p * (3 - 2 * p)
}
const mix = (a, b, p) => a + (b - a) * p

class CakeCandleState {
  constructor(count = 5) { this.reset(count) }
  reset(count = this.blownAt.length) {
    this.blownAt = Array.from({length: count}, () => null)
    this.celebrationAt = null
  }
  get remaining() { return this.blownAt.filter(time => time === null).length }
  blow(index, time) {
    if (time < 2.5 || !Number.isInteger(index) || index < 0 || index >= this.blownAt.length ||
      this.blownAt[index] !== null || this.celebrationAt !== null) return false
    this.blownAt[index] = time
    if (this.remaining === 0) this.celebrationAt = time
    return true
  }
  blowAll(time) {
    let changed = 0
    this.blownAt.forEach((_, index) => { if (this.blow(index, time)) changed++ })
    return changed
  }
}

const getCakeFrame = (time, celebrationAt = null) => {
  const entrance = smooth(0, 1.5, time)
  const celebration = celebrationAt === null ? null : Math.max(0, time - celebrationAt)
  const float = Math.sin(time * 1.5) * 0.009 * entrance
  return {
    entrance,
    cakeY: mix(0.12, -0.87, entrance) + Math.sin(entrance * Math.PI * 4) * Math.sin(entrance * Math.PI) * 0.018 + float,
    scale: mix(0.2, 1, entrance) + Math.sin(entrance * Math.PI) * 0.025,
    candlesAlpha: smooth(1.25, 1.5, time),
    hintAlpha: celebration === null ? smooth(2.5, 2.8, time) : 0,
    celebration,
    burstAlpha: celebration === null ? 0 : smooth(0, 0.12, celebration) * (1 - smooth(0.7, 1.8, celebration)),
    heartsAlpha: celebration === null ? 0 : smooth(0.2, 0.45, celebration) * (1 - smooth(2, 3.3, celebration)),
    balloonAlpha: celebration === null ? 0 : smooth(0.4, 0.9, celebration) * (1 - smooth(2.5, 4.5, celebration)),
    ringAlpha: celebration === null ? 0 : smooth(0, 0.3, celebration) * (1 - smooth(2, 4, celebration)),
    messageAlpha: celebration === null ? 0 : smooth(1.1, 1.8, celebration),
    messageScale: celebration === null ? 0.75 : mix(0.75, 1, smooth(1.1, 2.1, celebration)),
    float,
  }
}

const getCandleLayout = (count) => {
  const width = Math.min(0.12, 0.576 / Math.max(4, count))
  const step = count > 1 ? 0.4 / (count - 1) : 0
  return Array.from({length: count}, (_, index) => {
    const x = (index - (count - 1) / 2) * step
    return {x, width, height: width * 690 / 320, baseY: 0.82 * 1199 / 1312 * 0.21 + (1 - (x / 0.21) ** 2) * 0.018,
      hitWidth: count === 1 ? 0.065 : Math.min(0.065, step * 0.82)}
  })
}

const getCandleFrame = (index, count, time, blownAt) => {
  const start = 1.5 + index / Math.max(1, count - 1) * 0.75
  const age = blownAt === null ? null : Math.max(0, time - blownAt)
  const lit = smooth(start, start + 0.18, time) * (age === null ? 1 : 1 - smooth(0, 0.18, age))
  return {lit, smoke: age !== null && age < 1.4 ? Math.sin(age / 1.4 * Math.PI) * 0.65 : 0,
    smokeProgress: age === null ? 0 : clamp(age / 1.4),
    flicker: 1 + Math.sin(time * 22 + index * 1.7) * 0.06}
}

const getCakeParticle = (index, celebration) => {
  const seed = ((index * 61 + 17) % 97) / 97
  const scatter = ((index * 37 + 7) % 89) / 89
  const burst = celebration !== null && celebration < 2.5
  const age = celebration === null ? -1 : burst ? celebration - seed * 0.25 : (celebration - 2.5 + index * 0.37) % 3.8
  const life = burst ? 0.9 + scatter * 0.8 : 0.8
  const p = clamp(age / life)
  const active = celebration !== null && age >= 0 && age < life && (burst || index < 8)
  return {x: Math.sin(seed * Math.PI * 2) * p * (0.45 + scatter * 0.3),
    y: -0.82 + p * (0.25 + scatter * 0.65) - p * p * 0.17,
    size: 0.012 + scatter * 0.018, rotation: seed * Math.PI + p * 2,
    alpha: active ? Math.sin(p * Math.PI) * 0.85 : 0}
}

module.exports = {CakeCandleState, smooth, mix, getCakeFrame, getCandleLayout, getCandleFrame, getCakeParticle}
