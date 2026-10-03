// The only place the raw postMessage APIs appear.

import { asSandboxMessage, type SandboxMessage, type UiMessage } from "../core/protocol";

export function post(message: UiMessage): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

/** Returns an unsubscribe function, for an effect's cleanup. */
export function subscribe(handler: (message: SandboxMessage) => void): () => void {
  const listener = (event: MessageEvent): void => {
    const data: unknown = event.data;
    const envelope =
      typeof data === "object" && data !== null ? (data as { pluginMessage?: unknown }) : null;
    const message = asSandboxMessage(envelope?.pluginMessage);
    if (message) handler(message);
  };

  window.addEventListener("message", listener);
  return () => {
    window.removeEventListener("message", listener);
  };
}
