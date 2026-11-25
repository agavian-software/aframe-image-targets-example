const DEFAULT_MESSAGE = 'Merry Christmas!'
const getDefaultMessage = lines => Array.isArray(lines) ? lines.map(line => String(line ?? '')).join('\n') : DEFAULT_MESSAGE

const wrap = (ctx, text, width) => {
  const lines = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const character of paragraph) {
      if (line && ctx.measureText(line + character).width > width) {
        const space = line.lastIndexOf(' ')
        lines.push(space > 0 ? line.slice(0, space) : line)
        line = (space > 0 ? line.slice(space + 1) : '') + character
      } else line += character
    }
    lines.push(line.trim())
  }
  return lines
}

const drawSantaMessage = (canvas, {message, recipientName, familyName, textColor}) => {
  canvas.width = 768
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  const greeting = [message, recipientName || familyName].filter(Boolean).join('\n').trim().replace(/\r\n?/g, '\n')
  if (!ctx || !greeting) return
  const characters = Array.from(greeting)
  const text = characters.length > 220 ? characters.slice(0, 219).join('') + '\u2026' : greeting
  const maxWidth = 730
  const maxLines = 5
  let fontSize = 118
  let lines
  for (; fontSize >= 26; fontSize -= 2) {
    ctx.font = `bold ${fontSize}px Georgia, serif`
    lines = wrap(ctx, text, maxWidth)
    if (lines.length <= maxLines && lines.length * fontSize * 1.13 <= 178) break
  }
  fontSize = Math.max(26, fontSize)
  const visible = lines.slice(0, maxLines)
  if (lines.length > maxLines) visible[maxLines - 1] += '\u2026'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = textColor
  ctx.shadowColor = '#4c0b09'
  ctx.shadowBlur = 5
  visible.forEach((line, i) => ctx.fillText(line, canvas.width / 2,
    canvas.height / 2 + (i - (visible.length - 1) / 2) * fontSize * 1.13, maxWidth))
}

module.exports = {DEFAULT_MESSAGE, getDefaultMessage, drawSantaMessage}
