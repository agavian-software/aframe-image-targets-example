const MAGIC_CDN_BASE = 'https://d1y2o0xoe5yirl.cloudfront.net'

const joinUrl = (base, value) => {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `${String(base).replace(/\/$/, '')}/${String(value).replace(/^\//, '')}`
}

const resolveMagicAssetUrl = value => joinUrl(MAGIC_CDN_BASE, value)
const normalizeTargetName = value => String(value || '').replace(/\.json$/i, '')

module.exports = {joinUrl, resolveMagicAssetUrl, normalizeTargetName}
