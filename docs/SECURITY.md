# 开源副本的隐私边界

这个仓库仅包含经筛选的应用代码和新建的演示数据，从空 Git 仓库建立历史。

排除项：旧 Git 历史、真实身份与默认私人留言、私人媒体、浏览器数据、数据库和导出、备份、部署脚本及服务器审计文件、云资源配置、环境文件、密钥、构建输出、缓存、日志、设计过程记录和本机启动脚本。`.gitignore` 只负责未来误提交防护，不能清理已进入历史的数据。

应用的本地数据不是多人访问控制机制。不要公开个人备份，也不要将生产凭证写入前端环境变量。

## 每次提交前

```bash
git add <逐个明确的源码路径>
git diff --cached --stat
git diff --cached
python3 scripts/audit-public-files.py
mkdir -p /tmp/love-journal-public-audit
git checkout-index --all --prefix=/tmp/love-journal-public-audit/
gitleaks dir /tmp/love-journal-public-audit --redact --no-banner
gitleaks git . --redact --no-banner
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

从官方发布渠道安装 Gitleaks。扫描零命中不能代替人工审核：逐个检查拟提交文本和所有新增媒体，确认人物、地点、内容及再分发权；使用匿名贡献者名称和邮箱提交，防止提交元信息泄露身份。

## 从私人版本同步

1. 在公开副本新建分支，只按文件或补丁移植必要代码，绝不合并私人历史。
2. 避开默认数据、个人文案、浏览器导出、生产配置和未验证媒体。保持 `lib/demo-data.ts` 与演示版存储命名。
3. 检查补丁上下文、注释、HTML metadata、链接、锁文件来源和资源元数据，不使用整个目录覆盖。
4. 完成以上审计和功能验证后再推送。若秘密已经公开，立即撤销 / 轮换秘密并清理远端历史；删除当前文件并不够。

报告问题时请勿附真实备份或凭证。涉及安全问题可使用 GitHub 仓库可用的私密安全报告入口；不要在公开 issue 粘贴敏感数据。
