import type { Metadata } from "next";
import ResetPasswordForm from "@/components/profile/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Новый пароль | Лютые Пляжники",
  description: "Установите новый пароль для аккаунта LPVOLLEY.RU.",
};

interface ResetPasswordPageProps {
  searchParams?: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = (await searchParams) ?? {};
  const token = String(params.token || "").trim();

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <ResetPasswordForm token={token} />
    </main>
  );
}
