// Minimal React stand-in: loads client.js's factory, runs apply(), and checks
// that every slot registration the panel needs is actually made.
import fs from 'node:fs'
import vm from 'node:vm'

const src = fs.readFileSync('F:/zz12hui/dsh-radar-plugin/client.js', 'utf8')
const registered = []
const slots = {
  register: (opt, Comp) => {
    registered.push({ kind: 'register', name: opt.name, id: opt.id ?? null, key: opt.key ?? null, order: opt.order ?? null, comp: typeof Comp })
    return () => {}
  },
  inject: (key, cb) => {
    registered.push({ kind: 'inject', into: key, ran: false })
    const entry = registered[registered.length - 1]
    cb()
    entry.ran = true
    return () => {}
  },
}

const ctx = {
  slots,
  get: (k) => (k === 'layout' ? { selectPanel: () => {} } : undefined),
  effect: (fn) => { fn(); return () => {} },
}

const React = {
  createElement: () => null,
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useMemo: (f) => f(),
  useCallback: (f) => f,
  useRef: (v) => ({ current: v }),
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  document: { baseURI: 'http://x/', querySelector: () => null, addEventListener: () => {}, removeEventListener: () => {} },
  navigator: { clipboard: { writeText: async () => {} } },
  localStorage: { getItem: () => null, setItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  fetch: async () => ({ ok: true, json: async () => ({ value: { sidebarEntry: true } }) }),
  AbortSignal: { timeout: () => undefined },
  location: { reload: () => {} },
  require: (name) => (name === 'react' ? React : {}),
}
sandbox.globalThis = sandbox
sandbox.window = sandbox
sandbox.window.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    sandbox.__id = id
    sandbox.__exports = factory(sandbox.require)
  },
}

vm.createContext(sandbox)
vm.runInContext(src, sandbox)

console.log('module id:', sandbox.__id)
const mod = sandbox.__exports
console.log('exports:', Object.keys(mod).join(', '), '| inject =', JSON.stringify(mod.inject))

mod.apply(ctx)
// The sidebar entry waits for the config round-trip before registering, so the
// check has to let that promise settle first.
await new Promise((r) => setTimeout(r, 50))
console.log('\nslot registrations:')
for (const r of registered) {
  if (r.kind === 'inject') console.log(`  inject -> ${r.into}${r.ran ? ' (callback ran)' : ' (did NOT run)'}`)
  else console.log(`  register ${r.name}${r.id ? ' id=' + r.id : ''}${r.key ? ' key=' + r.key : ''}${r.order !== null ? ' order=' + r.order : ''} comp=${r.comp}`)
}

const names = registered.filter((r) => r.kind === 'register').map((r) => r.name)
const need = ['sidebar.panellist', 'main', 'conversation.composer.dock']
const missing = need.filter((n) => !names.includes(n))
console.log('\nrequired slots present:', missing.length === 0 ? 'YES' : 'MISSING ' + missing.join(', '))
process.exit(missing.length === 0 && mod.inject.length === 1 ? 0 : 1)
