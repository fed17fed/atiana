import { getText } from "@/lib/site-text";
import { loadHomeTestimonials } from "@/lib/testimonials-cache";

/** Home "What people say". Reviews come from the admin (database) with the code list as fallback. Demo ones keep their label. */
export async function HomeTestimonials() {
  const [list, title] = await Promise.all([loadHomeTestimonials(), getText("home.quotes.title")]);
  if (list.length === 0) return null; // the admin hid every review: show no empty heading
  return (
    <section className="sec" aria-labelledby="quotes-h">
      <div className="wrap">
        <h2 id="quotes-h" style={{ marginBottom: 28 }}>
          {title}
        </h2>
        <div className="quotes">
          {list.map((t) => (
            <figure className="quote" key={t.key}>
              <blockquote>“{t.quote}”</blockquote>
              <figcaption>
                <span className="who">{t.who}</span>
                {t.isDemo && <span className="tag-demo">Demo review</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
