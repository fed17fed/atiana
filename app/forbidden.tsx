import Link from "next/link";

export default function Forbidden() {
  return (
    <section className="sec">
      <div className="narrow" style={{ maxWidth: 560 }}>
        <p className="eyebrow">Error 403</p>
        <h1>You do not have access</h1>
        <p className="lead">This area is only for the KEA team. If you think this is a mistake, please write to us.</p>
        <Link className="btn btn-primary" href="/">
          Back to home
        </Link>
      </div>
    </section>
  );
}
