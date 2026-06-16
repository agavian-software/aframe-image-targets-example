require('./index.css')

const {
  imageIdentificationPipelineModule,
} = require('./image-identification-pipeline')

const onxrloaded = () => {
  XR8.addCameraPipelineModule(imageIdentificationPipelineModule())

  XR8.XrController.configure({
    imageTargetData: [
      require('../image-targets/model-target.json'),
      require('../image-targets/Manoj_A3_plus.json'),
    ],
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)

document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene')
  const video = document.querySelector('#jelly-video')
  const appLoader = document.querySelector('#customLoader')
  const scanOverlay = document.querySelector('#scanOverlay')
  const videoLoader = document.querySelector('#videoLoader')
  const videoLoaderText = document.querySelector('#videoLoaderText')

  if (!scene || !video || !appLoader || !videoLoader || !videoLoaderText) {
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
    if (!event.detail || event.detail.name !== 'Manoj_A3_plus') {
      return
    }

    playbackRequested = true
    scanOverlay?.classList.add('is-hidden')
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
    if (!event.detail || event.detail.name !== 'Manoj_A3_plus') {
      return
    }

    playbackRequested = false
    scanOverlay?.classList.remove('is-hidden')
    hideVideoLoader()
    video.pause()
    video.currentTime = 0
  })
})
