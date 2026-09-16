use crate::{
    diagnostic::{Diagnostic, Diagnostics},
    model::*,
    validate::validate_and_canonicalize,
};
use pulldown_cmark::{Event, Parser, Tag, TagEnd};
use serde_json::json;

/// Parses Markdown into a canonical [`WdfDocument`].
///
/// The accepted subset matches what WDF v0.1 can represent: ATX headings,
/// paragraphs, blockquotes containing paragraphs, top-level bullet and ordered
/// lists whose items are single paragraphs, `**bold**` spans, and soft/hard
/// line breaks. Anything else — inline code, links, images, tables, nested
/// lists, italic, HTML — is rejected with a `markdown.unsupported_*`
/// diagnostic instead of being silently dropped.
///
/// ```
/// use weimo_doc::{WdfBlock, from_markdown};
///
/// let doc = from_markdown("# Title\n\nplain paragraph\n").expect("supported");
/// assert!(matches!(doc.root.content[1], WdfBlock::Paragraph { .. }));
/// ```
pub fn from_markdown(input: &str) -> Result<WdfDocument, Diagnostics> {
    let events: Vec<Event<'_>> = Parser::new(input).collect();
    let mut cursor = Cursor {
        events,
        index: 0,
        diagnostics: Vec::new(),
    };
    let blocks = cursor.parse_blocks(None);
    if !cursor.diagnostics.is_empty() {
        return Err(cursor.diagnostics);
    }
    let value = json!({"schema": WDF_SCHEMA, "version": WDF_VERSION, "root": {"type":"doc", "content": blocks}});
    validate_and_canonicalize(&value)
}

struct Cursor<'a> {
    events: Vec<Event<'a>>,
    index: usize,
    diagnostics: Diagnostics,
}

impl<'a> Cursor<'a> {
    fn parse_blocks(&mut self, terminator: Option<TagEnd>) -> Vec<WdfBlock> {
        let mut blocks = Vec::new();
        while self.index < self.events.len() {
            if matches!(terminator, Some(end) if matches!((&self.events[self.index], end), (Event::End(actual), expected) if *actual == expected))
            {
                self.index += 1;
                break;
            }
            let event = self.events[self.index].clone();
            match event {
                Event::Start(Tag::Paragraph) => {
                    self.index += 1;
                    blocks.push(WdfBlock::Paragraph {
                        content: self.parse_inline(TagEnd::Paragraph, false),
                    });
                }
                Event::Start(Tag::Heading { level, .. }) => {
                    self.index += 1;
                    blocks.push(WdfBlock::Heading {
                        attrs: HeadingAttrs { level: level as u8 },
                        content: self.parse_inline(TagEnd::Heading(level), false),
                    });
                }
                Event::Start(Tag::BlockQuote(_)) => {
                    self.index += 1;
                    let content = self.parse_blocks(Some(TagEnd::BlockQuote(None)));
                    let mut paragraphs = Vec::new();
                    for block in content {
                        match block {
                            WdfBlock::Paragraph { content } => {
                                paragraphs.extend(split_paragraph_lines(content))
                            }
                            _ => self.unsupported("blockquote child"),
                        }
                    }
                    blocks.push(WdfBlock::Blockquote {
                        content: paragraphs,
                    });
                }
                Event::Start(Tag::List(start)) => {
                    self.index += 1;
                    let mut items = Vec::new();
                    while self.index < self.events.len() {
                        if matches!(self.events[self.index], Event::End(TagEnd::List(_))) {
                            self.index += 1;
                            break;
                        } else if matches!(self.events[self.index], Event::Start(Tag::Item)) {
                            self.index += 1;
                            // pulldown-cmark omits paragraph events in tight
                            // list items, so inline content is parsed directly.
                            if !matches!(
                                self.events.get(self.index),
                                Some(Event::Start(Tag::Paragraph))
                            ) {
                                items.push(list_item(self.parse_inline(TagEnd::Item, false)));
                                continue;
                            }
                            let item_blocks = self.parse_blocks(Some(TagEnd::Item));
                            if item_blocks.len() == 1 {
                                if let WdfBlock::Paragraph { content } =
                                    item_blocks.into_iter().next().unwrap()
                                {
                                    items.push(list_item(content));
                                } else {
                                    self.unsupported("list item");
                                }
                            } else {
                                self.unsupported("list item content");
                            }
                        } else {
                            self.unsupported("list content");
                            self.index += 1;
                        }
                    }
                    if start.is_some() {
                        blocks.push(WdfBlock::OrderedList {
                            attrs: Some(OrderedListAttrs {
                                start: start.unwrap_or(1) as u32,
                            }),
                            content: items,
                        });
                    } else {
                        blocks.push(WdfBlock::BulletList { content: items });
                    }
                }
                Event::Text(text) => {
                    self.index += 1;
                    blocks.push(WdfBlock::Paragraph {
                        content: vec![WdfText::plain(text.to_string())],
                    });
                }
                Event::End(_) => {
                    self.index += 1;
                }
                _ => {
                    self.unsupported("block");
                    self.index += 1;
                }
            }
        }
        blocks
    }

