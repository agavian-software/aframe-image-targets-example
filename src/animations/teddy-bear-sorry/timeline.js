const {mix, smooth} = require('../shared/easing')

const DEFAULT_TIMINGS = Object.freeze({walkIn: 2.5, kneel: 1, roseEmphasis: 1.5, letterReveal: 2, bannerReveal: 2})

const getTeddyFrame = (time, options, tappedAt = null) => {
  const {walkIn, kneel, roseEmphasis, letterReveal, bannerReveal, revealVideo} = options
  const roseAt = walkIn + kneel
  const letterAt = roseAt + roseEmphasis
  const videoAt = letterAt + letterReveal
  const unfoldAt = Math.min(letterAt + letterReveal * 0.55, tappedAt ?? Infinity)
  const unfoldEnd = unfoldAt + letterReveal * 0.32
  const roseRise = smooth(roseAt, roseAt + roseEmphasis * 0.75, time)
  const romanticFade = 1 - smooth(letterAt - roseEmphasis * 0.25, letterAt + letterReveal * 0.13, time)
  return {
    walking: smooth(0, walkIn, time),
    walkFade: smooth(0, walkIn * 0.17, time),
    kneeling: smooth(walkIn + kneel * 0.12, roseAt, time),
    tuckLeft: smooth(roseAt + roseEmphasis * 0.23, letterAt + letterReveal * 0.30, time),
    roseRise,
    roseAlpha: smooth(roseAt + roseEmphasis * 0.08, roseAt + roseEmphasis * 0.35, time) * romanticFade,
    flourish: smooth(roseAt, roseAt + roseEmphasis * 0.34, time) * romanticFade,
    envelope: smooth(letterAt, letterAt + letterReveal * 0.26, time),
    unfolding: smooth(unfoldAt, unfoldEnd, time),
    burst: smooth(unfoldAt, unfoldAt + letterReveal * 0.09, time) *
      (1 - smooth(unfoldAt + letterReveal * 0.12, unfoldAt + letterReveal * 0.36, time)),
    canOpen: time >= letterAt + letterReveal * 0.2 && time < unfoldAt,
    videoOpacity: revealVideo ? smooth(videoAt - letterReveal * 0.25, videoAt, time) : 1,
    videoReady: !revealVideo || time >= videoAt,
    banner: smooth(videoAt, videoAt + bannerReveal, time),
    ambient: smooth(videoAt + bannerReveal * 0.75, videoAt + bannerReveal + 0.5, time),
    ambientTime: Math.max(0, time - videoAt),
  }
}

const getTeddyLayout = (o, aspect) => {
  const unit = Math.min(o.width, o.pictureHeight * 1.5)
  const bounds = {left: o.boundsLeft / unit, right: o.boundsRight / unit,
    bottom: o.boundsBottom / unit, top: o.boundsTop / unit}
  const walkHeight = 0.67 * o.teddyScale
  const kneelHeight = 0.55 * o.teddyScale
  const letterWidth = 0.4 * o.letterScale
  const letterHeight = letterWidth / aspect.letter
  const teddyFeet = bounds.bottom - walkHeight * 0.92 - 0.055 + o.teddyY
  const letterY = bounds.bottom - letterHeight / 2 - 0.115 + o.letterY
  const bannerWidth = 0.94 * o.bannerScale
  const bannerHeight = bannerWidth / aspect.banner
  return {unit, bounds, walkHeight, kneelHeight, teddyFeet, letterY, letterWidth, letterHeight, bannerWidth, bannerHeight,
    bannerY: Math.min(teddyFeet, letterY - letterHeight / 2) - 0.025 - bannerHeight * 0.5 + o.bannerY}
}

const getTeddyPose = (time, frame, layout, options) => {
  const {bounds, teddyFeet, walkHeight, kneelHeight} = layout
  const stride = time / options.walkIn * 5.5 * Math.PI * 2
  const strideAmount = (1 - smooth(0.82, 1, frame.walking)) * frame.walkFade
  const side = options.entranceSide === 'right' ? 1 : -1
  const start = side < 0 ? bounds.left - 0.36 : bounds.right + 0.36
  const x = mix(start, 0, frame.walking) + frame.tuckLeft * options.teddyX
  const foot = teddyFeet - (1 - frame.walking) * 0.15 + Math.abs(Math.sin(stride)) * 0.035 * strideAmount
  return {
    x, foot,
    height: walkHeight * mix(0.75, 1, frame.walking) * (1 - 0.065 * frame.kneeling),
    lean: side * 0.053 * (1 - frame.walking) + Math.sin(stride) * 0.057 * strideAmount - 0.055 * frame.kneeling,
    kneelHeight: kneelHeight * (1 + 0.028 * Math.sin(time * 1.65) * frame.kneeling),
  }
}

module.exports = {DEFAULT_TIMINGS, getTeddyFrame, getTeddyLayout, getTeddyPose}
