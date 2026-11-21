const getBirthdayMessage = (message, name) => message === 'Happy Birthday!' && String(name ?? '').trim()
  ? `Happy Birthday ${String(name).trim()}` : String(message ?? '')

const drawCakeMessage = (canvas, message, color) => {
  canvas.width = 1024; canvas.height = 256
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  let size = 82, lines = []
  const text = String(message ?? '').slice(0, 180)
  for (; size >= 16; size -= 2) {
    context.font = `600 ${size}px Georgia, serif`
    lines = []
    for (const paragraph of text.split('\n').slice(0, 3)) {
      let line = ''
      for (const character of paragraph) {
        if (line && context.measureText(line + character).width > 950) {
          const space = line.lastIndexOf(' ')
          lines.push(space > 0 ? line.slice(0, space) : line)
          line = (space > 0 ? line.slice(space + 1) : '') + character
        } else line += character
      }
      lines.push(line)
    }
    if (lines.length <= 3 && lines.length * size * 1.15 <= 230) break
  }
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = color
  lines.slice(0, 3).forEach((line, i) => context.fillText(line, 512,
    128 + (i - (Math.min(3, lines.length) - 1) / 2) * size * 1.15, 950))
}

const drawCakeHint = (canvas, color) => {
  canvas.width = 1024; canvas.height = 144
  const context = canvas.getContext('2d')
  context.fillStyle = 'rgba(255, 246, 221, 0.94)'
  context.fillRect(0, 0, 1024, 144)
  context.font = '600 64px Arial, sans-serif'
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = color
  context.fillText('Tap to Blow Candles', 512, 74, 960)
}

module.exports = {getBirthdayMessage, drawCakeMessage, drawCakeHint}
