import { WdfText, type WdfBlock, type WdfDocument } from "../../model.js";

/**
 * Renders a {@link WdfDocument} back to Markdown.
 *
 * Blocks are separated by one blank line, headings use `#` prefixes, list
 * items use `-` / `N.` markers, quotes are prefixed with `> `, and bold runs
 * are wrapped in `**` (inner `**` escaped as `\**`). The output stays inside
 * the supported subset, so `fromMarkdown` round-trips it losslessly.
 */
export function toMarkdown(document: WdfDocument): string {
  return document.root.content.map(blockMarkdown).join("\n\n") + "\n";
}

function inlineMarkdown(content: WdfText[]): string {
  return content
    .map((text) =>
      WdfText.isBold(text) ? `**${text.text.replace(/\*\*/g, "\\**")}**` : text.text,
    )
    .join("");
}

function blockMarkdown(block: WdfBlock): string {
  switch (block.type) {
    case "paragraph":
      return inlineMarkdown(block.content);
    case "heading":
      return `${"#".repeat(block.attrs.level)} ${inlineMarkdown(block.content)}`;
    case "blockquote":
      return block.content
        .map((paragraph) =>
          inlineMarkdown(paragraph.content)
            .split("\n")
            .map((line) => (line === "" ? ">" : `> ${line}`))
            .join("\n"),
        )
        .join("\n");
    case "bullet_list":
      return block.content
        .map((item) => `- ${inlineMarkdown(item.content[0]!.content)}`)
        .join("\n");
    case "ordered_list": {
      const start = block.attrs.start;
      return block.content
        .map((item, index) => `${start + index}. ${inlineMarkdown(item.content[0]!.content)}`)
        .join("\n");
    }
  }
}
