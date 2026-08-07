"use client";

import { useState } from "react";

export default function LogoutButton({
  redirectTo = "/profile",
  className = "btn-action-outline",
  scope = "player",
}: {
  redirectTo?: string;
  className?: string;
  scope?: "player" | "admin";
}) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch(scope === "admin" ? "/api/admin/auth" : "/api/auth/logout", {
        method: scope === "admin" ? "DELETE" : "POST",
      });
    } catch {
      // noop: redirect anyway to clear UI state on client
    } finally {
      window.location.href = redirectTo;
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={loading} className={className}>
      {loading ? "Выход..." : "Выйти"}
    </button>
  );
}
