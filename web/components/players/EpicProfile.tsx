// @ts-nocheck — recovered verbatim from production build X6ckiqIYGHO_dkvUdX54y.
/* eslint-disable */
'use client';

// Keep the source-contract tests in sync before changing this component.
import * as a from 'react/jsx-runtime';
import * as l from 'react';
import Link from 'next/link';
import PlayerPhoto from '@/components/ui/PlayerPhoto';
import PlayerShareCard from '@/components/players/PlayerShareCard';
import PlayerHeadToHead from '@/components/players/PlayerHeadToHead';
import ProfileLinkPlayerForm from '@/components/profile/ProfileLinkPlayerForm';
import { METRIKA_GOALS, reachMetrikaGoal } from '@/lib/metrika-goals';

const s = () => Link;
const i = { A: PlayerPhoto };
const o = { default: ProfileLinkPlayerForm };

let c = {
    THAI: "THAI",
    KOTC: "KOTC",
    GO: "Группы + Олимп",
    CLASSIFICATION: "Группы + все места",
  },
  d = [
    { value: "total", label: "Все встречи" },
    { value: "together", label: "Вместе" },
    { value: "against", label: "Против" },
    { value: "wins", label: "Победы" },
    { value: "winRate", label: "% побед" },
  ],
  x = {
    frequentPartner: null,
    mainRival: null,
    bestPartner: null,
    toughestRival: null,
  },
  p = "lpvolley-player-meetings-view";
