const paths = {
  user: <><circle cx="16" cy="11" r="5" /><path d="M6 27c1-6 5-9 10-9s9 3 10 9" /></>,
  bag: <><path d="M7 10h18l1.5 16h-21z" /><path d="M12 13V9a4 4 0 0 1 8 0v4" /></>,
  menu: <path d="M6 10h20M6 16h20M6 22h20" />,
  close: <path d="M8 8l16 16M24 8L8 24" />,
  arrow: <path d="M6 16h20M18 8l8 8-8 8" />,
  video: <><rect x="4" y="8" width="17" height="16" rx="4" /><path d="M21 14l7-4v12l-7-4" /></>,
  leaf: <path d="M6 26C6 13 14 6 27 6c0 13-7 21-20 21M6 26l10-10" />,
  check: <path d="M7 17l6 6 12-13" />,
  clock: <><circle cx="16" cy="16" r="11" /><path d="M16 9v7l4 3" /></>,
  warn: <><path d="M16 5l12 21H4z" /><path d="M16 13v6M16 22.5v.5" /></>,
  error: <><circle cx="16" cy="16" r="11" /><path d="M11.5 11.5l9 9M20.5 11.5l-9 9" /></>,
  info: <><circle cx="16" cy="16" r="11" /><path d="M16 15v7M16 10.5v.5" /></>,
  pin: <><path d="M16 28s9-7.5 9-14a9 9 0 0 0-18 0c0 6.5 9 14 9 14z" /><circle cx="16" cy="14" r="3" /></>,
  gift: <><rect x="5" y="12" width="22" height="14" rx="3" /><path d="M16 12v14M4 12h24" /></>,
} as const;

export type IconName = keyof typeof paths;

/** Decorative line icon (always hidden from screen readers; put the label on the parent). */
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={`size-6 flex-none fill-none stroke-current stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round] ${className}`}
    >
      {paths[name]}
    </svg>
  );
}
