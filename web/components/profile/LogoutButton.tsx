"use client";

import { useState } from "react";

export default function LogoutButton({
  redirectTo = "/profile",
  className = "btn-action-outline",
}: {
  redirectTo?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
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

