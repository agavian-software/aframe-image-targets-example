const {drawProposalMessage} = require('../magical-ring-proposal/text')

const DEFAULT_MESSAGE = "I'm Truly Sorry ❤️\nI know I hurt you, and I want to make things right."
const drawHealingMessage = (canvas, message, color) => drawProposalMessage(canvas, message, '', color)

module.exports = {DEFAULT_MESSAGE, drawHealingMessage}
