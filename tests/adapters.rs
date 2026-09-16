use serde_json::Value;
use std::{fs, path::PathBuf};
use weimo_doc::{
    from_apple, from_markdown, from_tiptap, to_apple, to_markdown, to_tiptap,
    validate_and_canonicalize,
};

fn fixture(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures/core")
        .join(name)
        .join("expected.wdf.json");
    serde_json::from_str(&fs::read_to_string(path).expect("fixture")).expect("JSON fixture")
}

#[test]
fn markdown_and_tiptap_round_trip_shared_fixtures() {
    for name in [
        "paragraph-bold",
        "heading-levels",
        "blockquote",
        "bullet-list",
        "ordered-list-start-three",
        "mixed-document",
    ] {
        let expected = validate_and_canonicalize(&fixture(name)).expect("valid WDF");
        let markdown = to_markdown(&expected);
        assert_eq!(
            from_markdown(&markdown).expect("markdown parse"),
            expected,
            "markdown fixture {name}"
        );
        let tiptap = to_tiptap(&expected);
        assert_eq!(
            from_tiptap(&tiptap).expect("tiptap parse"),
            expected,
            "tiptap fixture {name}"
        );
    }
}

#[test]
fn apple_wire_round_trip_shared_fixture() {
    let expected = validate_and_canonicalize(&fixture("mixed-document")).expect("valid WDF");
    let apple = to_apple(&expected);
    assert_eq!(from_apple(&apple).expect("apple parse"), expected);
    assert_eq!(
        apple.get("type").and_then(Value::as_str),
        Some("apple.document")
    );
}

#[test]
fn tight_list_items_with_inline_marks_round_trip() {
    let markdown = "# Notes\n\n- **bold** item\n- a **b** c\n\n3. **b** start\n";
    let document = from_markdown(markdown).expect("tight list markdown");
    assert_eq!(to_markdown(&document), markdown);
    let diagnostics = from_markdown("- outer\n  - nested\n").expect_err("nested list must fail");
    assert!(
        diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code.starts_with("markdown.unsupported"))
    );
}

#[test]
fn canonicalization_normalizes_newlines_and_ordered_start() {
    let input = serde_json::json!({"schema":"weimo.document","version":1,"root":{"type":"doc","content":[{"type":"ordered_list","content":[{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"a\r\nb"}]}]}]}]}});
    let output = validate_and_canonicalize(&input).expect("valid WDF");
    assert_eq!(to_markdown(&output), "1. a\nb\n");
    assert_eq!(output.root.content[0], serde_json::from_value(serde_json::json!({"type":"ordered_list","attrs":{"start":1},"content":[{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"a\nb"}]}]}]})).expect("block"));
}

#[test]
fn invalid_unknown_mark_is_rejected() {
    let input = serde_json::json!({"schema":"weimo.document","version":1,"root":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"italic"}]}]}]}});
    let diagnostics = validate_and_canonicalize(&input).expect_err("unknown mark must fail");
    assert!(
        diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "wdf.unsupported_mark")
    );
}

#[test]
fn invalid_unknown_property_is_rejected() {
    let input = serde_json::json!({"schema":"weimo.document","version":1,"root":{"type":"doc","content":[{"type":"paragraph","content":[],"extra":true}]}});
    let diagnostics = validate_and_canonicalize(&input).expect_err("unknown property must fail");
    assert!(
        diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "wdf.unknown_property")
    );
}

#[test]
fn invalid_tiptap_mark_is_rejected() {
    let input = serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"italic"}]}]}]});
    let diagnostics = from_tiptap(&input).expect_err("unknown Tiptap mark must fail");
    assert!(
        diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "prosemirror.unsupported_mark")
    );
}