async function parseApiJson(e, t) {
  if (!(e.headers.get("content-type") || "").includes("application/json"))
    throw Error(t);
  try {
    return await e.json();
  } catch (a) {
    throw Error(t);
  }
}
function m(e) {
  if (!e) return "";
  try {
    return new Date(e).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (t) {
    return e;
  }
}
function u(e) {
  let t = e % 100,
    r = e % 10;
  return t >= 11 && t <= 14
    ? "".concat(e, " встреч")
    : 1 === r
      ? "".concat(e, " встреча")
      : r >= 2 && r <= 4
        ? "".concat(e, " встречи")
        : "".concat(e, " встреч");
}
function f(e) {
  let t = e % 100,
    r = e % 10;
  return t >= 11 && t <= 14
    ? "".concat(e, " матчей")
    : 1 === r
      ? "".concat(e, " матч")
      : r >= 2 && r <= 4
        ? "".concat(e, " матча")
        : "".concat(e, " матчей");
}
function b(e, t) {
  return "together" === t
    ? "Вместе "
        .concat(e.togetherMeetings, " \xb7 ")
        .concat(e.togetherWins, ":")
        .concat(e.togetherLosses, " \xb7 ")
        .concat(e.togetherWinRate, "%")
    : "against" === t
      ? "Против "
          .concat(e.againstMeetings, " \xb7 ")
          .concat(e.againstWins, ":")
          .concat(e.againstLosses, " \xb7 ")
          .concat(e.againstWinRate, "%")
      : "wins" === t
        ? ""
            .concat(e.totalWins, " побед \xb7 ")
            .concat(e.totalMeetings, " встреч \xb7 ")
            .concat(e.winRate, "%")
        : "winRate" === t
          ? ""
              .concat(e.winRate, "% побед \xb7 ")
              .concat(e.totalWins, " из ")
              .concat(e.totalMeetings)
          : "Всего "
              .concat(e.totalMeetings, " \xb7 вместе ")
              .concat(e.togetherMeetings, " \xb7 против ")
              .concat(e.againstMeetings);
}
function h(e) {
  return "total" === e
    ? {
        headers: ["Всего", "Вместе", "Против"],
        mobileHeaders: ["Все", "Вм.", "Пр."],
      }
    : {
        headers: ["Игры", "Победы", "%"],
        mobileHeaders: ["Игр", "Поб.", "%"],
      };
}
function v(e) {
  let { eyebrow: t, title: r, stats: l, emptyText: n, accent: s } = e;
  return (0, a.jsxs)("div", {
    className:
      "rounded-[22px] border border-[var(--profile-border)] bg-[var(--profile-card)] p-4",
    children: [
      (0, a.jsx)("div", {
        className:
          "text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--profile-muted)]",
        children: t,
      }),
      (0, a.jsx)("div", {
        className:
          "mt-2 text-lg font-semibold text-[var(--profile-text)]",
        children: r,
      }),
      l.meetings
        ? (0, a.jsxs)(a.Fragment, {
            children: [
              (0, a.jsxs)("div", {
                className:
                  "mt-3 text-4xl font-black leading-none ".concat(
                    "cold" === s ? "text-[#26c6ff]" : "text-[#ff6a00]",
                  ),
                children: [l.wins, ":", l.losses],
              }),
              (0, a.jsxs)("div", {
                className:
                  "mt-2 text-sm text-[var(--profile-muted-strong)]",
                children: [
                  "Счёт серии \xb7 ",
                  u(l.meetings),
                  " \xb7 ",
                  l.winRate,
                  "% побед",
                  l.draws ? " \xb7 ничьи ".concat(l.draws) : "",
                ],
              }),
            ],
          })
        : (0, a.jsx)("p", {
            className: "mt-3 text-sm text-[var(--profile-muted)]",
            children: n,
          }),
    ],
  });
}
function g(e) {
  let { player: t } = e;
  return (0, a.jsx)("div", {
    className:
      "h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--profile-border)] bg-[var(--profile-soft)]",
    children: t.photoUrl
      ? (0, a.jsx)(i.A, {
          photoUrl: t.photoUrl,
          alt: t.name,
          width: 48,
          height: 48,
          className: "h-full w-full object-cover",
        })
      : (0, a.jsx)("div", {
          className:
            "flex h-full w-full items-center justify-center text-xs font-black text-[var(--profile-text)]",
          children: String(t.name || "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((e) => e[0])
            .join("")
            .toUpperCase(),
        }),
  });
}
function j(e) {
  var t;
  let { playerId: r, playerName: n } = e,
    [i, o] = (0, l.useState)(""),
    [j, y] = (0, l.useState)("total"),
    [N, k] = (0, l.useState)("cards"),
    [w, T] = (0, l.useState)([]),
    [C, S] = (0, l.useState)(x),
    [R, P] = (0, l.useState)(null),
    [_, I] = (0, l.useState)(null),
    [M, W] = (0, l.useState)(!0),
    [K, A] = (0, l.useState)(!1),
    [O, F] = (0, l.useState)(""),
    [E, U] = (0, l.useState)(8);
  async function H(e) {
    P(e), I(null), A(!0), U(8), F("");
    try {
      let t = await fetch(
          "/api/players/"
            .concat(encodeURIComponent(r), "/head-to-head?otherId=")
            .concat(encodeURIComponent(e.id)),
        ),
        a = await parseApiJson(t, "Сервис личных встреч временно недоступен");
      if (!t.ok) throw Error(a.error || "Не удалось загрузить встречи");
      I(a);
    } catch (e) {
      F(e.message || "Не удалось загрузить встречи");
    } finally {
      A(!1);
    }
  }
  (0, l.useEffect)(() => {
    try {
      "list" === window.localStorage.getItem(p) && k("list");
    } catch (e) {}
  }, []),
    (0, l.useEffect)(() => {
      if (R) return;
      let e = new AbortController(),
        t = window.setTimeout(async () => {
          W(!0), F("");
          try {
            var t;
            let a = await fetch(
                "/api/players/"
                  .concat(encodeURIComponent(r), "/head-to-head?q=")
                  .concat(encodeURIComponent(i), "&limit=12&sort=")
                  .concat(j),
                { signal: e.signal },
              ),
              l = await parseApiJson(a, "Сервис личных встреч временно недоступен");
            if (!a.ok) throw Error(l.error || "Не удалось найти игроков");
            T(Array.isArray(l.players) ? l.players : []),
              S(null != (t = l.highlights) ? t : x);
          } catch (e) {
            "AbortError" !== e.name &&
              F(e.message || "Не удалось найти игроков");
          } finally {
            e.signal.aborted || W(!1);
          }
        }, 250 * !!i);
      return () => {
        window.clearTimeout(t), e.abort();
      };
    }, [r, i, R, j]);
  let L =
      null != (t = null == _ ? void 0 : _.meetings.slice(0, E)) ? t : [],
    D = (0, l.useMemo)(() => {
      if (!(null == _ ? void 0 : _.coverage.firstDate)) return "";
      let e = m(_.coverage.firstDate),
        t = _.coverage.lastDate ? m(_.coverage.lastDate) : e;
      return e === t ? e : "".concat(e, " — ").concat(t);
    }, [_]);
  return (0, a.jsxs)("section", {
    className:
      "rounded-[26px] border border-[var(--profile-border)] bg-[var(--profile-panel)] px-4 py-4 sm:px-5",
    "data-player-head-to-head": !0,
    children: [
      (0, a.jsxs)("div", {
        className: "flex flex-wrap items-start justify-between gap-3",
        children: [
          (0, a.jsxs)("div", {
            children: [
              (0, a.jsx)("h2", {
                className:
                  "text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--profile-text)]",
                children: "Личные встречи",
              }),
              (0, a.jsx)("p", {
                className: "mt-1 text-sm text-[var(--profile-muted)]",
                children: "Матчи в одной команде и друг против друга.",
              }),
            ],
          }),
          R
            ? (0, a.jsx)("button", {
                type: "button",
                onClick: function () {
                  P(null), I(null), o(""), F("");
                },
                className:
                  "rounded-full border border-[var(--profile-border)] bg-[var(--profile-card)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--profile-muted-strong)] hover:border-[var(--profile-accent)]",
                children: "Другой игрок",
              })
            : null,
        ],
      }),
      R
        ? (0, a.jsxs)("div", {
            className: "mt-4",
            children: [
              (0, a.jsxs)("div", {
                className:
                  "flex items-center gap-3 rounded-[22px] border border-[var(--profile-border)] bg-[var(--profile-card)] p-3",
                children: [
                  (0, a.jsx)(g, { player: R }),
                  (0, a.jsxs)("div", {
                    className: "min-w-0",
                    children: [
                      (0, a.jsxs)("div", {
                        className:
                          "text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--profile-muted)]",
                        children: [n, " \xd7"],
                      }),
                      (0, a.jsx)("div", {
                        className:
                          "truncate text-lg font-semibold text-[var(--profile-text)]",
                        children: R.name,
                      }),
                    ],
                  }),
                ],
              }),
              K
                ? (0, a.jsx)("div", {
                    className:
                      "py-10 text-center text-sm text-[var(--profile-muted)]",
                    children: "Считаем личные встречи…",
                  })
                : _
                  ? (0, a.jsxs)(a.Fragment, {
                      children: [
                        (0, a.jsxs)("div", {
                          className: "mt-3 grid gap-3 md:grid-cols-2",
                          children: [
                            (0, a.jsx)(v, {
                              eyebrow: "Партнёрство",
                              title: "В одной команде",
                              stats: _.together,
                              emptyText:
                                "В записанных матчах ещё не играли вместе.",
                              accent: "cold",
                            }),
                            (0, a.jsx)(v, {
                              eyebrow: "Соперничество",
                              title: "Друг против друга",
                              stats: _.against,
                              emptyText:
                                "В записанных матчах ещё не играли друг против друга.",
                              accent: "warm",
                            }),
                          ],
                        }),
                        _.byFormat.length
                          ? (0, a.jsxs)("div", {
                              className:
                                "mt-3 overflow-hidden rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-card)]",
                              "aria-label": "Статистика по форматам",
                              children: [
                                (0, a.jsxs)("div", {
                                  className:
                                    "grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-b border-[var(--profile-border)] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--profile-muted)]",
                                  children: [
                                    (0, a.jsx)("span", {
                                      children: "Формат",
                                    }),
                                    (0, a.jsx)("span", {
                                      className: "text-right",
                                      children: "Вместе",
                                    }),
                                    (0, a.jsx)("span", {
                                      className: "text-right",
                                      children: "Против",
                                    }),
                                  ],
                                }),
                                _.byFormat.map((e) =>
                                  (0, a.jsxs)(
                                    "div",
                                    {
                                      className:
                                        "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-[var(--profile-border)] px-3 py-2.5 text-[11px] last:border-b-0",
                                      children: [
                                        (0, a.jsx)("span", {
                                          className:
                                            "truncate font-semibold text-[var(--profile-text)]",
                                          children: c[e.format],
                                        }),
                                        (0, a.jsx)("span", {
                                          className:
                                            "text-right text-cyan-300",
                                          children: e.together.meetings
                                            ? ""
                                                .concat(
                                                  e.together.wins,
                                                  ":",
                                                )
                                                .concat(
                                                  e.together.losses,
                                                  " \xb7 ",
                                                )
                                                .concat(
                                                  e.together.winRate,
                                                  "%",
                                                )
                                            : "—",
                                        }),
                                        (0, a.jsx)("span", {
                                          className:
                                            "text-right text-orange-300",
                                          children: e.against.meetings
                                            ? ""
                                                .concat(
                                                  e.against.wins,
                                                  ":",
                                                )
                                                .concat(
                                                  e.against.losses,
                                                  " \xb7 ",
                                                )
                                                .concat(
                                                  e.against.winRate,
                                                  "%",
                                                )
                                            : "—",
                                        }),
                                      ],
                                    },
                                    e.format,
                                  ),
                                ),
                              ],
                            })
                          : null,
                        (0, a.jsxs)("div", {
                          className:
                            "mt-5 flex flex-wrap items-end justify-between gap-2",
                          children: [
                            (0, a.jsxs)("div", {
                              children: [
                                (0, a.jsx)("h3", {
                                  className:
                                    "text-sm font-semibold text-[var(--profile-text)]",
                                  children: "История матчей",
                                }),
                                (0, a.jsx)("p", {
                                  className:
                                    "mt-0.5 text-xs text-[var(--profile-muted)]",
                                  children: _.meetings.length
                                    ? ""
                                        .concat(u(_.meetings.length))
                                        .concat(
                                          D ? " \xb7 ".concat(D) : "",
                                        )
                                    : "Нет матчей с сохранёнными составами",
                                }),
                              ],
                            }),
                            _.coverage.formats.length
                              ? (0, a.jsx)("span", {
                                  className:
                                    "text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--profile-muted)]",
                                  children: _.coverage.formats
                                    .map((e) => c[e])
                                    .join(" \xb7 "),
                                })
                              : null,
                          ],
                        }),
                        L.length
                          ? (0, a.jsx)("div", {
                              className: "mt-3 space-y-2",
                              children: L.map((e) => {
                                let t = "win" === e.outcome,
                                  r = "loss" === e.outcome;
                                return (0, a.jsxs)(
                                  "article",
                                  {
                                    className:
                                      "grid gap-3 rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-card)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                                    children: [
                                      (0, a.jsxs)("div", {
                                        className: "min-w-0",
                                        children: [
                                          (0, a.jsxs)("div", {
                                            className:
                                              "flex flex-wrap items-center gap-2",
                                            children: [
                                              (0, a.jsx)("span", {
                                                className:
                                                  "rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] ".concat(
                                                    "together" ===
                                                      e.relation
                                                      ? "bg-cyan-500/12 text-cyan-300"
                                                      : "bg-orange-500/12 text-orange-300",
                                                  ),
                                                children:
                                                  "together" ===
                                                  e.relation
                                                    ? "Вместе"
                                                    : "Против",
                                              }),
                                              (0, a.jsxs)("span", {
                                                className:
                                                  "text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--profile-muted)]",
                                                children: [
                                                  c[e.format],
                                                  " \xb7 ",
                                                  m(e.tournamentDate),
                                                ],
                                              }),
                                            ],
                                          }),
                                          (0, a.jsx)(s(), {
                                            href: "/calendar/".concat(
                                              e.tournamentId,
                                            ),
                                            className:
                                              "mt-1.5 block truncate text-sm font-semibold text-[var(--profile-text)] hover:text-[var(--profile-accent)]",
                                            children: e.tournamentName,
                                          }),
                                          (0, a.jsx)("div", {
                                            className:
                                              "mt-1 text-xs text-[var(--profile-muted)]",
                                            children: e.stageLabel,
                                          }),
                                        ],
                                      }),
                                      (0, a.jsxs)("div", {
                                        className:
                                          "flex items-center justify-between gap-3 sm:justify-end",
                                        children: [
                                          (0, a.jsx)("span", {
                                            className:
                                              "text-[10px] font-black uppercase tracking-[0.1em] ".concat(
                                                t
                                                  ? "text-emerald-400"
                                                  : r
                                                    ? "text-red-400"
                                                    : "text-[var(--profile-muted)]",
                                              ),
                                            children: t
                                              ? "Победа"
                                              : r
                                                ? "Поражение"
                                                : "Ничья",
                                          }),
                                          (0, a.jsx)("span", {
                                            className:
                                              "min-w-16 text-right text-2xl font-black text-[var(--profile-text)]",
                                            children: e.scoreLabel,
                                          }),
                                        ],
                                      }),
                                    ],
                                  },
                                  e.id,
                                );
                              }),
                            })
                          : (0, a.jsxs)("div", {
                              className:
                                "mt-3 rounded-[20px] border border-dashed border-[var(--profile-border)] bg-[var(--profile-card)] px-4 py-8 text-center",
                              children: [
                                (0, a.jsx)("div", {
                                  className:
                                    "text-base font-semibold text-[var(--profile-text)]",
                                  children: "Пока не встречались",
                                }),
                                (0, a.jsx)("p", {
                                  className:
                                    "mt-1 text-sm text-[var(--profile-muted)]",
                                  children:
                                    "Или встреча проходила на старом турнире без сохранённых матчевых составов.",
                                }),
                              ],
                            }),
                        _.meetings.length > E
                          ? (0, a.jsx)("button", {
                              type: "button",
                              onClick: () => U((e) => e + 8),
                              className:
                                "mt-3 w-full rounded-2xl border border-[var(--profile-border)] bg-[var(--profile-card)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--profile-muted-strong)] hover:border-[var(--profile-accent)] hover:text-[var(--profile-text)]",
                              children: "Показать ещё",
                            })
                          : null,
                        (0, a.jsx)("p", {
                          className:
                            "mt-4 text-xs leading-5 text-[var(--profile-muted)]",
                          children:
                            "Учтены только командные турниры, где сохранены составы и счёт матчей. Турниры King of the Court в статистику личных встреч не входят.",
                        }),
                      ],
                    })
                  : null,
            ],
          })
        : (0, a.jsxs)("div", {
            className: "mt-4",
            children: [
              i || M
                ? null
                : (0, a.jsx)("div", {
                    className: "mb-4 grid gap-2 sm:grid-cols-2",
                    "aria-label": "Личные рекорды игрока",
                    children: [
                      {
                        label: "Чаще всего вместе",
                        player: C.frequentPartner,
                        detail: C.frequentPartner
                          ? f(C.frequentPartner.togetherMeetings)
                          : "",
                        accent: "text-cyan-300",
                      },
                      {
                        label: "Главный соперник",
                        player: C.mainRival,
                        detail: C.mainRival
                          ? f(C.mainRival.againstMeetings)
                          : "",
                        accent: "text-orange-300",
                      },
                      {
                        label: "Лучший партнёр",
                        player: C.bestPartner,
                        detail: C.bestPartner
                          ? "".concat(
                              C.bestPartner.togetherWinRate,
                              "% побед \xb7 минимум 3 игры",
                            )
                          : "",
                        accent: "text-emerald-300",
                      },
                      {
                        label: "Неудобный соперник",
                        player: C.toughestRival,
                        detail: C.toughestRival
                          ? "".concat(
                              C.toughestRival.againstWinRate,
                              "% побед \xb7 минимум 3 игры",
                            )
                          : "",
                        accent: "text-red-300",
                      },
                    ].map((e) =>
                      e.player
                        ? (0, a.jsxs)(
                            "button",
                            {
                              type: "button",
                              onClick: () => H(e.player),
                              className:
                                "rounded-2xl border border-[var(--profile-border)] bg-[var(--profile-card)] px-3 py-2.5 text-left transition hover:border-[var(--profile-accent)]",
                              children: [
                                (0, a.jsx)("span", {
                                  className:
                                    "block text-[9px] font-black uppercase tracking-[0.12em] ".concat(
                                      e.accent,
                                    ),
                                  children: e.label,
                                }),
                                (0, a.jsx)("span", {
                                  className:
                                    "mt-1 block truncate text-sm font-semibold text-[var(--profile-text)]",
                                  children: e.player.name,
                                }),
                                (0, a.jsx)("span", {
                                  className:
                                    "mt-0.5 block text-[11px] text-[var(--profile-muted)]",
                                  children: e.detail,
                                }),
                              ],
                            },
                            e.label,
                          )
                        : null,
                    ),
                  }),
              (0, a.jsx)("label", {
                htmlFor: "head-to-head-player-search",
                className: "sr-only",
                children: "Найти второго игрока",
              }),
              (0, a.jsxs)("div", {
                className: "relative",
                children: [
                  (0, a.jsx)("input", {
                    id: "head-to-head-player-search",
                    type: "search",
                    value: i,
                    onChange: (e) => o(e.target.value),
                    placeholder: "Введите имя игрока",
                    autoComplete: "off",
                    role: "combobox",
                    "aria-expanded": w.length > 0,
                    "aria-controls": "head-to-head-player-options",
                    "aria-autocomplete": "list",
                    className:
                      "w-full rounded-2xl border border-[var(--profile-border)] bg-[var(--profile-card)] px-4 py-3 text-sm text-[var(--profile-text)] outline-none placeholder:text-[var(--profile-muted)] focus:border-[var(--profile-accent)]",
                  }),
                  M
                    ? (0, a.jsx)("span", {
                        className:
                          "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--profile-muted)]",
                        children: "Поиск…",
                      })
                    : null,
                ],
              }),
              (0, a.jsxs)("div", {
                className:
                  "mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]",
                children: [
                  (0, a.jsxs)("div", {
                    className:
                      "flex flex-wrap items-center justify-between gap-2",
                    children: [
                      (0, a.jsx)("span", {
                        className:
                          "text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--profile-muted)]",
                        children: "Сортировать",
                      }),
                      (0, a.jsx)("div", {
                        role: "group",
                        "aria-label":
                          "Сортировка игроков по личным встречам",
                        className:
                          "flex flex-wrap rounded-xl border border-[var(--profile-border)] bg-[var(--profile-soft)] p-1",
                        children: d.map((e) =>
                          (0, a.jsx)(
                            "button",
                            {
                              type: "button",
                              "aria-pressed": j === e.value,
                              onClick: () => y(e.value),
                              className:
                                "rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition ".concat(
                                  j === e.value
                                    ? "bg-[var(--profile-card)] text-[var(--profile-text)] shadow-sm"
                                    : "text-[var(--profile-muted)] hover:text-[var(--profile-text)]",
                                ),
                              children: e.label,
                            },
                            e.value,
                          ),
                        ),
                      }),
                    ],
                  }),
                  (0, a.jsxs)("div", {
                    className:
                      "flex items-center justify-between gap-2 lg:justify-end",
                    children: [
                      (0, a.jsx)("span", {
                        className:
                          "text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--profile-muted)]",
                        children: "Вид",
                      }),
                      (0, a.jsx)("div", {
                        role: "group",
                        "aria-label": "Вид списка игроков",
                        className:
                          "flex rounded-xl border border-[var(--profile-border)] bg-[var(--profile-soft)] p-1",
                        children: [
                          { value: "cards", label: "Карточки" },
                          { value: "list", label: "Списком" },
                        ].map((e) =>
                          (0, a.jsx)(
                            "button",
                            {
                              type: "button",
                              "aria-pressed": N === e.value,
                              onClick: () =>
                                (function (e) {
                                  k(e);
                                  try {
                                    window.localStorage.setItem(p, e);
                                  } catch (e) {}
                                })(e.value),
                              className:
                                "rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition ".concat(
                                  N === e.value
                                    ? "bg-[var(--profile-card)] text-[var(--profile-text)] shadow-sm"
                                    : "text-[var(--profile-muted)] hover:text-[var(--profile-text)]",
                                ),
                              children: e.label,
                            },
                            e.value,
                          ),
                        ),
                      }),
                    ],
                  }),
                ],
              }),
              (0, a.jsxs)("div", {
                id: "head-to-head-player-options",
                role: "listbox",
                "aria-label": i
                  ? "Результаты поиска игроков"
                  : "Игроки для сравнения",
                "data-candidate-view": N,
                className:
                  "cards" === N
                    ? "mt-3 grid gap-2 sm:grid-cols-2"
                    : "mt-3 overflow-hidden rounded-2xl border border-[var(--profile-border)] bg-[var(--profile-card)]",
                children: [
                  "list" === N
                    ? (0, a.jsxs)("div", {
                        className:
                          "grid grid-cols-[minmax(0,1fr)_42px_42px_42px] gap-2 border-b border-[var(--profile-border)] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--profile-muted)] sm:grid-cols-[minmax(0,1fr)_64px_64px_56px] sm:tracking-[0.1em]",
                        children: [
                          (0, a.jsx)("span", { children: "Игрок" }),
                          h(j).headers.map((e, t) =>
                            (0, a.jsxs)(
                              "span",
                              {
                                className: "text-right",
                                children: [
                                  (0, a.jsx)("span", {
                                    className: "sm:hidden",
                                    children: h(j).mobileHeaders[t],
                                  }),
                                  (0, a.jsx)("span", {
                                    className: "hidden sm:inline",
                                    children: e,
                                  }),
                                ],
                              },
                              e,
                            ),
                          ),
                        ],
                      })
                    : null,
                  w.map((e, t) => {
                    let r = (function (e, t) {
                      if ("total" === t)
                        return [
                          e.totalMeetings,
                          e.togetherMeetings,
                          e.againstMeetings,
                        ];
                      let r =
                        "together" === t
                          ? {
                              meetings: e.togetherMeetings,
                              wins: e.togetherWins,
                              winRate: e.togetherWinRate,
                            }
                          : "against" === t
                            ? {
                                meetings: e.againstMeetings,
                                wins: e.againstWins,
                                winRate: e.againstWinRate,
                              }
                            : {
                                meetings: e.totalMeetings,
                                wins: e.totalWins,
                                winRate: e.winRate,
                              };
                      return [
                        r.meetings,
                        r.wins,
                        "".concat(r.winRate, "%"),
                      ];
                    })(e, j);
                    return "list" === N
                      ? (0, a.jsxs)(
                          "button",
                          {
                            type: "button",
                            role: "option",
                            "aria-selected": "false",
                            onClick: () => H(e),
                            className:
                              "grid w-full grid-cols-[minmax(0,1fr)_42px_42px_42px] items-center gap-2 border-b border-[var(--profile-border)] px-3 py-2 text-left transition last:border-b-0 hover:bg-[var(--profile-soft)] sm:grid-cols-[minmax(0,1fr)_64px_64px_56px]",
                            children: [
                              (0, a.jsxs)("span", {
                                className:
                                  "flex min-w-0 items-center gap-2.5",
                                children: [
                                  (0, a.jsx)("span", {
                                    className:
                                      "w-5 shrink-0 text-center text-[11px] font-black text-[var(--profile-muted)]",
                                    children: t + 1,
                                  }),
                                  (0, a.jsx)(g, { player: e }),
                                  (0, a.jsxs)("span", {
                                    className: "min-w-0",
                                    children: [
                                      (0, a.jsx)("span", {
                                        className:
                                          "block truncate text-sm font-semibold text-[var(--profile-text)]",
                                        children: e.name,
                                      }),
                                      (0, a.jsx)("span", {
                                        className:
                                          "block truncate text-[10px] text-[var(--profile-muted)] sm:hidden",
                                        children: b(e, j),
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                              (0, a.jsx)("span", {
                                className:
                                  "text-right text-xs font-semibold text-[var(--profile-muted-strong)]",
                                children: r[0],
                              }),
                              (0, a.jsx)("span", {
                                className:
                                  "text-right text-xs font-semibold text-[var(--profile-text)]",
                                children: r[1],
                              }),
                              (0, a.jsx)("span", {
                                className:
                                  "text-right text-xs font-black text-[var(--profile-accent)]",
                                children: r[2],
                              }),
                            ],
                          },
                          e.id,
                        )
                      : (0, a.jsxs)(
                          "button",
                          {
                            type: "button",
                            role: "option",
                            "aria-selected": "false",
                            onClick: () => H(e),
                            className:
                              "flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--profile-border)] bg-[var(--profile-card)] p-3 text-left transition hover:border-[var(--profile-accent)]",
                            children: [
                              (0, a.jsx)("span", {
                                className:
                                  "w-5 shrink-0 text-center text-xs font-black text-[var(--profile-muted)]",
                                children: t + 1,
                              }),
                              (0, a.jsx)(g, { player: e }),
                              (0, a.jsxs)("span", {
                                className: "min-w-0",
                                children: [
                                  (0, a.jsx)("span", {
                                    className:
                                      "block truncate text-sm font-semibold text-[var(--profile-text)]",
                                    children: e.name,
                                  }),
                                  (0, a.jsx)("span", {
                                    className:
                                      "mt-0.5 block truncate text-xs text-[var(--profile-muted)]",
                                    children: b(e, j),
                                  }),
                                ],
                              }),
                            ],
                          },
                          e.id,
                        );
                  }),
                ],
              }),
              M || w.length
                ? null
                : (0, a.jsx)("p", {
                    className:
                      "mt-4 text-center text-sm text-[var(--profile-muted)]",
                    children: "Игроки по этому запросу не найдены.",
                  }),
            ],
          }),
      O
        ? (0, a.jsx)("div", {
            className:
              "mt-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300",
            children: O,
          })
        : null,
    ],
  });
}
var y = { l7: METRIKA_GOALS, sv: reachMetrikaGoal };
function N(e, t) {
  let r = -1 / 0;
  for (let a of e) {
    if (a.ratingType !== t) continue;
    let e = Date.parse(String(a.tournamentDate || ""));
    Number.isFinite(e) && e > r && (r = e);
  }
  return r;
}
let k = {
    KOTC: {
      label: "KOTC",
      shortLabel: "KOTC",
      icon: "K",
      tone: "border-[#8a6f11] bg-[#241d05] text-[#ffd400]",
      badgeTone: "border-[#8a6f11]/50 bg-[#241d05] text-[#ffd400]",
    },
    THAI: {
      label: "THAI",
      shortLabel: "THAI",
      icon: "T",
      tone: "border-[#0f4c63] bg-[#0d1f29] text-[#26c6ff]",
      badgeTone: "border-[#0f4c63]/60 bg-[#0d1f29] text-[#26c6ff]",
    },
    IPT: {
      label: "ДАБЛ",
      shortLabel: "IPT",
      icon: "I",
      tone: "border-[#3a3a3a] bg-[#171717] text-white",
      badgeTone: "border-white/15 bg-[#171717] text-white",
    },
  },
  w = {
    kin: "ХАРД",
    advanced: "АДАНС",
    advance: "АДАНС",
    medium: "МЕДИУМ",
    light: "ЛАЙТ",
    lite: "ЛАЙТ",
  },
  T = {
    hard: "ХАРД",
    advanced: "АДАНС",
    advance: "АДАНС",
    medium: "МЕДИУМ",
    light: "ЛАЙТ",
    lite: "ЛАЙТ",
  },
  C = "lpvolley-player-profile-view";
function S(e) {
  let t = String(e || "")
    .trim()
    .toUpperCase();
  return t.includes("THAI")
    ? "THAI"
    : t.includes("KOTC") || t.includes("KING")
      ? "KOTC"
      : "IPT" === t || t.includes("DOUBLE") || t.includes("ДАБЛ")
        ? "IPT"
        : t;
}
function R(e) {
  if (!e) return "";
  try {
    return new Date(e).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
    });
  } catch (t) {
    return e;
  }
}
function formatLatestResult(e) {
  if (!e) return "";
  return [
    R(String(e.tournamentDate || "")),
    Number(e.place || 0) > 0 ? "#".concat(Number(e.place)) : null,
    String(e.tournamentName || "").trim() || null,
  ]
    .filter(Boolean)
    .join(" • ");
}
function getTournamentYear(e) {
  if (!e) return null;
  let t = Date.parse(String(e.tournamentDate || ""));
  return Number.isFinite(t) ? new Date(t).getFullYear() : null;
}
function P(e) {
  let t =
    arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 0;
  if (null == e) return "—";
  let r = Number(e);
  if (!Number.isFinite(r)) return "—";
  let a = t > 0 ? r.toFixed(t) : String(Math.round(r));
  return r > 0 ? "+".concat(a) : a;
}
function _(e) {
  let t =
    arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 0;
  if (null == e) return "—";
  let r = Number(e);
  return Number.isFinite(r)
    ? t > 0
      ? r.toFixed(t)
      : String(Math.round(r))
    : "—";
}
function I(e) {
  let t = String(e || "")
    .trim()
    .toLowerCase();
  return "hard" === t
    ? {
        label: "ХАРД",
        color: "text-[#ff4d43]",
        card: "border-[#ff4d43]/35 bg-[#2a1111]",
      }
    : "advanced" === t || "advance" === t
      ? {
          label: "АДАНС",
          color: "text-[#26c6ff]",
          card: "border-[#26c6ff]/35 bg-[#0d1f29]",
        }
      : "medium" === t
        ? {
            label: "МЕДИУМ",
            color: "text-[#ffb100]",
            card: "border-[#ffb100]/35 bg-[#261b05]",
          }
        : {
            label: "ЛАЙТ",
            color: "text-[#39d96c]",
            card: "border-[#39d96c]/35 bg-[#102114]",
          };
}
function M(e) {
  var t;
  return null !=
    (t =
      w[
        String(e || "")
          .trim()
          .toLowerCase()
      ])
    ? t
    : String(e || "")
        .trim()
        .toUpperCase();
}
function W(e) {
  var t, r, a, l, n, s;
  return (null !=
  (a = null == (t = e.r2Totals) ? void 0 : t.totalKingWins)
    ? a
    : 0) >
    (null != (l = null == (r = e.r1Totals) ? void 0 : r.totalKingWins)
      ? l
      : 0)
    ? "Сильнее во втором этапе"
    : (null != (n = e.longestKingRun) ? n : 0) >= 4
      ? "Любит длинные серии"
      : (null != (s = e.avgTakeoversPerTournament) ? s : 0) >= 2
        ? "Часто забирает трон"
        : "kin" === e.bestZoneFinish
          ? "Опасен в финальной зоне"
          : "Стабилен по корту";
}
function K(e) {
  var t, r, a;
  return (null != (t = e.closeMatchWins) ? t : 0) >= 3
    ? "Часто дожимает концовки"
    : (null != (r = e.avgDiff) ? r : 0) >= 5
      ? "Играет от контроля"
      : e.r2Count > e.r1Count
        ? "Лучше раскрывается в зонах"
        : (null != (a = e.avgWins) ? a : 0) >= 3
          ? "Стабилен по турам"
          : "Чувствует темп Thai";
}
function O(e) {
  let { label: t, value: r, accent: l, hint: n } = e;
  return (0, a.jsxs)("div", {
    className:
      "rounded-[22px] border border-[var(--profile-border)] bg-[var(--profile-card)] px-4 py-3.5",
    children: [
      (0, a.jsx)("div", {
        className:
          "font-heading text-[34px] leading-none sm:text-[42px] ".concat(
            l,
          ),
        children: r,
      }),
      (0, a.jsx)("div", {
        className:
          "mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--profile-muted)]",
        children: t,
      }),
      n
        ? (0, a.jsx)("div", {
            className: "mt-1 text-xs text-[var(--profile-muted)]",
            children: n,
          })
        : null,
    ],
  });
}
function F(e) {
  let { children: t, tone: r = "default" } = e;
  return (0, a.jsx)("span", {
    className:
      "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] ".concat(
        {
          default:
            "border-[var(--profile-border)] bg-[var(--profile-card)] text-[var(--profile-muted-strong)]",
          warm: "border-[#ff6a00]/35 bg-[#241207] text-[#ffb27d]",
          cold: "border-[#26c6ff]/35 bg-[#0d1f29] text-[#8be2ff]",
          gold: "border-[#ffd400]/35 bg-[#241d05] text-[#ffd400]",
        }[r],
      ),
    children: t,
  });
}
function E(e) {
  let { title: t, subtitle: r, badge: l, children: n } = e;
  return (0, a.jsxs)("section", {
    className:
      "rounded-[26px] border border-[var(--profile-border)] bg-[var(--profile-panel)] px-4 py-4 sm:px-5",
    children: [
      (0, a.jsxs)("div", {
        className: "flex flex-wrap items-start justify-between gap-3",
        children: [
          (0, a.jsxs)("div", {
            children: [
              (0, a.jsx)("h2", {
                className:
                  "text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--profile-text)]",
                children: t,
              }),
              (0, a.jsx)("p", {
                className: "mt-1 text-sm text-[var(--profile-muted)]",
                children: r,
              }),
            ],
          }),
          l ? (0, a.jsx)(F, { children: l }) : null,
        ],
      }),
      (0, a.jsx)("div", { className: "mt-4", children: n }),
    ],
  });
}
function U(e) {
  let { token: t, title: r, value: l, hint: n, accent: s } = e;
  return (0, a.jsx)("div", {
    className:
      "rounded-[22px] border border-[var(--profile-border)] bg-[var(--profile-card)] px-4 py-4",
    children: (0, a.jsxs)("div", {
      className: "flex items-start gap-3",
      children: [
        (0, a.jsx)("div", {
          className:
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--profile-soft)] text-[10px] font-black uppercase tracking-[0.08em] text-[var(--profile-muted-strong)]",
          children: t,
        }),
        (0, a.jsxs)("div", {
          className: "min-w-0",
          children: [
            (0, a.jsx)("div", {
              className: "font-heading text-[28px] leading-none ".concat(
                s || "text-[var(--profile-text)]",
              ),
              children: l,
            }),
            (0, a.jsx)("div", {
              className:
                "mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--profile-muted)]",
              children: r,
            }),
            n
              ? (0, a.jsx)("div", {
                  className:
                    "mt-2 line-clamp-2 text-sm text-[var(--profile-muted)]",
                  children: n,
                })
              : null,
          ],
        }),
      ],
    }),
  });
}
function H(e) {
  let { entries: t, emptyLabel: r } = e;
  return t.length
    ? (0, a.jsx)("div", {
        className: "flex items-center gap-1 overflow-x-auto pb-1",
        "aria-label": "Путь сезона игрока",
        children: t.map((e, n) => {
          let r =
            1 === e.place
              ? "border-[#39d96c]/35 bg-[#102114] text-[#39d96c]"
              : e.place <= 3
                ? "border-[#ffb100]/35 bg-[#261b05] text-[#ffb100]"
                : "border-[var(--profile-border)] bg-[var(--profile-card)] text-[var(--profile-text)]";
          return (0, a.jsxs)(
            a.Fragment,
            {
              children: [
                n
                  ? (0, a.jsx)("span", {
                      className:
                        "shrink-0 text-sm text-[var(--profile-muted)]",
                      "aria-hidden": !0,
                      children: "→",
                    })
                  : null,
                (0, a.jsxs)("div", {
                  className:
                    "min-w-[68px] shrink-0 rounded-2xl border px-3 py-2 text-center ".concat(
                      r,
                    ),
                  "aria-current": n === t.length - 1 ? "date" : void 0,
                  children: [
                    (0, a.jsxs)("div", {
                      className: "text-sm font-black",
                      children: ["#", e.place || "—"],
                    }),
                    (0, a.jsx)("div", {
                      className:
                        "mt-0.5 text-[10px] uppercase tracking-[0.12em] opacity-70",
                      children: R(e.date),
                    }),
                  ],
                }),
              ],
            },
            "".concat(e.date, "-").concat(n),
          );
        }),
      })
    : (0, a.jsx)("div", {
        className: "text-sm text-[var(--profile-muted)]",
        children: r,
      });
}
function L(e) {
  let { label: t, value: r, hint: l } = e;
  return (0, a.jsxs)("div", {
    className:
      "rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-card)] px-3.5 py-3",
    children: [
      (0, a.jsx)("div", {
        className:
          "font-heading text-[27px] leading-none text-[var(--profile-text)]",
        children: r,
      }),
      (0, a.jsx)("div", {
        className:
          "mt-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--profile-muted)]",
        children: t,
      }),
      l
        ? (0, a.jsx)("div", {
            className: "mt-2 text-xs text-[var(--profile-muted)]",
            children: l,
          })
        : null,
    ],
  });
}
function D(e) {
  let { entries: t } = e,
    r = t
      .slice(0, 12)
      .reverse()
      .filter((e) => Number.isFinite(Number(e.newTotalRating)));
  if (r.length < 2)
    return (0, a.jsxs)("div", {
      "data-rating-trend-empty": !0,
      className:
        "rounded-[22px] border border-dashed border-[var(--profile-border)] bg-[var(--profile-card)] px-4 py-7 text-center",
      children: [
        (0, a.jsx)("div", {
          className: "text-sm font-semibold text-[var(--profile-text)]",
          children: "Динамика появится после двух изменений рейтинга",
        }),
        (0, a.jsx)("div", {
          className: "mt-1 text-xs text-[var(--profile-muted)]",
          children: "Пока ориентируемся на последние турнирные финиши.",
        }),
      ],
    });
  let l = r.map((e) => Number(e.newTotalRating)),
    n = Math.min(...l),
    s = Math.max(Math.max(...l) - n, 1),
    i = r.map((e, t) => ({
      x: 18 + (t / Math.max(r.length - 1, 1)) * 524,
      y: 156 - ((Number(e.newTotalRating) - n) / s) * 136,
      entry: e,
    })),
    o = i
      .map((e) => "".concat(e.x.toFixed(1), ",").concat(e.y.toFixed(1)))
      .join(" "),
    c = r[0],
    d = r[r.length - 1];
  return (0, a.jsxs)("figure", {
    "data-rating-trend-chart": !0,
    className:
      "rounded-[22px] border border-[var(--profile-border)] bg-[var(--profile-card)] px-3 py-3 sm:px-4",
    children: [
      (0, a.jsxs)("svg", {
        viewBox: "0 0 ".concat(560, " ").concat(176),
        className: "h-auto w-full overflow-visible",
        role: "img",
        "aria-label": "Рейтинг изменился с "
          .concat(c.newTotalRating, " до ")
          .concat(d.newTotalRating),
        children: [
          (0, a.jsx)("title", { children: "Динамика рейтинга игрока" }),
          [0.25, 0.5, 0.75].map((e) =>
            (0, a.jsx)(
              "line",
              {
                x1: 18,
                x2: 542,
                y1: 20 + 136 * e,
                y2: 20 + 136 * e,
                stroke: "var(--profile-border)",
                strokeWidth: "1",
              },
              e,
            ),
          ),
          (0, a.jsx)("polyline", {
            points: o,
            fill: "none",
            stroke: "var(--profile-accent)",
            strokeWidth: "5",
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }),
          i.map((e, t) =>
            (0, a.jsx)(
              "circle",
              {
                cx: e.x,
                cy: e.y,
                r: t === i.length - 1 ? 6 : 3.5,
                fill:
                  t === i.length - 1
                    ? "var(--profile-accent-warm)"
                    : "var(--profile-accent)",
                stroke: "var(--profile-card)",
                strokeWidth: "3",
              },
              e.entry.id || "".concat(e.entry.createdAt, "-").concat(t),
            ),
          ),
        ],
      }),
      (0, a.jsxs)("figcaption", {
        className:
          "mt-1 flex items-center justify-between gap-3 text-xs text-[var(--profile-muted)]",
        children: [
          (0, a.jsxs)("span", {
            children: [R(c.createdAt), " \xb7 ", c.newTotalRating],
          }),
          (0, a.jsx)("span", {
            className: "font-semibold text-[var(--profile-text)]",
            children: P(d.newTotalRating - c.newTotalRating),
          }),
          (0, a.jsxs)("span", {
            children: [R(d.createdAt), " \xb7 ", d.newTotalRating],
          }),
        ],
      }),
    ],
  });
}
function z(e) {
  let { insight: t } = e,
    r = t.hasDeepStats
      ? t.fallbackTournamentCount > 0
        ? "Подробно "
            .concat(t.nativeTournamentCount, " • архив ")
            .concat(t.fallbackTournamentCount)
        : "Подробно ".concat(t.nativeTournamentCount)
      : "Только итоговые результаты";
  return (0, a.jsxs)("section", {
    "data-profile-format-panel": "THAI",
    className:
      "rounded-[24px] border border-[var(--profile-border)] bg-[var(--profile-panel)] p-4 sm:p-5",
    children: [
      (0, a.jsxs)("div", {
        className: "flex flex-wrap items-start justify-between gap-3",
        children: [
          (0, a.jsxs)("div", {
            children: [
              (0, a.jsx)("h3", {
                className: "font-heading text-2xl text-[#26c6ff]",
                children: "THAI",
              }),
              (0, a.jsx)("p", {
                className: "mt-1 text-sm text-[var(--profile-muted)]",
                children:
                  "Контроль ритма, туровая стабильность и концовки.",
              }),
            ],
          }),
          (0, a.jsx)(F, { tone: "cold", children: r }),
        ],
      }),
      (0, a.jsxs)("div", {
        className: "mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
        children: [
          (0, a.jsx)(L, {
            label: "Points P",
            value: _(t.avgPointsP, 1),
            hint: "Среднее за турнир",
          }),
          (0, a.jsx)(L, {
            label: "Средний diff",
            value: P(t.avgDiff, 1),
            hint: K(t),
          }),
          (0, a.jsx)(L, {
            label: "Победы по турам",
            value: _(t.avgWins, 1),
            hint: "R1: ".concat(t.r1Count, " • R2: ").concat(t.r2Count),
          }),
          (0, a.jsx)(L, {
            label: "Лучшая зона",
            value:
              t.zoneFinishes.hard > 0
                ? "ХАРД"
                : t.zoneFinishes.advanced > 0
                  ? "АДАНС"
                  : t.zoneFinishes.medium > 0
                    ? "МЕДИУМ"
                    : t.zoneFinishes.light > 0
                      ? "ЛАЙТ"
                      : "—",
            hint: "Клатч-победы: ".concat(_(t.closeMatchWins)),
          }),
        ],
      }),
      (0, a.jsxs)("p", {
        className: "mt-3 text-sm text-[var(--profile-muted)]",
        children: [
          "Турнирный стиль: ",
          (0, a.jsx)("strong", {
            className: "text-[var(--profile-text)]",
            children: K(t),
          }),
          " \xb7 Подиумы ",
          t.podiumRate,
          "% \xb7 Лучший diff ",
          P(t.bestDiff),
        ],
      }),
    ],
  });
}
function B(e) {
  var t, r, l, n;
  let { insight: s, scope: i, onScopeChange: o } = e,
    c = s.hasDeepStats
      ? s.fallbackTournamentCount > 0
        ? "Подробно "
            .concat(s.nativeTournamentCount, " • архив ")
            .concat(s.fallbackTournamentCount)
        : "Подробно ".concat(s.nativeTournamentCount)
      : "Только итоговые результаты",
    d =
      "r1" === i
        ? s.r1Totals
        : "r2" === i
          ? s.r2Totals
          : s.hasDeepStats
            ? {
                totalKingWins: null != (t = s.totalKingWins) ? t : 0,
                totalTakeovers: null != (r = s.totalTakeovers) ? r : 0,
                totalGamesPlayed:
                  null != (l = s.totalGamesPlayed) ? l : 0,
                longestKingRun: null != (n = s.longestKingRun) ? n : 0,
              }
            : null;
  return (0, a.jsxs)("section", {
    "data-profile-format-panel": "KOTC",
    className:
      "rounded-[24px] border border-[var(--profile-border)] bg-[var(--profile-panel)] p-4 sm:p-5",
    children: [
      (0, a.jsxs)("div", {
        className: "flex flex-wrap items-start justify-between gap-3",
        children: [
          (0, a.jsxs)("div", {
            children: [
              (0, a.jsx)("h3", {
                className: "font-heading text-2xl text-[#ffd400]",
                children: "KOTC",
              }),
              (0, a.jsx)("p", {
                className: "mt-1 text-sm text-[var(--profile-muted)]",
                children: "Трон, смены, серии и любимые зоны.",
              }),
            ],
          }),
          (0, a.jsx)(F, { tone: "gold", children: c }),
        ],
      }),
      (0, a.jsx)("div", {
        className: "mt-4 flex flex-wrap gap-2",
        "aria-label": "Период статистики KOTC",
        children: ["total", "r1", "r2"].map((e) =>
          (0, a.jsx)(
            "button",
            {
              type: "button",
              onClick: () => o(e),
              "aria-pressed": i === e,
              className:
                "rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ".concat(
                  i === e
                    ? "border-[#ffd400] bg-[#241d05] text-[#ffd400]"
                    : "border-[var(--profile-border)] bg-[var(--profile-card)] text-[var(--profile-muted)]",
                ),
              children: "total" === e ? "Итого" : e.toUpperCase(),
            },
            e,
          ),
        ),
      }),
      (0, a.jsxs)("div", {
        className: "mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
        children: [
          (0, a.jsx)(L, {
            label: "Очки на троне",
            value: _(null == d ? void 0 : d.totalKingWins),
            hint: "Среднее КР: ".concat(_(s.avgKingWinsPerTournament, 1)),
          }),
          (0, a.jsx)(L, {
            label: "Смены",
            value: _(null == d ? void 0 : d.totalTakeovers),
            hint: "Конверсия: ".concat(_(s.takeoverConversion, 1)),
          }),
          (0, a.jsx)(L, {
            label: "Эффективность трона",
            value: _(
              "total" === i
                ? s.kingEfficiency
                : d && d.totalGamesPlayed > 0
                  ? d.totalKingWins / d.totalGamesPlayed
                  : null,
              2,
            ),
          }),
          (0, a.jsx)(L, {
            label: "Лучшая серия",
            value: _(null == d ? void 0 : d.longestKingRun),
            hint: W(s),
          }),
        ],
      }),
      (0, a.jsxs)("p", {
        className: "mt-3 text-sm text-[var(--profile-muted)]",
        children: [
          "Турнирный стиль: ",
          (0, a.jsx)("strong", {
            className: "text-[var(--profile-text)]",
            children: W(s),
          }),
          " \xb7 Лучшая зона ",
          s.bestZoneFinish ? M(s.bestZoneFinish) : "формируется",
          " \xb7 Подиумы ",
          s.podiumRate,
          "%",
        ],
      }),
    ],
  });
}
function Z(e) {
  var t, r, n, c;
  let {
      player: d,
      stats: x,
      matches: p,
      ratingHistory: m,
      formatInsights: u,
      backLink: f,
      sharePath: b,
      claimLoginHref: h,
      initialSection: profileInitialSection = "overview",
      sectionOnly: profileSectionOnly = !1,
    } = e,
    v = (function (e, t, r) {
      let a =
        "W" === e.gender
          ? {
              key: "W",
              label: "Ж",
              rating: Number(e.ratingW || 0),
              rank: t.rankW,
              rankDelta: t.rankDeltaW,
              tournaments: Number(e.tournamentsW || 0),
            }
          : {
              key: "M",
              label: "М",
              rating: Number(e.ratingM || 0),
              rank: t.rankM,
              rankDelta: t.rankDeltaM,
              tournaments: Number(e.tournamentsM || 0),
            };
      return [
        a,
        {
          key: "Mix",
          label: "MIX",
          rating: Number(e.ratingMix || 0),
          rank: t.rankMix,
          rankDelta: t.rankDeltaMix,
          tournaments: Number(e.tournamentsMix || 0),
        },
      ].sort((e, t) => {
        let l = t.tournaments - e.tournaments;
        if (0 !== l) return l;
        let n = N(r, e.key),
          s = N(r, t.key);
        if (n !== s) return s > n ? 1 : -1;
        let i = t.rating - e.rating;
        return 0 !== i ? i : e.key === a.key ? -1 : 1;
      })[0];
    })(d, x, p),
    g = I(
      (function (e, t, r) {
        let a = null != r ? r : "M" === e.gender ? e.ratingM : e.ratingW;
        return a >= 170 || t.gold >= 3
          ? "hard"
          : a >= 120 || t.topThreeRate >= 60
            ? "advanced"
            : a >= 75 || t.totalTournaments >= 3
              ? "medium"
              : "light";
      })(d, x, v.rating),
    ),
    w = [
      {
        key: "KOTC",
        rating: u.kotc.totalRatingPoints,
        total: u.kotc.totalTournaments,
      },
      {
        key: "THAI",
        rating: u.thai.totalRatingPoints,
        total: u.thai.totalTournaments,
      },
      {
        key: "IPT",
        rating: x.formatStats.double.rating,
        total: x.formatStats.double.total,
      },
    ].sort((e, t) => t.rating - e.rating || t.total - e.total)[0],
    W = null != (t = k[w.key]) ? t : k.IPT,
    K = u.thai.totalTournaments > 0,
    Z = u.kotc.totalTournaments > 0,
    q = Z && (!K || "KOTC" === w.key) ? "KOTC" : "THAI",
    [G, X] = (0, l.useState)(profileInitialSection),
    [J, V] = (0, l.useState)("tabs"),
    [Y, Q] = (0, l.useState)(q),
    [$, ee] = (0, l.useState)("all"),
    [et, er] = (0, l.useState)("all"),
    [ea, el] = (0, l.useState)("total"),
    [en, es] = (0, l.useState)(6);
  (0, l.useEffect)(() => {
    if (profileSectionOnly) return;
    try {
      let e = window.localStorage.getItem(C);
      ("tabs" === e || "list" === e) && V(e);
    } catch (e) {}
  }, [profileSectionOnly]),
    (0, l.useEffect)(() => {
      if (profileSectionOnly) return;
      try {
        "meetings" === new URL(window.location.href).searchParams.get("section") &&
          X("meetings");
      } catch (e) {}
    }, [profileSectionOnly]),
    (0, l.useEffect)(() => {
      profileSectionOnly && X(profileInitialSection);
    }, [profileInitialSection, profileSectionOnly]),
    (0, l.useEffect)(() => {
      (0, y.sv)(y.l7.playerProfileOpen, {
        playerId: d.id,
        gender: d.gender,
        hasPhoto: !!d.photoUrl,
        hasSharePath: !!b,
      });
    }, [d.gender, d.id, d.photoUrl, b]),
    (0, l.useEffect)(() => {
      "THAI" === Y && !K && Z && Q("KOTC"),
        "KOTC" === Y && !Z && K && Q("THAI");
    }, [Z, K, Y]);
  let ei = ["hard", "advanced", "medium", "light"].filter((e) =>
      p.some((t) => String(t.level || "").toLowerCase() === e),
    ),
    eo = p.filter((e) => {
      let t = S(e.format),
        r = String(e.level || "").toLowerCase();
      return ("all" === $ || t === $) && ("all" === et || r === et);
    }),
    ec = eo.slice(0, en),
    latestResult = p[0] || null,
    latestSeasonYear = getTournamentYear(latestResult),
    recentResults = p
      .filter(
        (e) =>
          null == latestSeasonYear ||
          getTournamentYear(e) === latestSeasonYear,
      )
      .slice(0, 5),
    ed = [
      v.rank && v.rank <= 10 ? "Топ-10" : null,
      x.currentStreak.count >= 2
        ? "Серия x".concat(x.currentStreak.count)
        : null,
      x.gold > 0 ? "Побед: ".concat(x.gold) : null,
    ]
      .filter(Boolean)
      .slice(0, 2),
    ex = (function (e, t) {
      var r, a, l;
      let n = t.kotc,
        s = t.thai;
      return (null != (r = n.kingEfficiency) ? r : 0) >= 1
        ? "Король корта"
        : (null != (a = n.avgTakeoversPerTournament) ? a : 0) >= 2
          ? "Охотник за троном"
          : null != s.avgPointsP &&
              s.avgPointsP >= 20 &&
              (null != (l = s.avgDiff) ? l : 0) >= 5
            ? "Тактик Thai"
            : e.topThreeRate >= 60 && t.overall.currentTop3Streak >= 2
              ? "Стабильный призёр"
              : e.gold >= 2
                ? "Игрок больших финалов"
                : t.overall.totalTournaments >= 6
                  ? "Турнирный ветеран"
                  : "Формирует турнирную историю";
    })(x, u),
    ep = (function (e, t) {
      var r, a;
      let l = t.overall.bestPlace,
        n = t.overall.currentTop3Streak;
      return 1 === l && n >= 2
        ? "Пик формы: регулярно заходит в решающие турниры."
        : e.topThreeRate >= 60
          ? "Держит уровень и редко выпадает из числа претендентов."
          : (null != (r = t.kotc.avgTakeoversPerTournament) ? r : 0) >= 2
            ? "Опасен за счёт резких рывков и захватов трона."
            : (null != (a = t.thai.closeMatchWins) ? a : 0) >= 3
              ? "Сильный финишер: дожимает концовки в плотных матчах."
              : t.overall.totalTournaments >= 4
                ? "Набрал турнирную базу и уже читается по статистике."
                : "Набирает турнирную базу и формирует стиль игры.";
    })(x, u),
    em = (function (e, t) {
      let r = e
        .slice(0, 5)
        .map((e) => Number(e.place || 0))
        .filter((e) => e > 0);
      if (!r.length) return "Формирует историю";
      if (r.length >= 3 && r.every((e) => e <= 3)) return "Пик формы";
      if (t.currentStreak.count >= 2) return "Держит уровень";
      let a = r[0],
        l = r[r.length - 1];
      return a < l
        ? "Набирает ход"
        : a > l
          ? "Нестабилен, но опасен"
          : "Стабильный темп";
    })(recentResults, x),
    seasonSummary =
      u.overall.currentTop3Streak >= 2
        ? "Серия подиумов x".concat(u.overall.currentTop3Streak)
        : em,
    eu = String(d.bio || "").trim() || ep,
    ef =
      "Mix" === v.key
        ? "W" === d.gender
          ? { label: "Ж", rating: d.ratingW, tournaments: d.tournamentsW }
          : { label: "М", rating: d.ratingM, tournaments: d.tournamentsM }
        : {
            label: "MIX",
            rating: d.ratingMix,
            tournaments: d.tournamentsMix,
          },
    eb = ef.rating > 0 || ef.tournaments > 0,
    eh = [
      { key: "overview", label: "Обзор" },
      { key: "stats", label: "Статистика" },
      {
        key: "history",
        label: "История".concat(
          p.length ? " \xb7 ".concat(p.length) : "",
        ),
      },
      { key: "meetings", label: "Личные" },
    ];
  return (0, a.jsxs)("div", {
    className:
      "player-profile-page mx-auto max-w-[1120px] px-1 pb-6 pt-3 sm:px-2",
    children: [
      f
        ? (0, a.jsx)(s(), {
            href: f.href,
            className:
              "mb-3 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary transition hover:text-text-primary",
            children: f.label,
          })
        : null,
      (0, a.jsxs)("section", {
        className:
          "player-profile-surface overflow-clip rounded-[30px] border border-[var(--profile-border)] bg-[var(--profile-canvas)] shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:rounded-[34px]",
        children: [
          (0, a.jsxs)("div", {
            className:
              "relative overflow-hidden border-b border-[var(--profile-border)]",
            children: [
              d.photoUrl
                ? (0, a.jsx)("div", {
                    className: "absolute inset-0",
                    children: (0, a.jsx)(i.A, {
                      photoUrl: d.photoUrl,
                      alt: "",
                      width: 1600,
                      height: 960,
                      className:
                        "h-full w-full object-cover opacity-[0.16]",
                    }),
                  })
                : null,
              (0, a.jsx)("div", {
                className:
                  "absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(38,198,255,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(255,106,0,0.18),transparent_38%),linear-gradient(180deg,var(--profile-hero-start),var(--profile-hero-end))]",
              }),
              (0, a.jsxs)("div", {
                className: "relative z-10 px-5 py-5 sm:px-6 sm:py-6",
                children: [
                  (0, a.jsxs)("div", {
                    className:
                      "flex flex-wrap items-start justify-between gap-3",
                    children: [
                      (0, a.jsx)("div", {
                        className:
                          "text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--profile-muted-strong)]",
                        children: "Паспорт игрока",
                      }),
                      (0, a.jsxs)("div", {
                        className:
                          "flex flex-wrap items-center gap-2 [&>a]:min-h-11 [&>button]:min-h-11 [&>span]:min-h-11",
                        children: [
                          b
                            ? (0, a.jsx)(PlayerShareCard, {
                                sharePath: b,
                                playerName: d.name,
                                rank: v.rank,
                                rating: v.rating,
                                rankDelta: v.rankDelta,
                              })
                            : null,
                          h
                            ? (0, a.jsx)(o.default, {
                                targetPlayerId: d.id,
                                targetPlayerName: d.name,
                                loginHref: h,
                                compact: !0,
                              })
                            : null,
                        ],
                      }),
                    ],
                  }),
                  (0, a.jsxs)("div", {
                    className:
                      "mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-end",
                    children: [
                      (0, a.jsxs)("div", {
                        className:
                          "grid grid-cols-[88px_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-end",
                        children: [
                          (0, a.jsx)("div", {
                            className:
                              "relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full border border-[var(--profile-border-strong)] bg-[var(--profile-soft)] shadow-[0_10px_28px_rgba(0,0,0,0.24)] sm:h-28 sm:w-28",
                            children: d.photoUrl
                              ? (0, a.jsx)(i.A, {
                                  photoUrl: d.photoUrl,
                                  alt: d.name,
                                  width: 128,
                                  height: 128,
                                  className: "h-full w-full object-cover",
                                })
                              : (0, a.jsx)("div", {
                                  className:
                                    "flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,#ff8d3a,transparent_68%),linear-gradient(180deg,#1c2434_0%,#0b0b0e_100%)] text-3xl font-black text-white sm:text-4xl",
                                  children: d.name
                                    .split(/\s+/)
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((e) => e[0])
                                    .join("")
                                    .toUpperCase(),
                                }),
                          }),
                          (0, a.jsxs)("div", {
                            className: "min-w-0",
                            children: [
                              (0, a.jsx)("div", {
                                className:
                                  "flex flex-wrap items-center gap-2",
                                children: ed.map((e, t) =>
                                  (0, a.jsx)(
                                    F,
                                    {
                                      tone: 0 === t ? "gold" : "warm",
                                      children: e,
                                    },
                                    e,
                                  ),
                                ),
                              }),
                              (0, a.jsx)("h1", {
                                className:
                                  "mt-2 break-words text-[clamp(34px,8vw,68px)] font-black uppercase leading-[0.92] tracking-[-0.045em] text-[var(--profile-text)]",
                                children: d.name,
                              }),
                              (0, a.jsx)("div", {
                                className:
                                  "mt-1.5 text-sm font-semibold text-[var(--profile-muted-strong)] sm:text-base",
                                children: ex,
                              }),
                              (0, a.jsx)("p", {
                                className:
                                  "mt-1 line-clamp-2 max-w-2xl text-sm text-[var(--profile-muted)]",
                                children: eu,
                              }),
                            ],
                          }),
                          (0, a.jsxs)("div", {
                            className:
                              "col-span-2 flex flex-wrap items-center gap-2",
                            children: [
                              (0, a.jsx)("span", {
                                className:
                                  "rounded-full border px-3 py-1 text-[11px] font-bold "
                                    .concat(g.card, " ")
                                    .concat(g.color),
                                children: g.label,
                              }),
                              (0, a.jsxs)("span", {
                                className:
                                  "rounded-full border px-3 py-1 text-[11px] font-bold ".concat(
                                    W.badgeTone,
                                  ),
                                children: [W.icon, " ", W.label],
                              }),
                              d.city
                                ? (0, a.jsx)(F, { children: d.city })
                                : null,
                              (0, a.jsx)(F, {
                                children:
                                  "M" === d.gender
                                    ? "Мужской"
                                    : "Женский",
                              }),
                            ],
                          }),
                        ],
                      }),
                      (0, a.jsxs)("div", {
                        className: "grid grid-cols-2 gap-3",
                        children: [
                          (0, a.jsx)(O, {
                            label: "Рейтинг ".concat(v.label),
                            value: String(v.rating),
                            accent: "text-[#ff6a00]",
                            hint: "".concat(v.tournaments, " турн."),
                          }),
                          (0, a.jsx)(O, {
                            label: "Место ".concat(v.label),
                            value: v.rank ? "#".concat(v.rank) : "—",
                            accent: "text-[#ffd400]",
                            hint:
                              null == v.rankDelta
                                ? "Новое в рейтинге"
                                : v.rankDelta > 0
                                  ? "▲ ".concat(v.rankDelta, " поз.")
                                  : v.rankDelta < 0
                                    ? "▼ ".concat(Math.abs(v.rankDelta), " поз.")
                                    : "Позиция сохранена",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          !profileSectionOnly && (0, a.jsxs)("div", {
            className:
              "flex flex-wrap items-center justify-between gap-2 border-b border-[var(--profile-border)] bg-[var(--profile-panel)] px-4 py-2 sm:px-6",
            children: [
              (0, a.jsx)("span", {
                className:
                  "text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--profile-muted)]",
                children: "Отображение профиля",
              }),
              (0, a.jsx)("div", {
                role: "group",
                "aria-label": "Вид профиля игрока",
                className:
                  "flex rounded-xl border border-[var(--profile-border)] bg-[var(--profile-soft)] p-1",
                children: [
                  { value: "tabs", label: "Вкладки" },
                  { value: "list", label: "Списком" },
                ].map((e) =>
                  (0, a.jsx)(
                    "button",
                    {
                      type: "button",
                      "aria-pressed": J === e.value,
                      onClick: () =>
                        (function (e) {
                          V(e);
                          try {
                            window.localStorage.setItem(C, e);
                          } catch (e) {}
                        })(e.value),
                      className:
                        "min-h-11 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition ".concat(
                          J === e.value
                            ? "bg-[var(--profile-card)] text-[var(--profile-text)] shadow-sm"
                            : "text-[var(--profile-muted)] hover:text-[var(--profile-text)]",
                        ),
                      children: e.label,
                    },
                    e.value,
                  ),
                ),
              }),
            ],
          }),
          !profileSectionOnly && "tabs" === J
            ? (0, a.jsx)("div", {
                role: "tablist",
                "aria-label": "Разделы профиля игрока",
                "data-profile-tabs": !0,
                className:
                  "sticky top-16 z-40 grid grid-cols-4 border-b border-[var(--profile-border)] bg-[var(--profile-panel)] px-1 shadow-[0_10px_24px_rgba(0,0,0,0.12)] sm:static sm:z-auto sm:px-5 sm:shadow-none",
                children: eh.map((e) => {
                  let t = G === e.key;
                  return (0, a.jsxs)(
                    "button",
                    {
                      id: "profile-tab-".concat(e.key),
                      type: "button",
                      role: "tab",
                      "aria-selected": t,
                      "aria-controls": "profile-panel-".concat(e.key),
                      tabIndex: t ? 0 : -1,
                      onClick: () => X(e.key),
                      className:
                        "relative min-h-14 px-2 text-[11px] font-bold uppercase tracking-[0.11em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--profile-accent)] sm:text-xs ".concat(
                          t
                            ? "text-[var(--profile-text)]"
                            : "text-[var(--profile-muted)] hover:text-[var(--profile-text)]",
                        ),
                      children: [
                        e.label,
                        t
                          ? (0, a.jsx)("span", {
                              className:
                                "absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--profile-accent)]",
                            })
                          : null,
                      ],
                    },
                    e.key,
                  );
                }),
              })
            : null,
          (0, a.jsxs)("div", {
            "data-profile-view": J,
            className: "px-4 py-4 sm:px-6 sm:py-5 ".concat(
              "list" === J ? "space-y-5" : "",
            ),
            children: [
              (0, a.jsx)("div", {
                id: "profile-panel-overview",
                role: "tabs" === J ? "tabpanel" : "region",
                "aria-labelledby":
                  "tabs" === J ? "profile-tab-overview" : void 0,
                "aria-label": "list" === J ? "Обзор" : void 0,
                hidden: "tabs" === J && "overview" !== G,
                children: (0, a.jsxs)(E, {
                  title: "Обзор",
                  subtitle:
                    "Главное о форме и результатах без повторяющихся показателей.",
                  badge: em,
                  children: [
                    (0, a.jsxs)("div", {
                      className: "grid gap-3 md:grid-cols-3",
                      children: [
                        (0, a.jsx)(U, {
                          token: "BEST",
                          title: "Лучший финиш",
                          value: u.overall.bestPlace
                            ? "#".concat(u.overall.bestPlace)
                            : "—",
                          hint: x.bestTournament
                            ? ""
                                .concat(x.bestTournament.name, " \xb7 +")
                                .concat(x.bestTournament.pts)
                            : "Победа ещё впереди",
                          accent: "text-[#ffd400]",
                        }),
                        (0, a.jsx)(U, {
                          token: "TOP",
                          title: "Подиумы",
                          value: "".concat(x.topThreeRate, "%"),
                          hint: "Золото "
                            .concat(x.gold, " \xb7 Серебро ")
                            .concat(x.silver, " \xb7 Бронза ")
                            .concat(x.bronze),
                        }),
                        (0, a.jsx)(U, {
                          token: "RUN",
                          title: "Текущая форма",
                          value: u.overall.currentTop3Streak
                            ? "x".concat(u.overall.currentTop3Streak)
                            : em,
                          hint: latestResult
                            ? formatLatestResult(latestResult)
                            : u.overall.currentTop3Streak >= 2
                              ? "Серия топ-3 x".concat(
                                  u.overall.currentTop3Streak,
                                )
                              : "Пик ещё формируется",
                          accent: "text-[#ff6a00]",
                        }),
                      ],
                    }),
                    (0, a.jsxs)("div", {
                      className:
                        "mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]",
                      children: [
                        (0, a.jsxs)("div", {
                          className:
                            "rounded-[22px] border border-[var(--profile-border)] bg-[var(--profile-card)] px-4 py-4",
                          children: [
                            (0, a.jsx)("div", {
                              className:
                                "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--profile-muted)]",
                              children: "Портрет игрока",
                            }),
                            (0, a.jsx)("div", {
                              className:
                                "mt-2 text-xl font-semibold text-[var(--profile-text)]",
                              children: ex,
                            }),
                            (0, a.jsx)("p", {
                              className:
                                "mt-2 text-sm text-[var(--profile-muted)]",
                              children: ep,
                            }),
                            (0, a.jsxs)("p", {
                              className:
                                "mt-3 text-sm text-[var(--profile-muted)]",
                              children: [
                                "Сценарий результата: ",
                                (0, a.jsx)("strong", {
                                  className: "text-[var(--profile-text)]",
                                  children:
                                    (null !=
                                    (r = u.kotc.avgTakeoversPerTournament)
                                      ? r
                                      : 0) >= 2
                                      ? "Через резкие рывки"
                                      : (null !=
                                          (n = u.thai.closeMatchWins)
                                            ? n
                                            : 0) >= 3
                                        ? "Через контроль концовок"
                                        : x.topThreeRate >= 60
                                          ? "Через стабильность"
                                          : (null !=
                                              (c = u.kotc.kingEfficiency)
                                                ? c
                                                : 0) >= 1
                                            ? "Через доминацию на троне"
                                            : "Через накопление формы",
                                }),
                              ],
                            }),
                          ],
                        }),
                        (0, a.jsxs)("div", {
                          className:
                            "rounded-[22px] border border-[var(--profile-border)] bg-[var(--profile-card)] px-4 py-4",
                          children: [
                            (0, a.jsx)("div", {
                              className:
                                "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--profile-muted)]",
                              children: latestSeasonYear
                                ? "Путь сезона ".concat(latestSeasonYear)
                                : "Путь сезона",
                            }),
                            (0, a.jsx)("div", {
                              className:
                                "mt-2 text-xl font-semibold text-[var(--profile-text)]",
                              children: seasonSummary,
                            }),
                            (0, a.jsx)("div", {
                              className: "mt-4",
                              children: (0, a.jsx)(H, {
                                entries: recentResults
                                  .slice()
                                  .reverse()
                                  .map((e) => ({
                                    place: Number(e.place || 0),
                                    date: String(e.tournamentDate || ""),
                                  })),
                                emptyLabel:
                                  "Путь сезона начнётся с первого турнира.",
                              }),
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              }),
              (0, a.jsx)("div", {
                id: "profile-panel-stats",
                role: "tabs" === J ? "tabpanel" : "region",
                "aria-labelledby":
                  "tabs" === J ? "profile-tab-stats" : void 0,
                "aria-label": "list" === J ? "Статистика" : void 0,
                hidden: "tabs" === J && "stats" !== G,
                children: (0, a.jsxs)("div", {
                  className: "grid gap-4",
                  children: [
                    (0, a.jsxs)(E, {
                      title: "Статистика",
                      subtitle:
                        "Динамика рейтинга и общие турнирные показатели.",
                      badge: m.length
                        ? "".concat(m.length, " изм.")
                        : void 0,
                      children: [
                        (0, a.jsxs)("div", {
                          className:
                            "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
                          children: [
                            (0, a.jsx)(L, {
                              label: "Всего турниров",
                              value: String(u.overall.totalTournaments),
                            }),
                            (0, a.jsx)(L, {
                              label: "Среднее место",
                              value: _(x.avgPlace, 1),
                            }),
                            (0, a.jsx)(L, {
                              label: "Очки за турнир",
                              value: _(u.overall.avgRatingPoints, 1),
                            }),
                            (0, a.jsx)(L, {
                              label: "Любимая зона",
                              value: (function (e) {
                                let t = [
                                  {
                                    label: "ХАРД",
                                    count:
                                      e.kotc.zoneFinishes.kin +
                                      e.thai.zoneFinishes.hard,
                                  },
                                  {
                                    label: "АДАНС",
                                    count:
                                      e.kotc.zoneFinishes.advanced +
                                      e.thai.zoneFinishes.advanced,
                                  },
                                  {
                                    label: "МЕДИУМ",
                                    count:
                                      e.kotc.zoneFinishes.medium +
                                      e.thai.zoneFinishes.medium,
                                  },
                                  {
                                    label: "ЛАЙТ",
                                    count:
                                      e.kotc.zoneFinishes.light +
                                      e.thai.zoneFinishes.light,
                                  },
                                ].sort((e, t) => t.count - e.count)[0];
                                return !t || t.count <= 0
                                  ? "Пока без выраженной зоны"
                                  : t.label;
                              })(u),
                            }),
                          ],
                        }),
                        (0, a.jsx)("div", {
                          className: "mt-4",
                          children: (0, a.jsx)(D, { entries: m }),
                        }),
                      ],
                    }),
                    K || Z
                      ? (0, a.jsxs)("div", {
                          children: [
                            (0, a.jsxs)("div", {
                              className: "mb-3 flex flex-wrap gap-2",
                              "aria-label": "Выбор формата статистики",
                              children: [
                                (0, a.jsxs)("button", {
                                  type: "button",
                                  onClick: () => K && Q("THAI"),
                                  disabled: !K,
                                  "aria-pressed": "THAI" === Y && K,
                                  className:
                                    "rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] ".concat(
                                      "THAI" === Y && K
                                        ? k.THAI.badgeTone
                                        : "border-[var(--profile-border)] bg-[var(--profile-card)] text-[var(--profile-muted)]",
                                      " disabled:cursor-not-allowed disabled:opacity-45",
                                    ),
                                  children: [
                                    "THAI",
                                    K ? "" : " \xb7 нет данных",
                                  ],
                                }),
                                (0, a.jsxs)("button", {
                                  type: "button",
                                  onClick: () => Z && Q("KOTC"),
                                  disabled: !Z,
                                  "aria-pressed": "KOTC" === Y && Z,
                                  className:
                                    "rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] ".concat(
                                      "KOTC" === Y && Z
                                        ? k.KOTC.badgeTone
                                        : "border-[var(--profile-border)] bg-[var(--profile-card)] text-[var(--profile-muted)]",
                                      " disabled:cursor-not-allowed disabled:opacity-45",
                                    ),
                                  children: [
                                    "KOTC",
                                    Z ? "" : " \xb7 нет данных",
                                  ],
                                }),
                              ],
                            }),
                            "KOTC" === Y && Z
                              ? (0, a.jsx)(B, {
                                  insight: u.kotc,
                                  scope: ea,
                                  onScopeChange: el,
                                })
                              : K
                                ? (0, a.jsx)(z, { insight: u.thai })
                                : (0, a.jsx)(B, {
                                    insight: u.kotc,
                                    scope: ea,
                                    onScopeChange: el,
                                  }),
                          ],
                        })
                      : (0, a.jsxs)("div", {
                          className:
                            "rounded-[24px] border border-dashed border-[var(--profile-border)] bg-[var(--profile-panel)] px-4 py-8 text-center",
                          children: [
                            (0, a.jsx)("div", {
                              className:
                                "text-base font-semibold text-[var(--profile-text)]",
                              children:
                                "Форматная статистика ещё собирается",
                            }),
                            (0, a.jsx)(s(), {
                              href: "/calendar",
                              className:
                                "mt-2 inline-flex text-sm font-semibold text-[var(--profile-accent)] hover:underline",
                              children: "Посмотреть ближайшие турниры",
                            }),
                          ],
                        }),
                  ],
                }),
              }),
              (0, a.jsx)("div", {
                id: "profile-panel-history",
                role: "tabs" === J ? "tabpanel" : "region",
                "aria-labelledby":
                  "tabs" === J ? "profile-tab-history" : void 0,
                "aria-label": "list" === J ? "История" : void 0,
                hidden: "tabs" === J && "history" !== G,
                children: (0, a.jsxs)(E, {
                  title: "История",
                  subtitle:
                    "Финиши, формат и турнирная формула по времени.",
                  children: [
                    (0, a.jsxs)("div", {
                      className: "flex flex-wrap gap-2",
                      children: [
                        ["all", "THAI", "KOTC"].map((e) =>
                          (0, a.jsx)(
                            "button",
                            {
                              type: "button",
                              onClick: () => {
                                ee(e), es(6);
                              },
                              "aria-pressed": $ === e,
                              className:
                                "rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ".concat(
                                  $ === e
                                    ? "THAI" === e
                                      ? k.THAI.badgeTone
                                      : "KOTC" === e
                                        ? k.KOTC.badgeTone
                                        : "border-[#ffd400] bg-[#241d05] text-[#ffd400]"
                                    : "border-[var(--profile-border)] bg-[var(--profile-card)] text-[var(--profile-muted)]",
                                ),
                              children: "all" === e ? "Все" : e,
                            },
                            e,
                          ),
                        ),
                        ei.length > 1
                          ? (0, a.jsxs)(a.Fragment, {
                              children: [
                                (0, a.jsx)("button", {
                                  type: "button",
                                  onClick: () => {
                                    er("all"), es(6);
                                  },
                                  "aria-pressed": "all" === et,
                                  className:
                                    "rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ".concat(
                                      "all" === et
                                        ? "border-[#ff6a00] bg-[#241207] text-[#ff6a00]"
                                        : "border-[var(--profile-border)] bg-[var(--profile-card)] text-[var(--profile-muted)]",
                                    ),
                                  children: "Все уровни",
                                }),
                                ei.map((e) => {
                                  let t = I(e);
                                  return (0, a.jsx)(
                                    "button",
                                    {
                                      type: "button",
                                      onClick: () => {
                                        er(e), es(6);
                                      },
                                      "aria-pressed": et === e,
                                      className:
                                        "rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ".concat(
                                          et === e
                                            ? ""
                                                .concat(t.card, " ")
                                                .concat(t.color)
                                            : "border-[var(--profile-border)] bg-[var(--profile-card)] text-[var(--profile-muted)]",
                                        ),
                                      children: t.label,
                                    },
                                    e,
                                  );
                                }),
                              ],
                            })
                          : null,
                      ],
                    }),
                    (0, a.jsx)("div", {
                      className: "mt-4 space-y-3",
                      children: eo.length
                        ? ec.map((e, t) => {
                            var r, l;
                            let n =
                                1 === (l = Number(e.place))
                                  ? {
                                      label: "ПОБЕДА",
                                      tone: "bg-[#39d96c] text-white",
                                      card: "border-[#1a5d2c] bg-[#0d2313]",
                                    }
                                  : l <= 3
                                    ? {
                                        label: "ПОДИУМ",
                                        tone: "bg-[#ffb100] text-black",
                                        card: "border-[#6f520f] bg-[#231b07]",
                                      }
                                    : {
                                        label: "ФИНИШ",
                                        tone: "bg-[#ff4d43] text-white",
                                        card: "border-[#5f1b1b] bg-[#231010]",
                                      },
                              i =
                                null != (r = k[S(e.format)]) ? r : k.IPT,
                              o = (0, a.jsx)("article", {
                                className:
                                  "rounded-[22px] border px-4 py-3.5 transition hover:brightness-110 ".concat(
                                    n.card,
                                  ),
                                children: (0, a.jsxs)("div", {
                                  className: "flex flex-col gap-3",
                                  children: [
                                    (0, a.jsxs)("div", {
                                      className:
                                        "flex flex-wrap items-center justify-between gap-3",
                                      children: [
                                        (0, a.jsx)("div", {
                                          className:
                                            "text-xs font-semibold uppercase tracking-[0.14em] text-[var(--profile-muted)]",
                                          children:
                                            R(
                                              String(
                                                e.tournamentDate || "",
                                              ),
                                            ) || "—",
                                        }),
                                        (0, a.jsxs)("div", {
                                          className:
                                            "flex flex-wrap items-center gap-2",
                                          children: [
                                            (0, a.jsx)("div", {
                                              className:
                                                "inline-flex rounded-2xl px-3 py-1.5 text-[11px] font-black uppercase ".concat(
                                                  n.tone,
                                                ),
                                              children: n.label,
                                            }),
                                            (0, a.jsx)("div", {
                                              className:
                                                "inline-flex rounded-2xl border px-2.5 py-1 text-[11px] font-bold uppercase ".concat(
                                                  i.badgeTone,
                                                ),
                                              children: i.shortLabel,
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                    (0, a.jsxs)("div", {
                                      children: [
                                        (0, a.jsx)("div", {
                                          className:
                                            "line-clamp-2 text-base font-bold text-[var(--profile-text)]",
                                          children: e.tournamentName,
                                        }),
                                        (0, a.jsx)("div", {
                                          className:
                                            "mt-1 text-sm text-[var(--profile-muted)]",
                                          children: (function (e) {
                                            var t, r, a, l, n, s, i;
                                            let o = S(e.format);
                                            if ("THAI" === o) {
                                              let l =
                                                  null !=
                                                  (t = e.thaiPointsP)
                                                    ? t
                                                    : e.gamePts,
                                                n =
                                                  null !=
                                                  (a =
                                                    null !=
                                                    (r = e.thaiRoundDiff)
                                                      ? r
                                                      : e.diff)
                                                    ? a
                                                    : 0,
                                                o = e.thaiZone
                                                  ? " • ".concat(
                                                      null !=
                                                        (i =
                                                          T[
                                                            String(
                                                              (s =
                                                                e.thaiZone) ||
                                                                "",
                                                            )
                                                              .trim()
                                                              .toLowerCase()
                                                          ])
                                                        ? i
                                                        : String(s || "")
                                                            .trim()
                                                            .toUpperCase(),
                                                    )
                                                  : "";
                                              return "#"
                                                .concat(e.place, " • P ")
                                                .concat(l, " • diff ")
                                                .concat(P(n))
                                                .concat(o);
                                            }
                                            if ("KOTC" === o) {
                                              let t =
                                                  null !=
                                                  (l = e.kotcKingWins)
                                                    ? l
                                                    : e.gamePts,
                                                r =
                                                  null !=
                                                  (n = e.kotcTakeovers)
                                                    ? n
                                                    : 0,
                                                a = e.kotcZone
                                                  ? " • ".concat(
                                                      M(e.kotcZone),
                                                    )
                                                  : "";
                                              return "#"
                                                .concat(e.place, " • КР ")
                                                .concat(t, " • смены ")
                                                .concat(r)
                                                .concat(a);
                                            }
                                            let c =
                                              "Mix" === e.ratingType
                                                ? "Микст"
                                                : "W" === e.ratingType
                                                  ? "Женский"
                                                  : "Мужской";
                                            return "#"
                                              .concat(e.place, " • +")
                                              .concat(
                                                e.ratingPts,
                                                " рейтинга • ",
                                              )
                                              .concat(c);
                                          })(e),
                                        }),
                                      ],
                                    }),
                                  ],
                                }),
                              });
                            return e.tournamentId
                              ? (0, a.jsx)(
                                  s(),
                                  {
                                    href: "/calendar/".concat(
                                      e.tournamentId,
                                    ),
                                    children: o,
                                  },
                                  ""
                                    .concat(e.tournamentId, "-")
                                    .concat(t),
                                )
                              : (0, a.jsx)(
                                  "div",
                                  { children: o },
                                  "history-".concat(t),
                                );
                          })
                        : (0, a.jsxs)("div", {
                            className:
                              "rounded-[22px] border border-dashed border-[var(--profile-border)] bg-[var(--profile-card)] px-4 py-8 text-center",
                            children: [
                              (0, a.jsx)("div", {
                                className:
                                  "mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--profile-border)] bg-[var(--profile-soft)] text-2xl text-[var(--profile-text)]",
                                children: "П",
                              }),
                              (0, a.jsx)("div", {
                                className:
                                  "mt-3 text-base font-semibold text-[var(--profile-text)]",
                                children: "Пока нет сыгранных матчей",
                              }),
                              (0, a.jsx)("div", {
                                className:
                                  "mt-1 text-sm text-[var(--profile-muted)]",
                                children:
                                  "Участвуйте в турнирах — история начнёт заполняться.",
                              }),
                            ],
                          }),
                    }),
                    eo.length > en
                      ? (0, a.jsx)("button", {
                          type: "button",
                          onClick: () => es((e) => e + 6),
                          className:
                            "mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[18px] border border-[var(--profile-border)] bg-[var(--profile-card)] px-4 text-sm font-semibold text-[var(--profile-text)] transition hover:border-[var(--profile-accent)]",
                          children: "Показать ещё",
                        })
                      : null,
                  ],
                }),
              }),
              (0, a.jsx)("div", {
                id: "profile-panel-meetings",
                role: "tabs" === J ? "tabpanel" : "region",
                "aria-labelledby":
                  "tabs" === J ? "profile-tab-meetings" : void 0,
                "aria-label": "list" === J ? "Встречи" : void 0,
                hidden: "tabs" === J && "meetings" !== G,
                children:
                  "tabs" === J && "meetings" !== G
                    ? null
                    : (0, a.jsx)(PlayerHeadToHead, {
                        playerId: d.id,
                        playerName: d.name,
                        playerPhotoUrl: d.photoUrl,
                      }),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

export default Z;
