/**
 * dsh-radar — Host half.
 *
 * Serves the radar snapshot, refreshes it on demand, and proxies repository
 * READMEs for the detail window.
 *
 *   GET  /api/dsh-radar/data            -> snapshot (live cache if any, else bundle)
 *   GET  /api/dsh-radar/config          -> { sidebarEntry }
 *   POST /api/dsh-radar/config          -> { sidebarEntry } (writes the row config)
 *   GET  /api/dsh-radar/health          -> { ok, generated, plugins, skills }
 *   POST /api/dsh-radar/refresh         -> pulls npm catalog + GitHub topic search
 *   GET  /api/dsh-radar/readme?repo=... -> README markdown for one repository
 *   GET  /api/dsh-radar/status          -> { refreshing, updatedAt, lastResult }
 *
 * The bundle ships `data/radar.json` so the page works offline. A successful
 * refresh writes a cache file under the user's DSH cache directory; the bundled
 * snapshot stays untouched, which keeps upgrades from wiping a fresh pull.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const API_PREFIX = '/api/dsh-radar'

const CATALOG_URL = 'https://unpkg.com/dsh-plugin-catalog/index.json'
const GITHUB_SEARCH = 'https://api.github.com/search/repositories'
const GITHUB_README = 'https://api.github.com/repos'

/** Rows are positional; this keeps the layout in one place. */
const P = { id: 0, repo: 1, cat: 2, zh: 3, en: 4, stars: 5, dl: 6, pushed: 7, score: 8, lic: 9, src: 10 }
const S = { id: 0, owner: 1, name: 2, desc: 3, stars: 4, pushed: 5, score: 6, lic: 7 }

const REFRESH_PAGE_SIZE = 100
const REFRESH_MAX_PAGES = 5
const README_TTL_MS = 10 * 60 * 1000
const README_MAX_BYTES = 400 * 1024
const README_CACHE_ROWS = 40

const lg = (n) => Math.log10((n || 0) + 1)

function cacheDir() {
  const home = os.homedir()
  return path.join(home, '.dsh', 'cache', 'dsh-radar')
}

function cacheFile() {
  return path.join(cacheDir(), 'snapshot.json')
}

