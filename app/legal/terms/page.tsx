import { LegalDocument, legalMetadata } from "@/components/pages/LegalDocument";

export const generateMetadata = () => legalMetadata("terms");

export default function Page() {
  return <LegalDocument slug="terms" />;
}
