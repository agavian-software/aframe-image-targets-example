const TEMPLE_ARCH_FILES = Object.freeze({
  fullArch: '01_complete_tamil_temple_arch.webp', leftArch: '02_left_arch_growth.webp',
  rightArch: '03_right_arch_growth.webp', toran: '04_jasmine_mango_leaf_toran.webp',
  ribbon: '05_temple_red_ribbon_closed.webp', scissors: '06_ceremonial_gold_scissors.webp',
  leftCut: '07_cut_ribbon_left.webp', rightCut: '08_cut_ribbon_right.webp',
  banner: '09_blank_anniversary_banner.webp', bloom: '10_floral_bloom_sparkle.webp',
  overlay: '11_rose_petals_sparkles.webp', lamps: '12_brass_lamps_kalash_base.webp',
})
const cache = new Map()

const acquireTempleArchAssets = (THREE, document, base, maxSize, names) => {
  const entries = names.map((name) => {
    const url = `${base.replace(/\/$/, '')}/${TEMPLE_ARCH_FILES[name]}`
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

module.exports = {TEMPLE_ARCH_FILES, acquireTempleArchAssets}
