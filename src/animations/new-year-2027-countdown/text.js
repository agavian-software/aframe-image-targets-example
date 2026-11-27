const drawGoldLabel = (canvas, label) => {
  const {width, height} = canvas
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, width, height)
  const fill = ctx.createLinearGradient(0, height * 0.16, 0, height * 0.85)
  fill.addColorStop(0, '#fff9d8')
  fill.addColorStop(0.24, '#ffde79')
  fill.addColorStop(0.52, '#fff3b6')
  fill.addColorStop(1, '#b97621')
  ctx.font = `bold ${Math.round(height * 0.84)}px Georgia, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.strokeStyle = '#804810'
  ctx.lineWidth = 3
  ctx.shadowColor = '#090f28'
  ctx.shadowBlur = 8
  ctx.strokeText(label, width / 2, height * 0.53, width * 0.91)
  ctx.shadowBlur = 0
  ctx.fillStyle = fill
  ctx.fillText(label, width / 2, height * 0.53, width * 0.91)
}

const wrap = (ctx, text, width) => {
  const lines = []
  for (const paragraph of text.split('\n')) {
    if (ctx.measureText(paragraph).width <= width * 1.12) {
      lines.push(paragraph.trim())
      continue
    }
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

const drawGreeting = (canvas, {message, recipientName, familyName}) => {
  const {width, height} = canvas
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, width, height)
  const greeting = [message, recipientName || familyName].filter(Boolean).join('\n').trim().replace(/\r\n?/g, '\n')
  if (!greeting) return
  const characters = Array.from(greeting)
  const text = characters.length > 240 ? characters.slice(0, 239).join('') + '…' : greeting
  const maxWidth = width * 0.98
  let size = 56
  let lines
  for (; size >= 18; size -= 2) {
    ctx.font = `600 ${size}px Arial, sans-serif`
    lines = wrap(ctx, text, maxWidth)
    if (lines.length <= 5 && (lines.length * 1.1 + 0.3) * size <= height * 0.94) break
  }
  const visible = lines.slice(0, 5)
  if (lines.length > 5) visible[4] += '…'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#3e220f'
  const bodySize = Math.max(18, size)
  const lineHeight = bodySize * 1.1
  visible.forEach((line, index) => {
    ctx.font = index === 0 ? `bold ${Math.round(bodySize * 1.25)}px Georgia, serif` : `600 ${bodySize}px Arial, sans-serif`
    ctx.fillText(line, width / 2, height / 2 + (index - (visible.length - 1) / 2) * lineHeight, maxWidth)
  })
}

const drawGlow = canvas => {
  const radius = canvas.width / 2
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius)
  gradient.addColorStop(0, '#ffffff')
  gradient.addColorStop(0.12, '#ffffffed')
  gradient.addColorStop(0.35, '#ffffff73')
  gradient.addColorStop(1, '#ffffff00')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

module.exports = {drawGoldLabel, drawGreeting, drawGlow}
