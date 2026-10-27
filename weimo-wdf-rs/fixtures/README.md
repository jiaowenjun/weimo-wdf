# Fixtures

跨格式 conformance 语料，由 `tests/adapters.rs` 和 validator tests 消费，按 `core`、`canonicalization`、`invalid` 分类：

- `core/<case>/`：canonical WDF（`expected.wdf.json`）、Markdown 输入/输出（`input.md`、`expected.md`）、Tiptap JSON（`input.pm.json`）和 CLI plain output（`expected.cli.txt`）样本。
- `canonicalization/<case>/`：非 canonical case（`case.json`）与期望 canonical WDF。
- `invalid/<case>/`：非法 case（`case.json`）与期望 diagnostics（`diagnostics.json`）。

运行：

```bash
cargo test --test adapters
```

新增格式或节点时，应在此目录同步覆盖相应 fixture；`expected.wdf.json` 是 canonical model 的 golden value。
