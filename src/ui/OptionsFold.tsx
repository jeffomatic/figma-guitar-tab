import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * The settings, folded away by default. A native `<details>`, so the open state
 * survives a tab switch without App tracking it, and the window resizes to
 * follow it like any other change in the form's height.
 */
export function OptionsFold({ children }: Props) {
  return (
    <details className="group flex flex-col">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 font-medium text-neutral-700 select-none hover:text-neutral-900 [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="size-3 transition-transform group-open:rotate-90"
        >
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Options
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
