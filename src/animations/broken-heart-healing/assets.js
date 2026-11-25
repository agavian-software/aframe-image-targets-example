const FILES = Object.freeze({
  broken: '01_broken_heart.webp',
  needle: '02_healing_needle.webp',
  trail: '03_golden_thread_trail.webp',
  // 04_stitch_magic_overlay and 05_repaired_heart contain the same artwork.
  repaired: '05_repaired_heart.webp',
  healed: '06_healed_heart_closed.webp',
  left: '07_heart_left_door.webp',
  right: '08_heart_right_door.webp',
  banner: '09_apology_banner.webp',
  burst: '10_reveal_sparkle_burst.webp',
  petals: '11_rose_petal_overlay.webp',
})

const caches = new WeakMap()

const acquireAssets = (THREE, base) => {
  let cache = caches.get(THREE)
  if (!cache) caches.set(THREE, cache = new Map())
  let entry = cache.get(base)
  if (!entry) {
    const loader = new THREE.TextureLoader()
    const textures = {}
    const loads = Object.entries(FILES).map(([name, file]) => new Promise((resolve, reject) => {
      loader.load(`${base}/${file}`, texture => {
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = false
        textures[name] = texture
        resolve()
      }, undefined, reject)
    }))
    entry = {users: 0, textures, settled: Promise.allSettled(loads), promise: Promise.all(loads).then(() => textures)}
    cache.set(base, entry)
  }
  entry.users++
  let released = false
  return {
    promise: entry.promise,
    release() {
      if (released) return
      released = true
      if (--entry.users) return
      cache.delete(base)
      entry.settled.then(() => Object.values(entry.textures).forEach(texture => texture.dispose()))
    },
  }
}

// Texture rectangles are expressed in image coordinates with Y down.
const getUv = ([left, top, right, bottom]) => [left, 1 - bottom, right - left, bottom - top]
const HEART_REGIONS = {
  broken: [0.045, 0.115, 0.948, 0.915],
  repaired: [0.056, 0.073, 0.969, 0.9],
  healed: [0.075, 0.163, 0.902, 0.884],
  left: [0.163, 0.05, 0.626, 0.974],
  right: [0.386, 0.01, 0.906, 0.966],
}
const PETAL_REGIONS = [
  [0.263, 0.024, 0.349, 0.098],
  [0.614, 0.047, 0.728, 0.163],
  [0.805, 0.206, 0.936, 0.373],
  [0.689, 0.593, 0.823, 0.734],
].map(getUv)
const STAR_REGION = getUv([0.253, 0.182, 0.355, 0.304])

const createThreadTexture = THREE => {
  const size = 32
  const pixels = new Uint8Array(size * 4)
  for (let y = 0; y < size; y++) {
    const distance = Math.abs(2 * y / (size - 1) - 1)
    const glow = Math.max(0, 1 - distance)
    pixels.set([255, Math.round(174 + 79 * glow), Math.round(45 + 182 * glow),
      Math.round(255 * glow ** 2.6)], y * 4)
  }
  const texture = new THREE.DataTexture(pixels, 1, size)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

module.exports = {acquireAssets, getUv, HEART_REGIONS, PETAL_REGIONS, STAR_REGION, createThreadTexture}
