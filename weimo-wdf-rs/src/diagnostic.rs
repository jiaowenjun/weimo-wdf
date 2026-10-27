use serde::Serialize;

/// A single structured validation failure.
///
/// Diagnostics are data, not formatted strings: map `code` to UI behavior,
/// `path` to the offending node (as JSON-pointer-like segments), and `message`
/// to a user-facing message. All diagnostics produced by this crate have
/// `severity == "error"` in v0.1.
///
/// `source` names the layer that rejected the input: `"wdf"` for the model
/// and validator, `"markdown"`, `"prosemirror"` or `"apple"` for an adapter.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Diagnostic {
    /// Layer that produced the failure: `wdf`, `markdown`, `prosemirror`, `apple`.
    pub source: String,
    /// Stable machine-readable code, e.g. `wdf.unsupported_mark`.
    pub code: String,
    /// Always `"error"` in v0.1.
    pub severity: String,
    /// JSON-pointer-like path to the offending value; may be empty.
    pub path: Vec<serde_json::Value>,
    /// Human-readable explanation.
    pub message: String,
}

impl Diagnostic {
    /// Creates an error diagnostic; attach a path with [`Diagnostic::at`].
    pub fn error(source: &str, code: &str, message: impl Into<String>) -> Self {
        Self {
            source: source.to_string(),
            code: code.to_string(),
            severity: "error".to_string(),
            path: vec![],
            message: message.into(),
        }
    }

    /// Sets the JSON path of the offending value.
    pub fn at(mut self, path: Vec<serde_json::Value>) -> Self {
        self.path = path;
        self
    }
}

/// All failures for one input; empty means the input is valid.
pub type Diagnostics = Vec<Diagnostic>;
