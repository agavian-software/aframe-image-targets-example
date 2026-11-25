const DEFAULT_MESSAGE = 'I’m Really Sorry ❤️\nPlease forgive me.\nI never meant to hurt you.\nYou mean so much to me.'

const getDefaultMessage = lines => Array.isArray(lines) ? lines.map(String).join('\n') : DEFAULT_MESSAGE
const shorten = (text, limit) => {
  const characters = Array.from(text)
  return characters.length > limit ? characters.slice(0, limit - 1).join('') + '…' : text
}

const wrap = (ctx, text, width) => {
  const rows = []
  let row = ''
  for (const character of text) {
    if (row && ctx.measureText(row + character).width > width) {
      const space = row.lastIndexOf(' ')
      rows.push(space > 0 ? row.slice(0, space) : row)
      row = (space > 0 ? row.slice(space + 1) : '') + character
    } else row += character
  }
  rows.push(row)
  return rows
}

const drawTeddyMessage = (canvas, {message, recipientName, senderName, maxMessageLength, textColor}) => {
  canvas.width = 1024
  canvas.height = 280
  const ctx = canvas.getContext('2d')
  const content = shorten(message.trim(), maxMessageLength).split(/\r?\n/)
  const headline = content.shift()
  const paragraphs = [
    {text: headline, title: true},
    {text: recipientName && `For ${shorten(recipientName, 70)}`},
    ...content.map(text => ({text})),
    {text: senderName && `With love, ${shorten(senderName, 70)}`},
  ].filter(({text}) => text.trim())
  const font = (size, title) => `${title ? 'bold' : '600'} ${title ? Math.round(size * 1.15) : size}px Georgia, "Segoe UI Emoji", serif`
  const lineWidth = 989
  let rows = [], size = 76
  for (; size >= 23; size -= 3) {
    rows = paragraphs.flatMap(({text, title}) => {
      ctx.font = font(size, title)
      return wrap(ctx, text, lineWidth).map(value => ({value, title}))
    })
    if ((rows.length + 0.25) * size * 1.16 <= 268 || size <= 23) break
  }
  const maxRows = Math.floor(268 / (size * 1.16))
  if (rows.length > maxRows) {
    rows = rows.slice(0, maxRows)
    rows[rows.length - 1].value = rows[rows.length - 1].value.replace(/…?$/, '…')
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = textColor
  rows.forEach(({value, title}, index) => {
    ctx.font = font(size, title)
    ctx.fillText(value, 512, 140 + (index - (rows.length - 1) / 2) * size * 1.16, lineWidth)
  })
}

module.exports = {DEFAULT_MESSAGE, getDefaultMessage, drawTeddyMessage}
