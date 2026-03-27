import type { Metadata } from "next";
import { KotcLiveHubFlow } from "@/components/kotc-live/hub/KotcLiveHubFlow";

export const metadata: Metadata = {
  title: "KOTC Live Hub | Лютые Пляжники",
  description: "Аварийная панель управления сессиями King of the Court.",
};

export default function KotcLiveAdminPage() {
  return (
    <div className="min-h-screen bg-background text-text-primary">
      <KotcLiveHubFlow />
    </div>
  );
}
