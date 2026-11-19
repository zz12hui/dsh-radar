/**
 * dsh-radar — Host half.
 *
 * Serves the radar snapshot and persists the one user-facing option:
 *   GET  /api/dsh-radar/data     -> radar.json (plugins, skills, rising, meta)
 *   GET  /api/dsh-radar/config   -> { sidebarEntry }
 *   POST /api/dsh-radar/config   -> { sidebarEntry } (writes the row config)
 *   GET  /api/dsh-radar/health   -> { ok, generated, plugins, skills }
 *
 * The snapshot ships with the bundle (`data/radar.json`), so the page works
 * offline and scans the whole catalog without a network round-trip.
 */
import fs from 'node:fs'

const API_PREFIX = '/api/dsh-radar'

/** Resolved once per read window, so repeated page loads do not re-parse 2 MB. */
function loadSnapshot(packageDir) {
  const file = new URL('./data/radar.json', packageDir)
  const cache = { at: 0, body: null }

  return function read() {
    const now = Date.now()
    if (cache.body !== null && now - cache.at < 5 * 60 * 1000) return cache.body
    cache.body = fs.readFileSync(file, 'utf8')
    cache.at = now
    return cache.body
  }
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

/** Same-origin only: the page is served by this host, so no cross-site read is legitimate. */
function sameOrigin(request) {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (chunks.length === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

export function apply(ctx, config = {}) {
  const packageDir = new URL('.', import.meta.url)
  const readSnapshot = loadSnapshot(packageDir)
  const current = () => ({ sidebarEntry: config.sidebarEntry !== false })

  ctx.inject(['webServer'], (sctx) => {
    const server = sctx.get('webServer')
    if (!server || typeof server.register !== 'function') return

    const guard = (req, res, methods) => {
      if (!sameOrigin(req)) {
        writeJson(res, 403, { error: 'same-origin requests only' })
        return false
      }
      if (!methods.includes(req.method)) {
        writeJson(res, 405, { error: 'method not allowed' })
        return false
      }
      return true
    }

    const routes = [
      {
        kind: 'exact',
        path: `${API_PREFIX}/data`,
        handler: (req, res) => {
          if (!guard(req, res, ['GET', 'HEAD'])) return
          let body
          try {
            body = readSnapshot()
          } catch (error) {
            return writeJson(res, 500, { error: `radar snapshot unreadable: ${error?.message ?? error}` })
          }
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
          })
          res.end(req.method === 'HEAD' ? undefined : body)
        },
      },
      {
        kind: 'exact',
        path: `${API_PREFIX}/config`,
        handler: async (req, res) => {
          if (!guard(req, res, ['GET', 'POST'])) return
          if (req.method === 'GET') return writeJson(res, 200, { ok: true, value: current() })

          const body = await readJsonBody(req)
          if (body === undefined || typeof body !== 'object') {
            return writeJson(res, 400, { ok: false, error: 'malformed JSON body' })
          }
          const entry = ctx.fiber?.entry
          const editor = ctx.get('configEditor')
          if (entry === undefined || editor === undefined) {
            return writeJson(res, 200, {
              ok: false,
              error: 'this profile cannot save plugin configuration',
              value: current(),
            })
          }
          const next = { ...(entry.config ?? {}), sidebarEntry: body.sidebarEntry !== false }
          try {
            await editor.edit(entry, () => next)
            writeJson(res, 200, { ok: true, value: { sidebarEntry: next.sidebarEntry } })
          } catch (error) {
            writeJson(res, 200, {
              ok: false,
              error: String(error?.message ?? error),
              value: current(),
            })
          }
        },
      },
      {
        kind: 'exact',
        path: `${API_PREFIX}/health`,
        handler: (req, res) => {
          if (!guard(req, res, ['GET', 'HEAD'])) return
          try {
            const parsed = JSON.parse(readSnapshot())
            writeJson(res, 200, {
              ok: true,
              generated: parsed.generated,
              plugins: parsed.plugins?.length ?? 0,
              skills: parsed.skills?.length ?? 0,
              ...current(),
            })
          } catch (error) {
            writeJson(res, 500, { ok: false, error: String(error?.message ?? error) })
          }
        },
      },
    ]

    const disposers = routes.map((route) => server.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  })
}

export const inject = ['webServer']
export const name = 'dsh-radar'
