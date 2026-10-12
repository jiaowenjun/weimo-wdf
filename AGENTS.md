# weimo-wdf 协作规范

本文档适用于维护者和自动化代理。

## 基本约定

- 仓库布局：npm 包 `weimo-wdf` 位于仓库根目录（`src/`、`test/`、`package.json`），`fixtures/`、`docs/`、`schema/` 是共享的 conformance 语料与格式资产，`demo/` 是浏览器演示页（消费本地 `dist/` 构建，不属于 npm 包，npm `files` 只含 `dist`；由 `.github/workflows/pages.yml` 自动发布到 GitHub Pages，站点目录结构与仓库一致以保持相对路径有效）。
- 本仓库原含 Rust 实现（`rs/`，已移除，历史仍在 git 中）；`fixtures/` 的 golden value 由该实现产出，行为契约由此固定，TS 测试逐字节断言。
- `main` 是可发布分支；公共 API、README、`docs/format-reference.md` 和测试保持同步。
- 包名是 `weimo-wdf`；文档格式名是 WDF（`weimo.document` schema、`wdf.*` 诊断码、`WdfDocument` 类型），两者不要混淆。
- 版本号以仓库根 `package.json` 的 `version` 为准。遵循 SemVer；公共 API 变化必须在 README 和 `docs/format-reference.md` 中说明。
- 已发布版本的远端 tag 不得重写或强制移动，npm 版本不得重复上传。

## 检查与 CI

`main` 的推送和所有 PR 由 `.github/workflows/ci.yml` 检查（Node 22：`npm ci`、type-check、test、build）。提交前在仓库根目录本地跑：

```bash
npm run check
npm test
npm run build
git diff --check
```

## 发布

npm 发布流程另行约定，当前仓库不含发布 workflow。在约定落地前，不要手动执行
`npm publish`；已约定的原则：版本提交推送到 `main` 并通过 CI 后方可发布，
`vX.Y.Z` annotated tag 指向该提交，发布后核对 npm registry 可查询到同一版本。

## 与 weimo 主仓库的关系

本包源自 weimo 主仓库（`weimo-wdf-mvp` 验证项目）。本仓库是发布与后续开发的
upstream；主仓库内若保留副本，修改应以本仓库为准并单向同步。
