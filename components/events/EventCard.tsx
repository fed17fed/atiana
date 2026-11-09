import Image from "next/image";
import Link from "next/link";
import { LocalRange } from "@/components/booking/LocalTime";
import { Icon } from "@/components/ui/Icon";
import { eventModeLabel, eventTypeLabel, priceLine } from "@/content/events";
import { spotsLabel } from "@/lib/booking-rules";
import type { EventPricing, Mode } from "@/lib/generated/prisma/enums";

export type EventCardData = {
  slug: string;
  title: string;
  summary: string;
  pricing: EventPricing;
  mode: Mode;
  startsAt: string;
  endsAt: string;
  lengthLabel: string;
  location: string | null;
  image: string;
  imageAlt: string;
  priceCents: number | null;
  /** null = unknown (database not ready) */
  spotsLeft: number | null;
};

export function EventCard({ e }: { e: EventCardData }) {
  const full = e.spotsLeft !== null && e.spotsLeft <= 0;
  return (
    <article className="card">
      <div className="media">
        <Image src={e.image} alt={e.imageAlt} width={800} height={600} sizes="(min-width: 900px) 380px, 90vw" />
        <span className="badge badge-over b-free">{eventTypeLabel[e.pricing]}</span>
      </div>
      <div className="body">
        <div className="row-wrap" style={{ gap: 8 }}>
          <span className={`badge ${e.mode === "ONLINE" ? "b-online" : "b-person"}`}>{eventModeLabel[e.mode]}</span>
          {e.spotsLeft !== null && (
            <span className={`badge ${full ? "b-sold" : e.spotsLeft <= 3 ? "b-low" : "b-spots"}`}>
              {full ? "Sold out" : spotsLabel(e.spotsLeft)}
            </span>
          )}
        </div>
        <h2 style={{ fontSize: "1.4rem", margin: 0 }}>
          <Link href={`/events/${e.slug}`} className="stretched">
            {e.title}
          </Link>
        </h2>
        <p>
          <LocalRange startIso={e.startsAt} endIso={e.endsAt} />
          <br />
          {e.lengthLabel}
          {e.location && (
            <>
              <br />
              <Icon name="pin" className="size-4! inline-block align-text-bottom" /> {e.location}
            </>
          )}
        </p>
        <p>{e.summary}</p>
        <div className="foot">
          <span className="price" style={{ fontSize: "1.15rem" }}>
            {priceLine(e)}
          </span>
          <span className="link-arrow" aria-hidden="true">
            See details <Icon name="arrow" className="ic" />
          </span>
        </div>
      </div>
    </article>
  );
}
