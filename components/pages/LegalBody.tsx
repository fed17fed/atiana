import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * The Markdown of a legal text, exactly as the public legal pages show it. Used by LegalDocument (public) AND by the legal editor preview (admin),
 * so the preview is the same as the page. react-markdown shows no raw HTML and cleans link addresses.
 */
export function LegalBody({ body }: { body: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => (
          <div className="table-wrap" tabIndex={0}>
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {body}
    </Markdown>
  );
}
