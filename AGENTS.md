# weimo-doc 协作与发布规范

本文档适用于维护者和自动化代理。发布只有在 GitHub 和 crates.io 两侧都完成时才算完成。

## 基本约定

- `main` 是可发布分支；公共 API、README、`docs/format-reference.md`、rustdoc 和测试保持同步。
- crate 名是 `weimo-doc`（Rust 导入名 `weimo_doc`）；文档格式名是 WDF（`weimo.document` schema、`wdf.*` 诊断码、`WdfDocument` 类型），两者不要混淆。
- 版本号以 `Cargo.toml` 的 `[package].version` 为准，并同步检查 `Cargo.lock`。
- 遵循 SemVer；公共 API 变化必须在 rustdoc、README 和 `docs/format-reference.md` 中说明。
- 已发布版本的远端 tag 不得重写或强制移动，crates.io 版本不得重复上传。

## 发布规则

GitHub 的 `vX.Y.Z` annotated tag 是唯一发布入口。推送 tag 后，
`.github/workflows/publish.yml` 会校验版本并运行检查，成功后发布 crates.io。

严禁在推送 tag 前单独执行 `cargo publish`。发布完成必须同时满足：版本提交已推送到
`main`、tag 指向该提交、`Publish` 工作流成功、crates.io 可查询到同一版本。

## 发布流程

以下命令从仓库根目录执行，`X.Y.Z` 替换为实际版本：

1. 更新版本号、`Cargo.lock` 和必要文档。
2. 发布前检查：

   ```bash
   cargo fmt --all -- --check
   cargo test --locked
   cargo clippy --all-targets --locked -- -D warnings
   cargo package --locked
   cargo publish --dry-run --locked
   git diff --check
   ```

3. 提交并推送 `main`，确认 CI 通过且本地与远端一致：

   ```bash
   test -z "$(git status --porcelain)"
   git fetch origin main --tags
   test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
   ```

4. 从该提交创建并推送 tag：

   ```bash
   version="$(cargo metadata --no-deps --format-version 1 | jq -r '.packages[0].version')"
   git tag -a "v${version}" HEAD -m "Release v${version}"
   git push origin "v${version}"
   ```

5. 等待 `Publish` 成功后核验 tag、提交和 crates.io：

   ```bash
   version="$(cargo metadata --no-deps --format-version 1 | jq -r '.packages[0].version')"
   git ls-remote --tags origin "refs/tags/v${version}" "refs/tags/v${version}^{}"
   test "$(git rev-parse "v${version}^{commit}")" = "$(git rev-parse HEAD)"
   curl --fail --silent --show-error "https://crates.io/api/v1/crates/weimo-doc" \
     | jq -r '.crate.max_version'
   test -z "$(git status --porcelain)"
   ```

## 异常处理

- 版本或 tag 不一致：修正后使用新的版本号，不要强制移动公开 tag。
- 工作流失败：先确认 crates.io 是否已创建版本；已创建则递增版本，禁止重复上传。
- crates.io 已发布但遗漏 tag：核对对应提交，补建指向该提交的 annotated tag，不要再次发布。

## 与 weimo 主仓库的关系

本 crate 源自 weimo 主仓库（`weimo-wdf-mvp` 验证项目）。本仓库是发布与后续开发的
upstream；主仓库内若保留副本，修改应以本仓库为准并单向同步。
