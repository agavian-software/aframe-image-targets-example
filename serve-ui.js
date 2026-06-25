const fs = require('fs')
const http = require('http')
const path = require('path')

const root = path.join(__dirname, 'dist')
const port = Number(process.env.PORT || process.env.UI_PORT || 5173)

const types = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tflite': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
}

const getFilePath = (url) => {
  const cleanUrl = decodeURIComponent((url || '/').split('?')[0])
  const requested = cleanUrl === '/' ? '/index.html' : cleanUrl
  const filePath = path.normalize(path.join(root, requested))

  return filePath.startsWith(root) ? filePath : null
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    res.end()
    return
  }

  if (req.method !== 'GET') {
    send(res, 405, 'Method Not Allowed')
    return
  }

  const filePath = getFilePath(req.url)
  if (!filePath) {
    send(res, 403, 'Forbidden')
    return
  }

  const target = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(root, 'index.html')

  fs.readFile(target, (error, data) => {
    if (error) {
      send(res, 404, 'Not Found')
      return
    }

    send(res, 200, data, types[path.extname(target).toLowerCase()] || 'application/octet-stream')
  })
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop that process or run with UI_PORT=another_port.`)
    process.exit(1)
  }

  console.error(error)
  process.exit(1)
})

server.listen(port, () => {
  console.log(`UI server listening at http://localhost:${port}/`)
})
