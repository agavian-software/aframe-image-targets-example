const DEFAULT_MESSAGE = 'My Love ❤️\n\nEvery moment with you makes my life more beautiful.\n\nYou are my happiness, my favorite person and my forever.\n\nWill You Be Mine Forever? ❤️'
const getFullLetterText = ({message = DEFAULT_MESSAGE, recipientName = '', senderName = ''}) => [
  recipientName.trim() ? `To ${recipientName.trim()},` : '', message,
  senderName.trim() ? `With love,\n${senderName.trim()}` : '',
].filter(Boolean).join('\n\n')

// Fixed readable type on the AR preview. The reader always retains the full text.
const layoutLetterText = (context, options) => {
  context.font = '42px Georgia, "Segoe UI Emoji", serif'
  const lines = []
  for (const paragraph of getFullLetterText(options).replace(/\r\n?/g, '\n').split('\n')) {
    let line = ''
    for (const character of paragraph) {
      if (line && context.measureText(line + character).width > 700) {
        const space = line.lastIndexOf(' ')
        lines.push(space > 0 ? line.slice(0, space) : line)
        line = (space > 0 ? line.slice(space + 1) : '') + character
      } else line += character
      if (lines.length > 15) break
    }
    lines.push(line)
    // The complete message is in the reader; only measure enough for the preview.
    if (lines.length > 15) break
  }
  const overflow = lines.length > 14
  const preview = lines.slice(0, overflow ? 13 : 14)
  if (overflow) preview.push('… Continue in reading view')
  return {lines: preview, overflow}
}

const drawLoveLetterText = (canvas, layout, progress, color, allowRead = true) => {
  if (canvas.width !== 768) canvas.width = 768
  if (canvas.height !== 1080) canvas.height = 1080
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 768, 1080)
  ctx.font = '42px Georgia, "Segoe UI Emoji", serif'
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  const count = Math.min(layout.lines.length, Math.floor(Math.max(0, Math.min(1, progress)) * layout.lines.length + 1e-7))
  layout.lines.slice(0, count).forEach((line, index) => ctx.fillText(line, 34, 24 + index * 64, 700))
  if (progress >= 1 && allowRead) {
    ctx.font = 'italic 32px Georgia, serif'; ctx.textAlign = 'center'
    ctx.fillText('Tap letter to read', 384, 1020, 700)
  }
  return count
}

module.exports = {DEFAULT_MESSAGE, getFullLetterText, layoutLetterText, drawLoveLetterText}
