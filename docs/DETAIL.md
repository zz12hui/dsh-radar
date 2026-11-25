# 生态雷达

侧栏里多一个入口，点开就是插件与技能排行榜。数据随包走，断网也能翻。

## 1. 它能做什么

- **自动发现**：每次打开都按当前阈值重新扫一遍全量目录（6,245 个插件、896 个技能）。词条字典 19 组 204 个词，每个都能单独开关；星标、月下载、最近更新、综合分四条阈值可拖，另有宽松 / 标准 / 严格三档预设。
- **排行榜**：插件、技能、新星三个榜，带搜索和分页。
- **必装清单**：16 个插件配一句话说明，标出本机正在跑的。
- **放进会话 / 复制提示词**：这是与静态页最大的区别。任意条目右侧有「详情」「放入」「复制」，勾选多条后，底部浮层给出「放进会话」「看提示词」「清空」。
- **仓库详情**：点「详情」开弹窗，仓库名、简介、仓库地址、星标下载更新时间、许可证、分类，下面是 README 正文。弹窗右上角关闭，`Esc` 也关。行尾的 ↗ 用系统默认浏览器直接打开仓库页。
- **快捷操作**：头部「返回会话」，`Esc` 也能退（弹窗开着先关弹窗）；`/` 聚焦搜索，`j` / `k` 移动光标，空格勾选，`Enter` 把当前行放进会话；上次的 tab 与滚动位置会记住。

「放入」把条目写成下面这种文本，塞进会话输入框，只写不发送：

```
帮我把下面这些 DSH 扩展装上，装完逐个确认是否真的生效。

## 插件
- dsh-context · https://github.com/xxx/dsh-context
  上下文透视面板
...
插件用 `dsh plugin --profile <当前 profile> add <包名>` 安装，或走 plugin_manager。
装完到 插件 页确认对应行已启用，把失败的包名和报错贴出来。
```

## 2. 阈值怎么调

| 预设 | 星标 | 月下载 | 更新 | 综合分 | 结果 |
|---|---|---|---|---|---|
| 宽松 | 0 | 0 | 365 天 | 30 | 命中最杂 |
| 标准 | 0 | 0 | 180 天 | 40 | 默认 |
| 严格 | 3,000 | 20,000 | 60 天 | 60 | 只剩能打的 |

阈值和词条状态存在浏览器 `localStorage`，刷新不丢。「复制配置」导出 JSON。

## 3. 数据从哪来

快照打包在 `data/radar.json`，由仓库里的 `dsh-radar/build_plugin_data.py` 从 GitHub 与 npm 抓取结果生成。页面通过 `/api/dsh-radar/data` 读取，Host 侧缓存 5 分钟。

「开关」卡片底部是更新区：两个数据源各自一个勾选框，加一个「手动更新」按钮。勾 `npm 插件目录` 会拉 `unpkg.com/dsh-plugin-catalog/index.json`（约 6,900 个插件、5.6 MB、十几秒）；勾 `GitHub topic:dsh-plugin` 会拉仓库搜索接口的前 3 页（按星标降序，未登录 10 次/分）。两个都关掉时按钮直接拒。

抓回来的数据写到 `~/.dsh/cache/dsh-radar/snapshot.json`，读取时优先于打包快照，所以重装插件不会把它冲掉。合并时已有条目的星标与下载量只增不减，新检到的仓库以 `owner/name` 入库并标 `src: github`，归档仓库跳过，综合分对全表重算。

`dsh-plugin` 这个 topic 有不少无关项目在蹭，图片上传器、逆向工具都挂着它。所以新仓库还要在名字、简介或别的 topic 里提到 dsh / deepseek / harness，才算进来。

给 DSH 进程设置 `GITHUB_TOKEN` 可以抬高 GitHub 接口额度，不设也能用。

## 4. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/dsh-radar/data` | 完整快照 |
| GET | `/api/dsh-radar/config` | `{ sidebarEntry }` |
| POST | `/api/dsh-radar/config` | 写入 `sidebarEntry`，走 config editor |
| GET | `/api/dsh-radar/health` | 快照日期、条目数 |
| POST | `/api/dsh-radar/refresh` | 抓数据源写缓存，body `{ npm, github, pages }` |
| GET | `/api/dsh-radar/readme` | `?repo=owner/name`，返回 README 文本 |
| GET | `/api/dsh-radar/status` | 是否在更新、上次更新的结果 |

全部只接受同源请求（`sec-fetch-site` 与 `Origin` 校验）。

README 走 `api.github.com/repos/<repo>/readme`（`Accept: application/vnd.github.raw`），Host 侧缓存 40 条 / 10 分钟，单次最多读 400 KB。参数只接受 `owner/name`，带 `..` 或用别的一律拒。

## 5. 已知限制

- 打包快照停留在打包那天。「手动更新」能拉到当天的新数据，但只写本机缓存，仓库里的 `radar.json` 不会跟着变——要让别人也拿到新快照，得重跑生成脚本再发版。
- GitHub 直检进来的仓库分类靠 topic 猜，猜不出来的一律落到「工具」，所以它们的分类别太当真。
- 星标是仓库级的，一个仓库发多个插件时共享同一个数。
- 上榜不代表安全审查。插件能在你机器上跑任意代码，装之前点开仓库看一眼。