    fn parse_inline(&mut self, terminator: TagEnd, bold: bool) -> Vec<WdfText> {
        let mut result = Vec::new();
        while self.index < self.events.len() {
            let event = self.events[self.index].clone();
            if matches!(event, Event::End(end) if end == terminator) {
                self.index += 1;
                break;
            }
            match event {
                Event::Text(text) => {
                    self.index += 1;
                    result.push(if bold {
                        WdfText::bold(text.to_string())
                    } else {
                        WdfText::plain(text.to_string())
                    });
                }
                Event::Start(Tag::Strong) => {
                    self.index += 1;
                    result.extend(self.parse_inline(TagEnd::Strong, true));
                }
                Event::SoftBreak | Event::HardBreak => {
                    self.index += 1;
                    result.push(if bold {
                        WdfText::bold("\n")
                    } else {
                        WdfText::plain("\n")
                    });
                }
                Event::Code(code) => {
                    self.unsupported("code");
                    self.index += 1;
                    let _ = code;
                }
                Event::End(_) => {
                    self.index += 1;
                }
                _ => {
                    self.unsupported("inline");
                    self.index += 1;
                }
            }
        }
        result
    }

    fn unsupported(&mut self, kind: &str) {
        self.diagnostics.push(Diagnostic::error(
            "markdown",
            &format!("markdown.unsupported_{kind}"),
            format!("Markdown {kind} is outside the supported subset"),
        ));
    }
}

fn split_paragraph_lines(content: Vec<WdfText>) -> Vec<WdfParagraph> {
    let mut paragraphs: Vec<Vec<WdfText>> = vec![Vec::new()];
    for text in content {
        let parts: Vec<&str> = text.text.split('\n').collect();
        for (index, part) in parts.iter().enumerate() {
            if !part.is_empty() {
                paragraphs
                    .last_mut()
                    .expect("paragraph")
                    .push(if text.is_bold() {
                        WdfText::bold(*part)
                    } else {
                        WdfText::plain(*part)
                    });
            }
            if index + 1 < parts.len() {
                paragraphs.push(Vec::new());
            }
        }
    }
    paragraphs
        .into_iter()
        .filter(|content| !content.is_empty())
        .map(paragraph)
        .collect()
}

/// Renders a [`WdfDocument`] back to Markdown.
///
/// Blocks are separated by one blank line, headings use `#` prefixes, list
/// items use `-` / `N.` markers, quotes are prefixed with `> `, and bold runs
/// are wrapped in `**` (inner `**` escaped as `\**`). The output stays inside
/// the supported subset, so [`from_markdown`] round-trips it losslessly.
pub fn to_markdown(document: &WdfDocument) -> String {
    let mut output = document
        .root
        .content
        .iter()
        .map(block_markdown)
        .collect::<Vec<_>>()
        .join("\n\n");
    output.push('\n');
    output
}

fn inline_markdown(content: &[WdfText]) -> String {
    content
        .iter()
        .map(|text| {
            if text.is_bold() {
                format!("**{}**", text.text.replace("**", "\\**"))
            } else {
                text.text.clone()
            }
        })
        .collect()
}
fn block_markdown(block: &WdfBlock) -> String {
    match block {
        WdfBlock::Paragraph { content } => inline_markdown(content),
        WdfBlock::Heading { attrs, content } => format!(
            "{} {}",
            "#".repeat(attrs.level as usize),
            inline_markdown(content)
        ),
        WdfBlock::Blockquote { content } => content
            .iter()
            .map(|paragraph| {
                let body = inline_markdown(&paragraph.content);
                body.split('\n')
                    .map(|line| {
                        if line.is_empty() {
                            ">".to_string()
                        } else {
                            format!("> {line}")
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .collect::<Vec<_>>()
            .join("\n"),
        WdfBlock::BulletList { content } => content
            .iter()
            .map(|item| format!("- {}", inline_markdown(&item.content[0].content)))
            .collect::<Vec<_>>()
            .join("\n"),
        WdfBlock::OrderedList { attrs, content } => content
            .iter()
            .enumerate()
            .map(|(index, item)| {
                format!(
                    "{}. {}",
                    attrs.as_ref().map_or(1, |a| a.start) + index as u32,
                    inline_markdown(&item.content[0].content)
                )
            })
            .collect::<Vec<_>>()
            .join("\n"),
    }
}
