const GIFT_FILES = [
  '01_closed_gift_box.webp',
  '02_gift_box_lid.webp',
  '03_opening_explosion.webp',
  '04_floating_gift_pink_gold.webp',
  '05_floating_gift_heart.webp',
  '06_heart_burst.webp',
  '07_golden_star_swirl.webp',
  '08_blank_message_banner.webp',
]

const cache = new Map()

const acquireGiftAssets = (THREE, document, base, maxTextureSize) => {
  const key = `${base}|${maxTextureSize}`
  let entry = cache.get(key)
  if (!entry) {
    entry = {users: 0, textures: []}
    const loader = new THREE.TextureLoader()
    entry.promise = Promise.allSettled(GIFT_FILES.map(file => new Promise((resolve, reject) => {
      const texture = loader.load(`${base.replace(/\/$/, '')}/${file}`, (loaded) => {
        try {
          const image = loaded.image
          const scale = Math.min(1, maxTextureSize / Math.max(image.width, image.height))
          if (scale < 1) {
            const canvas = document.createElement('canvas')
            canvas.width = Math.round(image.width * scale)
            canvas.height = Math.round(image.height * scale)
            const context = canvas.getContext('2d')
            context.drawImage(image, 0, 0, canvas.width, canvas.height)
            loaded.image = canvas
          }
          loaded.colorSpace = THREE.SRGBColorSpace
          loaded.minFilter = THREE.LinearFilter
          loaded.magFilter = THREE.LinearFilter
          loaded.generateMipmaps = false
          loaded.needsUpdate = true
          resolve(loaded)
        } catch (error) { reject(error) }
      }, undefined, reject)
      entry.textures.push(texture)
    }))).then((results) => {
      const failure = results.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
      return results.map(result => result.value)
    })
    cache.set(key, entry)
  }
  entry.users++
  let released = false
  return {
    promise: entry.promise,
    release() {
      if (released) return
      released = true
      if (--entry.users) return
      cache.delete(key)
      // Also dispose requests which finish after removal or after another asset fails.
      entry.promise.catch(() => {}).then(() => entry.textures.forEach(texture => texture.dispose()))
    },
  }
}

module.exports = {GIFT_FILES, acquireGiftAssets}
