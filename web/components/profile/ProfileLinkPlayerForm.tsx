// @ts-nocheck — recovered verbatim from production build X6ckiqIYGHO_dkvUdX54y.
/* eslint-disable */
'use client';

import * as a from 'react/jsx-runtime';
import * as i from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { METRIKA_GOALS, reachMetrikaGoal } from '@/lib/metrika-goals';

const n = () => Link;
const s = { useRouter };
const o = { l7: METRIKA_GOALS, sv: reachMetrikaGoal };

let c =
    "inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2 font-body text-sm text-text-primary transition hover:border-brand/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60",
  d =
    "inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2 font-body text-sm font-semibold text-black transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-60";
function x(e) {
  return "/players/".concat(e);
}
function p(e, t) {
  return !!(
    (null == e ? void 0 : e.id) &&
    (null == t ? void 0 : t.id) &&
    e.id === t.id
  );
}
function m(e) {
  var t, r, l;
  let {
      targetPlayerId: m,
      targetPlayerName: u,
      loginHref: f = "/login?returnTo=%2Fprofile",
      className: b = "",
      embedded: h = !1,
      compact: v = !1,
    } = e,
    g = (0, s.useRouter)(),
    [j, y] = (0, i.useState)(null),
    [N, k] = (0, i.useState)(""),
    [w, T] = (0, i.useState)(!0),
    [C, S] = (0, i.useState)(!1),
    [R, P] = (0, i.useState)(!1),
    [_, I] = (0, i.useState)(""),
    [M, W] = (0, i.useState)(""),
    [K, A] = (0, i.useState)(!1),
    O = (0, i.useRef)(!1),
    F = (0, i.useCallback)(async function () {
      let e =
          arguments.length > 0 && void 0 !== arguments[0]
            ? arguments[0]
            : "",
        t = e
          ? "/api/auth/player-link?q=".concat(encodeURIComponent(e))
          : "/api/auth/player-link",
        r = await fetch(t, { cache: "no-store" }),
        a = await r.json().catch(() => null);
      if (401 === r.status) return A(!0), y(null), null;
      if (!r.ok)
        throw Error(
          (null == a ? void 0 : a.error) ||
            "Не удалось получить состояние привязки",
        );
      return A(!1), y(a), a;
    }, []);
  (0, i.useEffect)(() => {
    let e = !0;
    return (
      (async () => {
        try {
          T(!0);
          let t = await F();
          if (!e || !t) return;
          if (!O.current && !t.linked_player && t.full_name) {
            (O.current = !0), k(t.full_name), S(!0);
            try {
              await F(t.full_name);
            } finally {
              e && S(!1);
            }
          }
        } catch (t) {
          if (!e) return;
          I(t instanceof Error ? t.message : "Ошибка загрузки");
        } finally {
          e && T(!1);
        }
      })(),
      () => {
        e = !1;
      }
    );
  }, [F]);
  let E = (0, i.useCallback)(
      async (e) => {
        let t = String(null != e ? e : N).trim();
        if (t.length < 2)
          return void I("Введите минимум 2 символа для поиска.");
        try {
          S(!0), I("");
          let e = await F(t);
          e &&
            (k(t),
            0 === e.search_results.length
              ? W("По этому запросу карточки игрока не найдены.")
              : W(""));
        } catch (e) {
          I(e instanceof Error ? e.message : "Ошибка поиска");
        } finally {
          S(!1);
        }
      },
      [F, N],
    ),
    U = (0, i.useCallback)(
      async (e) => {
        e.preventDefault(), await E();
      },
      [E],
    ),
    H = (0, i.useCallback)(
      async (e) => {
        try {
          P(!0), I(""), W("");
          let t = await fetch("/api/auth/player-link", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ playerId: e }),
            }),
            r = await t.json().catch(() => null);
          if (!t.ok)
            throw Error(
              (null == r ? void 0 : r.error) ||
                "Не удалось привязать карточку",
            );
          y(r),
            W(
              (null == r ? void 0 : r.message) ||
                "Карточка игрока привязана.",
            ),
            (0, o.sv)(o.l7.playerLinked),
            g.refresh();
        } catch (e) {
          I(e instanceof Error ? e.message : "Ошибка привязки");
        } finally {
          P(!1);
        }
      },
      [g],
    ),
    L = (0, i.useCallback)(async () => {
      try {
        P(!0), I(""), W("");
        let e = await fetch("/api/auth/player-link", {
            method: "DELETE",
          }),
          t = await e.json().catch(() => null);
        if (!e.ok)
          throw Error(
            (null == t ? void 0 : t.error) || "Не удалось снять привязку",
          );
        y(t),
          W((null == t ? void 0 : t.message) || "Привязка снята."),
          g.refresh();
      } catch (e) {
        I(e instanceof Error ? e.message : "Ошибка снятия привязки");
      } finally {
        P(!1);
      }
    }, [g]),
    D = null != (r = null == j ? void 0 : j.linked_player) ? r : null,
    z = null != (l = null == j ? void 0 : j.resolved_player) ? l : null,
    B = (0, i.useMemo)(
      () => (m ? { id: m, name: u || "Эта карточка игрока" } : null),
      [m, u],
    ),
    Q = Boolean(null == j ? void 0 : j.link_requires_moderation),
    Y = String((null == j ? void 0 : j.telegram_bot) || "Lpvolley_bot").replace(/^@/, ""),
    Z = h
      ? ["space-y-4", b].join(" ").trim()
      : [
          "rounded-xl border border-white/10 bg-surface-light/20 p-4 space-y-4",
          b,
        ]
          .join(" ")
          .trim();
  return w
    ? v
      ? null
      : (0, a.jsx)("section", {
          className: Z,
          children: (0, a.jsx)("p", {
            className: "font-body text-sm text-text-secondary",
            children: "Загрузка блока привязки...",
          }),
        })
    : K
      ? v
        ? (0, a.jsx)(n(), {
            href: f,
            className:
              "inline-flex min-h-9 items-center justify-center rounded-full border border-[var(--profile-border)] bg-[var(--profile-card)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--profile-muted-strong)] transition hover:border-[var(--profile-accent)] hover:text-[var(--profile-text)]",
            children: "Это вы? Привязать",
          })
        : (0, a.jsxs)("section", {
            className: Z,
            children: [
              h
                ? (0, a.jsx)("p", {
                    className: "font-body text-sm text-text-secondary",
                    children:
                      "Чтобы привязать карточку к своему аккаунту, сначала войдите в личный кабинет.",
                  })
                : (0, a.jsxs)("div", {
                    children: [
                      (0, a.jsx)("h3", {
                        className:
                          "font-heading text-2xl text-text-primary tracking-wide",
                        children: "Привязка к карточке игрока",
                      }),
                      (0, a.jsx)("p", {
                        className:
                          "mt-2 font-body text-sm text-text-secondary",
                        children:
                          "Чтобы привязать эту карточку к своему аккаунту, сначала войдите в личный кабинет.",
                      }),
                    ],
                  }),
              (0, a.jsx)(n(), {
                href: f,
                className: "btn-action-outline inline-flex",
                children: "Войти и привязать",
              }),
            ],
          })
      : Q && !D
        ? v
          ? (0, a.jsx)("a", {
              href: "https://t.me/".concat(Y),
              target: "_blank",
              rel: "noreferrer",
              className:
                "inline-flex min-h-9 items-center justify-center rounded-full bg-[#2AABEE] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#229ED9]",
              children: "Подтвердить в Telegram",
            })
          : (0, a.jsxs)("section", {
              className: Z,
              children: [
                (0, a.jsx)("p", {
                  className: "font-body text-sm text-text-secondary",
                  children:
                    "Карточку Telegram-аккаунта подтверждает организатор — так никто не сможет присвоить чужую статистику.",
                }),
                (0, a.jsx)("a", {
                  href: "https://t.me/".concat(Y),
                  target: "_blank",
                  rel: "noreferrer",
                  className:
                    "inline-flex items-center justify-center rounded-xl bg-[#2AABEE] px-4 py-2 font-body text-sm font-semibold text-white transition hover:bg-[#229ED9]",
                  children: "Открыть бота и привязать карточку",
                }),
                (0, a.jsxs)("p", {
                  className: "font-body text-xs text-text-secondary",
                  children: ["В боте нажмите «Привязать карточку» или отправьте ", (0, a.jsx)("code", { children: "/register" }), "."],
                }),
              ],
            })
        : v
        ? B
          ? p(D, B)
            ? (0, a.jsx)("span", {
                className:
                  "inline-flex min-h-9 items-center rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-300",
                children: "Ваш профиль",
              })
            : (0, a.jsx)("button", {
                type: "button",
                className:
                  "inline-flex min-h-9 items-center justify-center rounded-full border border-[var(--profile-border)] bg-[var(--profile-card)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--profile-muted-strong)] transition hover:border-[var(--profile-accent)] hover:text-[var(--profile-text)] disabled:cursor-not-allowed disabled:opacity-60",
                onClick: () => H(B.id),
                disabled: R,
                "aria-label": "Привязать карточку игрока ".concat(
                  B.name,
                  " к своему аккаунту",
                ),
                children: R ? "Привязываю..." : "Это вы? Привязать",
              })
          : null
        : (0, a.jsxs)("section", {
            className: Z,
            children: [
              h
                ? (0, a.jsx)("p", {
                    className: "font-body text-sm text-text-secondary",
                    children:
                      "Закрепите свой аккаунт за карточкой игрока, чтобы профиль, статистика и фото открывались автоматически.",
                  })
                : (0, a.jsxs)("div", {
                    children: [
                      (0, a.jsx)("h3", {
                        className:
                          "font-heading text-2xl text-text-primary tracking-wide",
                        children: "Привязка к карточке игрока",
                      }),
                      (0, a.jsx)("p", {
                        className:
                          "mt-1 font-body text-sm text-text-secondary",
                        children:
                          "Закрепите свой аккаунт за карточкой игрока, чтобы профиль, статистика и фото открывались автоматически.",
                      }),
                    ],
                  }),
              _
                ? (0, a.jsx)("div", {
                    className:
                      "rounded-xl border border-red-400/35 bg-red-500/10 p-3 font-body text-sm text-red-100",
                    children: _,
                  })
                : null,
              M
                ? (0, a.jsx)("div", {
                    className:
                      "rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-3 font-body text-sm text-emerald-100",
                    children: M,
                  })
                : null,
              D
                ? (0, a.jsxs)("div", {
                    className:
                      "rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-4",
                    children: [
                      (0, a.jsx)("p", {
                        className:
                          "font-body text-xs uppercase tracking-[0.2em] text-emerald-200/90",
                        children: "Активная привязка",
                      }),
                      (0, a.jsxs)("div", {
                        className:
                          "mt-2 flex flex-wrap items-center justify-between gap-3",
                        children: [
                          (0, a.jsxs)("div", {
                            children: [
                              (0, a.jsx)("p", {
                                className:
                                  "font-heading text-xl text-text-primary",
                                children: D.name,
                              }),
                              (0, a.jsx)("p", {
                                className:
                                  "font-body text-sm text-emerald-100/85",
                                children:
                                  "W" === D.gender
                                    ? "Женский профиль"
                                    : "Мужской профиль",
                              }),
                            ],
                          }),
                          (0, a.jsxs)("div", {
                            className: "flex flex-wrap gap-2",
                            children: [
                              (0, a.jsx)(n(), {
                                href: x(D.id),
                                className: c,
                                children: "Открыть карточку",
                              }),
                              (0, a.jsx)("button", {
                                type: "button",
                                className: c,
                                onClick: L,
                                disabled: R,
                                children: "Снять привязку",
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  })
                : z
                  ? (0, a.jsxs)("div", {
                      className:
                        "rounded-xl border border-amber-400/35 bg-amber-500/10 p-4",
                      children: [
                        (0, a.jsx)("p", {
                          className:
                            "font-body text-xs uppercase tracking-[0.2em] text-amber-100/90",
                          children: "Автоматически найдено",
                        }),
                        (0, a.jsxs)("p", {
                          className:
                            "mt-2 font-body text-sm text-amber-50",
                          children: [
                            "Сейчас кабинет находит вашу статистику через старую автосвязку:",
                            " ",
                            (0, a.jsx)(n(), {
                              href: x(z.id),
                              className: "underline underline-offset-2",
                              children: z.name,
                            }),
                            ". Лучше закрепить её явно кнопкой ниже.",
                          ],
                        }),
                      ],
                    })
                  : (0, a.jsx)("div", {
                      className:
                        "rounded-xl border border-white/10 bg-black/10 p-4 font-body text-sm text-text-secondary",
                      children: "Явная привязка пока не настроена.",
                    }),
              B
                ? (0, a.jsxs)("div", {
                    className:
                      "rounded-xl border border-brand/35 bg-brand/10 p-4",
                    children: [
                      (0, a.jsx)("p", {
                        className:
                          "font-body text-xs uppercase tracking-[0.2em] text-brand-light/90",
                        children: "Быстрая привязка",
                      }),
                      (0, a.jsxs)("div", {
                        className:
                          "mt-2 flex flex-wrap items-center justify-between gap-3",
                        children: [
                          (0, a.jsxs)("div", {
                            children: [
                              (0, a.jsx)("p", {
                                className:
                                  "font-heading text-xl text-text-primary",
                                children: B.name,
                              }),
                              (0, a.jsx)("p", {
                                className:
                                  "font-body text-sm text-text-secondary",
                                children:
                                  "Эта карточка открыта сейчас на странице игрока.",
                              }),
                            ],
                          }),
                          p(D, B)
                            ? (0, a.jsx)("span", {
                                className:
                                  "rounded-full border border-emerald-400/35 px-3 py-1 font-body text-sm text-emerald-100",
                                children: "Уже привязано",
                              })
                            : (0, a.jsx)("button", {
                                type: "button",
                                className: d,
                                onClick: () => H(B.id),
                                disabled: R,
                                children: "Привязать эту карточку",
                              }),
                        ],
                      }),
                    ],
                  })
                : null,
              (0, a.jsxs)("form", {
                onSubmit: U,
                className: "space-y-3",
                children: [
                  (0, a.jsxs)("div", {
                    children: [
                      (0, a.jsx)("label", {
                        className:
                          "font-body text-xs uppercase tracking-[0.2em] text-text-secondary",
                        children: "Найти по имени",
                      }),
                      (0, a.jsx)("input", {
                        value: N,
                        onChange: (e) => k(e.target.value),
                        placeholder: "Например: Лебедев Александр",
                        className: "mt-2 ".concat(
                          "w-full rounded-xl border border-white/10 bg-surface px-4 py-3 font-body text-text-primary outline-none transition-colors focus:border-brand",
                        ),
                      }),
                    ],
                  }),
                  (0, a.jsxs)("div", {
                    className: "flex flex-wrap gap-2",
                    children: [
                      (0, a.jsx)("button", {
                        type: "submit",
                        className: d,
                        disabled: C || R,
                        children: C ? "Ищу..." : "Найти карточку",
                      }),
                      (null == j ? void 0 : j.full_name)
                        ? (0, a.jsx)("button", {
                            type: "button",
                            className: c,
                            disabled: C || R,
                            onClick: () => E(j.full_name || ""),
                            children: "Найти по имени аккаунта",
                          })
                        : null,
                    ],
                  }),
                ],
              }),
              (
                null == j || null == (t = j.search_results)
                  ? void 0
                  : t.length
              )
                ? (0, a.jsx)("div", {
                    className: "space-y-2",
                    children: j.search_results.map((e) =>
                      (0, a.jsxs)(
                        "div",
                        {
                          className:
                            "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 p-3",
                          children: [
                            (0, a.jsxs)("div", {
                              children: [
                                (0, a.jsx)(n(), {
                                  href: x(e.id),
                                  className:
                                    "font-body text-base text-text-primary hover:text-brand-light",
                                  children: e.name,
                                }),
                                (0, a.jsx)("p", {
                                  className:
                                    "font-body text-sm text-text-secondary",
                                  children:
                                    "W" === e.gender
                                      ? "Женский профиль"
                                      : "Мужской профиль",
                                }),
                              ],
                            }),
                            p(D, e)
                              ? (0, a.jsx)("span", {
                                  className:
                                    "rounded-full border border-emerald-400/35 px-3 py-1 font-body text-sm text-emerald-100",
                                  children: "Уже привязано",
                                })
                              : (0, a.jsx)("button", {
                                  type: "button",
                                  className: c,
                                  disabled: R,
                                  onClick: () => H(e.id),
                                  children: "Привязать",
                                }),
                          ],
                        },
                        e.id,
                      ),
                    ),
                  })
                : null,
            ],
          });
}

export default m;
