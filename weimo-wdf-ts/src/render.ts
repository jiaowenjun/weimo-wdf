import { WdfText, type WdfBlock, type WdfDocument } from "./model.js";

/**
 * Renders a {@link WdfDocument} as plain terminal-style text.
 *
 * Headings keep their `#` prefix, list items use `-` / `N.`, quotes are
 * prefixed with `>`, and no escape codes are emitted — suitable for logs,
 * previews and copy-as-plain-text.
 */
export function renderPlain(document: WdfDocument): string {
  return (
    document.root.content.map((block) => renderBlock(block)).join("\n\n") + "\n"
  );
}

function inline(content: WdfText[]): string {
  return content.map((text) => text.text).join("");
}

function lines(value: string, prefix: string): string {
  return value
    .split("\n")
    .map((line) => (line === "" ? prefix.trimEnd() : `${prefix}${line}`))
    .join("\n");
}

function renderBlock(block: WdfBlock): string {
  switch (block.type) {
    case "paragraph":
      return inline(block.content);
    case "heading":
      return `${"#".repeat(block.attrs.level)} ${inline(block.content)}`;
    case "blockquote":
      return block.content
        .map((paragraph) => lines(inline(paragraph.content), "> "))
        .join("\n");
    case "bullet_list":
      return block.content
        .map((item) => lines(inline(item.content[0]!.content), "- "))
        .join("\n");
    case "ordered_list": {
      const start = block.attrs.start;
      return block.content
        .map((item, index) => lines(inline(item.content[0]!.content), `${start + index}. `))
        .join("\n");
    }
  }
}
