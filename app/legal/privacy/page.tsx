import { LegalDocument, legalMetadata } from "@/components/pages/LegalDocument";

export const generateMetadata = () => legalMetadata("privacy");

export default function Page() {
  return <LegalDocument slug="privacy" />;
}
