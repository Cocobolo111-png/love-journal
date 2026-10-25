# 生产数据与部署

默认构建继续使用虚构演示数据。正式版本使用：

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
LOVE_JOURNAL_MODE=published LOVE_JOURNAL_PUBLIC_DIR=/absolute/path/to/original/public pnpm build
```

原花园和音频从现有私有素材目录构建，不需要上传到公开仓库。GitHub只管理代码、通用说明和虚构测试数据；真实记录、照片、视频、环境配置、备份、授权码和设备会话都保留在自有服务器或本机私有目录。

## 自动服务器保存

正式版通过同源 `/api/storage/` 读写。已有 Vinext 前端服务和独立的 Node 文件存储服务均只监听回环地址，由现有 Caddy 分流。没有数据库、CMS、外部部署平台或公开登录页。

- `GET /status` 查询当前浏览器是否已授权。
- `POST /authorize` 使用维护者签发的一次性授权码，换取90天的 HttpOnly、Secure、SameSite=Strict Cookie。授权码使用后失效，默认15分钟有效；可由维护者通过环境变量设置时限。服务器只保存码和会话的SHA-256摘要。
- `GET /journal`、`GET /joys` 读取当前共享内容。
- `PUT /journal`、`PUT /joys` 需要有效设备会话、正确的Origin和当前修订号 If-Match。旧版本返回409，不覆盖新版本。
- `POST /media` 需要授权；照片最长20MiB、视频最长100MiB。媒体单独保存在内容哈希文件中，文档只保留引用。禁止SVG、外部图片地址、目录路径和未完成的上传引用。
- `GET/HEAD /media/<sha256>` 提供媒体，支持视频Range请求。其余内部文件、授权状态文件、备份目录都不映射为公开文件路径。

授权设备的新增、编辑、删除、照片/视频导入、打卡、留言和兑换数量都会提交服务器。未授权设备仍可本地编辑，但界面明确显示尚未上传，不会修改共享数据。其他设备重新打开或刷新会读取最新共享内容，不提供实时协同编辑。

浏览器保留缓存和待上传内容。网络失败时不把本机副本当作服务器保存成功；刷新可重试。使用Web Locks串行化同一浏览器的跨标签页读写；服务器修订号阻止不同设备或旧标签页覆盖更新。冲突时保留本机副本并提示处理，不能强行覆盖。

从旧发布快照迁移时保存基准摘要。旧浏览器没有同步标记时，先比较旧基准，再合并此前尚未上传的独立改动；同一条记录出现双方改动时停止自动覆盖。基准只向客户端提供摘要，不提供历史私密正文；服务器备份不对外开放。

每次成功写入先保留原版本，再原子写入当前JSON；媒体内容哈希文件不就地改写。部署代码不得覆盖数据目录。删除记录不会立即清理历史备份引用的媒体。

## 运行与首次初始化

存储服务启动命令为 `node server/storage.mjs`，生产运行时需要随代码发布 `server/` 和 `lib/`。使用原Linux依赖，不复制macOS node_modules。需要Node.js 24，原服务器已有该运行时。

私有环境配置：

```text
LOVE_JOURNAL_STORAGE_DIR=/absolute/private/shared/storage
LOVE_JOURNAL_ORIGIN=https://configured-production-domain
PORT=loopback-port
```

只在空数据目录执行一次：

```sh
node server/storage-admin.mjs migrate /absolute/private/full-migration-backup.json
```

迁移会把原完整备份中的照片与视频拆为独立文件，保留所有条目字段、日期、数量和关系；已有数据时拒绝重新初始化。迁移后逐字节还原完整备份作一致性核验。

在私有环境下签发设备授权码：

```sh
node server/storage-admin.mjs invite
```

不要将输出写入聊天、仓库、工作流日志或公网文件。授权码可在网站设置中填写，或通过私有设备授权文件带到URL片段 `#device-authorize=...`。片段在读取后立即从地址栏删除，不进入HTTP URL、Referer或访问日志。不要为公开访客自动颁发设备会话。使用Caddy日志过滤器移除Cookie、Authorization及Set-Cookie。

## 代码更新

沿用原仓库、手动构建与SSH发布。git push本身不自动上线。每个版本保留独立release和previous回滚指针；先测试存储服务，再验证站点配置、切换current，重启前端与存储服务，平滑重载Caddy。生产服务通过current符号链接启动时，启动入口必须按真实路径判断，相关逻辑有回归测试。

保留独立站点配置，检查其他站点不受影响。回滚前确认新客户端已经保存的服务器数据与目标旧版兼容，不能通过重新导入旧快照回滚数据。私有完整备份和每版JSON另行保管。

## 验收

检查：未授权写入401、跨站写入403、过期/复用授权码401、旧修订409；授权保存后刷新/其他设备可见；媒体字节一致且视频可Range播放；服务重启后内容保留；本机失败副本不被覆盖；原其他站点正常。完整JSON导出会重新内联服务器媒体，继续可作为独立恢复备份。
