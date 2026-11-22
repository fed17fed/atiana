import Markdown from "react-markdown";

/**
 * The long text of a class, 1:1 or event (markdown). Used on the public pages and in the admin preview.
 * react-markdown writes no raw HTML (a typed <script> stays plain text) and removes javascript: links,
 * so a text from the database cannot run code. Headings are moved down: the page already has its own h1/h2.
 * Same look as the former SessionText: plain paragraphs and bullet lists.
 */
export function OfferingBody({ markdown, headingLevel = 3 }: { markdown: string; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as "h2" | "h3";
  const style = headingLevel === 2 ? { fontSize: "1.3rem" } : { fontSize: "1.1rem" };
  return (
    <div className="session-text stack" style={{ gap: 12 }}>
      <Markdown
        components={{
          h1: ({ children }) => <H style={style}>{children}</H>,
          h2: ({ children }) => <H style={style}>{children}</H>,
          h3: ({ children }) => <H style={style}>{children}</H>,
          p: ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
          ul: ({ children }) => <ul style={{ display: "grid", gap: 6, listStyle: "disc", paddingLeft: "1.3em", margin: 0 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ display: "grid", gap: 6, listStyle: "decimal", paddingLeft: "1.3em", margin: 0 }}>{children}</ol>,
          img: () => null, // no pictures inside a text (no tracking images from other sites)
          a: ({ href, children }) => (
            <a href={href} {...(href && /^https?:/i.test(href) ? { rel: "noopener noreferrer" } : {})}>
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
