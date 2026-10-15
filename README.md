# Love Journal · 沉浸式情侣回忆记录网站

一个基于现代 Web 技术构建的沉浸式情侣回忆记录网站。电影感视觉、植物入口、滚动视差与页面转场，让日常记录成为可以慢慢翻阅的回忆。

An immersive, local-first journal for shared memories, built with React, TypeScript and Vinext.

![原创演示植物背景](public/botanical-demo.png)

## 功能

- **Cinematic Fantasy Editorial**：保留原有布局、字体层级、响应式样式、植物入口和滚动动画，使用新的演示背景。
- **日常记录**：新增、编辑、删除、按月份筛选；支持多张照片与视频混排。
- **相册**：日常媒体同步展示、排序、逐项移除、大图浏览与视频播放，每条最多 12 项。
- **纪念日**：倒计时、单次或每年重复；闰日纪念日有平年处理。
- **心愿与打卡**：分类、完成状态、习惯打卡与统计。
- **小确幸 / Messages**：留言翻阅、置顶、隐藏与编辑。
- **爱情兑换券**：剩余数量、编辑与兑换状态；这是本地互动，无支付或服务履约功能。
- **声音系统**：音乐淡入、静音记忆、点击 / 保存 / 转场 / 兑换音效，浏览器授权后播放。
- **备份**：主手账 JSON 导入、导出，含照片和视频；覆盖前确认。

## 快速运行

需要 Node.js **22.13 或更新版本**、pnpm **11.25.0**（`npm install -g pnpm@11.25.0`）。

```bash
git clone https://github.com/Cocobolo111-png/love-journal.git
cd love-journal
pnpm install --frozen-lockfile
pnpm dev
```

打开 **http://localhost:4180/**。无需注册、API Key、数据库或后端配置。`.env.example` 说明了配置边界，无需复制也能运行。

首次在当前地址打开时，自动展示虚构人物「示例 A / 示例 B」、固定虚构日期、示例记录、程序生成的色块相片、演示留言与兑换券。所有演示内容集中在 `lib/demo-data.ts`，可以直接编辑、删除或添加自己的内容；刷新后编辑仍保留。示例初始化不会覆盖已有的当前演示版数据。

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

`pnpm start` 使用 Wrangler **本地**预览构建结果；按终端显示的本地地址访问。它不会发布网站。Vinext 当前为 beta，升级框架时请重新检查构建和交互。

## 本地存储与隐私

- IndexedDB 保存手账与视频，localStorage 保存小确幸和声音偏好，sessionStorage 保存音乐位置；演示版使用独立的 `love-journal-demo-*` 名称。
- 没有双人云同步、用户登录、服务端数据库或上传接口。更换浏览器、域名、端口或从 `localhost` 改为 `127.0.0.1`，都会切换存储空间。清除网站数据会丢失记录。
- 主手账 JSON **不包含小确幸**的独立 localStorage 内容，请勿把它当作全站备份。私人备份应保存在仓库以外。
- 导入图片会在浏览器重绘为最长边 1800px 的 JPEG；视频保留原始 Blob，可能包含原文件元数据，不适合直接公开。上传本地媒体只写入当前浏览器。
- 图片上限 20MB，视频上限 100MB，主手账备份上限 500MB。MOV 播放依赖浏览器编码支持，可先转成 H.264 MP4。
- 如用于自己的公网服务，请另行设计身份验证、访问控制与安全同步；当前版本适合本地体验。

## 技术栈与目录

React 19、TypeScript、Vinext / Vite、Tailwind CSS、Base UI / shadcn、Lucide；Cloudflare Vite 插件与 Wrangler 仅用于开发、构建及本地预览。

```text
app/                    首页、小确幸页面与视觉样式
components/             UI 组件、全局声音控制
hooks/                  响应式辅助逻辑
lib/journal.ts          本地手账、媒体与备份逻辑
lib/little-joys.ts       留言、兑换与独立持久化
lib/demo-data.ts         全部虚构初始内容
lib/audio-system.ts     声音生命周期与效果控制
lib/portal-motion.ts    入口动画曲线
public/                 原创演示背景、图标与合成音频
scripts/                可复现音频生成与发布文件审计
tests/                  数据、兑换、动画与声音逻辑测试
docs/                   安全与资源授权说明
```

## 许可与素材

源码采用 [MIT](LICENSE)。依赖与 UI 派生组件遵循各自许可证，见 [第三方声明](THIRD_PARTY_NOTICES.md)。演示植物图片为本项目重新生成的 AI 图片；演示色块、图标与音频为新创作素材，无私人照片、声音或原项目媒体。详见 [资源清单](docs/ASSETS.md)。

## 安全同步后续代码

不要把私人项目目录或其 Git 历史直接合并 / 推送到此仓库。每次只移植经审查的源码改动，保持演示数据、独立存储名与演示素材；禁止复制环境文件、部署目录、备份及构建输出。逐个检查 `git diff --cached`，运行测试、构建与 Gitleaks；素材来源不明确则排除。完整步骤见 [安全说明](docs/SECURITY.md)。
