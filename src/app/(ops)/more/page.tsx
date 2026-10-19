import Link from "next/link";
import { PageHeader } from "@/components/ui";

const LINKS = [
  ["/usage", "Record usage"],
  ["/transfers", "Transfers"],
  ["/waste", "Waste"],
  ["/opening", "Opening stock"],
  ["/recipes", "Recipes and sales"],
  ["/sales", "Sales import"],
  ["/reports", "Reports"],
  ["/replenishment", "What to buy or move"],
  ["/purchase-orders", "Purchase orders"],
  ["/settings", "Settings"],
  ["/onboarding", "Setup checklist"],
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="More" />
      <ul className="card divide-y divide-line">
        {LINKS.map(([href, label]) => (
          <li key={href}><Link className="flex min-h-12 items-center px-3" href={href}>{label}</Link></li>
        ))}
      </ul>
    </>
  );
}
