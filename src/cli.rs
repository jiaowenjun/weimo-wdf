use crate::model::*;

const ANSI_BOLD: &str = "\x1b[1m";
const ANSI_OFF: &str = "\x1b[22m";

/// Renders a [`WdfDocument`] as plain terminal text.
///
/// Headings keep their `#` prefix, list items use `-` / `N.`, quotes are
/// prefixed with `>`, and no escape codes are emitted — suitable for logs,
/// previews and piped output.
pub fn render_plain(document: &WdfDocument) -> String {
    render(document, false)
}

/// Like [`render_plain`], but wraps bold runs and heading lines in ANSI
/// bold escape codes for interactive terminals.
pub fn render_ansi(document: &WdfDocument) -> String {
    render(document, true)
}

fn inline(content: &[WdfText], ansi: bool) -> String {
    content
        .iter()
        .map(|text| {
            if ansi && text.is_bold() {
                format!("{ANSI_BOLD}{}{ANSI_OFF}", text.text)
            } else {
                text.text.clone()
            }
        })
        .collect()
}
fn lines(value: String, prefix: &str) -> String {
    value
        .split('\n')
        .map(|line| {
            if line.is_empty() {
                prefix.trim_end().to_string()
            } else {
                format!("{prefix}{line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}
fn block(block: &WdfBlock, ansi: bool) -> String {
    match block {
        WdfBlock::Paragraph { content } => inline(content, ansi),
        WdfBlock::Heading { attrs, content } => format!(
            "{}{}",
            "#".repeat(attrs.level as usize) + " ",
            if ansi {
                format!("{ANSI_BOLD}{}{ANSI_OFF}", inline(content, true))
            } else {
                inline(content, false)
            }
        ),
        WdfBlock::Blockquote { content } => content
            .iter()
            .map(|p| lines(inline(&p.content, ansi), "> "))
            .collect::<Vec<_>>()
            .join("\n"),
        WdfBlock::BulletList { content } => content
            .iter()
            .map(|i| lines(inline(&i.content[0].content, ansi), "- "))
            .collect::<Vec<_>>()
            .join("\n"),
        WdfBlock::OrderedList { attrs, content } => content
            .iter()
            .enumerate()
            .map(|(index, i)| {
                lines(
                    inline(&i.content[0].content, ansi),
                    &format!("{}. ", attrs.as_ref().map_or(1, |a| a.start) + index as u32),
                )
            })
            .collect::<Vec<_>>()
            .join("\n"),
    }
}
fn render(document: &WdfDocument, ansi: bool) -> String {
    document
        .root
        .content
        .iter()
        .map(|b| block(b, ansi))
        .collect::<Vec<_>>()
        .join("\n\n")
        + "\n"
}
