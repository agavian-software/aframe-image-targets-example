const {drawProposalMessage} = require('../magical-ring-proposal/text')
const DEFAULT_MESSAGE = 'You Stole My Heart ❤️'
const drawCupidMessage = (canvas, message, color) => drawProposalMessage(canvas, message, '', color)
module.exports = {DEFAULT_MESSAGE, drawCupidMessage}
