const {createTextureAcquirer} = require('../shared/texture-leases')

const FILES = Object.freeze({
  walking: '01_teddy_bear_walking_with_rose.webp',
  kneeling: '02_teddy_bear_kneeling_with_rose.webp',
  rose: '03_single_red_rose.webp',
  envelope: '04_love_envelope_closed.webp',
  letter: '05_open_apology_letter.webp',
  banner: '06_blank_sorry_banner.webp',
  hearts: '07_floating_hearts_overlay.webp',
  petals: '08_rose_petal_spiral_overlay.webp',
  burst: '09_magic_reveal_burst.webp',
  trail: '10_golden_heart_light_trail.webp',
})

const acquireAssets = createTextureAcquirer(FILES)
const uv = (left, top, right, bottom) => [left, 1 - bottom, right - left, bottom - top]
const HEART_UV = uv(0.59, 0.16, 0.84, 0.35)
const SPARK_UV = uv(0.47, 0.013, 0.60, 0.105)
const PETAL_UVS = [
  uv(0.12, 0.33, 0.31, 0.49),
  uv(0.636, 0.64, 0.835, 0.865),
  uv(0.382, 0.479, 0.507, 0.60),
]

module.exports = {FILES, acquireAssets, HEART_UV, SPARK_UV, PETAL_UVS}
