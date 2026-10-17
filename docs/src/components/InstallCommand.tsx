import { useState } from "react";

import { ActionError, pendingProps, useAction } from "../lib/use-action.js";

/** Click-to-copy install command; shared by the landing and showcase pages. */
export function InstallCommand({ packageName }: Readonly<{ packageName: string }>) {
  const [copied, setCopied] = useState(false);
  const action = useAction();
  const command = `npm install ${packageName}`;
  const feedback = action.pending ? "Copying…" : copied ? "Copied" : "Copy";

  return (
    <>
      <button
        className="sw-install-command"
        {...pendingProps(action.pending)}
        onClick={() =>
          void action.run(
            async () => {
              await navigator.clipboard.writeText(command);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            },
            () => "Cannot copy the command. Allow clipboard access and try again.",
          )
        }
        type="button"
      >
        <span aria-hidden="true">$</span>
        <code>{command}</code>
        <strong aria-live="polite">{feedback}</strong>
        <span className="sw-visually-hidden"> install command</span>
      </button>
      <ActionError error={action.error} />
    </>
  );
}
