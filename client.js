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
.rr .sw input { accent-color:var(--dsw-alias-state-business-primary,#5b9dff); width:14px; height:14px; }
.rr .presets { display:flex; gap:5px; margin-bottom:11px; }
.rr .presets button { flex:1; font:inherit; font-size:11.5px; padding:5px 0; border-radius:7px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:var(--dsw-alias-label-secondary,#b4b4b4); }
.rr .presets button.on { background:var(--dsw-alias-button-primary-fill,#2f6fe4); border-color:transparent; color:#fff; }
.rr .dstat { display:flex; gap:14px; flex-wrap:wrap; align-items:baseline; margin-bottom:10px; }
.rr .dstat b { font-size:22px; color:var(--dsw-alias-state-success-primary,#41c98a); font-variant-numeric:tabular-nums; letter-spacing:-.4px; }
.rr .dstat span { font-size:12px; color:var(--dsw-alias-label-tertiary,#8b8b8b); }
.rr .list { border:1px solid var(--dsw-alias-border-l2,#333); border-radius:10px; overflow:hidden; }
.rr .row { display:grid; grid-template-columns:22px 1fr 74px 78px 30px; gap:10px; align-items:center; padding:9px 11px; border-bottom:1px solid var(--dsw-alias-border-l1,#2a2a2a); cursor:pointer; }
.rr .row:last-child { border-bottom:0; }
.rr .row:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.05)); }
.rr .row .pick { width:15px; height:15px; accent-color:var(--dsw-alias-state-business-primary,#5b9dff); cursor:pointer; }
.rr .row .nm { min-width:0; }
.rr .row .nm b { display:block; font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rr .row .nm span { display:block; font-size:11.5px; color:var(--dsw-alias-label-tertiary,#8b8b8b); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rr .row .nm i { font-style:normal; font-size:10.5px; padding:0 4px; border-radius:4px; margin-right:4px; background:rgba(91,157,255,.13); color:var(--dsw-alias-state-business-primary,#7fb2ff); }
.rr .row .num { text-align:right; font-size:12px; font-variant-numeric:tabular-nums; color:var(--dsw-alias-label-secondary,#b4b4b4); }
.rr .row .num i { display:block; font-style:normal; font-size:10.5px; color:var(--dsw-alias-label-caption,#777); }
.rr .row .cp { font:inherit; font-size:11px; padding:3px 0; border-radius:6px; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#333); background:transparent; color:var(--dsw-alias-label-secondary,#b4b4b4); }
.rr .row .cp:hover { color:var(--dsw-alias-label-primary,#e6e6e6); border-color:var(--dsw-alias-border-l3,#444); }
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
.rr .toast { position:fixed; left:50%; bottom:84px; transform:translateX(-50%); z-index:40; padding:8px 14px; border-radius:9px; font-size:12.5px; border:1px solid var(--dsw-alias-border-l3,#444); background:var(--dsw-alias-bg-layer-3,#242424); box-shadow:0 8px 24px rgba(0,0,0,.3); }
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
`

    /* -------------------------------------------------------------- components */

    function useToast() {
      const [text, setText] = React.useState('')
      const timer = React.useRef(0)
      const show = React.useCallback((message) => {
        setText(message)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setText(''), 1800)
      }, [])
      React.useEffect(() => () => clearTimeout(timer.current), [])
      return [text, show]
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

    function RadarPage() {
      const [data, setData] = React.useState(snapshot)
      const [error, setError] = React.useState('')
      const [tab, setTab] = React.useState('discover')
      const [cfg, setCfg] = React.useState(loadCfg)
      const [selected, setSelected] = React.useState(() => new Map())
      const [prompt, setPrompt] = React.useState(null)
      const [toast, showToast] = useToast()
      const [dictQ, setDictQ] = React.useState('')
      const [rankTab, setRankTab] = React.useState('plugins')
      const [rankQ, setRankQ] = React.useState('')
      const [rankLimit, setRankLimit] = React.useState(60)

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
          h('button', { key: id, className: tab === id ? 'on' : '', onClick: () => setTab(id) }, label),
        ),
      )

      const body = tab === 'discover' ? discoveryView() : tab === 'rank' ? rankView() : picksView()

      const bar = selected.size
        ? h('div', { className: 'bar', key: 'bar' }, [
            h('span', { key: 'n' }, ['已选 ', h('b', { key: 'b' }, selected.size), ' 项']),
            h('button', { key: 'c', className: 'pri', onClick: () => openPrompt([...selected.values()]) }, '生成安装提示词'),
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
            h('button', { key: 'd', onClick: () => setPrompt(null) }, '关闭'),
            h('span', { className: 'hint', key: 'h' }, '粘贴到任意会话，让它替你装'),
          ]),
        ]),
      )

      return h('div', { className: 'rr' }, [
        h('style', { key: 'style' }, CSS),
        header,
        tabs,
        body,
        bar,
        modal,
        toast ? h('div', { className: 'toast', key: 'toast' }, toast) : null,
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
          return h('div', { key: label }, [
            h('div', { key: 'h', style: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary,#8b8b8b)', margin: '12px 0 6px' } }, `${label} · ${arr.length} 条`),
            h('div', { className: 'list', key: 'l' },
              arr.slice(0, cfg.limit).map((it) => row(it)),
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
        return h('div', { className: 'row', key: `${it.kind}:${it.id}`, onClick: () => toggle(it) }, [
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
          h('div', { className: 'num', key: 'dl' }, [
            isPlugin ? fmt(it.dl) : it.score.toFixed(1),
            h('i', { key: 'l' }, isPlugin ? '月下载' : '综合分'),
          ]),
          h('button', {
            key: 'cp', className: 'cp', title: '复制安装提示词',
            onClick: async (e) => {
              e.stopPropagation()
              await copyOne(it)
            },
          }, '复制'),
        ])
      }

      function rankView() {
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

        return h('div', { key: 'rk' }, [
          h('div', { className: 'dsearch', key: 'd', style: { marginBottom: 12 } }, [
            h('input', { key: 'i', value: rankQ, placeholder: '搜名字、作者、简介…', onChange: (e) => { setRankQ(e.target.value); setRankLimit(60) } }),
            h('select', {
              key: 't', value: rankTab, onChange: (e) => setRankTab(e.target.value),
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
                    key: 'c', className: 'pri',
                    onClick: async () => {
                      const ok = await copyText(buildPrompt([{ kind: 'plugin', id: p.id, repo: p.repo, zh: p.why }]))
                      showToast(ok ? '安装提示词已复制' : '复制失败')
                    },
                  }, '复制安装提示词'),
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

    /* ------------------------------------------------------------------ apply */

    const inject = ['slots']

    function apply(ctx) {
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
    }

    return { inject, apply }
  },
})
