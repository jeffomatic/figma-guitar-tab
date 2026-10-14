import { useId, type RefObject } from "react";

interface Props {
  value: string;
  placeholder: string;
  /** This mode's section of the examples doc. */
  examplesUrl: string;
  onChange: (value: string) => void;
  /** Owned by App, so a diagnostic click can focus and select a range. */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function SourceField({ value, placeholder, examplesUrl, onChange, textareaRef }: Props) {
  const id = useId();

  // Not a wrapping <label>: a link inside one would also focus the textarea.
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="font-medium text-neutral-700">
          ASCII tab
        </label>
        <a
          href={examplesUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-blue-600 hover:underline"
        >
          examples
        </a>
      </div>
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        spellCheck={false}
        rows={6}
        placeholder={placeholder}
        className="resize-y rounded-md bg-white p-2 font-mono text-xs leading-snug whitespace-pre shadow-xs ring-1 ring-neutral-300 transition-shadow ring-inset outline-none hover:ring-neutral-400 focus:ring-2 focus:ring-neutral-900"
      />
    </div>
  );
}
