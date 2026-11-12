import type { SessionLongText } from "@/content/session-texts";

/** The long text of a session: opening, what happens, what you need, how to join. Plain paragraphs and lists (no HTML from data). */
export function SessionText({ text, headingLevel = 3 }: { text: SessionLongText; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as "h2" | "h3";
  const style = headingLevel === 2 ? { fontSize: "1.3rem" } : { fontSize: "1.1rem" };
  return (
    <div className="session-text stack" style={{ gap: 12 }}>
      {text.opening.map((p) => (
        <p key={p} style={{ margin: 0 }}>
          {p}
        </p>
      ))}
      <H style={style}>What happens during the session</H>
      {text.happens.map((p) => (
        <p key={p} style={{ margin: 0 }}>
          {p}
        </p>
      ))}
      <H style={style}>What you need</H>
      <ul style={{ display: "grid", gap: 6, listStyle: "disc", paddingLeft: "1.3em", margin: 0 }}>
        {text.needs.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <H style={style}>How to join</H>
      <ul style={{ display: "grid", gap: 6, listStyle: "disc", paddingLeft: "1.3em", margin: 0 }}>
        {text.join.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
