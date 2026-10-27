# weimo-wdf monorepo 协作规范

本文档适用于维护者和自动化代理，约定 monorepo 级规则；各子项目的详细规范见其目录内的
AGENTS.md。

## 布局

- `weimo-wdf-rs/` — Rust 实现，crates.io 包 `weimo-wdf`（导入名 `weimo_wdf`）。规范见
  [`weimo-wdf-rs/AGENTS.md`](weimo-wdf-rs/AGENTS.md)。
- `weimo-wdf-ts/` — TypeScript 实现，npm 包 `weimo-wdf`。规范见
  [`weimo-wdf-ts/AGENTS.md`](weimo-wdf-ts/AGENTS.md)。
- 两个子目录各自自包含（各自的 `Cargo.toml`/`package.json`、fixtures、docs、schema、
  LICENSE），互不共享文件。`weimo-wdf-rs/Cargo.toml` 保留 `[workspace]` 表独立成
  workspace；**仓库根不得放置 `Cargo.toml`**，否则会吸收子包导致 workspace 冲突。

## 命名

- 文档格式名是 WDF（`weimo.document` schema、`wdf.*` 诊断码、`WdfDocument` 类型）。
- 两侧包同名 `weimo-wdf`，与格式名对齐；仓库即 monorepo `weimo-wdf`，子项目目录以
  `-ts`/`-rs` 后缀区分。

## CI 与发布

- CI 按路径过滤拆分：`ci-rs.yml` 只在 `weimo-wdf-rs/**` 变化时运行，`ci-ts.yml` 只在
  `weimo-wdf-ts/**` 变化时运行；`pages.yml` 将 TS demo 部署到
  <https://jiaowenjun.github.io/weimo-wdf/>。
- 发布 tag 前缀区分包：Rust 用 `rs-vX.Y.Z`（推送后触发 `publish-rs.yml` 自动发布
  crates.io），TypeScript 用 `ts-vX.Y.Z`（npm 发布按 TS 规范手动执行）。
- 历史无前缀 tag `v0.1.0`/`v0.1.1` 是合并前 Rust 仓库的发布 tag，保持原样不得移动。
- 版本号各自独立演进：Rust 以 `weimo-wdf-rs/Cargo.toml` 为准，TS 以
  `weimo-wdf-ts/package.json` 为准。
- `main` 是可发布分支。已发布版本的远端 tag 不得重写或强制移动，crates.io/npm 版本
  不得重复上传。

## 历史

源自 weimo 主仓库（`weimo-wdf-mvp` 验证项目），先后经历 `weimo-doc`/`weimo-wdf-rs`
（Rust）与 `weimo-wdf-ts`（TypeScript）两个独立仓库，2026-10 以 RS 仓库为基底合并为本
monorepo（TS 历史经 git subtree 并入，旧 `weimo-wdf-ts` 仓库已归档）。
