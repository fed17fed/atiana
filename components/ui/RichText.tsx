import type { ReactNode } from "react";
import Link from "next/link";
import { parseInline } from "@/lib/inline-text";

/** Renders one line / paragraph of editable text. Use inside your own <p>, <h1> ... */
export function RichText({ text }: { text: string }): ReactNode {
  return parseInline(text).map((p, i) => {
    if (p.type === "text") return p.value;
    if (p.type === "em") return <em key={i}>{p.value}</em>;
    if (p.href.startsWith("/")) {
      return (
        <Link key={i} href={p.href}>
          {p.label}
        </Link>
      );
    }
    return (
      <a key={i} href={p.href} rel="noopener noreferrer">
        {p.label}
      </a>
    );
  });
}
