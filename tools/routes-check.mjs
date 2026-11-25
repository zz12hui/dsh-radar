// Mount the plugin against a fake webServer and exercise every route.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

const routes = new Map()
const disposers = []

const fakeCtx = {
  inject(names, fn) {
    // Mirrors cordis: the callback runs once the named service exists.
    fn({ get: (name) => (name === 'webServer' ? webServer : undefined) })
  },
  get: () => undefined,
  fiber: undefined,
}

const webServer = {
  register(route) {
    if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
    routes.set(route.path, route.handler)
    const dispose = () => routes.delete(route.path)
    disposers.push(dispose)
    return dispose
  },
}

const mod = await import(new URL('../index.js', import.meta.url).href)
mod.apply(fakeCtx, {})

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name} ${detail}`)
  }
}

/** Invoke a handler the way Node's http server would. */
function call(routePath, { method = 'GET', body, origin, url } = {}) {
  const handler = routes.get(routePath)
  if (!handler) throw new Error(`no route ${routePath}`)
  const payload = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
  const req = Readable.from(payload)
  req.method = method
  req.url = url || routePath
  req.headers = { host: '127.0.0.1:51346' }
  if (origin) req.headers.origin = origin
  return new Promise((resolve) => {
    const chunks = []
    const res = {
      statusCode: 0,
      headers: {},
      writeHead(code, headers) {
        this.statusCode = code
        Object.assign(this.headers, headers || {})
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.from(chunk))
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(text) } catch {}
        resolve({ status: this.statusCode, headers: this.headers, text, json })
      },
    }
    handler(req, res)
  })
}

console.log('route table')
for (const p of routes.keys()) console.log('  ', p)
check('six routes registered', routes.size === 6, `got ${routes.size}`)

/* ---- health / data / config ---- */
{
  const health = await call('/api/dsh-radar/health')
  check('health 200', health.status === 200, `got ${health.status}`)
  check('health reports plugins', health.json?.plugins > 6000, `got ${health.json?.plugins}`)
  check('health reports skills', health.json?.skills > 800, `got ${health.json?.skills}`)
  check('health echoes sidebarEntry', health.json?.sidebarEntry === true)

  const data = await call('/api/dsh-radar/data')
  check('data 200', data.status === 200)
  const parsed = JSON.parse(data.text)
  check('data has plugins array', Array.isArray(parsed.plugins) && parsed.plugins.length > 6000, `got ${parsed.plugins?.length}`)
  check('data rows are 11 wide after the source field', parsed.plugins[0].length >= 10, `got ${parsed.plugins[0].length}`)
  check('no-store cache header', data.headers['cache-control'] === 'no-store')

  const cfg = await call('/api/dsh-radar/config')
  check('config 200', cfg.status === 200)
  check('config reports sidebar entry', cfg.json?.value?.sidebarEntry === true)

  const status = await call('/api/dsh-radar/status')
  check('status 200', status.status === 200)
  check('status idle at start', status.json?.refreshing === false)
}

/* ---- same-origin guard ---- */
{
  const blocked = await call('/api/dsh-radar/data', { origin: 'https://evil.example.com' })
  check('cross-origin read refused', blocked.status === 403, `got ${blocked.status}`)

  const allowed = await call('/api/dsh-radar/data', { origin: 'http://127.0.0.1:51346' })
  check('same-origin read allowed', allowed.status === 200, `got ${allowed.status}`)

  const wrongMethod = await call('/api/dsh-radar/data', { method: 'POST' })
  check('POST on a GET route refused', wrongMethod.status === 405, `got ${wrongMethod.status}`)

  const refreshGet = await call('/api/dsh-radar/refresh', { method: 'GET' })
  check('GET on refresh refused', refreshGet.status === 405, `got ${refreshGet.status}`)
}

/* ---- README proxy argument validation ---- */
{
  const bad = await call('/api/dsh-radar/readme', { url: '/api/dsh-radar/readme?repo=../etc/passwd' })
  check('path traversal refused', bad.json?.ok === false, JSON.stringify(bad.json))

  const missing = await call('/api/dsh-radar/readme', { url: '/api/dsh-radar/readme' })
  check('missing repo refused', missing.json?.ok === false)

  const weird = await call('/api/dsh-radar/readme', { url: '/api/dsh-radar/readme?repo=not-a-repo' })
  check('shorthand repo refused', weird.json?.ok === false, JSON.stringify(weird.json))
}

/* ---- real README over the network ---- */
{
  const url = '/api/dsh-radar/readme?repo=' + encodeURIComponent('T-Auto/dsh-ops')
  const readme = await call('/api/dsh-radar/readme', { url })
  check('readme 200', readme.status === 200, `got ${readme.status}`)
  check('readme fetched', readme.json?.ok === true, JSON.stringify(readme.json).slice(0, 200))
  check('readme carries markdown', typeof readme.json?.text === 'string' && readme.json.text.length > 200, `len ${readme.json?.text?.length}`)
  check('readme looks like the project', /dsh-ops/i.test(readme.json?.text || ''))

  const again = await call('/api/dsh-radar/readme', { url })
  check('second call served from cache', again.json?.cached === true, JSON.stringify(again.json?.cached))

  const missing = await call('/api/dsh-radar/readme', { url: '/api/dsh-radar/readme?repo=zz12hui/definitely-not-a-real-repo-xyz' })
  check('missing README reported cleanly', missing.json?.ok === false && /没有 README|404/.test(String(missing.json?.error)), JSON.stringify(missing.json))
}

/* ---- refresh with both sources disabled should refuse ---- */
{
  const none = await call('/api/dsh-radar/refresh', { method: 'POST', body: { npm: false, github: false } })
  check('refresh without sources refused', none.json?.ok === false, JSON.stringify(none.json).slice(0, 200))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
