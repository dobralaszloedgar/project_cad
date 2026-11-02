/** A conventional desktop arrow for playback; the native cursor stays untouched. */
export default function DemoPointer({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 20 28"
      aria-hidden="true"
    >
      <path
        d="M1 1V22L6.3 16.8L10.4 26L14.2 24.3L10.1 15.4H17.5Z"
        fill="#fff"
        stroke="#1a211e"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}
