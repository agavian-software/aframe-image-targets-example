require('./index.css')

if (window.AFRAME) {
  AFRAME.registerComponent('play-gltf-animations-sequentially', {
    schema: {
      loop: {default: true},
    },

    init() {
      this.mixer = null
      this.clips = []
      this.currentClip = 0
      this.currentAction = null
      this.playNextClip = this.playNextClip.bind(this)

      this.el.addEventListener('model-loaded', (event) => {
        const model = event.detail.model
        this.clips = model.animations || []

        if (!this.clips.length) {
          return
        }

        this.mixer = new THREE.AnimationMixer(model)
        this.currentClip = 0
        this.mixer.addEventListener('finished', this.playNextClip)
        this.playClip(this.currentClip)
      })
    },

    playClip(index) {
      if (!this.mixer || !this.clips[index]) {
        return
      }

      if (this.currentAction) {
        this.currentAction.stop()
      }

      const clip = this.clips[index]
      this.currentAction = this.mixer.clipAction(clip)
      this.currentAction.reset()
      this.currentAction.setLoop(THREE.LoopOnce, 1)
      this.currentAction.clampWhenFinished = false
      this.currentAction.play()
    },

    playNextClip() {
      const nextClip = this.currentClip + 1

      if (nextClip >= this.clips.length) {
        if (!this.data.loop) {
          return
        }

        this.currentClip = 0
      } else {
        this.currentClip = nextClip
      }

      this.playClip(this.currentClip)
    },

    tick(time, deltaTime) {
      if (this.mixer) {
        this.mixer.update(deltaTime / 1000)
      }
    },

    remove() {
      if (this.mixer) {
        this.mixer.removeEventListener('finished', this.playNextClip)
        this.mixer.stopAllAction()
      }
    },
  })
}

const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [
      require('../image-targets/Murugar_god.json'),
    ],
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)

document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene')
  const video = document.querySelector('#jelly-video')
  const appLoader = document.querySelector('#customLoader')
  const videoLoader = document.querySelector('#videoLoader')
  const videoLoaderText = document.querySelector('#videoLoaderText')

  if (!scene || !appLoader) {
    return
  }

  let playbackRequested = false

  const hideAppLoader = () => {
    appLoader.classList.add('is-hidden')
  }

  const showVideoLoader = (message = 'Buffering video...') => {
    if (!playbackRequested) {
      return
    }

    videoLoaderText.textContent = message
    videoLoader.classList.add('is-visible')
    videoLoader.setAttribute('aria-hidden', 'false')
  }

  const hideVideoLoader = () => {
    videoLoader.classList.remove('is-visible')
    videoLoader.setAttribute('aria-hidden', 'true')
  }

  scene.addEventListener('realityready', hideAppLoader, {once: true})

  // Avoid leaving the custom overlay above permission or runtime messages forever.
  scene.addEventListener('loaded', () => {
    window.setTimeout(hideAppLoader, 8000)
  }, {once: true})

  if (!video || !videoLoader || !videoLoaderText) {
    return
  }

  video.pause()
  hideVideoLoader()

  video.addEventListener('loadstart', () => {
    showVideoLoader('Loading video...')
  })

  video.addEventListener('waiting', () => {
    showVideoLoader('Buffering video...')
  })

  video.addEventListener('stalled', () => {
    showVideoLoader('Connection is slow...')
  })

  video.addEventListener('canplay', hideVideoLoader)
  video.addEventListener('playing', hideVideoLoader)
  video.addEventListener('pause', hideVideoLoader)

  video.addEventListener('error', () => {
    showVideoLoader('Video could not be loaded')
  })

  scene.addEventListener('xrimagefound', (event) => {
    if (!event.detail || event.detail.name !== 'Murugar_god') {
      return
    }

    playbackRequested = true
    video.muted = false

    if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      showVideoLoader('Starting video...')
    }

    video.play().catch(() => {
      playbackRequested = false
      hideVideoLoader()
    })
  })

  scene.addEventListener('xrimagelost', (event) => {
    if (!event.detail || event.detail.name !== 'Murugar_god') {
      return
    }

    playbackRequested = false
    hideVideoLoader()
    video.pause()
    video.currentTime = 0
  })
})
