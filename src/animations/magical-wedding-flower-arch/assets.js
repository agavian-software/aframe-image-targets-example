const FLOWER_ARCH_FILES = Object.freeze({
  leftArch: '01_left_arch_outer.webp', rightArch: '02_right_arch_outer.webp',
  fullArch: '03_full_golden_flower_arch.webp', ribbon: '04_closed_ribbon_bow.webp',
  scissors: '05_ceremonial_scissors.webp', leftCut: '06_cut_ribbon_left.webp',
  rightCut: '07_cut_ribbon_right.webp', bloom: '08_magic_arch_bloom_burst.webp',
  banner: '09_blank_anniversary_ribbon_banner.webp', overlay: '10_petals_sparkle_overlay.webp',
})
const cache = new Map()

const acquireFlowerArchAssets = (THREE, document, base, maxSize, names) => {
  const entries = names.map((name) => {
    const url = `${base.replace(/\/$/, '')}/${FLOWER_ARCH_FILES[name]}`
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

module.exports = {FLOWER_ARCH_FILES, acquireFlowerArchAssets}
