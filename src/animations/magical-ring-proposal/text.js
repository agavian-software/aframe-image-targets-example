const DEFAULT_MESSAGE = 'Will You Marry Me? ❤️'

const drawProposalMessage = (canvas, message, coupleNames, color) => {
  canvas.width = 1024; canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const names = String(coupleNames ?? '').trim()
  const text = [String(message ?? ''), names].filter(Boolean).join('\n').slice(0, 240)
  let lines = [], size = 72
  for (; size >= 14; size -= 2) {
    ctx.font = `600 ${size}px Georgia, "Segoe UI Emoji", serif`
    lines = []
    for (const paragraph of text.split('\n').slice(0, 4)) {
      let line = ''
      for (const character of paragraph) {
        if (line && ctx.measureText(line + character).width > 950) {
          const space = line.lastIndexOf(' ')
          lines.push(space > 0 ? line.slice(0, space) : line)
          line = (space > 0 ? line.slice(space + 1) : '') + character
        } else line += character
      }
      lines.push(line)
    }
    if (lines.length <= 4 && lines.length * size * 1.15 <= 230) break
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color
  lines.slice(0, 4).forEach((line, i) => ctx.fillText(line, 512,
    128 + (i - (Math.min(4, lines.length) - 1) / 2) * size * 1.15, 950))
}

module.exports = {DEFAULT_MESSAGE, drawProposalMessage}