/** Resolved once per read window, so repeated page loads do not re-parse 2 MB. */
function loadSnapshot(packageDir) {
  const bundled = new URL('./data/radar.json', packageDir)
  const cache = { at: 0, body: null }

  const read = () => {
    const now = Date.now()
    if (cache.body !== null && now - cache.at < 5 * 60 * 1000) return cache.body
    // A live snapshot wins over the bundled one; both are plain JSON text.
    let file = bundled
    try {
      if (fs.existsSync(cacheFile())) file = cacheFile()
    } catch {}
    cache.body = fs.readFileSync(file, 'utf8')
    cache.at = now
    return cache.body
  }

  /** A refresh just wrote a newer file, so the memo has to go. */
  read.invalidate = () => {
    cache.body = null
    cache.at = 0
  }
  return read
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

function githubHeaders(accept = 'application/vnd.github+json') {
  const headers = {
    accept,
    'user-agent': 'dsh-radar-plugin',
    'x-github-api-version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

async function fetchJson(url, timeoutMs = 20000) {
  const response = await fetch(url, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} ${url}${body ? ` — ${body.slice(0, 160)}` : ''}`)
  }
  return response.json()
}

/* --------------------------------------------------------------- merge logic */

function scorePlugins(rows) {
  const maxStars = rows.reduce((n, r) => Math.max(n, r[P.stars] || 0), 0)
  const maxDl = rows.reduce((n, r) => Math.max(n, r[P.dl] || 0), 0)
  const denomStars = lg(maxStars) || 1
  const denomDl = lg(maxDl) || 1
  for (const row of rows) {
    if (row[P.src] === 'archived') {
      // untouched marker row: scoring handled by the caller
    }
    const s = lg(row[P.stars]) / denomStars
    const d = lg(row[P.dl]) / denomDl
    const pushed = row[P.pushed]
    const fresh = pushed === null || pushed === undefined || pushed > 900 ? 0 : Math.max(0, 1 - pushed / 120)
    let score = 0.5 * s + 0.34 * d + 0.16 * fresh
    row[P.score] = Math.round(score * 1000) / 10
  }
  return rows
}

function daysSince(iso) {
  if (!iso) return 999
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 999
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

/** Category guess for repositories that are not in the npm catalog. */
const TOPIC_CATEGORY = [
  [/activit|automation|cron|schedule/, 'workflow'],
  [/memory|recall|knowledge/, 'memory'],
  [/search|browse|crawl|scrap/, 'browser'],
  [/voice|audio|speech|tts/, 'voice'],
  [/image|vision|ocr|video/, 'vision'],
  [/theme|skin|wallpaper|color/, 'theme'],
  [/git|review|commit|pr\b/, 'git'],
  [/security|guard|safety|audit/, 'security'],
  [/mobile|remote|tunnel|ssh/, 'remote'],
  [/market|catalog|registry|plugin-?market/, 'market'],
  [/skill/, 'skill'],
  [/token|usage|cost|billing/, 'usage'],
  [/notify|notification|webhook/, 'notify'],
  [/doc|render|markdown|pdf/, 'docs'],
  [/model|provider|llm|api-?key/, 'model'],
  [/ui|sidebar|panel|widget|tui/, 'ui'],
  [/fun|game|pet|whale/, 'fun'],
]

function guessCategory(topics, text) {
  const hay = `${(topics || []).join(' ')} ${text || ''}`.toLowerCase()
  for (const [re, cat] of TOPIC_CATEGORY) if (re.test(hay)) return cat
  return 'tools'
}

/**
 * The `dsh-plugin` topic is not a reliable signal on its own. Plenty of
 * unrelated tools (image uploaders, reverse-engineering kits) carry it just to
 * show up in searches, so a repository has to mention the ecosystem somewhere
 * other than that topic before it counts as part of this catalog.
 */
const RELEVANT = /(^|[^a-z])(dsh|deepseek|harness)([^a-z]|$)/i
const GENERIC_TOPICS = new Set(['dsh-plugin', 'dsh-pack', 'dsh', 'dsh-plugins'])

function isRelevant(repo) {
  const topics = (repo?.topics || []).filter((t) => !GENERIC_TOPICS.has(String(t).toLowerCase()))
  const fields = [repo?.full_name, repo?.name, repo?.description, ...topics]
  return fields.some((value) => typeof value === 'string' && RELEVANT.test(value))
}

/**
 * Fold a fresh catalog + GitHub search page set into a snapshot.
 *
 * Rules that matter:
 * - Rows that exist in the old snapshot keep their star/download numbers unless
 *   the new source has better data; a catalog-only entry has no downloads.
 * - Repositories found by the topic search but absent from the catalog are
 *   added with the repository name as id and `src: 'github'`.
 * - Scores are recomputed for every row so the ranking stays consistent.
 */
export function mergeSnapshot(base, input = {}) {
  const catalogPlugins = Array.isArray(input.catalog) ? input.catalog : []
  const ghRepos = Array.isArray(input.github) ? input.github : []
  const now = Date.now()

  const rows = (base.plugins || []).map((r) => r.slice())
  const byId = new Map(rows.map((r) => [r[P.id], r]))
  const byRepo = new Map()
  for (const r of rows) if (r[P.repo]) byRepo.set(String(r[P.repo]).toLowerCase(), r)

  const added = []
  const enriched = []
  const seenRepos = new Set(byRepo.keys())

  const upsertCatalog = (plugin) => {
    const name = plugin?.name
    if (!name) return
    const repoRaw = (plugin?.repository && (plugin.repository.url || plugin.repository)) || ''
    const match = /github\.com\/([^/]+)\/([^/#?]+)/i.exec(String(repoRaw))
    const repo = match ? `${match[1]}/${match[2]}`.replace(/\.git$/i, '') : ''
    const zh = (plugin.description && (plugin.description.zh || plugin.description.en)) || ''
    const en = (plugin.description && plugin.description.en) || ''
    const cat = (plugin.metadata && plugin.metadata.category) || 'tools'
    const ver = plugin.versions && plugin.versions[0]
    const lic = (plugin.metadata && plugin.metadata.license) || ''

    const existing = byId.get(name) || (repo ? byRepo.get(repo.toLowerCase()) : undefined)
    if (existing) {
      existing[P.zh] = zh || existing[P.zh]
      existing[P.en] = en || existing[P.en]
      existing[P.cat] = cat || existing[P.cat]
      if (repo) existing[P.repo] = existing[P.repo] || repo
      if (lic) existing[P.lic] = existing[P.lic] || lic
      enriched.push(name)
      return
    }
    const row = new Array(11).fill('')
    row[P.id] = name
    row[P.repo] = repo
    row[P.cat] = cat
    row[P.zh] = zh
    row[P.en] = en
    row[P.stars] = 0
    row[P.dl] = 0
    row[P.pushed] = 999
    row[P.score] = 0
    row[P.lic] = lic
    row[P.src] = 'npm'
    rows.push(row)
    byId.set(name, row)
    if (repo) {
      byRepo.set(repo.toLowerCase(), row)
      seenRepos.add(repo.toLowerCase())
    }
    added.push(name)
    void ver
  }

  for (const plugin of catalogPlugins) upsertCatalog(plugin)

  let ghAdded = 0
  let ghSkipped = 0
  for (const repo of ghRepos) {
    const full = repo?.full_name
    if (!full || repo.archived) continue
    const key = full.toLowerCase()
    const stars = repo.stargazers_count || 0
    const pushed = daysSince(repo.pushed_at)
    const lic = (repo.license && repo.license.spdx_id) || ''
    const desc = repo.description || ''
    const existing = byRepo.get(key)
    if (existing) {
      existing[P.stars] = Math.max(existing[P.stars] || 0, stars)
      existing[P.pushed] = Math.min(existing[P.pushed] ?? 999, pushed)
      if (lic) existing[P.lic] = existing[P.lic] || lic
      continue
    }
    // Already in the npm catalog under another name? Those rows name the repo,
    // so byRepo would have caught them; anything left is search-only.
    if (!isRelevant(repo)) {
      ghSkipped++
      continue
    }
    const row = new Array(11).fill('')
    row[P.id] = full
    row[P.repo] = full
    row[P.cat] = guessCategory(repo.topics, `${full} ${desc}`)
    row[P.zh] = desc
    row[P.en] = desc
    row[P.stars] = stars
    row[P.dl] = 0
    row[P.pushed] = pushed
    row[P.score] = 0
    row[P.lic] = lic
    row[P.src] = 'github'
    rows.push(row)
    byRepo.set(key, row)
    added.push(full)
    ghAdded++
  }

  scorePlugins(rows)

  const skills = (base.skills || []).map((r) => r.slice())
  const archived = new Set(base.archived || [])
  const out = {
    ...base,
    generated: new Date(now).toISOString().slice(0, 10),
    refreshedAt: new Date(now).toISOString(),
    plugins: rows,
    skills,
    archived: [...archived],
    rankedPlugins: rows.length,
    rankedSkills: skills.length,
    sources: {
      npm: catalogPlugins.length,
      github: ghRepos.length,
      githubAdded: ghAdded,
      githubSkipped: ghSkipped,
    },
  }
  return {
    snapshot: out,
    stats: {
      added: added.length,
      githubAdded: ghAdded,
      githubSkipped: ghSkipped,
      enriched: enriched.length,
      plugins: rows.length,
    },
  }
}

/* -------------------------------------------------------------- refresh job */

async function pullCatalog() {
  const response = await fetch(CATALOG_URL, {
    headers: { accept: 'application/json', 'user-agent': 'dsh-radar-plugin' },
    redirect: 'follow',
    signal: AbortSignal.timeout(90000),
  })
  if (!response.ok) throw new Error(`catalog HTTP ${response.status}`)
  const json = await response.json()
  return Array.isArray(json?.plugins) ? json.plugins : []
}

async function pullGitHubTopic(pages) {
  const out = []
  const notes = []
  const max = Math.max(1, Math.min(REFRESH_MAX_PAGES, pages || 3))
  for (let page = 1; page <= max; page++) {
    const url = `${GITHUB_SEARCH}?q=${encodeURIComponent('topic:dsh-plugin')}&sort=stars&order=desc&per_page=${REFRESH_PAGE_SIZE}&page=${page}`
    let json
    try {
      json = await fetchJson(url, 25000)
    } catch (error) {
      // A rate limit half way through keeps whatever pages already arrived,
      // but the shortfall has to reach the UI or the numbers look complete.
      if (page === 1) throw error
      notes.push(`GitHub 搜索第 ${page} 页没拉到（${String(error?.message ?? error).slice(0, 90)}），这次只用了前 ${page - 1} 页`)
      break
    }
    const items = Array.isArray(json?.items) ? json.items : []
    out.push(...items)
    if (items.length < REFRESH_PAGE_SIZE) break
  }
  return { repos: out, notes }
}

/* ------------------------------------------------------------------ READMEs */

function createReadmeCache() {
  const map = new Map()
  return {
    get(key) {
      const hit = map.get(key)
      if (!hit) return null
      if (Date.now() - hit.at > README_TTL_MS) {
        map.delete(key)
        return null
      }
      return hit.value
    },
    set(key, value) {
      map.delete(key)
      map.set(key, { at: Date.now(), value })
      while (map.size > README_CACHE_ROWS) {
        const oldest = map.keys().next().value
        map.delete(oldest)
      }
    },
  }
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

async function pullReadme(repo) {
  const response = await fetch(`${GITHUB_README}/${repo}/readme`, {
    headers: githubHeaders('application/vnd.github.raw'),
    signal: AbortSignal.timeout(20000),
  })
  if (response.status === 404) return { ok: false, error: '这个仓库没有 README' }
  if (!response.ok) {
    const retryAfter = response.headers.get('x-ratelimit-remaining')
    const hint = response.status === 403 || response.status === 429
      ? `GitHub 接口限流了（剩余 ${retryAfter ?? '未知'}），过几分钟再试，或设置 GITHUB_TOKEN 环境变量提高额度`
      : `GitHub 返回 HTTP ${response.status}`
    return { ok: false, error: hint }
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  const clipped = buffer.subarray(0, README_MAX_BYTES)
  return {
    ok: true,
    text: clipped.toString('utf8'),
    truncated: buffer.length > README_MAX_BYTES,
    bytes: buffer.length,
  }
}

/* --------------------------------------------------------------------- apply */

export function apply(ctx, config = {}) {
  const packageDir = new URL('.', import.meta.url)
  const readSnapshot = loadSnapshot(packageDir)
  const readmeCache = createReadmeCache()
  const current = () => ({ sidebarEntry: config.sidebarEntry !== false })

  /** Mutable process state for the refresh button. */
  const state = {
    refreshing: null,
    updatedAt: null,
    lastResult: null,
  }

  const runRefresh = async (input) => {
    const base = JSON.parse(readSnapshot())
    const wantNpm = input?.npm !== false
    const wantGithub = input?.github !== false
    const pages = Number(input?.pages) || 3
    const errors = []

    // Refreshing with nothing selected would only rewrite the same rows.
    if (!wantNpm && !wantGithub) throw new Error('至少选一个数据源再更新')

    let catalog = []
    if (wantNpm) {
      try {
        catalog = await pullCatalog()
      } catch (error) {
        errors.push(`npm 目录：${error?.message ?? error}`)
      }
    }

    let github = []
    if (wantGithub) {
      try {
        const pulled = await pullGitHubTopic(pages)
        github = pulled.repos
        errors.push(...pulled.notes)
      } catch (error) {
        errors.push(`GitHub 搜索：${error?.message ?? error}`)
      }
    }

    // Nothing came back from anything that was asked for: fail loudly instead
    // of writing a snapshot that only looks fresher.
    const gotNothing = (!wantNpm || catalog.length === 0) && (!wantGithub || github.length === 0)
    if (gotNothing) {
      throw new Error(errors.join('；') || '两个数据源都没有返回内容')
    }

    const { snapshot, stats } = mergeSnapshot(base, { catalog, github })
    snapshot.sources = { ...snapshot.sources, errors }

    await fs.promises.mkdir(cacheDir(), { recursive: true })
    await fs.promises.writeFile(cacheFile(), JSON.stringify(snapshot), 'utf8')
    // Order matters: drop the memo only after the new file is on disk, so a
    // reader between the two steps still gets complete JSON either way.
    readSnapshot.invalidate()
    state.updatedAt = snapshot.refreshedAt
    state.lastResult = { ...stats, sources: snapshot.sources, errors, at: snapshot.refreshedAt }
    return state.lastResult
  }

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
        path: `${API_PREFIX}/refresh`,
        handler: async (req, res) => {
          if (!guard(req, res, ['POST'])) return
          if (state.refreshing !== null) {
            return writeJson(res, 200, { ok: false, error: '正在更新中，等这次跑完', busy: true })
          }
          const body = (await readJsonBody(req)) ?? {}
          state.refreshing = Date.now()
          try {
            const result = await runRefresh(body)
            writeJson(res, 200, { ok: true, ...result })
          } catch (error) {
            writeJson(res, 200, { ok: false, error: String(error?.message ?? error) })
          } finally {
            state.refreshing = null
          }
        },
      },
      {
        kind: 'exact',
        path: `${API_PREFIX}/readme`,
        handler: async (req, res) => {
          if (!guard(req, res, ['GET'])) return
          let repo = ''
          try {
            repo = new URL(req.url, 'http://localhost').searchParams.get('repo') || ''
          } catch {}
          if (!REPO_PATTERN.test(repo) || repo.includes('..')) {
            return writeJson(res, 400, { ok: false, error: 'repo must look like owner/name' })
          }
          const hit = readmeCache.get(repo)
          if (hit) return writeJson(res, 200, { ...hit, cached: true })
          try {
            const result = await pullReadme(repo)
            if (result.ok) readmeCache.set(repo, result)
            writeJson(res, 200, result)
          } catch (error) {
            writeJson(res, 200, { ok: false, error: String(error?.message ?? error) })
          }
        },
      },
      {
        kind: 'exact',
        path: `${API_PREFIX}/status`,
        handler: (req, res) => {
          if (!guard(req, res, ['GET'])) return
          writeJson(res, 200, {
            ok: true,
            refreshing: state.refreshing !== null,
            updatedAt: state.updatedAt,
            lastResult: state.lastResult,
          })
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
              refreshedAt: parsed.refreshedAt ?? null,
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
