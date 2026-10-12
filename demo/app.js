// The demo imports the repo's actual build output, so what runs in the
// browser is exactly what npm consumers get. Only markdown-it (the single
// dependency of the weimo-wdf/markdown subpath) comes from the esm.sh CDN
// via the import map in index.html.
import {
  renderPlain,
  toApple,
  toTiptap,
  validateAndCanonicalize,
} from "../dist/index.js";
import { fromMarkdown, toMarkdown } from "../dist/adapters/markdown/index.js";

const nonCanonicalWdf = {
  schema: "weimo.document",
  version: 1,
  root: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "hello\r\nworld" },
          { type: "text", text: "" },
          { type: "text", text: "more", marks: [{ type: "bold" }] },
          { type: "text", text: "!", marks: [{ type: "bold" }] },
        ],
      },
      {
        type: "ordered_list",
        content: [
          {
            type: "list_item",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "a" }] },
            ],
          },
        ],
      },
    ],
  },
};

const invalidMarkWdf = {
  schema: "weimo.document",
  version: 1,
  root: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "hi", marks: [{ type: "italic" }] },
        ],
      },
    ],
  },
};

const SAMPLES = [
  {
    label: "发布说明",
    mode: "markdown",
    text: "# Release notes\n\n## Highlights\n\n- **bold** item\n- plain item\n\n3. third\n4. fourth\n\n> quoted line\n> second line\n",
  },
  {
    label: "标题层级",
    mode: "markdown",
    text: "# Heading one\n\n###### Heading six\n\nplain closing paragraph\n",
  },
  {
    label: "非 canonical WDF",
    mode: "wdf",
    text: JSON.stringify(nonCanonicalWdf, null, 2),
  },
  { label: "链接(拒绝)", mode: "markdown", text: "A [link](https://example.com) inside a paragraph\n" },
  { label: "嵌套列表(拒绝)", mode: "markdown", text: "- outer\n  - inner\n" },
  { label: "非法 mark(拒绝)", mode: "wdf", text: JSON.stringify(invalidMarkWdf, null, 2) },
];

const inputEl = document.getElementById("input");
const statusEl = document.getElementById("status");
const diagnosticsEl = document.getElementById("diagnostics");
const outputEl = document.getElementById("output");
const outputCodeEl = document.getElementById("output-code");
const copyBtn = document.getElementById("copy");

const state = { mode: "markdown", tab: "wdf", outputs: null };

for (const sample of SAMPLES) {
  const btn = document.createElement("button");
  btn.type = "button";
  const isBad = sample.label.includes("拒绝");
  btn.innerHTML = isBad ? `<span class="bad">${sample.label}</span>` : sample.label;
  btn.addEventListener("click", () => {
    setMode(sample.mode);
    inputEl.value = sample.text;
    run();
  });
  document.getElementById("samples").append(btn);
}

document.getElementById("input-tabs").addEventListener("click", (event) => {
  const mode = event.target.dataset.mode;
  if (mode) setMode(mode);
});

document.getElementById("output-tabs").addEventListener("click", (event) => {
  const tab = event.target.dataset.tab;
  if (tab) {
    state.tab = tab;
    for (const btn of event.currentTarget.children) {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    }
    renderOutput();
  }
});

function setMode(mode) {
  state.mode = mode;
  for (const btn of document.getElementById("input-tabs").children) {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  }
}

let debounce;
inputEl.addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(run, 150);
});

copyBtn.addEventListener("click", async () => {
  if (outputCodeEl.textContent) {
    await navigator.clipboard.writeText(outputCodeEl.textContent);
    copyBtn.textContent = "已复制";
    setTimeout(() => (copyBtn.textContent = "复制"), 1200);
  }
});

function run() {
  let result;
  if (state.mode === "markdown") {
    result = fromMarkdown(inputEl.value);
  } else {
    let parsed;
    try {
      parsed = JSON.parse(inputEl.value);
    } catch (error) {
      // The demo layer's own failure, deliberately distinct from package
      // diagnostics (grey badge vs red).
      result = {
        ok: false,
        diagnostics: [
          {
            source: "demo",
            code: "demo.invalid_json",
            severity: "error",
            path: [],
            message: `JSON 解析失败:${error.message}`,
          },
        ],
      };
    }
    if (parsed !== undefined) result = validateAndCanonicalize(parsed);
  }
  render(result);
}

function render(result) {
  if (result.ok) {
    state.outputs = {
      wdf: JSON.stringify(result.value, null, 2),
      tiptap: JSON.stringify(toTiptap(result.value), null, 2),
      apple: JSON.stringify(toApple(result.value), null, 2),
      markdown: toMarkdown(result.value),
      plain: renderPlain(result.value),
    };
    statusEl.className = "status ok";
    statusEl.textContent =
      `✓ 有效 · ${result.value.root.content.length} 个顶层块 · 已规范化`;
    diagnosticsEl.hidden = true;
    diagnosticsEl.replaceChildren();
  } else {
    state.outputs = null;
    statusEl.className = "status err";
    statusEl.textContent = `✗ 被拒绝 · ${result.diagnostics.length} 条诊断`;
    diagnosticsEl.hidden = false;
    diagnosticsEl.replaceChildren(
      ...result.diagnostics.map((diagnostic) => {
        const item = document.createElement("div");
        item.className = "diag";
        const head = document.createElement("div");
        head.className = "diag-head";
        const badge = document.createElement("span");
        badge.className = `badge${diagnostic.source === "demo" ? " demo" : ""}`;
        badge.textContent = diagnostic.code;
        head.append(badge);
        if (diagnostic.path.length > 0) {
          const path = document.createElement("span");
          path.className = "path";
          path.textContent = formatPath(diagnostic.path);
          head.append(path);
        }
        const message = document.createElement("p");
        message.textContent = diagnostic.message;
        item.append(head, message);
        return item;
      }),
    );
  }
  renderOutput();
}

function renderOutput() {
  if (state.outputs) {
    outputEl.classList.remove("empty");
    outputCodeEl.textContent = state.outputs[state.tab];
  } else {
    outputEl.classList.add("empty");
    outputCodeEl.textContent = "(输入被拒绝——没有输出)";
  }
}

function formatPath(segments) {
  let out = "$";
  for (const segment of segments) {
    out += typeof segment === "number" ? `[${segment}]` : `.${segment}`;
  }
  return out;
}

// Boot with the first sample.
inputEl.value = SAMPLES[0].text;
run();
