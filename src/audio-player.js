const createAudioPlayer = (document) => {
  const player = document.querySelector('#audioPlayer')
  const audio = document.querySelector('#magic-audio')
  const artwork = document.querySelector('#audioArtwork')
  const status = document.querySelector('#audioStatus')
  const retry = document.querySelector('#audioRetry')

  const stopEffect = () => player.classList.remove('is-playing')
  const play = async () => {
    try {
      await audio.play()
    } catch (error) {
      if (error.name === 'NotAllowedError') status.textContent = 'Press Play to listen.'
    }
  }

  audio.addEventListener('playing', () => {
    player.classList.add('is-playing')
    status.textContent = ''
    retry.hidden = true
  })
  audio.addEventListener('canplay', () => {
    if (!audio.error && status.textContent === 'Loading audio…') status.textContent = ''
  })
  audio.addEventListener('waiting', stopEffect)
  audio.addEventListener('pause', stopEffect)
  audio.addEventListener('ended', stopEffect)
  audio.addEventListener('error', () => {
    stopEffect()
    status.textContent = 'The audio couldn’t be loaded.'
    retry.hidden = false
  })
  artwork.addEventListener('error', () => { artwork.hidden = true })
  retry.addEventListener('click', () => {
    retry.hidden = true
    status.textContent = 'Loading audio…'
    audio.load()
    return play()
  })

  return {
    isOpen: () => !player.hidden,
    open({audioUrl, imageUrl}) {
      artwork.hidden = !imageUrl
      if (imageUrl) artwork.src = imageUrl
      status.textContent = 'Loading audio…'
      player.hidden = false
      audio.src = audioUrl
      play()
    },
  }
}

module.exports = {createAudioPlayer}
