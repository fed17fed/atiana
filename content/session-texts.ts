/**
 * Texts of the real sessions (Phase 11, tasks 11.1/11.7/11.8). Source: docs/real-sessions-content.md (designer draft,
 * owner said "use them" on 2026-11-12). Tatiana's words with the small fixes from that file.
 * No Zoom link, no email and no clock times in the texts: times come from the schedule on the page.
 * The rule numbers (join early, ...) come from lib/booking-rules.ts.
 */
import { JOIN_EARLY_MINUTES } from "@/lib/booking-rules";

export type SessionLongText = {
  /** Paragraphs of the opening text */
  opening: string[];
  /** "What happens during the session" lines */
  happens: string[];
  /** "What you need" list */
  needs: string[];
  /** "How to join" list */
  join: string[];
};

const ENERGY_PARAGRAPHS = [
  "When Kundalini Energy is activated, it flows in through the crown chakra, down your spine and up again.",
  "This experience can be blissful and filled with feelings of love and a sense of the interconnectedness of all things.",
  "Kundalini energy holds a wide range of frequencies. People describe an expanded state of consciousness, non-dual awareness and spiritual growth, a connection to their source and higher self, and a release of energetic blocks.",
  "These are just some of the experiences people describe, and they are different for each person.",
  "Some people feel the experience become deeper when they come back often.",
  "KEA is not medical treatment and does not promise any result. Please read our Health Notice before you book.",
];

type Options = {
  /** Minutes the client should keep free ("Allow N minutes of undisturbed time") */
  allowMinutes: number;
  /** Text for the mat line, e.g. "60 minutes" */
  matFor: string;
  /** Paragraphs before the shared energy paragraphs. Empty = none. */
  lead?: string[];
  /** Replace the shared energy paragraphs (Lunar Eclipse has its own opening) */
  ownOpening?: string[];
  /** "start" = the door closes at the start time; "activation" = it closes when the main activation starts */
  doorsClose?: "start" | "activation";
};

export function buildLongText(o: Options): SessionLongText {
  const doorsClose = o.doorsClose ?? "start";
  return {
    opening: o.ownOpening ?? [...(o.lead ?? []), ...ENERGY_PARAGRAPHS],
    happens: [
      "You lie down on a yoga mat in the comfort of your home.",
      `Allow ${o.allowMinutes} minutes of undisturbed time.`,
      "You need to ensure a good Internet connection, as the session is on Zoom.",
      "Place your camera so that I can see your body from the top of your head to your toes. Use good sound from your device, as loud music will be played.",
      "Please have light stomach conditions (2 hours after lunch or 30 minutes after a snack).",
      "While music is played I will concentrate on each individual and transmit energy into your field. I will hold the space for you when your Kundalini energy is activated and worked in your body.",
      "I will point at different chakras or meridian points on your body.",
      "Allow whatever arises to be experienced and expressed. Experiences can vary from person to person and from session to session. You may feel the energy for the next couple of days.",
    ],
    needs: [
      "Download the Zoom app and make an account if you don't have one.",
      "You will listen to music on Zoom. Be ready to listen with wireless headphones, or connect to a speaker for good sound.",
      `A yoga mat or comfy rug to lie on for ${o.matFor}.`,
      "Camera on. Make sure you are lying down so that your full body is visible on the screen from the side.",
      "A light stomach: 2 hours after lunch or 30 minutes after a snack.",
    ],
    join: [
      "You get the Zoom link by email after you book. It is also in My bookings.",
      doorsClose === "start"
        ? `Please join ${JOIN_EARLY_MINUTES} minutes before the start. Doors close at the start time, and we cannot let you in later. No refund or credit for a missed session.`
        : `Please join ${JOIN_EARLY_MINUTES} minutes before the start. Doors close when the main activation starts. The page shows the start time (greeting) and the activation time. No refund or credit for a missed session.`,
      "Sessions are not recorded.",
    ],
  };
}

/** Plain text version (used for the database body and search). Paragraphs are separated by a blank line. */
export function longTextToMarkdown(t: SessionLongText): string {
  return [
    ...t.opening,
    "## What happens during the session",
    t.happens.join("\n\n"),
    "## What you need",
    t.needs.map((x) => `- ${x}`).join("\n"),
    "## How to join",
    t.join.map((x) => `- ${x}`).join("\n"),
  ].join("\n\n");
}

export const TEXT_KEA = buildLongText({ allowMinutes: 60, matFor: "60 minutes" });

export const TEXT_BLITZ = buildLongText({
  allowMinutes: 30,
  matFor: "30 minutes",
  lead: [
    `This session is designed for busy souls to get 30 minutes of energy transmission. Please join the session ${JOIN_EARLY_MINUTES} minutes before, as the Kundalini energy activation starts at the start time and I won't be able to admit you once it has started.`,
  ],
});

export const TEXT_GRATITUDE = buildLongText({
  allowMinutes: 30,
  matFor: "30 minutes",
  lead: [
    `This session is designed for busy souls to get 30 minutes of energy transmission. Please join the session ${JOIN_EARLY_MINUTES} minutes before, as the Kundalini energy activation starts at the start time shown on this page, sharp, and I won't be able to admit you once it has started.`,
  ],
});

export const TEXT_DIVE_DEEP = buildLongText({
  allowMinutes: 90,
  matFor: "90 minutes",
  doorsClose: "activation",
  lead: [
    `This special session is designed to give you 90 minutes of energy transmission. The first 30 minutes are an introduction and greeting, which you can skip if you want. Please join the session no later than ${JOIN_EARLY_MINUTES} minutes before the activation starts, as the Kundalini energy activation starts at the activation time shown on this page, sharp, and I won't be able to admit you once it has started.`,
  ],
});

export const TEXT_NEW_MOON = buildLongText({ allowMinutes: 60, matFor: "60 minutes" });

export const TEXT_FULL_MOON = buildLongText({
  allowMinutes: 30,
  matFor: "30 minutes",
  lead: ["This is a 30-minute energy transmission."],
});

export const TEXT_LUNAR_ECLIPSE = buildLongText({
  allowMinutes: 60,
  matFor: "60 minutes",
  ownOpening: [
    "Don't miss this opportunity to cleanse your emotional waters and to set the intention for renewal and rejuvenation – Lunar Eclipse – with the magic of Kundalini Energy Activation online session. You may feel the extended effect of the energetic cycles of this Lunar Eclipse over the next three months. This day is very unique because you may be more receptive to the energies, which can enhance the spiritual awareness in your physical and emotional body. I will activate the Kundalini energy and will hold the space for you for the duration of 60 minutes, giving the time to unveil the deepest hidden places in your soul.",
    ...ENERGY_PARAGRAPHS,
  ],
});

export const TEXT_WINTER_SOLSTICE = buildLongText({
  allowMinutes: 75,
  matFor: "75 minutes (or 60 minutes if you skip the greeting)",
  doorsClose: "activation",
  lead: [
    `This special Winter Solstice session is designed to give you 60 minutes of energy transmission. The first 15 minutes are an introduction and greeting, which you can skip if you want. Please join the session no later than ${JOIN_EARLY_MINUTES} minutes before the activation starts, as the Kundalini energy activation starts at the activation time shown on this page, sharp, and I won't be able to admit you once it has started.`,
  ],
});
