const {createTextureAcquirer} = require('../shared/texture-leases')

const ASSET_BASE = './animations/new-year-2027-countdown/assets'
const FILES = {
  clock: '01_midnight_countdown_clock',
  halo: '02_countdown_halo_ring',
  yearArt: '03_golden_2027_numbers',
  banner: '04_blank_new_year_banner',
  leftFirework: '05_left_fireworks_burst',
  rightFirework: '06_right_fireworks_burst',
  confetti: '07_confetti_overlay',
  trail: '08_golden_sparkle_trail',
}
const acquirers = Object.fromEntries(['webp', 'png'].map(format => [format, createTextureAcquirer(
  Object.fromEntries(Object.entries(FILES).map(([name, file]) => [name, `${file}.${format}`]))
)]))

const acquireAssets = (THREE, base, format) => acquirers[format](THREE, base)

module.exports = {ASSET_BASE, acquireAssets}
