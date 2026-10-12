/**
 * A single structured validation failure.
 *
 * Diagnostics are data, not formatted strings: map `code` to UI behavior,
 * `path` to the offending node (as JSON-pointer-like segments), and `message`
 * to a user-facing message. All diagnostics produced by this package have
 * `severity === "error"` in v0.1.
 *
 * `source` names the layer that rejected the input: `"wdf"` for the model and
 * validator, `"markdown"`, `"prosemirror"` or `"apple"` for an adapter.
 */
export interface Diagnostic {
  /** Layer that produced the failure: `wdf`, `markdown`, `prosemirror`, `apple`. */
  source: string;
  /** Stable machine-readable code, e.g. `wdf.unsupported_mark`. */
  code: string;
  /** Always `"error"` in v0.1. */
  severity: "error";
  /** JSON-pointer-like path to the offending value; may be empty. */
  path: DiagnosticPathSegment[];
  /** Human-readable explanation. */
  message: string;
}

/** One segment of a {@link Diagnostic.path}: an object key or an array index. */
export type DiagnosticPathSegment = string | number;

/** All failures for one input. */
export type Diagnostics = Diagnostic[];

/** Creates an error diagnostic with an optional path. */
export function diagnosticError(
  source: string,
  code: string,
  message: string,
  path: DiagnosticPathSegment[] = [],
): Diagnostic {
  return { source, code, severity: "error", path, message };
}
