import { LegalDocument, legalMetadata } from "@/components/pages/LegalDocument";

export const generateMetadata = () => legalMetadata("health-disclaimer");

export default function Page() {
  return <LegalDocument slug="health-disclaimer" />;
}
