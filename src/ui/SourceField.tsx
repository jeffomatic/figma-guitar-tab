import type { RefObject } from "react";

interface Props {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  /** Owned by App, so a diagnostic click can focus and select a range. */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function SourceField({ value, placeholder, onChange, textareaRef }: Props) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium text-neutral-700">ASCII tab</span>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        spellCheck={false}
        rows={10}
        placeholder={placeholder}
        className="resize-y rounded border border-neutral-300 p-2 font-mono text-xs leading-snug whitespace-pre focus:border-neutral-500 focus:outline-none"
      />
    </label>
  );
}
