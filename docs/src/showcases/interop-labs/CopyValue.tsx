import { useEffect, useRef, useState } from "react";

import { Icon } from "../../components/Icon.js";

const COPIED_FEEDBACK_MS = 1600;

/**
 * A value set in the code face with a button that copies it, such as a SHA-256
 * digest. `shown` is what fits the row; the full value is what is copied.
 */
export function CopyValue({
  value,
  label,
  shown = value,
  testId,
}: Readonly<{ value: string; label: string; shown?: string; testId?: string }>) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    });
  };

  return (
    <span className="sw-si-copy">
      <code data-testid={testId} title={shown === value ? undefined : value}>
        {shown}
      </code>
      <button
        aria-label={`Copy ${label}`}
        className="sw-si-copy__button"
        onClick={copy}
        type="button"
      >
        <Icon name={copied ? "check" : "copy"} size="sm" />
      </button>
      <span aria-live="polite" className="sw-si-copy__status">
        {copied ? "Copied" : ""}
      </span>
    </span>
  );
}
