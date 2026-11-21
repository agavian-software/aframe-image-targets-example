const DEFAULT_MESSAGE = 'Happy Wedding Anniversary'
const ordinal = value => {
  const n = Math.max(0, Math.floor(Number(value) || 0))
  if (!n) return ''
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({1: 'st', 2: 'nd', 3: 'rd'}[n % 10] || 'th')
  return `${n}${suffix}`
}
const getAnniversaryText = (options) => {
  const anniversary = ordinal(options.anniversaryNumber)
  let message = String(options.message ?? DEFAULT_MESSAGE)
  if (message === DEFAULT_MESSAGE && anniversary) message = `Happy ${anniversary} Wedding Anniversary`
  const names = String(options.coupleNames ?? '').trim()
  const dates = [options.startDate, options.endDate].map(value => String(value ?? '').trim()).filter(Boolean).join(' – ')
  message = message.replace(/\{(anniversary|years|coupleNames|dates)\}/g, (match, key) =>
    ({anniversary, years: String(options.anniversaryNumber || ''), coupleNames: names, dates})[key])
  return [message, names, dates].filter(Boolean).join('\n')
}

const wrapText = (ctx, text, maxWidth) => {
  const lines = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = ''
    for (const character of paragraph) {
      if (line && ctx.measureText(line + character).width > maxWidth) {
        const space = line.lastIndexOf(' ')
        lines.push(space > 0 ? line.slice(0, space) : line)
        line = (space > 0 ? line.slice(space + 1) : '') + character
      } else line += character
    }
    lines.push(line)
  }
  return lines
}
const drawAnniversaryText = (canvas, options) => {
  canvas.width = 1584; canvas.height = 192
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  // Match the narrow cream strip of asset 07; avoid its floral top/bottom borders.
  const text = getAnniversaryText(options).slice(0, 500)
  let size = 64, lines = []
  for (; size >= 14; size -= 2) {
    ctx.font = `600 ${size}px Georgia, "Segoe UI Emoji", serif`
    lines = wrapText(ctx, text, 1480)
    if (lines.length <= 6 && lines.length * size * 1.12 <= 176) break
  }
  size = Math.max(14, size)
  ctx.font = `600 ${size}px Georgia, "Segoe UI Emoji", serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = options.textColor
  const visible = lines.slice(0, 6)
  visible.forEach((line, index) => ctx.fillText(line, 792,
    96 + (index - (visible.length - 1) / 2) * size * 1.12, 1480))
}
module.exports = {DEFAULT_MESSAGE, ordinal, getAnniversaryText, drawAnniversaryText}
