"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";

export type FormProblem = { fieldId: string; message: string };

/** Wireframe A14: red summary, role="alert", takes focus when it appears, links to each wrong field. */
export function ErrorSummary({ problems, title }: { problems: FormProblem[]; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (problems.length > 0) ref.current?.focus();
  }, [problems]);
  if (problems.length === 0) return null;
  return (
    <div ref={ref} tabIndex={-1} className="alert a-error" role="alert">
      <Icon name="error" />
      <div>
        <b>{title ?? `${problems.length} problem${problems.length === 1 ? "" : "s"}`}</b>
        <ul className="adm-problems">
          {problems.map((p) => (
            <li key={p.fieldId}>
              <a href={`#${p.fieldId}`}>{p.message}</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
