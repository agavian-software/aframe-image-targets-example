const DEFAULT_TIMINGS = Object.freeze({
  brokenHeartIntro: 1.5,
  needleEntrance: 1,
  stitching: 3,
  healedPause: 1,
  doorOpen: 1.5,
  bannerReveal: 1.5,
})

// Coordinates are relative to the heart's visible width, with positive Y up.
const DEFAULT_PATH = Object.freeze([
  [0.025, 0.25], [-0.097, 0.17], [0.048, 0.099], [-0.103, 0.01],
  [0.034, -0.059], [-0.072, -0.141], [0.013, -0.224], [-0.06, -0.312],
].map(Object.freeze))

const clamp = value => Math.max(0, Math.min(1, value))
const mix = (a, b, t) => a + (b - a) * t
const smooth = (start, end, time) => {
  const t = clamp((time - start) / (end - start))
  return t * t * (3 - 2 * t)
}

const getHealingFrame = (time, timing) => {
  const needleAt = timing.brokenHeartIntro
  const stitchAt = needleAt + timing.needleEntrance
  const healAt = stitchAt + timing.stitching
  const openAt = healAt + timing.healedPause
  const revealAt = openAt + timing.doorOpen
  const bannerAt = revealAt + timing.bannerReveal
  const doors = smooth(openAt, revealAt, time)
  const heal = smooth(healAt, healAt + timing.healedPause * 0.68, time)
  const stitch = clamp((time - stitchAt) / timing.stitching)
  return {
    time, openAt, revealAt, stitch, doors, heal,
    intro: smooth(0, needleAt * 0.45, time),
    approach: smooth(needleAt, stitchAt, time),
    needleAlpha: smooth(needleAt, needleAt + timing.needleEntrance * 0.23, time) * (1 - heal),
    repair: smooth(0.67, 1, stitch),
    doorSwap: smooth(0, 0.23, doors),
    doorAlpha: 1 - smooth(0.77, 1, doors),
    videoOpacity: smooth(0, 0.87, doors),
    videoReady: time >= revealAt,
    banner: smooth(revealAt, bannerAt, time),
    burst: smooth(healAt, healAt + timing.healedPause * 0.22, time) *
      (1 - smooth(healAt + timing.healedPause * 0.28, openAt + timing.doorOpen * 0.22, time)),
    ambientTime: Math.max(0, time - revealAt),
  }
}

const getStitchPoint = (path, index, progress) => {
  const [x, y] = path[index]
  const [nextX, nextY] = path[index + 1]
  return {
    x: mix(x, nextX, progress),
    y: mix(y, nextY, progress) + Math.sin(progress * Math.PI) * 0.018,
  }
}

const getDoorX = (direction, progress, heartX, heartWidth, edge) => {
  const halfWidth = heartWidth * 0.5
  const start = heartX + direction * halfWidth * 0.5
  const end = edge + direction * (halfWidth * 0.65 + 0.08)
  return mix(start, direction < 0 ? Math.min(start, end) : Math.max(start, end), progress)
}

module.exports = {DEFAULT_TIMINGS, DEFAULT_PATH, clamp, mix, smooth, getHealingFrame, getStitchPoint, getDoorX}
