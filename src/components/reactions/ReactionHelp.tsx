import type { ReactNode } from "react";

export function EngineeringHelp({
  text,
  children,
  more,
}: {
  text?: string;
  children?: ReactNode;
  more?: ReactNode;
}) {
  return (
    <div className="equipment-help">
      {text ?? children}
      {more && (
        <details>
          <summary>Details</summary>
          {more}
        </details>
      )}
    </div>
  );
}
