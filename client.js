/**
 * dsh-radar — Client half.
 *
 * Registers a sidebar entry named 生态雷达 and the panel it opens. The panel
 * scans the full catalog locally (6,245 plugins + 896 skills shipped with the
 * bundle), so opening it always re-runs discovery with the current thresholds.
 */
window.__ModuleLoader__.load({
  id: 'dsh-radar',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = '生态雷达'
    const PANEL_ID = 'dsh-radar'
    const API = '/api/dsh-radar'

    /**
     * The panel lives in the `main` slot, the composer in `main.conversation`.
     * Only one of them is mounted at a time, and `inputActions` is handed to
     * session-scope slots alone, so the panel cannot reach the composer by
     * itself. A null-rendering dock entry captures the action face on the way
     * past and parks it here; the panel picks it up afterwards.
     *
     * The reference deliberately survives unmount. The shell behind it belongs
     * to the session and outlives the dock entry, so a captured face stays
     * usable once the conversation is on screen again. Callers still treat
     * every use as fallible — a closed session may not have one at all.
     */
    const composer = { sessionId: null, actions: null, readDraft: null }

    /** Host-side handles the panel needs; filled in by apply(). */
    const runtime = { ctx: null, layout: null }

    const backToConversation = () => {
      try {
        const layout = runtime.layout ?? runtime.ctx?.get?.('layout')
        if (layout?.selectPanel) {
          layout.selectPanel(null)
          return true
        }
      } catch {}
      return false
    }

    /**
     * Write into the composer without sending. `setDraft` replaces the whole
     * draft, so an existing draft is appended to rather than dropped: losing
     * something the user already typed would be worse than a cluttered box.
     * @returns false when no composer is mounted to receive it.
     */
    const draftIntoComposer = (text) => {
      try {
        const actions = composer.actions
        if (!actions?.setDraft) return false
        const current = composer.readDraft?.() ?? ''
        actions.setDraft(current.trim() ? `${current.trimEnd()}\n\n${text}` : text)
        return true
      } catch {
        return false
      }
    }

    /* ------------------------------------------------------------------ data */

    const bridgeUrl = (endpoint) => {
      try {
        return new URL(`${API}/${endpoint}`, document.baseURI).toString()
      } catch {
        return `${API}/${endpoint}`
      }
    }

    let snapshot = null
    let snapshotPromise = null

    async function loadSnapshot() {
      if (snapshot !== null) return snapshot
      if (snapshotPromise !== null) return snapshotPromise
      snapshotPromise = fetch(bridgeUrl('data'), { signal: AbortSignal.timeout(20000) })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
        .then((json) => {
          snapshot = json
          snapshotPromise = null
          return json
        })
        .catch((error) => {
          snapshotPromise = null
          throw error
        })
      return snapshotPromise
    }

    /** Drop the cached snapshot and pull again — used after a manual refresh. */
    async function reloadSnapshot() {
      snapshot = null
      snapshotPromise = null
      return loadSnapshot()
    }

    const fmt = (n) => {
      if (!n) return '0'
      if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿'
      if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万'
      return n.toLocaleString('zh-CN')
    }

    const fresh = (d) => {
      if (d === null || d === undefined || d > 900) return '—'
      if (d <= 0) return '今天'
      if (d === 1) return '昨天'
      if (d < 30) return `${d} 天前`
      if (d < 365) return `${Math.round(d / 30)} 个月前`
      return `${Math.round(d / 365)} 年前`
    }

    const catName = (cats, c) => cats[c] || c || '其他'

    /* ------------------------------------------------------------- dictionary */

    const DICT = [
      { key: 'memory', label: '记忆与长期上下文', words: ['memory', 'memor', '记忆', '长期记忆', 'recall', 'knowledge', '知识库', '持久', 'persist', 'hindsight', '第二大脑'] },
      { key: 'context', label: '上下文与压缩', words: ['context', '上下文', '压缩', 'compress', 'token', '会话管理', 'session', '缓存'] },
      { key: 'search', label: '搜索与抓取', words: ['search', '搜索', '抓取', 'fetch', 'crawl', 'scraper', 'browse', '检索', 'serp', 'rss', 'news'] },
      { key: 'browser', label: '浏览器与网页', words: ['browser', '浏览器', 'chromium', 'puppeteer', 'playwright', '网页', 'webium', 'cdp'] },
      { key: 'vision', label: '视觉与多模态', words: ['vision', '视觉', '图片', 'image', 'ocr', '截图', 'screenshot', '多模态', 'video', '视频', 'pdf'] },
      { key: 'voice', label: '语音与音频', words: ['voice', '语音', 'audio', '音频', 'tts', 'asr', 'speech', '播客', 'whisper', '转录'] },
      { key: 'ui', label: '界面与侧栏', words: ['sidebar', '侧栏', '侧边栏', 'ui', '界面', 'panel', '面板', '工作台', '改版', '重排', '按钮', '布局'] },
      { key: 'theme', label: '主题与外观', words: ['theme', '主题', '皮肤', 'skin', 'wallpaper', '壁纸', '外观', '配色', '字体'] },
      { key: 'usage', label: '用量与计费', words: ['balance', '余额', 'usage', '用量', '计费', 'token', 'cost', '消耗', '价格', '额度'] },
      { key: 'model', label: '模型接入与账号', words: ['model', '模型', 'provider', '接入', '账号', 'api key', 'llm', '本地模型', 'ollama', '路由', 'router'] },
      { key: 'git', label: 'Git 与代码评审', words: ['git', 'commit', 'diff', 'review', '评审', '代码审查', 'pull request', 'pr ', 'merge', 'worktree'] },
      { key: 'security', label: '安全与权限', words: ['security', '安全', '权限', 'permission', 'sandbox', '沙箱', 'guard', '守卫', 'audit', '审计', '密钥', 'secret'] },
      { key: 'workflow', label: '工作流与自动化', words: ['workflow', '工作流', '自动化', 'automat', '定时', 'cron', 'schedule', 'agent flow', '流水线', 'batch', '批量'] },
      { key: 'remote', label: '远程与移动端', words: ['remote', '远程', 'mobile', '手机', 'android', 'ios', 'ssh', '隧道', 'tunnel', '同步'] },
      { key: 'notify', label: '通知与集成', words: ['notify', '通知', '推送', 'telegram', 'slack', 'webhook', '邮件', 'email', '钉钉', '飞书', '微信', 'wechat'] },
      { key: 'docs', label: '文档与图表', words: ['doc', '文档', 'markdown', '图', 'diagram', '架构图', '流程图', '渲染', 'render', 'slide', 'ppt', 'excel'] },
      { key: 'data', label: '数据与检索库', words: ['database', '数据库', 'sql', 'sqlite', 'vector', '向量', '索引', 'index', '查询', 'query', 'csv', 'json'] },
      { key: 'fun', label: '娱乐与挂件', words: ['pet', '挂件', '桌宠', 'fun', '娱乐', '小游戏', 'game', '鲸鱼', '动画', 'meme', '彩蛋'] },
      { key: 'dev', label: '开发与运行时', words: ['terminal', '终端', 'shell', 'bash', 'runtime', '编译', 'build', 'tsx', 'typescript', '调试', 'debug', '日志', 'log'] },
    ]

    const DEFAULTS = { stars: 0, dl: 0, pushed: 180, score: 40, limit: 40, skills: true, archived: false, fresh: true, off: [] }
    const PRESETS = {
      loose: { stars: 0, dl: 0, pushed: 365, score: 30, limit: 80 },
      normal: { stars: 0, dl: 0, pushed: 180, score: 40, limit: 40 },
      strict: { stars: 3000, dl: 20000, pushed: 60, score: 60, limit: 20 },
    }
    const CFG_KEY = 'dsh-radar-cfg'
    const UI_KEY = 'dsh-radar-ui'

    /** Tab and scroll survive a trip to the conversation and back. */
    const loadUi = () => {
      try {
        return { tab: 'discover', scroll: 0, ...JSON.parse(sessionStorage.getItem(UI_KEY) || '{}') }
      } catch {
        return { tab: 'discover', scroll: 0 }
      }
    }
    const saveUi = (ui) => {
      try {
        sessionStorage.setItem(UI_KEY, JSON.stringify(ui))
      } catch {}
    }

    const loadCfg = () => {
      try {
        return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }
      } catch {
        return { ...DEFAULTS }
      }
    }
    const saveCfg = (cfg) => {
      try {
        localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
      } catch {}
    }

    /** Runs one discovery pass over the whole snapshot. Pure, so it is testable without React. */
    function runDiscovery(snap, settings) {
      if (!snap) return null
      const off = new Set(settings.off || [])
      const groups = DICT.map((g) => ({ ...g, words: g.words.filter((w) => !off.has(w)) })).filter((g) => g.words.length)
      const archived = new Set(snap.archived || [])
      const hits = { plugin: [], skill: [] }

      // The best-matching group decides the badge; more hits ranks higher.
      const match = (text) => {
        let best = null
        for (const g of groups) {
          let n = 0
          let first = ''
          for (const w of g.words) {
            if (text.indexOf(w) !== -1) {
              n++
              if (!first) first = w
            }
          }
          if (n && (best === null || n > best.n)) best = { key: g.key, word: first, n }
        }
        return best
      }

      for (const r of snap.plugins) {
        const [id, repo, cat, zh, en, stars, dl, pushed, score] = r
        if (stars < settings.stars || dl < settings.dl || pushed > settings.pushed || score < settings.score) continue
        if (!settings.archived && archived.has(id)) continue
        const best = match(`${id} ${repo} ${zh} ${en} ${catName(snap.cats, cat)}`.toLowerCase())
        if (best === null) continue
        hits.plugin.push({ kind: 'plugin', id, repo, zh, stars, dl, pushed, score, cat, badge: best.word, n: best.n })
      }

      if (settings.skills) {
        for (const r of snap.skills) {
          const [id, owner, name, desc, stars, pushed, score] = r
          if (stars < settings.stars || pushed > settings.pushed || score < settings.score) continue
          const best = match(`${id} ${owner} ${name} ${desc}`.toLowerCase())
          if (best === null) continue
          hits.skill.push({ kind: 'skill', id, owner, name, desc, stars, pushed, score, badge: best.word, n: best.n })
        }
      }

      const cmp = settings.fresh
        ? (a, b) => b.n - a.n || a.pushed - b.pushed || b.stars - a.stars
        : (a, b) => b.stars - a.stars
      hits.plugin.sort(cmp)
      hits.skill.sort(cmp)

      return {
        hits,
        total: hits.plugin.length + hits.skill.length,
        scanned: snap.plugins.length + (settings.skills ? snap.skills.length : 0),
        words: groups.reduce((n, g) => n + g.words.length, 0),
      }
    }

    /* ---------------------------------------------------------------- prompt */

    function buildPrompt(items) {
      const plugins = items.filter((x) => x.kind === 'plugin')
      const skills = items.filter((x) => x.kind === 'skill')
      const out = []
      out.push('帮我把下面这些 DSH 扩展装上，装完逐个确认是否真的生效。')
      out.push('')
      if (plugins.length) {
        out.push('## 插件')
        for (const p of plugins) {
          const repo = p.repo ? ` · https://github.com/${p.repo}` : ''
          out.push(`- ${p.id}${repo}`)
          if (p.zh) out.push(`  ${p.zh}`)
        }
        out.push('')
        out.push('插件用 `dsh plugin --profile <当前 profile> add <包名>` 安装，或走 plugin_manager。装完到 插件 页确认对应行已启用，把失败的包名和报错贴出来。')
      }
      if (skills.length) {
        if (plugins.length) out.push('')
        out.push('## 技能')
        for (const s of skills) {
          out.push(`- ${s.id} → 克隆到 ~/.dsh/skills/${s.name || s.id.split('/').pop()}`)
          if (s.desc) out.push(`  ${s.desc}`)
        }
        out.push('')
        out.push('技能是 SKILL.md 目录，克隆完不用安装；重启会话后确认能被识别。')
      }
      if (!items.length) out.push('（还没勾选任何条目）')
      return out.join('\n')
    }

    /* ------------------------------------------------------------------ size */

    const CSS = `
.rr { height:100%; min-height:0; overflow-y:auto; box-sizing:border-box; padding:20px 24px 96px; color:var(--dsw-alias-label-primary,#e6e6e6); font-size:14px; line-height:1.55; }
.rr * { box-sizing:border-box; }
.rr h1 { font-size:22px; margin:0 0 6px; font-weight:650; letter-spacing:-.2px; }
.rr .sub { color:var(--dsw-alias-label-tertiary,#8b8b8b); font-size:12.5px; margin:0 0 18px; }
.rr .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:18px; }
.rr .stat { border:1px solid var(--dsw-alias-border-l2,#333); border-radius:10px; padding:10px 12px; background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.02)); }
.rr .stat b { display:block; font-size:20px; font-variant-numeric:tabular-nums; letter-spacing:-.4px; }
.rr .stat span { font-size:11.5px; color:var(--dsw-alias-label-tertiary,#8b8b8b); }
.rr .stat.a b { color:var(--dsw-alias-state-business-primary,#5b9dff); }
.rr .stat.b b { color:var(--dsw-alias-state-success-primary,#41c98a); }
.rr .stat.c b { color:var(--dsw-alias-state-warn-primary,#e0a33e); }
.rr .tabs { display:flex; gap:2px; padding:3px; border-radius:9px; background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04)); width:max-content; margin-bottom:16px; }
.rr .tabs button { border:0; background:transparent; color:var(--dsw-alias-label-secondary,#b4b4b4); font:inherit; font-size:13px; padding:6px 14px; border-radius:7px; cursor:pointer; white-space:nowrap; }
.rr .tabs button.on { background:var(--dsw-alias-button-primary-fill,#2f6fe4); color:var(--dsw-alias-label-primary-foreground,#fff); }
.rr .card { border:1px solid var(--dsw-alias-border-l2,#333); border-radius:12px; padding:14px 15px; background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.02)); }
.rr .grid2 { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:12px; align-items:start; }
@media (max-width:900px){ .rr .grid2 { grid-template-columns:1fr } }
.rr h3 { font-size:13px; margin:0 0 3px; font-weight:600; }
.rr .ph { font-size:11.5px; color:var(--dsw-alias-label-tertiary,#8b8b8b); margin:0 0 11px; line-height:1.5; }
.rr .dsearch { display:flex; gap:6px; margin-bottom:9px; }
.rr .dsearch input { flex:1; min-width:0; background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04)); border:1px solid var(--dsw-alias-border-l2,#333); color:inherit; font:inherit; font-size:12px; padding:5px 9px; border-radius:7px; outline:none; }
.rr .dsearch input:focus { border-color:var(--dsw-alias-state-business-primary,#5b9dff); }
.rr .dsearch button { font:inherit; font-size:11.5px; padding:5px 9px; border-radius:7px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:var(--dsw-alias-label-secondary,#b4b4b4); }
.rr .dsearch button:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06)); }
.rr .dscroll { max-height:300px; overflow:auto; padding-right:3px; }
.rr .grp { margin-bottom:11px; }
.rr .grp:last-child { margin-bottom:0; }
.rr .gh { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--dsw-alias-label-secondary,#b4b4b4); margin-bottom:5px; }
.rr .gh .cnt { color:var(--dsw-alias-label-caption,#777); font-variant-numeric:tabular-nums; }
.rr .gh .all { margin-left:auto; font:inherit; font-size:11px; background:none; border:0; color:var(--dsw-alias-state-business-primary,#5b9dff); cursor:pointer; padding:0; }
.rr .kw { display:flex; flex-wrap:wrap; gap:4px; }
.rr .kw button { font:inherit; font-size:11.5px; padding:3px 8px; border-radius:6px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:var(--dsw-alias-label-tertiary,#8b8b8b); }
.rr .kw button.on { background:rgba(91,157,255,.14); border-color:rgba(91,157,255,.45); color:var(--dsw-alias-state-business-primary,#7fb2ff); }
.rr .rule { display:flex; align-items:center; gap:9px; margin-bottom:9px; font-size:12px; color:var(--dsw-alias-label-secondary,#b4b4b4); }
.rr .rule label { width:62px; flex:none; }
.rr .rule input[type=range] { flex:1; accent-color:var(--dsw-alias-state-business-primary,#5b9dff); height:3px; min-width:0; }
.rr .rule output { width:52px; text-align:right; font-size:11.5px; color:var(--dsw-alias-label-tertiary,#8b8b8b); font-variant-numeric:tabular-nums; flex:none; }
.rr .rule select { flex:1; background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04)); border:1px solid var(--dsw-alias-border-l2,#333); color:inherit; font:inherit; font-size:12px; padding:4px 6px; border-radius:7px; outline:none; }
.rr .sw { display:flex; align-items:center; gap:7px; font-size:12px; color:var(--dsw-alias-label-secondary,#b4b4b4); margin-bottom:8px; cursor:pointer; }

    .rr { color-scheme:dark; }
    .rr .sw input { appearance:none; -webkit-appearance:none; width:15px; height:15px; margin:0; flex:none;
      border:1px solid var(--dsw-alias-border-l3,#4a4a4a); border-radius:4px; background:transparent;
      cursor:pointer; position:relative; transition:background .12s,border-color .12s; }
    .rr .sw input:hover { border-color:var(--dsw-alias-state-business-primary,#5b9dff); }
    .rr .sw input:checked { background:var(--dsw-alias-state-business-primary,#5b9dff); border-color:transparent; }
    .rr .sw input:checked::after { content:''; position:absolute; left:4px; top:1px; width:4px; height:8px;
      border:solid #fff; border-width:0 1.8px 1.8px 0; transform:rotate(42deg); }
.rr .presets { display:flex; gap:5px; margin-bottom:11px; }
.rr .presets button { flex:1; font:inherit; font-size:11.5px; padding:5px 0; border-radius:7px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:var(--dsw-alias-label-secondary,#b4b4b4); }
.rr .presets button.on { background:var(--dsw-alias-button-primary-fill,#2f6fe4); border-color:transparent; color:#fff; }
.rr .dstat { display:flex; gap:14px; flex-wrap:wrap; align-items:baseline; margin-bottom:10px; }
.rr .dstat b { font-size:22px; color:var(--dsw-alias-state-success-primary,#41c98a); font-variant-numeric:tabular-nums; letter-spacing:-.4px; }
.rr .dstat span { font-size:12px; color:var(--dsw-alias-label-tertiary,#8b8b8b); }
.rr .list { border:1px solid var(--dsw-alias-border-l2,#333); border-radius:10px; overflow:hidden; }
.rr .row { display:grid; grid-template-columns:20px minmax(0,1fr) 60px 64px 152px; gap:10px; align-items:center; padding:9px 11px; border-bottom:1px solid var(--dsw-alias-border-l1,#2a2a2a); cursor:pointer; }
.rr .row:last-child { border-bottom:0; }
.rr .row:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.05)); }
.rr .row.cur { background:rgba(91,157,255,.1); box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary,#5b9dff); }
.rr .row.cur .nm b { color:var(--dsw-alias-state-business-primary,#7fb2ff); }
.rr .row .pick { appearance:none; -webkit-appearance:none; width:15px; height:15px; margin:0; flex:none;
      border:1px solid var(--dsw-alias-border-l3,#4a4a4a); border-radius:4px; background:transparent;
      cursor:pointer; position:relative; transition:background .12s,border-color .12s; }
    .rr .row .pick:hover { border-color:var(--dsw-alias-state-business-primary,#5b9dff); }
    .rr .row .pick:checked { background:var(--dsw-alias-state-business-primary,#5b9dff); border-color:transparent; }
    .rr .row .pick:checked::after { content:''; position:absolute; left:4px; top:1px; width:4px; height:8px;
      border:solid #fff; border-width:0 1.8px 1.8px 0; transform:rotate(42deg); }
.rr .row .nm { min-width:0; }
.rr .row .nm b { display:block; font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rr .row .nm span { display:block; font-size:11.5px; color:var(--dsw-alias-label-tertiary,#8b8b8b); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rr .row .nm i { font-style:normal; font-size:10.5px; padding:0 4px; border-radius:4px; margin-right:4px; background:rgba(91,157,255,.13); color:var(--dsw-alias-state-business-primary,#7fb2ff); }
.rr .row .num { text-align:right; font-size:12px; font-variant-numeric:tabular-nums; color:var(--dsw-alias-label-secondary,#b4b4b4); }
.rr .row .num i { display:block; font-style:normal; font-size:10.5px; color:var(--dsw-alias-label-caption,#777); }
.rr .row .cp { font:inherit; font-size:11px; padding:3px 7px; border-radius:6px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:var(--dsw-alias-label-secondary,#b4b4b4); white-space:nowrap; }
.rr .row .cp:hover { color:var(--dsw-alias-label-primary,#e6e6e6); border-color:var(--dsw-alias-border-l3,#444); }
    @media (max-width:760px){ .rr .row { grid-template-columns:20px minmax(0,1fr) 56px 152px } .rr .row .num.dl { display:none } }
.rr .picks { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:10px; }
.rr .pickc { border:1px solid var(--dsw-alias-border-l2,#333); border-radius:10px; padding:11px 12px; background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.02)); display:flex; flex-direction:column; gap:6px; }
.rr .pickc .t { display:flex; align-items:center; gap:6px; min-width:0; }
.rr .pickc .t b { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rr .pickc .tag { font-size:10.5px; padding:1px 6px; border-radius:5px; flex:none; border:1px solid var(--dsw-alias-border-l2,#333); color:var(--dsw-alias-label-tertiary,#8b8b8b); }
.rr .pickc .tag.live { border-color:rgba(65,201,138,.35); color:var(--dsw-alias-state-success-primary,#41c98a); background:rgba(65,201,138,.1); }
.rr .pickc p { margin:0; font-size:12px; color:var(--dsw-alias-label-secondary,#b4b4b4); line-height:1.5; }
.rr .pickc .mf { display:flex; gap:10px; font-size:11px; color:var(--dsw-alias-label-tertiary,#8b8b8b); margin-top:auto; }
.rr .pickc .mf b { color:var(--dsw-alias-label-secondary,#b4b4b4); font-weight:600; }
.rr .acts { display:flex; gap:6px; margin-top:7px; }
.rr .acts button { flex:1; font:inherit; font-size:11.5px; padding:4px 0; border-radius:7px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:var(--dsw-alias-label-secondary,#b4b4b4); }
.rr .acts button:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06)); color:var(--dsw-alias-label-primary,#e6e6e6); }
.rr .acts button.pri { background:var(--dsw-alias-button-primary-fill,#2f6fe4); border-color:transparent; color:#fff; }
.rr .empty { padding:32px; text-align:center; color:var(--dsw-alias-label-tertiary,#8b8b8b); font-size:13px; }
.rr .bar { position:fixed; left:50%; bottom:22px; transform:translateX(-50%); z-index:30; display:flex; align-items:center; gap:10px; padding:9px 14px; border-radius:12px; border:1px solid var(--dsw-alias-border-l3,#444); background:var(--dsw-alias-bg-layer-3,#242424); box-shadow:0 8px 28px rgba(0,0,0,.32); font-size:12.5px; }
.rr .bar b { font-variant-numeric:tabular-nums; }
.rr .bar button { font:inherit; font-size:12px; padding:5px 12px; border-radius:8px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:inherit; }
.rr .bar button.pri { background:var(--dsw-alias-button-primary-fill,#2f6fe4); border-color:transparent; color:#fff; }
.rr .toast { position:fixed; left:50%; bottom:84px; transform:translateX(-50%); z-index:40; display:flex; align-items:center; gap:12px; padding:8px 14px; border-radius:9px; font-size:12.5px; border:1px solid var(--dsw-alias-border-l3,#444); background:var(--dsw-alias-bg-layer-3,#242424); box-shadow:0 8px 24px rgba(0,0,0,.3); }
.rr .toast button { font:inherit; font-size:12px; padding:3px 10px; border-radius:7px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:var(--dsw-alias-state-business-primary,#7fb2ff); }
.rr .headbar { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.rr .headbar .back { display:inline-flex; align-items:center; gap:5px; font:inherit; font-size:12px; padding:5px 11px; border-radius:8px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:var(--dsw-alias-label-secondary,#b4b4b4); }
.rr .headbar .back:hover { color:var(--dsw-alias-label-primary,#e6e6e6); border-color:var(--dsw-alias-border-l3,#444); background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06)); }
.rr .headbar .keys { margin-left:auto; font-size:11px; color:var(--dsw-alias-label-caption,#777); }
.rr .headbar .keys kbd { font:inherit; font-size:10.5px; padding:1px 5px; border-radius:4px; border:1px solid var(--dsw-alias-border-l2,#333); background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04)); }
.rr .loading { padding:40px; text-align:center; color:var(--dsw-alias-label-tertiary,#8b8b8b); font-size:13px; }
.rr .err { padding:16px; border:1px solid var(--dsw-alias-state-error-primary,#d9534f); border-radius:10px; color:var(--dsw-alias-state-error-primary,#d9534f); font-size:13px; }
.rr .modal { position:fixed; inset:0; z-index:50; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; padding:24px; }
.rr .modal .box { width:min(720px,100%); max-height:80vh; display:flex; flex-direction:column; border-radius:12px; border:1px solid var(--dsw-alias-border-l3,#444); background:var(--dsw-alias-bg-layer-2,#1f1f1f); overflow:hidden; }
.rr .modal .mh { display:flex; align-items:center; gap:10px; padding:12px 15px; border-bottom:1px solid var(--dsw-alias-border-l2,#333); font-size:13.5px; font-weight:600; }
.rr .modal .mh button { margin-left:auto; font:inherit; font-size:16px; line-height:1; width:26px; height:26px; border-radius:7px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:var(--dsw-alias-label-secondary,#b4b4b4); }
.rr .modal textarea { flex:1; min-height:280px; margin:12px 15px; padding:11px 12px; border-radius:9px; border:1px solid var(--dsw-alias-border-l2,#333); background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.35)); color:inherit; font:12.5px/1.6 ui-monospace,Menlo,Consolas,monospace; resize:vertical; outline:none; }
.rr .modal .mf { display:flex; gap:8px; padding:0 15px 14px; }
.rr .modal .mf button { font:inherit; font-size:12.5px; padding:6px 14px; border-radius:8px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:inherit; }
.rr .modal .mf button.pri { background:var(--dsw-alias-button-primary-fill,#2f6fe4); border-color:transparent; color:#fff; }
.rr .modal .mf .hint { font-size:11.5px; color:var(--dsw-alias-label-tertiary,#8b8b8b); margin-left:auto; align-self:center; }
.rr .upd { display:flex; flex-direction:column; gap:6px; margin-top:2px; padding-top:9px; border-top:1px solid var(--dsw-alias-border-l1,#2a2a2a); }
.rr .upd .lbl { font-size:11.5px; color:var(--dsw-alias-label-tertiary,#8b8b8b); }
.rr .upd .go { display:flex; align-items:center; gap:8px; }
.rr .upd .go button { font:inherit; font-size:12px; padding:5px 13px; border-radius:8px; cursor:pointer; border:0; background:var(--dsw-alias-button-primary-fill,#2f6fe4); color:#fff; }
.rr .upd .go button[disabled] { opacity:.55; cursor:default; }
.rr .upd .go .meta { font-size:11px; color:var(--dsw-alias-label-caption,#777); }
.rr .upd .err { font-size:11px; color:var(--dsw-alias-state-error-primary,#d9534f); }
.rr .row .acts .mini { flex:none; font:inherit; font-size:10.5px; padding:2px 6px; border-radius:5px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:var(--dsw-alias-label-secondary,#b4b4b4); white-space:nowrap; }
.rr .row .acts .mini:hover { color:var(--dsw-alias-label-primary,#e6e6e6); border-color:var(--dsw-alias-border-l3,#444); }
.rr .dtl .box { width:min(880px,100%); max-height:86vh; }
.rr .dtl .dh { padding:14px 18px 11px; }
.rr .dtl .dh .rname { font-size:15.5px; font-weight:650; letter-spacing:-.2px; word-break:break-all; }
.rr .dtl .dh .rdesc { font-size:12.5px; color:var(--dsw-alias-label-secondary,#b4b4b4); margin-top:5px; line-height:1.55; }
.rr .dtl .dh .rlink { font-size:12px; margin-top:7px; }
.rr .dtl .dh .rlink a { color:var(--dsw-alias-state-business-primary,#5b9dff); text-decoration:none; }
.rr .dtl .dh .rlink a:hover { text-decoration:underline; }
.rr .dtl .dmeta { display:flex; gap:14px; flex-wrap:wrap; font-size:11.5px; color:var(--dsw-alias-label-tertiary,#8b8b8b); padding:0 18px 10px; }
.rr .dtl .dbody { overflow:auto; padding:0 18px 18px; flex:1; min-height:120px; }
.rr .md { font-size:13px; line-height:1.72; color:var(--dsw-alias-label-secondary,#c4c4c4); }
.rr .md h1, .rr .md h2, .rr .md h3, .rr .md h4 { color:var(--dsw-alias-label-primary,#e6e6e6); margin:18px 0 8px; font-weight:650; letter-spacing:-.1px; }
.rr .md h1 { font-size:18px; } .rr .md h2 { font-size:16px; } .rr .md h3 { font-size:14px; } .rr .md h4 { font-size:13px; }
.rr .md p { margin:0 0 10px; }
.rr .md ul, .rr .md ol { margin:0 0 10px; padding-left:19px; }
.rr .md li { margin-bottom:4px; }
.rr .md code { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:11.5px; padding:1px 5px; border-radius:5px; background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.07)); }
.rr .md pre { margin:0 0 12px; padding:11px 12px; border-radius:8px; background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.35)); border:1px solid var(--dsw-alias-border-l1,#2a2a2a); overflow:auto; }
.rr .md pre code { background:none; padding:0; font-size:11.5px; line-height:1.55; }
.rr .md blockquote { margin:0 0 10px; padding:2px 0 2px 11px; border-left:2px solid var(--dsw-alias-border-l3,#444); color:var(--dsw-alias-label-tertiary,#8b8b8b); }
.rr .md a { color:var(--dsw-alias-state-business-primary,#5b9dff); text-decoration:none; }
.rr .md a:hover { text-decoration:underline; }
.rr .md hr { border:0; border-top:1px solid var(--dsw-alias-border-l2,#333); margin:14px 0; }
.rr .md img { max-width:100%; }
.rr .md .imgph { font-size:11px; color:var(--dsw-alias-label-caption,#777); border:1px dashed var(--dsw-alias-border-l2,#333); border-radius:6px; padding:2px 6px; }
.rr .dtl .foot { padding:0 18px 14px; font-size:11.5px; color:var(--dsw-alias-label-caption,#777); }
`

    /* -------------------------------------------------------------- components */

    function useToast() {
      const [state, setState] = React.useState(null)
      const timer = React.useRef(0)
      const show = React.useCallback((message, action) => {
        setState({ message, action })
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setState(null), 2600)
      }, [])
      React.useEffect(() => () => clearTimeout(timer.current), [])
      return [state, show]
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        try {
          const area = document.createElement('textarea')
          area.value = text
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          const ok = document.execCommand('copy')
          document.body.removeChild(area)
          return ok
        } catch {
          return false
        }
      }
    }

    /* ---------------------------------------------------------------- markdown */

    const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/

    /** Inline spans only: bold, code, links, images (shown as a placeholder chip). */
    function inlineNodes(text, keyBase) {
      const nodes = []
      let rest = String(text)
      let n = 0
      while (rest.length) {
        const hit = INLINE_RE.exec(rest)
        if (hit === null) {
          nodes.push(rest)
          break
        }
        if (hit.index > 0) nodes.push(rest.slice(0, hit.index))
        const token = hit[0]
        const key = `${keyBase}-${n++}`
        if (token.startsWith('**')) {
          nodes.push(h('b', { key }, token.slice(2, -2)))
        } else if (token.startsWith('`')) {
          nodes.push(h('code', { key }, token.slice(1, -1)))
        } else if (token.startsWith('![')) {
          const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token)
          nodes.push(h('span', { key, className: 'imgph', title: m ? m[2] : '' }, m && m[1] ? `图片：${m[1]}` : '图片'))
        } else {
          const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
          if (m) {
            nodes.push(h('a', { key, href: m[2], target: '_blank', rel: 'noopener noreferrer' }, m[1]))
          } else {
            nodes.push(token)
          }
        }
        rest = rest.slice(hit.index + token.length)
      }
      return nodes
    }

    /**
     * READMEs lean on HTML for their header badges and centred blocks.
     * Rendering those tags as text turns the top of every document into noise,
     * so fold them down first: images keep their alt text, links keep their
     * label and target, and the rest of the markup goes away.
     */
    function flattenHtml(source) {
      let text = String(source || '')
      if (text.indexOf('<') === -1) return text
      text = text.replace(/<img\b[^>]*>/gi, (tag) => {
        const alt = /alt="([^"]*)"/i.exec(tag)
        const label = alt && alt[1] ? alt[1].replace(/\s+/g, ' ').trim() : ''
        return label ? `图片：${label}` : '图片'
      })
      text = text.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
        const clean = String(label).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
        return clean ? `[${clean}](${href})` : ''
      })
      text = text.replace(/<br\s*\/?>/gi, '\n')
      text = text.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      text = text.replace(/<(strong|b)>/gi, '**').replace(/<\/(strong|b)>/gi, '**')
      text = text.replace(/<code>/gi, '`').replace(/<\/code>/gi, '`')
      // Anything left is structural: for a text view it is only in the way.
      text = text.replace(/<[^>]+>/g, '')
      // Badge rows are usually one image per line, several lines in a row. A
      // run of them is noise in a text view, so collapse it to one marker.
      const onlyBadge = /^\s*(?:\[图片：?[^\]]*\]\([^)]*\)|图片：?\S*)\s*$/
      const merged = []
      let run = []
      const flushRun = () => {
        if (run.length >= 2) merged.push('图片（徽章组）')
        else if (run.length === 1) merged.push(run[0])
        run = []
      }
      for (const line of text.split('\n')) {
        if (onlyBadge.test(line)) {
          run.push(line)
          continue
        }
        flushRun()
        merged.push(line)
      }
      flushRun()
      text = merged.join('\n')
      // Collapse the blank lines those blocks leave behind.
      text = text.replace(/\n{3,}/g, '\n\n')
      return text
    }

    /**
     * Just enough markdown for a README: headings, fenced code, lists,
     * blockquotes, rules and paragraphs. Unknown lines fall through as text,
     * which is the right failure mode for a document viewer.
     */
    function renderMarkdown(source) {
      const lines = flattenHtml(source).replace(/\r\n/g, '\n').split('\n')
      const out = []
      let fence = null
      let buf = []
      let key = 0

      const flushParagraph = () => {
        if (!buf.length) return
        const text = buf.join(' ').trim()
        buf = []
        if (text) out.push(h('p', { key: `p${key++}` }, inlineNodes(text, `p${key}`)))
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const fenceHit = /^\s*(```+|~~~+)(.*)$/.exec(line)
        if (fenceHit) {
          if (fence === null) {
            flushParagraph()
            fence = { marker: fenceHit[1][0], lang: fenceHit[2].trim(), body: [] }
          } else {
            out.push(h('pre', { key: `c${key++}` },
              h('code', { className: fence.lang ? `lang-${fence.lang}` : undefined }, fence.body.join('\n')),
            ))
            fence = null
          }
          continue
        }
        if (fence !== null) {
          fence.body.push(line)
          continue
        }

        if (!line.trim()) {
          flushParagraph()
          continue
        }
        const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          flushParagraph()
          const level = Math.min(6, heading[1].length)
          out.push(h(`h${level}`, { key: `h${key++}` }, inlineNodes(heading[2].replace(/\s+#+$/, ''), `h${key}`)))
          continue
        }
        if (/^\s{0,3}([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
          flushParagraph()
          out.push(h('hr', { key: `r${key++}` }))
          continue
        }
        const quote = /^\s{0,3}>\s?(.*)$/.exec(line)
        if (quote) {
          flushParagraph()
          const body = [quote[1]]
          while (i + 1 < lines.length && /^\s{0,3}>\s?/.test(lines[i + 1])) {
            i++
            body.push(lines[i].replace(/^\s{0,3}>\s?/, ''))
          }
          out.push(h('blockquote', { key: `q${key++}` }, inlineNodes(body.join(' '), `q${key}`)))
          continue
        }
        const bullet = /^\s{0,3}[-*+]\s+(.*)$/.exec(line)
        if (bullet) {
          flushParagraph()
          const items = [bullet[1]]
          while (i + 1 < lines.length) {
            const next = /^\s{0,3}[-*+]\s+(.*)$/.exec(lines[i + 1])
            if (!next) break
            i++
            items.push(next[1])
          }
          out.push(h('ul', { key: `u${key++}` },
            items.map((text, idx) => h('li', { key: idx }, inlineNodes(text, `u${key}-${idx}`))),
          ))
          continue
        }
        const ordered = /^\s{0,3}\d+[.)]\s+(.*)$/.exec(line)
        if (ordered) {
          flushParagraph()
          const items = [ordered[1]]
          while (i + 1 < lines.length) {
            const next = /^\s{0,3}\d+[.)]\s+(.*)$/.exec(lines[i + 1])
            if (!next) break
            i++
            items.push(next[1])
          }
          out.push(h('ol', { key: `o${key++}` },
            items.map((text, idx) => h('li', { key: idx }, inlineNodes(text, `o${key}-${idx}`))),
          ))
          continue
        }
        // Table rows and anything else stay as paragraph text.
        buf.push(line.trim())
      }
      flushParagraph()
      if (fence !== null && fence.body.length) {
        out.push(h('pre', { key: `c${key++}` }, h('code', null, fence.body.join('\n'))))
      }
      if (!out.length) out.push(h('p', { key: 'empty' }, '（README 是空的）'))
      return out
    }

    /** Open a repository page in the OS default browser. */
    function openExternal(url) {
      try {
        const win = window.open(url, '_blank', 'noopener,noreferrer')
        if (win) return true
      } catch {}
      try {
        const a = document.createElement('a')
        a.href = url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        return true
      } catch {
        return false
      }
    }

    function RadarPage() {
      const [data, setData] = React.useState(snapshot)
      const [error, setError] = React.useState('')
      const initialUi = React.useRef(loadUi())
      const [tab, setTab] = React.useState(initialUi.current.tab)
      const [cfg, setCfg] = React.useState(loadCfg)
      const [selected, setSelected] = React.useState(() => new Map())
      const [prompt, setPrompt] = React.useState(null)
      const [toast, showToast] = useToast()
      const [dictQ, setDictQ] = React.useState('')
      const [rankTab, setRankTab] = React.useState('plugins')
      const [rankQ, setRankQ] = React.useState('')
      const [rankLimit, setRankLimit] = React.useState(60)
      const [onlyLive, setOnlyLive] = React.useState(false)
      const [cursor, setCursor] = React.useState(-1)
      const [detail, setDetail] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [srcNpm, setSrcNpm] = React.useState(true)
      const [srcGithub, setSrcGithub] = React.useState(true)
      const [refreshNote, setRefreshNote] = React.useState('')

      const rootRef = React.useRef(null)
      const searchRef = React.useRef(null)
      const uiRef = React.useRef(initialUi.current)

      /* data */
      React.useEffect(() => {
        let alive = true
        loadSnapshot()
          .then((json) => {
            if (alive) setData(json)
          })
          .catch((e) => {
            if (alive) setError(String(e?.message ?? e))
          })
        return () => {
          alive = false
        }
      }, [])

      const update = React.useCallback((patch) => {
        setCfg((prev) => {
          const next = { ...prev, ...patch }
          saveCfg(next)
          return next
        })
      }, [])

      /* discovery — recomputed on every open and every setting change */
      const discovery = React.useMemo(() => runDiscovery(data, cfg), [data, cfg])

      /* Rank rows are built here rather than inside the view so the keyboard
         cursor and the rendered list always walk the same array. */
      const rankRows = React.useMemo(() => {
        if (!data) return []
        const q = rankQ.trim().toLowerCase()
        let rows
        if (rankTab === 'plugins') {
          rows = data.plugins.map((r) => ({ kind: 'plugin', id: r[0], repo: r[1], cat: r[2], zh: r[3], stars: r[5], dl: r[6], pushed: r[7], score: r[8] }))
          if (q) rows = rows.filter((r) => `${r.id} ${r.repo} ${r.zh} ${catName(data.cats, r.cat)}`.toLowerCase().includes(q))
          rows.sort((a, b) => b.score - a.score)
        } else if (rankTab === 'skills') {
          rows = data.skills.map((r) => ({ kind: 'skill', id: r[0], owner: r[1], name: r[2], desc: r[3], stars: r[4], pushed: r[5], score: r[6] }))
          if (q) rows = rows.filter((r) => `${r.id} ${r.desc}`.toLowerCase().includes(q))
          rows.sort((a, b) => b.score - a.score)
        } else {
          rows = (data.rising || []).map((r) => ({ kind: r.kind === 'skill' ? 'skill' : 'plugin', id: r.id, repo: r.id, desc: r.desc, stars: r.stars, pushed: r.pushed, score: r.age ?? 0, age: r.age, rising: true }))
          if (q) rows = rows.filter((r) => `${r.id} ${r.desc}`.toLowerCase().includes(q))
        }
        return rows
      }, [data, rankTab, rankQ])

      const live = React.useMemo(() => new Set(data?.installed || []), [data])

      /* The exact list the cursor walks, in render order.
         Picks is a card grid with its own buttons, so the cursor stays off it. */
      const flat = React.useMemo(() => {
        if (!data) return []
        if (tab === 'discover') {
          if (!discovery) return []
          const pick = (arr) => (onlyLive ? arr.filter((r) => live.has(r.id)) : arr)
          return [...pick(discovery.hits.plugin).slice(0, cfg.limit), ...pick(discovery.hits.skill).slice(0, cfg.limit)]
        }
        if (tab === 'rank') {
          const rows = onlyLive ? rankRows.filter((r) => r.kind === 'plugin' && live.has(r.id)) : rankRows
          return rows.slice(0, rankLimit)
        }
        return []
      }, [data, tab, discovery, cfg.limit, rankRows, rankLimit, onlyLive, live])

      /* Keep the cursor inside the list whenever it shrinks under it. */
      React.useEffect(() => {
        setCursor((c) => (c >= flat.length ? flat.length - 1 : c))
      }, [flat.length])

      /* Tab and scroll survive the trip to the conversation. */
      React.useEffect(() => {
        const next = { ...uiRef.current, tab }
        uiRef.current = next
        saveUi(next)
      }, [tab])

      React.useEffect(() => {
        const root = rootRef.current
        if (!root) return
        const onScroll = () => {
          uiRef.current = { ...uiRef.current, scroll: root.scrollTop }
          saveUi(uiRef.current)
        }
        root.addEventListener('scroll', onScroll, { passive: true })
        // Restore once, after the first paint has laid the list out.
        if (uiRef.current.scroll) root.scrollTop = uiRef.current.scroll
        return () => root.removeEventListener('scroll', onScroll)
      }, [])

      /* selection */
      const toggle = React.useCallback((item) => {
        setSelected((prev) => {
          const next = new Map(prev)
          if (next.has(item.id)) next.delete(item.id)
          else next.set(item.id, item)
          return next
        })
      }, [])

      const openPrompt = React.useCallback(
        (items) => {
          setPrompt(buildPrompt(items))
        },
        [],
      )

      const copyOne = React.useCallback(
        async (item) => {
          const ok = await copyText(buildPrompt([item]))
          showToast(ok ? '安装提示词已复制' : '复制失败，请手动选择文本')
        },
        [showToast],
      )

      /** Hand the prompt to the composer instead of the clipboard. */
      const sendToComposer = React.useCallback(
        (items) => {
          if (!items.length) return
          const text = buildPrompt(items)
          if (!draftIntoComposer(text)) {
            showToast('会话还没打开，先点「返回会话」再试', {
              label: '返回会话',
              run: () => backToConversation(),
            })
            return
          }
          backToConversation()
        },
        [showToast],
      )

      /** Pull the repository README once and park it on the open detail object. */
      const openDetail = React.useCallback((item) => {
        const repo = item.repo || item.id || ''
        if (!repo) return
        setDetail({
          id: item.id,
          repo,
          desc: item.zh || item.desc || '',
          stars: item.stars || 0,
          dl: item.dl || 0,
          pushed: item.pushed,
          lic: item.lic || '',
          cat: item.cat || '',
          kind: item.kind || 'plugin',
          loading: true,
          text: '',
          error: '',
          truncated: false,
        })
        fetch(`${bridgeUrl('readme')}?repo=${encodeURIComponent(repo)}`, { signal: AbortSignal.timeout(30000) })
          .then((r) => r.json())
          .then((json) => {
            setDetail((prev) => (prev && prev.repo === repo
              ? {
                  ...prev,
                  loading: false,
                  text: json.text || '',
                  truncated: Boolean(json.truncated),
                  error: json.ok === false ? String(json.error || '读取失败') : '',
                }
              : prev))
          })
          .catch((error) => {
            setDetail((prev) => (prev && prev.repo === repo
              ? { ...prev, loading: false, error: String(error?.message ?? error) }
              : prev))
          })
      }, [])

      const doRefresh = React.useCallback(async () => {
        if (busy) return
        if (!srcNpm && !srcGithub) {
          setRefreshNote('至少选一个数据源')
          return
        }
        setBusy(true)
        setRefreshNote('正在抓取，两个源大概 20 秒…')
        try {
          const response = await fetch(bridgeUrl('refresh'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ npm: srcNpm, github: srcGithub, pages: 3 }),
            signal: AbortSignal.timeout(180000),
          })
          const result = await response.json()
          if (!result.ok) {
            setRefreshNote(`更新失败：${result.error || '未知错误'}`)
            return
          }
          const next = await reloadSnapshot()
          setData(next)
          const stamp = (next.refreshedAt || '').slice(0, 16).replace('T', ' ')
          const skips = Number(result.githubSkipped) || 0
          const parts = [
            `已更新 ${stamp}`,
            `新增 ${result.added} 条`,
            `GitHub 直检 ${result.githubAdded} 条`,
          ]
          if (skips) parts.push(`滤掉 ${skips} 个蹭 topic 的仓库`)
          // A page that failed to arrive is worth showing; a clean run is not.
          const notes = Array.isArray(result.errors) ? result.errors : []
          setRefreshNote(parts.join(' · ') + (notes.length ? `　（${notes.join('；')}）` : ''))
          showToast(`数据已更新：${result.plugins} 个插件${notes.length ? '，有部分源没拉全' : ''}`)
        } catch (error) {
          setRefreshNote(`更新失败：${error?.message ?? error}`)
        } finally {
          setBusy(false)
        }
      }, [busy, srcNpm, srcGithub, showToast])

      /* Keyboard: / focuses search, j/k walk, space selects, Enter sends. */
      React.useEffect(() => {
        const onKey = (event) => {
          const target = event.target
          const typing = target instanceof HTMLElement
            && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
          if (event.key === 'Escape') {
            if (detail !== null) { setDetail(null); event.preventDefault(); return }
            if (prompt !== null) { setPrompt(null); event.preventDefault(); return }
            if (typing) { target.blur(); return }
            backToConversation()
            return
          }
          if (typing) return
          if (event.metaKey || event.ctrlKey || event.altKey) return
          const k = event.key
          if (k === '/') {
            event.preventDefault()
            searchRef.current?.focus()
            return
          }
          if (k === 'j' || k === 'k') {
            event.preventDefault()
            setCursor((c) => {
              const next = k === 'j' ? c + 1 : c - 1
              return Math.max(0, Math.min(flat.length - 1, next))
            })
            return
          }
          if (k === ' ' || k === 'x') {
            const item = flat[cursor]
            if (!item) return
            event.preventDefault()
            toggle(item)
            return
          }
          if (k === 'Enter') {
            const item = flat[cursor]
            if (!item) return
            event.preventDefault()
            sendToComposer([item])
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [flat, cursor, prompt, detail, toggle, sendToComposer])

      /* Keep the cursor row in view while walking with j/k. */
      React.useEffect(() => {
        const root = rootRef.current
        if (!root || cursor < 0) return
        const row = root.querySelector('[data-cursor="1"]')
        row?.scrollIntoView({ block: 'nearest' })
      }, [cursor])

      /* ------------------------------------------------------------- render */

      if (error) {
        return h('div', { className: 'rr' }, [
          h('style', { key: 's' }, CSS),
          h('h1', { key: 't' }, NS),
          h('div', { className: 'err', key: 'e' }, `读取数据失败：${error}`),
          h('button', { key: 'b', className: 'cp', style: { marginTop: 12, padding: '5px 12px' }, onClick: () => location.reload() }, '重新加载'),
        ])
      }

      if (!data) {
        return h('div', { className: 'rr' }, [
          h('style', { key: 's' }, CSS),
          h('h1', { key: 't' }, NS),
          h('div', { className: 'loading', key: 'l' }, '正在读取生态数据…'),
        ])
      }

      const header = h('div', { key: 'head' }, [
        h('div', { key: 'hb', className: 'headbar' }, [
          h('button', {
            key: 'b', className: 'back', title: '回到当前会话（Esc）',
            onClick: () => backToConversation(),
          }, ['← 返回会话']),
          tab === 'rank'
            ? h('label', { key: 'l', className: 'sw', style: { margin: 0 } }, [
                h('input', { key: 'i', type: 'checkbox', checked: onlyLive, onChange: (e) => setOnlyLive(e.target.checked) }),
                '只看本机已装',
              ])
            : null,
          h('span', { key: 'k', className: 'keys' }, [
            h('kbd', { key: 'a' }, '/'), ' 搜索  ',
            h('kbd', { key: 'b' }, 'j'), h('kbd', { key: 'c' }, 'k'), ' 移动  ',
            h('kbd', { key: 'd' }, '空格'), ' 勾选  ',
            h('kbd', { key: 'e' }, 'Enter'), ' 放进会话',
          ]),
        ]),
        h('h1', { key: 'h' }, NS),
        h('p', { className: 'sub', key: 's' }, `数据快照 ${data.generated} · 每次打开自动重扫 · 全量 ${fmt(data.plugins.length)} 个插件与 ${fmt(data.skills.length)} 个技能`),
        h('div', { className: 'stats', key: 'st' }, [
          h('div', { className: 'stat a', key: 'a' }, [h('b', { key: 'b' }, fmt(data.plugins.length)), h('span', { key: 's' }, '收录插件')]),
          h('div', { className: 'stat a', key: 'b' }, [h('b', { key: 'b' }, fmt(data.rankedPlugins || data.plugins.length)), h('span', { key: 's' }, '参与排序')]),
          h('div', { className: 'stat b', key: 'c' }, [h('b', { key: 'b' }, fmt(data.skills.length)), h('span', { key: 's' }, '技能仓库')]),
          h('div', { className: 'stat c', key: 'd' }, [h('b', { key: 'b' }, fmt(data.rising?.length ?? 0)), h('span', { key: 's' }, '新星（90 天内）')]),
        ]),
      ])

      const tabs = h('div', { className: 'tabs', key: 'tabs' },
        [['discover', '自动发现'], ['rank', '排行榜'], ['picks', '必装清单']].map(([id, label]) =>
          h('button', { key: id, className: tab === id ? 'on' : '', onClick: () => { setTab(id); setCursor(-1) } }, label),
        ),
      )

      const body = tab === 'discover' ? discoveryView() : tab === 'rank' ? rankView() : picksView()

      const bar = selected.size
        ? h('div', { className: 'bar', key: 'bar' }, [
            h('span', { key: 'n' }, ['已选 ', h('b', { key: 'b' }, selected.size), ' 项']),
            h('button', { key: 'p', className: 'pri', onClick: () => sendToComposer([...selected.values()]) }, '放进会话'),
            h('button', { key: 'c', onClick: () => openPrompt([...selected.values()]) }, '看提示词'),
            h('button', { key: 'x', onClick: () => setSelected(new Map()) }, '清空'),
          ])
        : null

      const modal = prompt === null ? null : h('div', { className: 'modal', key: 'm', onClick: (e) => { if (e.target === e.currentTarget) setPrompt(null) } },
        h('div', { className: 'box' }, [
          h('div', { className: 'mh', key: 'h' }, [
            '安装提示词',
            h('button', { key: 'x', onClick: () => setPrompt(null), 'aria-label': '关闭' }, '×'),
          ]),
          h('textarea', { key: 'a', value: prompt, readOnly: true, onFocus: (e) => e.target.select() }),
          h('div', { className: 'mf', key: 'f' }, [
            h('button', {
              key: 'c', className: 'pri',
              onClick: async () => {
                const ok = await copyText(prompt)
                showToast(ok ? '已复制，粘贴到会话里即可' : '复制失败，请手动选择文本')
                if (ok) setPrompt(null)
              },
            }, '复制'),
            h('button', {
              key: 's',
              onClick: () => {
                const items = [...selected.values()]
                if (!items.length) return
                setPrompt(null)
                sendToComposer(items)
              },
            }, '放进会话'),
            h('button', { key: 'd', onClick: () => setPrompt(null) }, '关闭'),
            h('span', { className: 'hint', key: 'h' }, '「放进会话」只写进输入框，不会自动发送'),
          ]),
        ]),
      )

      const detailModal = detail === null ? null : h('div', {
        className: 'modal dtl', key: 'dtl',
        onClick: (e) => { if (e.target === e.currentTarget) setDetail(null) },
      },
        h('div', { className: 'box' }, [
          h('div', { className: 'mh dh', key: 'h' }, [
            h('div', { key: 'w', style: { minWidth: 0 } }, [
              h('div', { className: 'rname', key: 'n' }, detail.repo),
              detail.desc ? h('div', { className: 'rdesc', key: 'd' }, detail.desc) : null,
              h('div', { className: 'rlink', key: 'l' }, [
                h('a', {
                  href: `https://github.com/${detail.repo}`,
                  target: '_blank', rel: 'noopener noreferrer',
                  onClick: (e) => { e.preventDefault(); openExternal(`https://github.com/${detail.repo}`) },
                }, `https://github.com/${detail.repo} ↗`),
              ]),
            ]),
            h('button', { key: 'x', onClick: () => setDetail(null), 'aria-label': '关闭' }, '×'),
          ]),
          h('div', { className: 'dmeta', key: 'm' }, [
            h('span', { key: 'a' }, `★ ${fmt(detail.stars)}`),
            detail.kind === 'plugin' ? h('span', { key: 'b' }, `⤓ ${fmt(detail.dl)} 月下载`) : null,
            h('span', { key: 'c' }, `更新 ${fresh(detail.pushed)}`),
            detail.lic ? h('span', { key: 'd' }, detail.lic) : null,
            detail.cat ? h('span', { key: 'e' }, catName(data.cats, detail.cat)) : null,
          ]),
          h('div', { className: 'dbody', key: 'b' }, [
            detail.loading
              ? h('div', { className: 'loading', key: 'l' }, '正在读取 README…')
              : detail.error
                ? h('div', { className: 'err', key: 'e' }, detail.error)
                : h('div', { className: 'md', key: 'md' }, renderMarkdown(detail.text)),
          ]),
          detail.truncated
            ? h('div', { className: 'foot', key: 'f' }, 'README 太长，这里只显示前 400 KB。')
            : null,
        ]),
      )

      return h('div', { className: 'rr', ref: rootRef }, [
        h('style', { key: 'style' }, CSS),
        header,
        tabs,
        body,
        bar,
        detailModal,
        modal,
        toast
          ? h('div', { className: 'toast', key: 'toast' }, [
              h('span', { key: 'm' }, toast.message),
              toast.action
                ? h('button', { key: 'a', onClick: () => { toast.action.run(); } }, toast.action.label)
                : null,
            ])
          : null,
      ])

      /* --------------------------------------------------------- sub views */

      function discoveryView() {
        if (!discovery) return h('div', { className: 'loading' }, '扫描中…')
        const off = new Set(cfg.off || [])
        const needle = dictQ.trim().toLowerCase()
        const groups = DICT
          .map((g) => ({
            ...g,
            shown: needle ? g.words.filter((w) => w.indexOf(needle) !== -1 || g.label.toLowerCase().indexOf(needle) !== -1) : g.words,
            onCount: g.words.filter((w) => !off.has(w)).length,
          }))
          .filter((g) => g.shown.length)

        const dict = h('div', { className: 'card', key: 'dict' }, [
          h('h3', { key: 'h' }, ['触发词字典 ', h('span', { key: 'c', style: { fontSize: 11, color: 'var(--dsw-alias-label-caption,#777)', fontWeight: 400 } }, `${discovery.words} 个生效`)]),
          h('p', { className: 'ph', key: 'p' }, '点词开关，结果实时重算。任意一个启用的词命中就算触发，命中越多排越前。'),
          h('div', { className: 'dsearch', key: 'd' }, [
            h('input', { key: 'i', value: dictQ, placeholder: '在词条里找…', onChange: (e) => setDictQ(e.target.value) }),
            h('button', { key: 'on', onClick: () => update({ off: [] }) }, '全开'),
            h('button', { key: 'off', onClick: () => update({ off: DICT.flatMap((g) => g.words) }) }, '全关'),
          ]),
          h('div', { className: 'dscroll', key: 's' },
            groups.map((g) =>
              h('div', { className: 'grp', key: g.key }, [
                h('div', { className: 'gh', key: 'h' }, [
                  h('b', { key: 'b', style: { fontWeight: 600 } }, g.label),
                  h('span', { className: 'cnt', key: 'c' }, `${g.onCount}/${g.words.length}`),
                  h('button', {
                    key: 'a', className: 'all',
                    onClick: () => {
                      const next = new Set(cfg.off || [])
                      const allOn = g.words.every((w) => !next.has(w))
                      for (const w of g.words) allOn ? next.add(w) : next.delete(w)
                      update({ off: [...next] })
                    },
                  }, g.onCount ? '全不选' : '全选'),
                ]),
                h('div', { className: 'kw', key: 'k' },
                  g.shown.map((w) =>
                    h('button', {
                      key: w, className: off.has(w) ? '' : 'on',
                      onClick: () => {
                        const next = new Set(cfg.off || [])
                        next.has(w) ? next.delete(w) : next.add(w)
                        update({ off: [...next] })
                      },
                    }, w),
                  ),
                ),
              ]),
            ),
          ),
        ])

        const slider = (key, rid, min, max, step, label, render) =>
          h('div', { className: 'rule', key: rid }, [
            h('label', { key: 'l' }, label),
            h('input', {
              key: 'i', type: 'range', min, max, step, value: cfg[key],
              onChange: (e) => update({ [key]: Number(e.target.value) }),
            }),
            h('output', { key: 'o' }, render(cfg[key])),
          ])

        const controls = h('div', { key: 'ctl' }, [
          h('div', { className: 'card', key: 'thr', style: { marginBottom: 12 } }, [
            h('h3', { key: 'h' }, '触发阈值'),
            h('p', { className: 'ph', key: 'p' }, '只有同时满足的条目才算值得装。'),
            h('div', { className: 'presets', key: 'pr' },
              [['loose', '宽松'], ['normal', '标准'], ['strict', '严格']].map(([id, label]) =>
                h('button', {
                  key: id,
                  className: ['stars', 'dl', 'pushed', 'score'].every((k) => PRESETS[id][k] === cfg[k]) ? 'on' : '',
                  onClick: () => update(PRESETS[id]),
                }, label),
              ),
            ),
            slider('stars', 's', 0, 5000, 50, '星标 ≥', (v) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : v)),
            slider('dl', 'd', 0, 50000, 500, '月下载 ≥', (v) => (v >= 10000 ? `${(v / 10000).toFixed(1).replace(/\.0$/, '')}万` : v)),
            slider('pushed', 'u', 0, 365, 5, '更新 ≤', (v) => `${v} 天`),
            slider('score', 'c', 0, 95, 1, '综合分 ≥', (v) => `${v} 分`),
            h('div', { className: 'rule', key: 'lim' }, [
              h('label', { key: 'l' }, '最多显示'),
              h('select', { key: 's', value: String(cfg.limit), onChange: (e) => update({ limit: Number(e.target.value) }) },
                [20, 40, 80, 200].map((n) => h('option', { key: n, value: String(n) }, `${n} 条`)),
              ),
            ]),
          ]),
          h('div', { className: 'card', key: 'sw' }, [
            h('h3', { key: 'h' }, '开关'),
            h('label', { className: 'sw', key: 'a' }, [
              h('input', { key: 'i', type: 'checkbox', checked: cfg.skills, onChange: (e) => update({ skills: e.target.checked }) }),
              '一起扫描技能仓库',
            ]),
            h('label', { className: 'sw', key: 'b' }, [
              h('input', { key: 'i', type: 'checkbox', checked: cfg.archived, onChange: (e) => update({ archived: e.target.checked }) }),
              '包含已归档仓库',
            ]),
            h('label', { className: 'sw', key: 'c' }, [
              h('input', { key: 'i', type: 'checkbox', checked: cfg.fresh, onChange: (e) => update({ fresh: e.target.checked }) }),
              '优先最近更新',
            ]),
            h('div', { className: 'upd', key: 'upd' }, [
              h('div', { className: 'lbl', key: 'l' }, '更新数据（选中要抓的源）'),
              h('label', { className: 'sw', key: 'npm', style: { margin: 0 } }, [
                h('input', { key: 'i', type: 'checkbox', checked: srcNpm, onChange: (e) => setSrcNpm(e.target.checked) }),
                'npm 插件目录（全量清单）',
              ]),
              h('label', { className: 'sw', key: 'gh', style: { margin: 0 } }, [
                h('input', { key: 'i', type: 'checkbox', checked: srcGithub, onChange: (e) => setSrcGithub(e.target.checked) }),
                'GitHub topic:dsh-plugin（新仓库）',
              ]),
              h('div', { className: 'go', key: 'go' }, [
                h('button', { key: 'b', disabled: busy, onClick: doRefresh }, busy ? '更新中…' : '手动更新'),
                h('span', { className: 'meta', key: 'm' }, data.refreshedAt ? `上次 ${String(data.refreshedAt).slice(0, 16).replace('T', ' ')}` : '还没手动更新过'),
              ]),
              refreshNote
                ? h('div', { className: refreshNote.indexOf('失败') === 0 ? 'err' : 'meta', key: 'n', style: { fontSize: 11, lineHeight: 1.5 } }, refreshNote)
                : null,
            ]),
            h('div', { className: 'acts', key: 'acts' }, [
              h('button', {
                key: 'r',
                onClick: () => {
                  const next = { ...DEFAULTS }
                  saveCfg(next)
                  setCfg(next)
                  showToast('已恢复默认阈值')
                },
              }, '恢复默认'),
              h('button', {
                key: 'c',
                onClick: async () => {
                  const ok = await copyText(JSON.stringify({
                    thresholds: { stars: cfg.stars, downloads: cfg.dl, updated_within_days: cfg.pushed, min_score: cfg.score, limit: cfg.limit },
                    toggles: { include_skills: cfg.skills, include_archived: cfg.archived, prefer_fresh: cfg.fresh },
                    disabled_words: cfg.off || [],
                  }, null, 2))
                  showToast(ok ? '配置 JSON 已复制' : '复制失败')
                },
              }, '复制配置'),
            ]),
          ]),
        ])

        const rowsFor = (label, arr) => {
          if (!arr.length) return null
          const shown = onlyLive ? arr.filter((it) => live.has(it.id)) : arr
          if (!shown.length) return null
          return h('div', { key: label }, [
            h('div', { key: 'h', style: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary,#8b8b8b)', margin: '12px 0 6px' } }, `${label} · ${shown.length} 条`),
            h('div', { className: 'list', key: 'l' },
              shown.slice(0, cfg.limit).map((it) => row(it)),
            ),
          ])
        }

        const results = h('div', { className: 'card', key: 'res', style: { marginTop: 12 } }, [
          h('div', { className: 'dstat', key: 'st' }, [
            h('div', { key: 'a' }, [h('b', { key: 'b' }, fmt(discovery.total)), h('span', { key: 's' }, ' 条命中')]),
            h('div', { key: 'b', style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary,#8b8b8b)' } },
              `扫描 ${fmt(discovery.scanned)} 条 · 生效词 ${discovery.words} 个 · 星 ${cfg.stars} / 下载 ${cfg.dl} / 更新 ≤ ${cfg.pushed} 天 / 分 ≥ ${cfg.score}`),
          ]),
          rowsFor('插件', discovery.hits.plugin) || rowsFor('技能', discovery.hits.skill)
            ? null
            : h('div', { className: 'empty', key: 'e' }, '当前阈值下没有命中。把星标或综合分调低一点，或者多开几个词条。'),
          rowsFor('插件', discovery.hits.plugin),
          rowsFor('技能', discovery.hits.skill),
        ])

        return h('div', { key: 'dv' }, [
          h('div', { className: 'grid2', key: 'g' }, [dict, controls]),
          results,
        ])
      }

      function row(it) {
        const on = selected.has(it.id)
        const isPlugin = it.kind === 'plugin'
        const key = `${it.kind}:${it.id}`
        const isCur = cursor >= 0 && flat[cursor] !== undefined
          && `${flat[cursor].kind}:${flat[cursor].id}` === key
        return h('div', {
          className: isCur ? 'row cur' : 'row',
          key,
          'data-cursor': isCur ? '1' : undefined,
          onClick: () => { toggle(it); setCursor(flat.findIndex((x) => `${x.kind}:${x.id}` === key)) },
        }, [
          h('input', {
            key: 'c', className: 'pick', type: 'checkbox', checked: on,
            onClick: (e) => e.stopPropagation(),
            onChange: () => toggle(it),
          }),
          h('div', { className: 'nm', key: 'n' }, [
            h('b', { key: 'b' }, it.id),
            h('span', { key: 's' }, [h('i', { key: 'i' }, it.badge), isPlugin ? it.zh : `${it.owner} · ${it.desc}`]),
          ]),
          h('div', { className: 'num', key: 'st' }, [fmt(it.stars), h('i', { key: 'l' }, '星标')]),
          h('div', { className: 'num dl', key: 'dl' }, [
            isPlugin ? fmt(it.dl) : (it.score ?? 0).toFixed(1),
            h('i', { key: 'l' }, isPlugin ? '月下载' : '综合分'),
          ]),
          h('div', { key: 'acts', style: { display: 'flex', gap: 4, justifyContent: 'flex-end' } }, [
            h('button', {
              key: 'dt', className: 'mini', title: '查看仓库详情与 README',
              onClick: (e) => { e.stopPropagation(); openDetail(it) },
            }, '详情'),
            h('button', {
              key: 'go', className: 'mini', title: '放进会话输入框',
              onClick: (e) => { e.stopPropagation(); sendToComposer([it]) },
            }, '放入'),
            h('button', {
              key: 'cp', className: 'mini', title: '复制安装提示词',
              onClick: async (e) => { e.stopPropagation(); await copyOne(it) },
            }, '复制'),
            h('a', {
              key: 'op', className: 'mini', title: '在默认浏览器里打开仓库',
              href: `https://github.com/${it.repo || it.id}`,
              target: '_blank', rel: 'noopener noreferrer',
              onClick: (e) => e.stopPropagation(),
              style: { textDecoration: 'none', display: 'inline-block' },
            }, '↗'),
          ]),
        ])
      }

      function rankView() {
        const rows = onlyLive ? rankRows.filter((r) => r.kind === 'plugin' && live.has(r.id)) : rankRows

        return h('div', { key: 'rk' }, [
          h('div', { className: 'dsearch', key: 'd', style: { marginBottom: 12 } }, [
            h('input', {
              key: 'i', value: rankQ, ref: searchRef,
              placeholder: '搜名字、作者、简介…（按 / 聚焦）',
              onChange: (e) => { setRankQ(e.target.value); setRankLimit(60); setCursor(-1) },
            }),
            h('select', {
              key: 't', value: rankTab,
              onChange: (e) => { setRankTab(e.target.value); setCursor(-1) },
              style: { background: 'var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04))', border: '1px solid var(--dsw-alias-border-l2,#333)', color: 'inherit', font: 'inherit', fontSize: 12, padding: '4px 7px', borderRadius: 7 },
            }, [['plugins', '插件'], ['skills', '技能'], ['rising', '新星']].map(([v, l]) => h('option', { key: v, value: v }, l))),
          ]),
          rows.length === 0
            ? h('div', { className: 'empty', key: 'e' }, '没有匹配的条目')
            : h('div', { className: 'list', key: 'l' }, rows.slice(0, rankLimit).map((it) => row({ ...it, badge: '' }))),
          rows.length > rankLimit
            ? h('div', { key: 'm', style: { textAlign: 'center', marginTop: 10 } },
                h('button', { className: 'cp', style: { padding: '6px 18px' }, onClick: () => setRankLimit((n) => n + 60) }, `再显示 60 条（共 ${rows.length}）`),
              )
            : null,
        ])
      }

      function picksView() {
        const picks = data.picks || []
        if (!picks.length) return h('div', { className: 'empty' }, '这个快照没有附带必装清单')
        return h('div', { key: 'pk' }, [
          h('p', { className: 'ph', key: 'p' }, '按「装上之后手感会变」挑的，绿标是本机正在跑的。'),
          h('div', { className: 'picks', key: 'g' },
            picks.map((p) =>
              h('div', { className: 'pickc', key: p.id }, [
                h('div', { className: 't', key: 't' }, [
                  h('b', { key: 'b' }, p.id),
                  p.live ? h('span', { className: 'tag live', key: 'l' }, '本机在用') : null,
                  h('span', { className: 'tag', key: 'c' }, p.cat || ''),
                ]),
                h('p', { key: 'd' }, p.why),
                h('div', { className: 'mf', key: 'm' }, [
                  h('span', { key: 'a' }, [h('b', { key: 'b' }, fmt(p.stars)), ' 星']),
                  h('span', { key: 'b' }, [h('b', { key: 'b' }, fmt(p.dl)), ' 月下载']),
                ]),
                h('div', { className: 'acts', key: 'x' }, [
                  h('button', {
                    key: 'g', className: 'pri',
                    onClick: () => sendToComposer([{ kind: 'plugin', id: p.id, repo: p.repo, zh: p.why }]),
                  }, '放进会话'),
                  h('button', {
                    key: 'c',
                    onClick: async () => {
                      const ok = await copyText(buildPrompt([{ kind: 'plugin', id: p.id, repo: p.repo, zh: p.why }]))
                      showToast(ok ? '安装提示词已复制' : '复制失败')
                    },
                  }, '复制'),
                ]),
              ]),
            ),
          ),
        ])
      }
    }

    function RadarIcon() {
      return h('svg', {
        width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true',
      }, [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 8.5, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('circle', { key: 'b', cx: 12, cy: 12, r: 4, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('circle', { key: 'c', cx: 12, cy: 12, r: 1.4, fill: 'currentColor' }),
        h('path', { key: 'd', d: 'M12 3.5v2.6M12 17.9v2.6M3.5 12h2.6M17.9 12h2.6', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }),
      ])
    }

    /**
     * Reads the live draft. `useInput` is a selector hook, so it has to run at
     * render level; this tiny component exists only to be that render level and
     * to mirror the value into a ref the panel can read outside React.
     */
    function DraftSpy({ useInput, sink }) {
      const draft = useInput((state) => state.draft)
      sink.current = draft
      return null
    }

    /**
     * Renders nothing. Its only job is to be mounted inside a session so the
     * framework hands over `inputActions` and `useInput`, which the panel
     * cannot get on its own (the panel lives in `main`, a root-scope slot).
     */
    function ComposerBridge(props) {
      const sessionId = props?.sessionId
      const actions = props?.inputActions
      const useInput = props?.useInput
      const draftRef = React.useRef('')

      React.useEffect(() => {
        if (actions === undefined) return
        composer.sessionId = sessionId ?? null
        composer.actions = actions
        // Reading the draft is how the panel appends instead of clobbering
        // whatever is already typed in the box.
        composer.readDraft = () => draftRef.current
      }, [actions, sessionId])

      return typeof useInput === 'function'
        ? h(DraftSpy, { useInput, sink: draftRef })
        : null
    }

    /* ------------------------------------------------------------------ apply */

    const inject = ['slots']

    function apply(ctx) {
      runtime.ctx = ctx
      try {
        runtime.layout = ctx.get('layout') ?? null
      } catch {
        runtime.layout = null
      }

      let entryDispose = null
      let seatReady = false
      let enabled = true

      const sync = () => {
        if (!seatReady) return
        if (enabled && entryDispose === null) {
          entryDispose = ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => NS },
            RadarIcon,
          )
        } else if (!enabled && entryDispose !== null) {
          entryDispose()
          entryDispose = null
        }
      }

      ctx.slots.inject('sidebar.panellist', () => {
        seatReady = true
        fetch(bridgeUrl('config'), { signal: AbortSignal.timeout(8000) })
          .then((r) => r.json())
          .then((result) => {
            enabled = result?.value?.sidebarEntry !== false
            sync()
          })
          .catch(() => sync())
        return () => {
          seatReady = false
          if (entryDispose !== null) {
            entryDispose()
            entryDispose = null
          }
        }
      })

      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID }, RadarPage),
      )

      /* The dock seat is additive and null-rendering; it only carries the
         session's input actions across to the panel. */
      ctx.slots.inject('conversation.composer.dock', () =>
        ctx.slots.register({ name: 'conversation.composer.dock', id: 'dsh-radar-bridge', order: 90 }, ComposerBridge),
      )
    }

    return { inject, apply }
  },
})
