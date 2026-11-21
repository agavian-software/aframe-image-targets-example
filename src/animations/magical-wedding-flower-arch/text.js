const {DEFAULT_MESSAGE, getAnniversaryText} = require('../golden-rings-anniversary/text')
const drawArchMessage = (canvas, options) => {
  canvas.width = 1536; canvas.height = 256
  const ctx = canvas.getContext('2d'), text = getAnniversaryText(options).slice(0, 500)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  let size = 72, lines = []
  for (; size >= 14; size -= 2) {
    ctx.font = `600 ${size}px Georgia, "Segoe UI Emoji", serif`; lines = []
    for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
      let line = ''
      for (const character of paragraph) {
        if (line && ctx.measureText(line + character).width > 1440) {
          const space = line.lastIndexOf(' ')
          lines.push(space > 0 ? line.slice(0, space) : line)
          line = (space > 0 ? line.slice(space + 1) : '') + character
        } else line += character
      }
      lines.push(line)
    }
    if (lines.length <= 6 && lines.length * size * 1.12 <= 236) break
  }
  size = Math.max(14, size); ctx.font = `600 ${size}px Georgia, "Segoe UI Emoji", serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = options.textColor
  lines.slice(0, 6).forEach((line, index) => ctx.fillText(line, 768,
    128 + (index - (Math.min(lines.length, 6) - 1) / 2) * size * 1.12, 1440))
}
module.exports = {DEFAULT_MESSAGE, drawArchMessage}
