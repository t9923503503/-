import type { Metadata } from "next";
import { KotcLiveHubFlow } from "@/components/kotc-live/hub/KotcLiveHubFlow";

export const metadata: Metadata = {
  title: "KOTC Live Hub | Лютые Пляжники",
  description: "Аварийная панель управления сессиями King of the Court.",
};

export default function KotcLiveAdminPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_18%),radial-gradient(circle_at_top_right,rgba(6,182,212,0.12),transparent_18%),linear-gradient(180deg,#050914,#09101d)] text-text-primary">
      <KotcLiveHubFlow />
    </div>
  );
}
