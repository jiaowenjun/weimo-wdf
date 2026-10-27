# weimo-wdf（TS）协作规范

本文档适用于维护者和自动化代理。monorepo 级约定见根目录 [`AGENTS.md`](../AGENTS.md)。

## 基本约定

- 布局：npm 包 `weimo-wdf` 位于 monorepo 的本子目录 `weimo-wdf-ts/`（`src/`、`test/`、`package.json`），`fixtures/`、`docs/`、`schema/` 是 conformance 语料与格式资产，`demo/` 是浏览器演示页（消费本地 `dist/` 构建，不属于 npm 包，npm `files` 只含 `dist`；由仓库根 `.github/workflows/pages.yml` 自动发布到 GitHub Pages <https://jiaowenjun.github.io/weimo-wdf/>，站点目录结构与本目录一致以保持相对路径有效）。
- `fixtures/` 的 golden value 由 Rust 实现产出，行为契约由此固定，TS 测试逐字节断言（Rust 实现位于 monorepo 的 `../weimo-wdf-rs/`）。
- `main` 是可发布分支；公共 API、README、`docs/format-reference.md` 和测试保持同步。
- 包名是 `weimo-wdf`（npm，保持不变），文档格式名是 WDF（`weimo.document` schema、`wdf.*` 诊断码、`WdfDocument` 类型），两者不要混淆。
- 版本号以本目录 `package.json` 的 `version` 为准。遵循 SemVer；公共 API 变化必须在 README 和 `docs/format-reference.md` 中说明。
- 已发布版本的远端 tag 不得重写或强制移动，npm 版本不得重复上传。

## 检查与 CI

触及 `weimo-wdf-ts/**` 的 `main` 推送和 PR 由仓库根 `.github/workflows/ci-ts.yml` 检查（Node 22：`npm ci`、type-check、test、build）。提交前在本目录本地跑：

```bash
npm run check
npm test
npm run build
git diff --check
```

## 发布

npm 发布流程另行约定，当前不含发布 workflow。在约定落地前，不要手动执行
`npm publish`；已约定的原则：版本提交推送到 `main` 并通过 CI 后方可发布，
`ts-vX.Y.Z` annotated tag 指向该提交，发布后核对 npm registry 可查询到同一版本。

## 与 weimo 主仓库的关系

本包源自 weimo 主仓库（`weimo-wdf-mvp` 验证项目）。本目录是发布与后续开发的
upstream；主仓库内若保留副本，修改应以此为准并单向同步。

2026-10 并入 `weimo-wdf` monorepo（原独立仓库 `weimo-wdf-ts` 已归档）；npm 包名
仍为 `weimo-wdf`，不受影响。
