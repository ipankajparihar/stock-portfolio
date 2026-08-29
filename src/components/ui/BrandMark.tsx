/**
 * The app's mark, inlined.
 *
 * Deliberately inline SVG rather than `<img src="/icon.svg">`: this renders in the header of every
 * page, so an inline mark costs no request and paints with the rest of the header instead of
 * popping in a beat later.
 *
 * KEEP IN SYNC with `src/app/icon.svg` (the favicon). They are necessarily separate — Next's icon
 * file convention needs a real static file — so a change to one belongs in the other.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="brandMarkTile" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>

      <rect width="32" height="32" rx="7.5" fill="url(#brandMarkTile)" />

      <path
        d="M6.25 21.75 L12.75 14.75 L17.75 18.25 L25.75 9.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
