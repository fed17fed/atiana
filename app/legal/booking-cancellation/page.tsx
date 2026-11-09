import { LegalDocument, legalMetadata } from "@/components/pages/LegalDocument";

export const generateMetadata = () => legalMetadata("booking-cancellation");

export default function Page() {
  return <LegalDocument slug="booking-cancellation" />;
}
