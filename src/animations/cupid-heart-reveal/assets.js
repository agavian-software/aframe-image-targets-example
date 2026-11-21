const CUPID_FILES = Object.freeze({
  flying: '01_cupid_flying.webp', aiming: '02_cupid_aiming.webp',
  shooting: '03_cupid_shooting.webp', celebrating: '04_cupid_celebrating.webp',
  arrow: '05_heart_arrow.webp', motion: '06_arrow_motion_trail.webp', impact: '07_arrow_impact.webp',
  whole: '08_heart_whole.webp', cracked: '09_heart_cracked.webp', splitting: '10_heart_splitting.webp',
  shattering: '11_heart_shattering.webp', left: '12_heart_left_half.webp', right: '13_heart_right_half.webp',
  fragments: '14_heart_fragments.webp', petals: '15_rose_petals.webp', ring: '16_gold_sparkle_ring.webp',
  impactFlash: '17_impact_flash.webp', revealFlash: '18_reveal_flash.webp', sparkles: '19_golden_sparkles.webp',
  glow: '20_heart_glow_trail.webp', outline: '21_glowing_heart_outline.webp', banner: '22_blank_love_banner.webp',
})
const cache = new Map()

const acquireCupidAssets = (THREE, document, base, maxSize, names) => {
  const entries = names.map((name) => {
    const url = `${base.replace(/\/$/, '')}/${CUPID_FILES[name]}`
    const key = `${url}|${maxSize}`
    let entry = cache.get(key)
    if (!entry) {
      entry = {key, users: 0}
      entry.promise = new Promise((resolve, reject) => {
        entry.texture = new THREE.TextureLoader().load(url, (texture) => {
          try {
            const image = texture.image
            const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
            if (scale < 1) {
              const canvas = document.createElement('canvas')
              canvas.width = Math.round(image.width * scale)
              canvas.height = Math.round(image.height * scale)
              canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
              texture.image = canvas
            }
            texture.colorSpace = THREE.SRGBColorSpace
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter
            texture.generateMipmaps = false
            texture.needsUpdate = true
            resolve(texture)
          } catch (error) { reject(error) }
        }, undefined, reject)
      })
      cache.set(key, entry)
    }
    entry.users++
    return entry
  })
  let released = false
  return {
    promise: Promise.all(entries.map(entry => entry.promise)).then(textures =>
      Object.fromEntries(names.map((name, index) => [name, textures[index]]))),
    release() {
      if (released) return
      released = true
      entries.forEach((entry) => {
        if (--entry.users) return
        cache.delete(entry.key)
        entry.promise.catch(() => {}).then(() => entry.texture.dispose())
      })
    },
  }
}

module.exports = {CUPID_FILES, acquireCupidAssets}
