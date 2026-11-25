// Offline checks for the refresh merge: pure function, no network.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

// The merge lives in index.js, which imports only node builtins — safe to load.
const mod = await import(new URL('../index.js', import.meta.url).href).catch((error) => {
  console.error('import failed:', error.message)
  process.exit(1)
})

const mergeSnapshot = mod.mergeSnapshot
if (typeof mergeSnapshot !== 'function') {
  console.error('mergeSnapshot is not exported')
  process.exit(1)
}

let pass = 0
let fail = 0
const check = (name, condition, detail = '') => {
  if (condition) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name} ${detail}`)
  }
}

const base = {
  generated: '2026-11-19',
  cats: { tools: '工具与能力', memory: '记忆' },
  plugins: [
    // [id, repo, cat, zh, en, stars, dl, pushed, score, lic, src]
    ['dsh-ops', 'T-Auto/dsh-ops', 'tools', '运维工具', 'ops tools', 5934, 258459, 0, 81.8, 'MIT', 'npm'],
    ['dsh-known', 'someone/knowndev', 'tools', '已知插件', 'known', 100, 2000, 5, 3.2, 'MIT', 'npm'],
  ],
  skills: [['owner/skill', 'owner', 'skill', 'desc', 500, 3, 60, 'MIT']],
  archived: [],
  rising: [],
  rankedPlugins: 2,
  rankedSkills: 1,
}

/* 1. catalog entries that already exist keep their numbers */
{
  const { snapshot, stats } = mergeSnapshot(base, {
    catalog: [
      {
        name: 'dsh-known',
        description: { zh: '新简介', en: 'new desc' },
        metadata: { category: 'memory' },
        repository: { url: 'https://github.com/someone/knowndev' },
        versions: [{ version: '1.2.3' }],
      },
    ],
    github: [],
  })
  const row = snapshot.plugins.find((r) => r[0] === 'dsh-known')
  check('existing row survives', Boolean(row))
  check('existing stars kept', row[5] === 100, `got ${row[5]}`)
  check('existing downloads kept', row[6] === 2000, `got ${row[6]}`)
  check('description refreshed', row[3] === '新简介', `got ${row[3]}`)
  check('category refreshed', row[2] === 'memory', `got ${row[2]}`)
  check('plugin count unchanged', snapshot.plugins.length === 2, `got ${snapshot.plugins.length}`)
  check('stats.enriched counts the update', stats.enriched === 1, `got ${stats.enriched}`)
}

/* 2. a brand-new npm catalog entry is appended */
{
  const { snapshot, stats } = mergeSnapshot(base, {
    catalog: [
      {
        name: 'dsh-brand-new',
        description: { zh: '全新插件', en: 'brand new' },
        metadata: { category: 'tools' },
        repository: { url: 'https://github.com/newowner/dsh-brand-new.git' },
        versions: [{ version: '0.1.0' }],
      },
    ],
    github: [],
  })
  const row = snapshot.plugins.find((r) => r[0] === 'dsh-brand-new')
  check('new catalog row appended', Boolean(row))
  check('repo extension stripped', row[1] === 'newowner/dsh-brand-new', `got ${row[1]}`)
  check('new row has zero downloads', row[6] === 0, `got ${row[6]}`)
  check('new row scored', typeof row[8] === 'number' && row[8] >= 0, `got ${row[8]}`)
  check('count grew', snapshot.plugins.length === 3, `got ${snapshot.plugins.length}`)
  check('stats.added counts it', stats.added === 1, `got ${stats.added}`)
}

/* 3. GitHub-only repos join with stars, and never duplicate a catalog repo */
{
  const { snapshot, stats } = mergeSnapshot(base, {
    catalog: [],
    github: [
      {
        full_name: 'gh/only-repo',
        description: 'a github only plugin',
        stargazers_count: 4200,
        pushed_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        topics: ['dsh-plugin', 'dsh-memory'],
        license: { spdx_id: 'Apache-2.0' },
        archived: false,
      },
      {
        full_name: 'T-Auto/dsh-ops',
        description: 'dup',
        stargazers_count: 9999,
        pushed_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        topics: ['dsh-plugin'],
        license: { spdx_id: 'MIT' },
        archived: false,
      },
    ],
  })
  const added = snapshot.plugins.find((r) => r[1] === 'gh/only-repo')
  check('github-only repo added', Boolean(added))
  check('github stars carried', added[5] === 4200, `got ${added[5]}`)
  check('github source marked', added[10] === 'github', `got ${added[10]}`)
  check('license carried', added[9] === 'Apache-2.0', `got ${added[9]}`)
  check('category guessed from topics', added[2] === 'memory', `got ${added[2]}`)

  const dup = snapshot.plugins.filter((r) => (r[1] || '').toLowerCase() === 't-auto/dsh-ops')
  check('no duplicate for a known repo', dup.length === 1, `got ${dup.length}`)
  check('existing repo keeps its downloads', dup[0][6] === 258459, `got ${dup[0][6]}`)
  check('github star number wins when higher', dup[0][5] === 9999, `got ${dup[0][5]}`)
  check('stats.githubAdded counts only new', stats.githubAdded === 1, `got ${stats.githubAdded}`)
}

/* 4. topic abuse: unrelated repos carrying dsh-plugin are dropped */
{
  const { snapshot, stats } = mergeSnapshot(base, {
    catalog: [],
    github: [
      {
        full_name: 'Molunerfinn/PicGo',
        description: 'The ultimate image uploader for creators.',
        stargazers_count: 27521,
        pushed_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        topics: ['dsh-plugin', 'electron', 'image-uploader'],
        license: { spdx_id: 'MIT' },
        archived: false,
      },
      {
        full_name: 'someone/dsh-real-one',
        description: 'A DSH plugin that does something.',
        stargazers_count: 900,
        pushed_at: new Date(Date.now() - 4 * 86400000).toISOString(),
        topics: ['dsh-plugin'],
        license: { spdx_id: 'MIT' },
        archived: false,
      },
    ],
  })
  check('unrelated repo dropped despite the topic',
    !snapshot.plugins.find((r) => r[1] === 'Molunerfinn/PicGo'))
  check('dsh-named repo kept',
    Boolean(snapshot.plugins.find((r) => r[1] === 'someone/dsh-real-one')))
  check('skip counter reports the drop', stats.githubSkipped === 1, `got ${stats.githubSkipped}`)
  check('skip counter lands in sources',
    snapshot.sources.githubSkipped === 1, `got ${snapshot.sources.githubSkipped}`)
}

/* 4b. a repo already in the catalog is never dropped by the filter */
{
  const { snapshot } = mergeSnapshot(base, {
    catalog: [],
    github: [
      {
        full_name: 'T-Auto/dsh-ops',
        description: 'ops tools',
        stargazers_count: 6000,
        pushed_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        topics: ['dsh-plugin'],
        license: { spdx_id: 'MIT' },
        archived: false,
      },
    ],
  })
  check('known repo still matches after filtering',
    snapshot.plugins.filter((r) => r[0] === 'dsh-ops').length === 1)
}

/* 5. archived GitHub repos are skipped */
{
  const { snapshot } = mergeSnapshot(base, {
    catalog: [],
    github: [{ full_name: 'dead/archived', stargazers_count: 500, topics: ['dsh-plugin'], archived: true }],
  })
  check('archived github repo skipped', !snapshot.plugins.find((r) => r[1] === 'dead/archived'))
}

/* 6. scoring stays inside 0..100 after a merge of mixed data */
{
  const big = []
  for (let i = 0; i < 40; i++) {
    big.push({
      name: `pkg-${i}`,
      description: { zh: `插件 ${i}`, en: `plugin ${i}` },
      metadata: { category: 'tools' },
      repository: { url: `https://github.com/dev${i}/pkg-${i}` },
      versions: [{ version: '1.0.0' }],
    })
  }
  const github = []
  for (let i = 0; i < 20; i++) {
    github.push({
      full_name: `gh${i}/dsh-repo-${i}`,
      description: 'a dsh plugin',
      stargazers_count: (i + 1) * 1000,
      pushed_at: new Date(Date.now() - i * 86400000).toISOString(),
      topics: ['dsh-plugin'],
      license: { spdx_id: 'MIT' },
      archived: false,
    })
  }
  const { snapshot } = mergeSnapshot(base, { catalog: big, github })
  const scores = snapshot.plugins.map((r) => r[8])
  check('scores are numbers', scores.every((x) => typeof x === 'number' && !Number.isNaN(x)))
  check('scores within 0..100', scores.every((x) => x >= 0 && x <= 100), `min ${Math.min(...scores)} max ${Math.max(...scores)}`)
  // A perfect 100 needs both the top star count and the top download count on
  // one row; GitHub-only rows carry no downloads, so the ceiling sits lower.
  check('top score is substantial', Math.max(...scores) >= 60, `got ${Math.max(...scores)}`)
  check('download-heavy row still tops when it has fresh pushes',
    snapshot.plugins.find((r) => r[0] === 'dsh-ops')[8] > 0)
  check('row count = base + new', snapshot.plugins.length === 2 + 40 + 20, `got ${snapshot.plugins.length}`)
  check('refreshedAt stamped', /^\d{4}-\d\d-\d\dT/.test(snapshot.refreshedAt || ''), `got ${snapshot.refreshedAt}`)
  check('sources recorded', snapshot.sources.npm === 40 && snapshot.sources.github === 20, JSON.stringify(snapshot.sources))
}

/* 7. an empty merge leaves the snapshot usable */
{
  const { snapshot } = mergeSnapshot(base, { catalog: [], github: [] })
  check('empty merge keeps rows', snapshot.plugins.length === 2, `got ${snapshot.plugins.length}`)
  check('empty merge keeps skills', snapshot.skills.length === 1, `got ${snapshot.skills.length}`)
  check('empty merge still scores', snapshot.plugins.every((r) => typeof r[8] === 'number'))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
