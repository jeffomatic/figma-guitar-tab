import type { ParseError } from "../core/diagnostics";

interface Props {
  diagnostics: ParseError[];
  /** Called only for a diagnostic that points somewhere in the source. */
  onSelect: (error: ParseError) => void;
}

export function DiagnosticList({ diagnostics, onSelect }: Props) {
  if (diagnostics.length === 0) return null;

  // Errors first: they are what blocks a render.
  const ordered = [...diagnostics].sort(
    (a, b) => Number(b.severity === "error") - Number(a.severity === "error"),
  );

  return (
    <ul className="flex flex-col gap-1">
      {ordered.map((error, index) => {
        const anchored = error.line !== undefined;
        const isError = error.severity === "error";

        return (
          <li key={`${error.code}-${String(index)}`}>
            <button
              type="button"
              disabled={!anchored}
              onClick={() => {
                onSelect(error);
              }}
              className={`w-full rounded px-2 py-1 text-left text-xs ${
                isError ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"
              } ${anchored ? "hover:brightness-95" : "cursor-default"}`}
            >
              {/* Line numbers are 0-based in the code and 1-based for people. */}
              {anchored && (
                <span className="mr-2 tabular-nums opacity-60">
                  Line {String((error.line ?? 0) + 1)}
                </span>
              )}
              {error.message}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
