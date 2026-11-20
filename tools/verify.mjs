/**
 * Offline harness: loads the Client module in Node with a tiny require shim,
 * then exercises runDiscovery / buildPrompt against the real snapshot.
 * The module's factory returns { inject, apply }; the internals are re-read
 * from source so this stays in sync without extra exports.
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const clientPath = path.join(root, 'client.js')
const dataPath = path.join(root, 'data', 'radar.json')

const source = fs.readFileSync(clientPath, 'utf8')
const snapshot = JSON.parse(fs.readFileSync(dataPath, 'utf8'))

// Pull the two pure helpers out of the module body and evaluate them alone.
function extract(name) {
  const start = source.indexOf(`function ${name}(`)
  const decl = start === -1 ? source.indexOf(`const ${name} = (`) : start
  if (decl === -1) throw new Error(`${name} not found`)
  // find the matching closing brace of the body (function or arrow alike)
  let depth = 0
  let i = source.indexOf('{', decl)
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return source.slice(decl, i + 1)
}

const dictStart = source.indexOf('const DICT = [')
const dictEnd = source.indexOf('\n    ]', dictStart) + 6
const dictSrc = source.slice(dictStart, dictEnd).replace('const DICT =', 'var DICT =')

const sandbox = { DICT: null, catName: (cats, c) => cats[c] || c || '其他' }
vm.createContext(sandbox)
vm.runInContext(dictSrc, sandbox)
vm.runInContext(extract('runDiscovery').replace('function runDiscovery', 'var runDiscovery = function'), sandbox)
vm.runInContext(extract('buildPrompt').replace('function buildPrompt', 'var buildPrompt = function'), sandbox)

const DEF = { stars: 0, dl: 0, pushed: 180, score: 40, limit: 40, skills: true, archived: false, fresh: true, off: [] }
const results = []
const check = (label, ok, extra = '') => {
  results.push({ label, ok, extra })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

const t0 = Date.now()
const normal = sandbox.runDiscovery(snapshot, DEF)
const ms = Date.now() - t0
check('标准档命中非空', normal.total > 0, `${normal.total} 条 / 扫描 ${normal.scanned} / ${ms}ms`)
check('标准档扫描全量', normal.scanned === 6245 + 896, String(normal.scanned))
check('词条全部启用', normal.words === 204, String(normal.words))

const strict = sandbox.runDiscovery(snapshot, { ...DEF, stars: 3000, dl: 20000, pushed: 60, score: 60 })
check('严格档少于标准档', strict.total > 0 && strict.total < normal.total, `${strict.total} vs ${normal.total}`)

const offAll = sandbox.runDiscovery(snapshot, { ...DEF, off: sandbox.DICT.flatMap((g) => g.words) })
check('全关词条命中为 0', offAll.total === 0, String(offAll.total))

const noSkills = sandbox.runDiscovery(snapshot, { ...DEF, skills: false })
check('关技能后不扫技能', noSkills.scanned === 6245, String(noSkills.scanned))
check('关技能后技能命中为 0', noSkills.hits.skill.length === 0)

const onlyMemory = sandbox.runDiscovery(snapshot, {
  ...DEF,
  off: sandbox.DICT.filter((g) => g.key !== 'memory').flatMap((g) => g.words),
})
const onlyMemoryBad = onlyMemory.hits.plugin.filter((p) => p.badge === '' )
check('只开记忆词条仍有命中', onlyMemory.total > 0, String(onlyMemory.total))
check('只开记忆词条命中带 badge', onlyMemoryBad.length === 0)
const memSample = onlyMemory.hits.plugin.slice(0, 3).map((p) => `${p.id}(${p.badge})`).join(', ')
console.log('   sample:', memSample)

const asc = normal.hits.plugin.every((p, i, a) => i === 0 || a[i - 1].n >= p.n)
check('插件按命中词数降序', asc)

const p = sandbox.buildPrompt([
  { kind: 'plugin', id: 'dsh-context', repo: 'PC2005-cloud/dsh-context', zh: '上下文透视面板' },
  { kind: 'skill', id: 'anthropics/skills', name: 'skills', desc: 'Public repository for Agent Skills' },
])
check('提示词含插件段', p.includes('## 插件') && p.includes('dsh-context'))
check('提示词含仓库链接', p.includes('https://github.com/PC2005-cloud/dsh-context'))
check('提示词含技能段', p.includes('## 技能') && p.includes('~/.dsh/skills/skills'))
check('提示词含安装说明', p.includes('dsh plugin --profile'))

const onlySkill = sandbox.buildPrompt([{ kind: 'skill', id: 'a/b', name: 'b', desc: 'x' }])
check('只有技能时不出现插件段', !onlySkill.includes('## 插件'))

const empty = sandbox.buildPrompt([])
check('空选择给出占位', empty.includes('还没勾选'))

/* --- composer bridge: append instead of clobber ------------------------- */
// `draftIntoComposer` closes over the module-level `composer` handle, so it is
// lifted out of source together with a stand-in for that handle.
{
  const bridgeSrc = extract('draftIntoComposer').replace('const draftIntoComposer =', 'var draftIntoComposer =')
  const box = { sessionId: null, actions: null, readDraft: null }
  const scope = {
    composer: box,
    // the real body reads `composer.actions` / `composer.readDraft`
  }
  vm.createContext(scope)
  vm.runInContext(bridgeSrc, scope)
  const write = (text) => scope.draftIntoComposer(text)

  check('没有会话时写入失败', write('hi') === false)
  box.actions = { setDraft: (t) => { box.draft = t } }
  box.readDraft = () => ''
  check('空草稿直接写入', write('提示词') === true && box.draft === '提示词')

  box.readDraft = () => '我自己写的'
  write('提示词')
  check('已有草稿时追加不覆盖', box.draft === '我自己写的\n\n提示词', JSON.stringify(box.draft))

  box.readDraft = () => '有空白   \n'
  write('追加')
  check('追加前裁掉尾部空白', box.draft === '有空白\n\n追加', JSON.stringify(box.draft))

  box.actions = { setDraft: () => { throw new Error('locked') } }
  check('写入抛错时返回失败而不是崩溃', write('x') === false)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
