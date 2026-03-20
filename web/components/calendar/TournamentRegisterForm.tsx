"use client";

import { useMemo, useState } from "react";

type Gender = "M" | "W";

export default function TournamentRegisterForm({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("M");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<
    | { type: "success"; text: string }
    | { type: "error"; text: string }
    | null
  >(null);

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && !loading;
  }, [name, loading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (name.trim().length < 2) {
      setMessage({ type: "error", text: "Введите имя и фамилию (минимум 2 символа)." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tournament-register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          tournamentId,
          name,
          gender,
          phone: phone.trim().length ? phone.trim() : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage({
          type: "error",
          text: data?.error || "Ошибка отправки заявки",
        });
        return;
      }

      const ok = data?.ok;
      if (ok) {
        setMessage({
          type: "success",
          text: data?.message || "Заявка отправлена! Ожидайте одобрения администратора.",
        });
        setName("");
        setPhone("");
        setGender("M");
      } else {
        setMessage({
          type: "error",
          text: data?.message || "Не удалось отправить заявку",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: "Ошибка соединения. Проверьте интернет и повторите попытку.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 rounded-xl border border-white/10 bg-surface-light/20 p-6 md:p-8"
    >
      <h2 className="font-heading text-3xl text-text-primary tracking-wide">
        Подача заявки
      </h2>

      <p className="mt-2 font-body text-text-secondary text-sm">
        Заявка уходит в очередь модерации. После одобрения игрок будет
        зарегистрирован в турнир.
      </p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-text-secondary text-xs font-body uppercase tracking-wide">
            Имя и фамилия
          </span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full rounded-lg bg-surface text-text-primary border border-white/10 px-4 py-3 outline-none focus:border-brand transition-colors font-body"
            placeholder="Напр. Иван Петров"
          />
        </label>

        <label className="block">
          <span className="text-text-secondary text-xs font-body uppercase tracking-wide">
            Телефон (опционально)
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-2 w-full rounded-lg bg-surface text-text-primary border border-white/10 px-4 py-3 outline-none focus:border-brand transition-colors font-body"
            placeholder="+7 ..."
          />
        </label>
      </div>

      <div className="mt-5">
        <div className="text-text-secondary text-xs font-body uppercase tracking-wide">
          Пол
        </div>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={() => setGender("M")}
            className={[
              "flex-1 rounded-lg border px-4 py-3 font-body transition-colors",
              gender === "M"
                ? "border-brand bg-brand/15 text-text-primary"
                : "border-white/10 bg-surface text-text-primary/90 hover:border-brand/60",
            ].join(" ")}
            aria-pressed={gender === "M"}
          >
            М
          </button>
          <button
            type="button"
            onClick={() => setGender("W")}
            className={[
              "flex-1 rounded-lg border px-4 py-3 font-body transition-colors",
              gender === "W"
                ? "border-brand bg-brand/15 text-text-primary"
                : "border-white/10 bg-surface text-text-primary/90 hover:border-brand/60",
            ].join(" ")}
            aria-pressed={gender === "W"}
          >
            Ж
          </button>
        </div>
      </div>

      <div className="mt-7 flex gap-3 flex-col sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={!canSubmit}
          className={[
            "inline-flex items-center justify-center px-7 py-3 rounded-lg font-body font-semibold transition-colors border",
            canSubmit
              ? "bg-brand text-white border-brand hover:bg-brand-light"
              : "bg-white/5 text-text-primary/50 border-white/10 cursor-not-allowed",
          ].join(" ")}
        >
          {loading ? "Отправка..." : "Отправить заявку"}
        </button>

        <p className="text-text-secondary text-xs font-body">
          Данные используются только для формирования заявки.
        </p>
      </div>

      {message ? (
        <div
          className={[
            "mt-6 rounded-lg border px-4 py-3 font-body text-sm",
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-200",
          ].join(" ")}
          role="status"
        >
          {message.text}
        </div>
      ) : null}
    </form>
  );
}

