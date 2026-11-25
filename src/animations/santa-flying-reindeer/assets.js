const {createTextureAcquirer} = require('../shared/texture-leases')

const ASSET_BASE = './animations/santa-flying-reindeer/assets'
const FILES = {
  flying: '01_santa_sleigh_flying',
  dropping: '02_santa_sleigh_dropping_gift',
  closedGift: '03_closed_christmas_gift_box',
  openGift: '04_open_gift_explosion',
  banner: '05_blank_merry_christmas_banner',
  snow: '06_snowfall_overlay',
  burst: '07_gift_reveal_burst',
  trail: '08_santa_flight_trail',
}
const acquirers = Object.fromEntries(['webp', 'png'].map(format => [format, createTextureAcquirer(
  Object.fromEntries(Object.entries(FILES).map(([key, name]) => [key, `${name}.${format}`]))
)]))

// Flake clusters from the supplied overlay. Artwork coordinates start at the top left.
const SNOW_REGIONS = [
  [0.085, 0.13, 0.155, 0.15],
  [0.42, 0.05, 0.16, 0.16],
  [0.86, 0.40, 0.11, 0.16],
  [0.055, 0.61, 0.105, 0.11],
  [0.73, 0.76, 0.12, 0.11],
].map(([x, y, width, height]) => [x, 1 - y - height, width, height])

const acquireAssets = (THREE, base, format) => acquirers[format](THREE, base)

module.exports = {ASSET_BASE, acquireAssets, SNOW_REGIONS}
