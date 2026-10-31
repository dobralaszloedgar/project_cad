import { useId } from "react";

/** The flask mark shared by the landing page and application. */
export default function BrandMark({ size = 28 }: { size?: number }) {
  const mask = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="8 8 112 112"
      fill="currentColor"
      aria-hidden="true"
    >
      <defs>
        <mask
          id={mask}
          maskUnits="userSpaceOnUse"
          x="8"
          y="8"
          width="112"
          height="112"
          style={{ maskType: "luminance" }}
        >
          <rect x="8" y="8" width="112" height="112" fill="white" />
          <path
            d="M57 0H71V35.0192Q71 42.0192 79 47.0192A30 30 0 1 1 49 47.0192Q57 42.0192 57 35.0192Z"
            transform="translate(64 64) scale(.9) translate(-64 -64)"
            fill="black"
            stroke="black"
            strokeWidth="6"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <circle cx="64" cy="64" r="50" mask={`url(#${mask})`} />
      <path
        d="M38 73C53.6 63 74.4 83 90 73A26 26 0 0 1 38 73Z"
        transform="translate(64 64) scale(.9) translate(-64 -64)"
      />
    </svg>
  );
}
