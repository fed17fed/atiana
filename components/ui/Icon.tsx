const paths = {
  user: <><circle cx="16" cy="11" r="5" /><path d="M6 27c1-6 5-9 10-9s9 3 10 9" /></>,
  bag: <><path d="M7 10h18l1.5 16h-21z" /><path d="M12 13V9a4 4 0 0 1 8 0v4" /></>,
  menu: <path d="M6 10h20M6 16h20M6 22h20" />,
  close: <path d="M8 8l16 16M24 8L8 24" />,
  arrow: <path d="M6 16h20M18 8l8 8-8 8" />,
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
