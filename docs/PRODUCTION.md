# 发布已有真实手账

生产网站使用 `LOVE_JOURNAL_MODE=published` 构建；默认构建继续保留独立的虚构演示数据。生产模式不把演示记录作为真实数据的替代品。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
LOVE_JOURNAL_MODE=published LOVE_JOURNAL_PUBLIC_DIR=/absolute/path/to/existing/private-project/public pnpm build
```

`LOVE_JOURNAL_PUBLIC_DIR` 指向原项目的植物花园和音频资源目录，不能指向备份、照片原件或凭证目录。原始设计素材不需要进入公开仓库。生产版继续使用原植物背景、布局、动画与本地编辑交互；公开演示版继续使用演示素材。

数据发布与代码发布分开：

- `GET /published/content.json`：`{format:"love-journal-publication-v1",journal:<原完整手账备份>,littleJoys:<原小确幸数据或null>}`。手账包含照片 data URL 与视频备份映射，不改动条目字段。
- `GET /published/little-joys.json`：同一 format，仅包含 littleJoys，独立路由无需重复下载整份影像。
- 这两份文件只保存在自有服务器的独立 shared/published 目录，不放在 GitHub、public、dist、Actions artifact 或代码历史中。原始完整备份另行私有保管。
- IndexedDB 已有 `main` 时直接读取现有内容；没有时才下载、校验并原子写入快照及视频。写入事务内再次检查，不覆盖另一标签页刚保存的内容。
- localStorage 已有小确幸时不拉取或覆盖；未保存时读取已发布内容。保留隐藏/置顶状态和兑奖券初始/剩余数量。
- 现有损坏记录或快照读取错误会报错，保留原数据，不退回演示数据或重置。
- 浏览器编辑依旧只影响本设备。发布快照不会自动同步新增内容或兑奖状态；要让其他新设备看到后续内容，需另行备份并更新服务器快照。已有设备内容不因更新快照被覆盖。

生产服务沿用 Vinext Node + systemd + Caddy。独立站点反向代理到回环服务端口；Caddy 只对上述两个精确路径提供静态快照，其余 published 路径不开放。拒绝应用的非 GET/HEAD 请求，不提供共享写接口，也不新增账号、访问密码、数据库或 CMS。

现有 Love Journal 原本只有手动构建和 SSH 发布，没有 GitHub Actions 自动发布。代码继续推送原仓库；推送本身不会更新生产站点。后续沿用：检查/构建 → 上传 dist 和运行清单到独立 release → 用已核验的 Linux 运行依赖预检 → 原子切换 current → 只重启 Love Journal → HTTPS 检查，失败回退 previous。不要把 macOS node_modules 上传到 Linux。更改运行依赖时必须按锁文件重新安装 Linux 依赖。

代码部署不得上传或覆盖 shared。独立站点配置修改先验证，再平滑重载 Caddy；不要覆盖其他站点配置。保留 previous 版本和私有备份。

旧数据导出工具为 `scripts/migration-export.html`。临时放到原本地项目 public 目录，在原浏览器和完整原地址打开，一次导出手账、照片、视频、留言和券状态；导出后移出 public。该工具只读已有数据库，兼容没有 videos store 的早期版本，不初始化缺失数据库。现有设置页导出仍是原手账格式，不包含小确幸。

每次验收至少检查新浏览器首次导入、刷新后的内容、内部路由直达、照片与视频、留言与券数量、原其他站点，以及敏感路径的 404 和写请求的 405。首次影像导入体积取决于原始备份，完成后继续使用本地数据库。
