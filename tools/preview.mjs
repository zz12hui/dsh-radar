// Renders the radar panel off-DSH so the UI can be screenshotted without a
// browser session: a minimal React reimplementation (state, effects, re-render
// passes) plus a JSX-free HTML serializer.
import fs from 'node:fs'
import vm from 'node:vm'

const SNAP = JSON.parse(fs.readFileSync('F:/zz12hui/dsh-radar-plugin/data/radar.json', 'utf8'))

/* ---------------- mini React ---------------- */
const hookStore = new Map() // component fn -> hook slots
let current = null // { fn, index }

function slotsFor(fn) {
  let s = hookStore.get(fn)
  if (!s) hookStore.set(fn, (s = []))
  return s
}

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
  useState(initial) {
    const s = slotsFor(current.fn)
    const i = current.index++
    if (!(i in s)) s[i] = { v: typeof initial === 'function' ? initial() : initial }
    const slot = s[i]
    return [slot.v, (next) => { slot.v = typeof next === 'function' ? next(slot.v) : next; dirty = true }]
  },
  useMemo(fn) { current.index++; return fn() },
  useCallback(fn) { current.index++; return fn },
  useRef(v) { const s = slotsFor(current.fn); const i = current.index++; if (!(i in s)) s[i] = { current: v }; return s[i] },
  useEffect(fn) {
    const s = slotsFor(current.fn)
    const i = current.index++
    if (!(i in s)) { s[i] = true; pendingEffects.push(fn) }
  },
}
let dirty = false
let pendingEffects = []

/* ---------------- load module ---------------- */
const src = fs.readFileSync('F:/zz12hui/dsh-radar-plugin/client.js', 'utf8')
let Page = null
const slots = {
  register: (opt, Comp) => { if (opt.key === 'dsh-radar') Page = Comp; return () => {} },
  inject: (key, cb) => { cb(); return () => {} },
}
let exported = null
const sandbox = {
  console, setTimeout, clearTimeout,
  document: { baseURI: 'http://localhost:51346/', querySelector: () => null, addEventListener() {}, removeEventListener() {} },
  addEventListener() {}, removeEventListener() {}, scrollTo() {},
  navigator: { clipboard: { writeText: async () => {} } },
  localStorage: { getItem: () => null, setItem() {} },
  sessionStorage: {
    getItem: (k) => (k === 'dsh-radar-ui' && process.env.PREVIEW_TAB ? JSON.stringify({ tab: process.env.PREVIEW_TAB, scroll: 0 }) : null),
    setItem() {},
  },
  fetch: async () => ({ ok: true, json: async () => SNAP }),
  AbortSignal: { timeout: () => undefined },
  location: { reload() {} },
  require: (n) => (n === 'react' ? React : {}),
}
sandbox.globalThis = sandbox
sandbox.window = sandbox
sandbox.__ModuleLoader__ = { load: ({ factory }) => { exported = factory(sandbox.require) } }
vm.createContext(sandbox)
vm.runInContext(src, sandbox)

exported.apply({
  slots,
  get: (k) => (k === 'layout' ? { selectPanel() {} } : undefined),
  effect: (fn) => { fn(); return () => {} },
})
if (!Page) throw new Error('RadarPage was never registered on the main slot')

/* ---------------- render loop ---------------- */
const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link'])
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function render(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return esc(node)
  if (Array.isArray(node)) return node.map(render).join('')
  const { type, props, children } = node
  if (typeof type === 'function') {
    const outer = current
    current = { fn: type, index: 0 }
    let out
    try { out = type({ ...props, children: children.length > 1 ? children : children[0] }) } finally { current = outer }
    return render(out)
  }
  const attrs = Object.entries(props || {})
    .filter(([k, v]) => v !== undefined && v !== null && v !== false && !k.startsWith('on') && k !== 'key' && k !== 'ref')
    .map(([k, v]) => {
      const name = k === 'className' ? 'class' : k === 'htmlFor' ? 'for' : k
      if (v === true) return name
      if (k === 'style' && typeof v === 'object') return `style="${esc(Object.entries(v).map(([a, b]) => `${a}:${b}`).join(';'))}"`
      return `${name}="${esc(v)}"`
    }).join(' ')
  const inner = children.map(render).join('')
  return VOID.has(type) ? `<${type} ${attrs}>` : `<${type} ${attrs}>${inner}</${type}>`
}

async function paint() {
  for (let pass = 0; pass < 12; pass++) {
    dirty = false
    pendingEffects = []
    current = { fn: Page, index: 0 }
    const html = render(React.createElement(Page))
    // run this pass's effects, then flush any state they set
    for (const eff of pendingEffects) { try { eff() } catch (e) { console.error('effect error:', e.message) } }
    await new Promise((r) => setTimeout(r, 30))
    if (!dirty) return html
  }
  return '<p>render did not settle</p>'
}

const html = await paint()
fs.writeFileSync('F:/zz12hui/dsh-radar-plugin/.preview.html',
  `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#141414">${html}</body>`, 'utf8')
console.log('tab:', process.env.PREVIEW_TAB || 'discover')
console.log('wrote .preview.html', fs.statSync('F:/zz12hui/dsh-radar-plugin/.preview.html').size, 'bytes')
console.log('sample:', html.slice(0, 220).replace(/\s+/g, ' '))
