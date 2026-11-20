const drawLetterAtlas = (canvas, layout, color, outline) => {
  canvas.width = 1024
  canvas.height = 512
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.font = '700 88px Georgia, serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = color
  context.strokeStyle = outline
  context.lineWidth = 5
  context.lineJoin = 'round'
  layout.forEach(({letter}, i) => {
    const x = i % 8 * 128 + 64
    const y = Math.floor(i / 8) * 128 + 68
    context.strokeText(letter, x, y, 116)
    context.fillText(letter, x, y, 116)
  })
}

const drawMessage = (canvas, message, color) => {
  canvas.width = 1024
  canvas.height = 256
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  const text = String(message ?? '').slice(0, 160)
  let lines = []
  let size = 82
  for (; size >= 16; size -= 2) {
    context.font = `600 ${size}px Georgia, serif`
    lines = []
    for (const paragraph of text.split('\n').slice(0, 3)) {
      let line = ''
      for (const character of paragraph) {
        if (line && context.measureText(line + character).width > 960) {
          const space = line.lastIndexOf(' ')
          lines.push(space > 0 ? line.slice(0, space) : line)
          line = (space > 0 ? line.slice(space + 1) : '') + character
        } else line += character
      }
      lines.push(line)
    }
    if (lines.length <= 3 && size * 1.15 * lines.length <= 230) break
  }
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = color
  lines.slice(0, 3).forEach((line, i) => context.fillText(line, 512,
    128 + (i - (Math.min(3, lines.length) - 1) / 2) * size * 1.15, 960))
}

module.exports = {drawLetterAtlas, drawMessage}
