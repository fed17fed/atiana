import { LegalDocument, legalMetadata } from "@/components/pages/LegalDocument";

export const generateMetadata = () => legalMetadata("cookies");

export default function Page() {
  return <LegalDocument slug="cookies" />;
}
