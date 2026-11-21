const clamp = value => Math.max(0, Math.min(1, value))
const mix = (a, b, p) => a + (b - a) * p
const smooth = (start, end, time) => {
  const p = clamp((time - start) / (end - start))
  return p * p * (3 - 2 * p)
}
const getLoveLetterFrame = (elapsed, duration = 9.5, speed = 1) => {
  const time = Math.max(0, elapsed) * 9.5 / duration * speed
  return {time, flight: smooth(0, 2, time), alpha: smooth(0, 0.3, time),
    opening: smooth(2, 3.2, time), unfold: smooth(3.2, 5.5, time),
    message: smooth(5.5, 8, time), heart: smooth(8, 9.5, time),
    burst: smooth(8, 8.15, time) * (1 - smooth(8.6, 9.4, time)),
    bob: Math.sin(time * 1.65) * 0.012 * smooth(2, 3, time)}
}
const getLoveLetterLayout = (options, aspect = 1000 / 853) => {
  const envelopeY = options.envelopeSize / 2 + 0.08
  const letterHeight = options.letterSize * aspect
  const letterBottom = options.envelopeSize * 0.12
  return {envelopeY, letterHeight, letterBottom,
    letterY: envelopeY + letterBottom + letterHeight / 2,
    heartWidth: Math.max(options.letterSize * 1.5, letterHeight * 1.15)}
}
const getFlightPose = (frame, layout, side = 'left') => {
  const sign = side === 'right' ? 1 : -1
  const p = frame.flight
  return {x: sign * 1.85 * (1 - p),
    y: layout.envelopeY + (1 - p) * 0.28 + Math.sin(p * Math.PI) * 0.22 + frame.bob,
    rotation: sign * (1 - p) * -0.22 + Math.sin(frame.time * 1.2) * 0.018 * p,
    flap: Math.sin(frame.time < 2 ? frame.time * 15 : 30 + (frame.time - 2) * 8)}
}
const getLovePetal = (index, frame, layout) => {
  const seed = ((index * 41 + 13) % 97) / 97, scatter = ((index * 67 + 7) % 89) / 89
  const idle = frame.time >= 10
  const age = idle ? (frame.time - 10 + index * 1.37) % 7 : frame.time - 8 - seed * 0.4
  const life = idle ? 2.4 : 1.6 + seed * 0.4
  return {x: (scatter - 0.5) * (0.3 + age * 0.8) + Math.sin(age * 3 + seed * 6) * 0.025,
    y: layout.letterY + 0.2 + (idle ? 0 : 0.23 * age) - (idle ? 0.10 : 0.28) * age * age,
    alpha: age >= 0 && age < life && (!idle || index < 4) ? smooth(0, 0.15, age) * (1 - smooth(life - 0.5, life, age)) : 0,
    width: (0.025 + seed * 0.025) * (0.4 + 0.6 * Math.abs(Math.cos(age * 4 + index))),
    height: 0.025 + seed * 0.025, rotation: seed * 6 + age * (1.3 + scatter * 3)}
}
const getLoveSparkle = (index, frame, layout, side) => {
  const seed = ((index * 73 + 17) % 101) / 101, scatter = ((index * 37 + 11) % 89) / 89
  const t = frame.time, idle = t >= 9.5
  const age = (t + index * 0.37) % (idle ? 4.6 : 1.5)
  let x, y, alpha
  if (t < 2.4) {
    const past = getLoveLetterFrame(Math.max(0, t - seed * 0.65))
    const pose = getFlightPose(past, layout, side)
    x = pose.x + (scatter - 0.5) * 0.11; y = pose.y - seed * 0.12
    alpha = frame.alpha * (1 - smooth(2, 2.4, t)) * (1 - seed) * 0.85
  } else {
    const a = seed * Math.PI * 2 + Math.sin(t * 0.25) * 0.1
    x = Math.cos(a) * layout.heartWidth * 0.42
    y = layout.letterY + Math.sin(a) * layout.letterHeight * 0.6
    alpha = age < 0.9 && (!idle || index < 10) ? Math.sin(age / 0.9 * Math.PI) * 0.7 : 0
  }
  return {x, y, alpha, width: 0.07 + scatter * 0.07, rotation: t * 0.25 + seed * 3}
}

module.exports = {mix, smooth, getLoveLetterFrame, getLoveLetterLayout, getFlightPose, getLovePetal, getLoveSparkle}
