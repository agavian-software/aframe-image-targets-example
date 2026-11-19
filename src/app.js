require('./index.css')

const {getMagicEntries} = require('./magic-entries')
const {createImageTargetPlayback} = require('./image-target-playback')
const {cameraFocusPipelineModule} = require('./camera-focus')
const {imageIdentificationPipelineModule} = require('./image-identification-pipeline')

const onxrloaded = () => {
  XR8.addCameraPipelineModule(cameraFocusPipelineModule({
    debug: new URLSearchParams(window.location.search).get('cameraDebug') === '1',
  }))
  XR8.addCameraPipelineModule(imageIdentificationPipelineModule())
  XR8.XrController.configure({imageTargetData: []})
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)

document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene')
  const video = document.querySelector('#magic-video')
  const player = document.querySelector('#videoPlayer')
  const appLoader = document.querySelector('#customLoader')
  const scanOverlay = document.querySelector('#scanOverlay')
  const scanStatusText = document.querySelector('#scanStatusText')
  const videoLoader = document.querySelector('#videoLoader')
  const videoLoaderText = document.querySelector('#videoLoaderText')
  const timeoutOverlay = document.querySelector('#identificationTimeout')
  const tryAgainButton = document.querySelector('#identificationTryAgain')
  const exitButton = document.querySelector('#identificationExit')
  const soundToggle = document.querySelector('#soundToggle')
  const fullscreenToggle = document.querySelector('#fullscreenToggle')
  const videoMessage = document.querySelector('#videoMessage')
  const videoMessageText = document.querySelector('#videoMessageText')
  const scanAgainButton = document.querySelector('#videoScanAgain')
  const playButton = document.querySelector('#videoPlay')
  const backButton = document.querySelector('#videoBackToTarget')

  if (!scene || !video || !player || !appLoader || !videoLoader || !videoLoaderText) return

  let hasActiveVideo = false
  let playbackRequest = 0
  let playingTargetName = ''
  let webpagePlayback = false
  let targetLostTimer = null
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  const hideAppLoader = () => appLoader.classList.add('is-hidden')
  const updateSoundButton = () => {
    soundToggle?.classList.toggle('is-muted', video.muted)
    soundToggle?.setAttribute('aria-pressed', String(video.muted))
    soundToggle?.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video')
  }
  const hideVideoLoader = () => {
    targetPlayback.hideLoading()
    videoLoader.classList.remove('is-visible')
    videoLoader.setAttribute('aria-hidden', 'true')
  }
  const showVideoLoader = (message) => {
    if (!hasActiveVideo) return
    if (!webpagePlayback && targetPlayback.showLoading(playingTargetName, message)) {
      videoLoader.classList.remove('is-visible')
      videoLoader.setAttribute('aria-hidden', 'true')
      return
    }
    videoLoaderText.textContent = message
    videoLoader.classList.add('is-visible')
    videoLoader.setAttribute('aria-hidden', 'false')
  }
  const showVideoMessage = (message, allowRescan = false, allowPlay = false) => {
    if (videoMessageText) videoMessageText.textContent = message
    if (videoMessage) videoMessage.hidden = false
    if (scanAgainButton) scanAgainButton.hidden = !allowRescan
    if (playButton) playButton.hidden = !allowPlay
  }
  const cancelTargetLostTimer = () => {
    if (targetLostTimer === null) return
    window.clearTimeout(targetLostTimer)
    targetLostTimer = null
  }
  const onTargetLost = ({targetName}) => {
    if (webpagePlayback || playingTargetName !== targetName) return
    targetPlayback.hide()
    hideVideoLoader()
    cancelTargetLostTimer()
    targetLostTimer = window.setTimeout(() => {
      targetLostTimer = null
      if (webpagePlayback || playingTargetName !== targetName || targetPlayback.isTracked(targetName)) return
      resumeScanning()
    }, 2500)
  }
  const targetPlayback = createImageTargetPlayback({scene, onTargetFound: startTargetVideo, onTargetLost})
  const returnToTarget = () => {
    if (!webpagePlayback) return
    webpagePlayback = false
    player.hidden = true
    video.controls = false
    if (backButton) backButton.hidden = true
    if (videoMessage) videoMessage.hidden = true
    if (!hasActiveVideo) return
    targetPlayback.show(playingTargetName)
    if (!targetPlayback.isTracked(playingTargetName)) onTargetLost({targetName: playingTargetName})
  }
  const resumeScanning = () => {
    ++playbackRequest
    hasActiveVideo = false
    playingTargetName = ''
    cancelTargetLostTimer()
    returnToTarget()
    targetPlayback.clear()
    video.pause()
    video.removeAttribute('src')
    video.load()
    player.hidden = true
    video.controls = false
    if (fullscreenToggle) fullscreenToggle.hidden = true
    if (soundToggle) soundToggle.hidden = true
    if (videoMessage) videoMessage.hidden = true
    document.body.classList.remove('is-playing-video')
    hideVideoLoader()
    if (scanStatusText) scanStatusText.textContent = 'Searching image...'
    scanOverlay?.classList.remove('is-hidden')
    window.dispatchEvent(new Event('imageidentificationresume'))
  }

  scene.addEventListener('realityready', hideAppLoader, {once: true})
  scene.addEventListener('loaded', () => window.setTimeout(hideAppLoader, 2500), {once: true})

  video.muted = isIOS
  video.defaultMuted = isIOS
  video.controls = false
  updateSoundButton()
  hideVideoLoader()

  video.addEventListener('volumechange', updateSoundButton)
  video.addEventListener('loadstart', () => showVideoLoader('Loading video...'))
  video.addEventListener('waiting', () => showVideoLoader('Buffering video...'))
  video.addEventListener('stalled', () => showVideoLoader('Connection is slow...'))
  video.addEventListener('canplay', hideVideoLoader)
  video.addEventListener('playing', () => {
    if (!hasActiveVideo) return
    window.dispatchEvent(new Event('imageidentificationpause'))
    if (webpagePlayback) targetPlayback.hide()
    else targetPlayback.show(playingTargetName)
    hideVideoLoader()
    if (videoMessage) videoMessage.hidden = true
    if (fullscreenToggle) fullscreenToggle.hidden = false
  })
  video.addEventListener('pause', hideVideoLoader)
  video.addEventListener('ended', () => {
    if (hasActiveVideo) resumeScanning()
  })
  video.addEventListener('error', () => {
    if (!hasActiveVideo) return
    hideVideoLoader()
    showVideoMessage('Video could not be loaded. Please scan your gift again.', true)
  })

  soundToggle?.addEventListener('click', () => {
    video.muted = !video.muted
    updateSoundButton()
  })
  playButton?.addEventListener('click', () => playVideo(playbackRequest))

  fullscreenToggle?.addEventListener('click', async () => {
    if (!hasActiveVideo || !playingTargetName) return
    // Use the same media element so time, sound and playback continue unchanged.
    webpagePlayback = true
    cancelTargetLostTimer()
    targetPlayback.hide()
    player.hidden = false
    video.controls = true
    if (backButton) backButton.hidden = false
    if (videoMessage) videoMessage.hidden = true
    window.dispatchEvent(new Event('imageidentificationpause'))
    try {
      if (isIOS && video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen()
      } else if (video.requestFullscreen) {
        await video.requestFullscreen()
      } else if (video.webkitEnterFullscreen) {
        // iPhone Safari uses the native video fullscreen API.
        video.webkitEnterFullscreen()
      } else if (video.webkitRequestFullscreen) {
        await video.webkitRequestFullscreen()
      } else {
        showVideoMessage('Fullscreen is unavailable in this browser. You can keep watching here.')
      }
    } catch (error) {
      showVideoMessage('Could not open fullscreen. Please try the fullscreen button again.')
      console.error('[magic] Fullscreen failed:', error)
    }
  })

  const onFullscreenChange = () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !video.webkitDisplayingFullscreen) {
      returnToTarget()
    }
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)
  video.addEventListener('webkitendfullscreen', returnToTarget)
  backButton?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(console.error)
    else if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen?.()
    returnToTarget()
  })

  window.addEventListener('imageidentificationtimeout', () => {
    if (hasActiveVideo) return
    scanOverlay?.classList.add('is-hidden')
    timeoutOverlay?.classList.add('is-visible')
    timeoutOverlay?.setAttribute('aria-hidden', 'false')
    tryAgainButton?.focus()
  })
  tryAgainButton?.addEventListener('click', () => {
    timeoutOverlay?.classList.remove('is-visible')
    timeoutOverlay?.setAttribute('aria-hidden', 'true')
    resumeScanning()
  })
  scanAgainButton?.addEventListener('click', resumeScanning)
  exitButton?.addEventListener('click', () => window.location.assign('https://www.sisulogs.com/'))

  window.addEventListener('imageidentified', async (event) => {
    if (hasActiveVideo) return
    const entries = getMagicEntries(event.detail)
    if (!entries.length) return

    hasActiveVideo = true
    const request = ++playbackRequest
    window.dispatchEvent(new Event('imageidentificationpause'))
    hideAppLoader()
    scanOverlay?.classList.add('is-hidden')
    timeoutOverlay?.classList.remove('is-visible')
    timeoutOverlay?.setAttribute('aria-hidden', 'true')
    document.body.classList.add('is-playing-video')
    // Keep the webpage player hidden until the viewer clicks Fullscreen.
    player.hidden = true
    if (videoMessage) videoMessage.hidden = true
    showVideoLoader('Loading matched experience...')

    try {
      await targetPlayback.load(entries)
      if (request !== playbackRequest) return
      hideVideoLoader()
    } catch (error) {
      if (request !== playbackRequest) return
      resumeScanning()
      console.error('[magic] Could not load matched target:', error)
    }
  })

  async function startTargetVideo({targetName, videoUrl}) {
    if (!hasActiveVideo || webpagePlayback) return
    cancelTargetLostTimer()
    const targetChanged = playingTargetName !== targetName
    playingTargetName = targetName
    if (soundToggle) soundToggle.hidden = false
    if (targetChanged || video.src !== videoUrl) {
      ++playbackRequest
      targetPlayback.hide()
      video.pause()
      video.src = videoUrl
      video.load()
      if (fullscreenToggle) fullscreenToggle.hidden = true
    }
    if (!video.paused) {
      targetPlayback.show(playingTargetName)
      return
    }
    showVideoLoader('Starting video...')
    await playVideo(playbackRequest)
  }

  async function playVideo(request) {
    try {
      await video.play()
    } catch (error) {
      if (request !== playbackRequest) return
      if (error.name === 'NotAllowedError' && !video.muted) {
        // Browsers may require autoplay to begin muted until the viewer interacts.
        video.muted = true
        updateSoundButton()
        try {
          await video.play()
          return
        } catch (mutedError) {
          if (request !== playbackRequest) return
          error = mutedError
        }
      }
      hideVideoLoader()
      if (!video.error) showVideoMessage('Tap Play to start watching.', false, true)
      console.error('[magic] Video playback failed:', error)
    }
  }
})
