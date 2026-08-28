// @ts-nocheck — recovered verbatim from production build X6ckiqIYGHO_dkvUdX54y.
/* eslint-disable */
'use client';

import * as a from 'react/jsx-runtime';
import * as l from 'react';
import Link from 'next/link';
import PlayerPhoto from '@/components/ui/PlayerPhoto';
import RankMovementBadge from '@/components/rankings/RankMovementBadge';
import RankingsMyPlace from '@/components/rankings/RankingsMyPlace';
import RankingsGuide from './RankingsGuide';

const n = () => Link;
const i = { A: PlayerPhoto };

function c(e) {
  return "avg" === e
    ? "СР."
    : "trn" === e
      ? "ТУР."
      : "medals" === e
        ? "ЗОЛ."
        : "РЕЙ.";
}
function d(e, t) {
  return "avg" === t
    ? e.tournaments > 0
      ? (e.rating / e.tournaments).toFixed(1)
      : "0"
    : "trn" === t
      ? String(e.tournaments)
      : "medals" === t
        ? String(e.gold)
        : String(e.rating);
}
function o(e, t, s, a) {
  let l = Math.abs(e) % 100,
    r = l % 10;
  return l > 10 && l < 20 ? a : 1 === r ? t : r > 1 && r < 5 ? s : a;
}
function x(e) {
  return "".concat(e, " ").concat(o(e, "игрок", "игрока", "игроков"));
}
function m(e) {
  return "".concat(e, " ").concat(o(e, "турнир", "турнира", "турниров"));
}
function u(e) {
  let { value: t, label: s, accent: l, outlined: r = !1 } = e;
  return (0, a.jsxs)("div", {
    className:
      "min-w-0 rounded-[18px] border px-1 py-3 sm:rounded-[28px] sm:px-4 sm:py-5 ".concat(
        r
          ? "border-[#7a4b00] bg-[#261701]"
          : "border-white/6 bg-[#141414]",
      ),
    children: [
      (0, a.jsx)("div", {
        className:
          "text-center font-heading text-3xl leading-none sm:text-5xl ".concat(
            l,
          ),
        children: t,
      }),
      (0, a.jsx)("div", {
        className:
          "mt-2 truncate text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-white/60 sm:mt-3 sm:text-[13px] sm:tracking-[0.14em]",
        children: s,
      }),
    ],
  });
}
function p(e) {
  let { active: t, onClick: s, children: l, ariaLabel: r } = e;
  return (0, a.jsx)("button", {
    type: "button",
    onClick: s,
    "aria-label": r,
    "aria-pressed": t,
    className:
      "rankings-gender-tab min-w-0 rounded-[18px] border px-2 py-3 text-xs font-bold uppercase tracking-[0.06em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff] sm:rounded-full sm:px-4 sm:text-sm ".concat(
        t
          ? "rankings-gender-tab--active border-[#ff6a00] bg-[#ff6a00] text-white shadow-[0_10px_35px_rgba(255,106,0,0.28)]"
          : "border-white/5 bg-[#181818] text-white/55 hover:text-white/75",
      ),
    children: l,
  });
}
function b(e) {
  let { active: t, onClick: s, children: l } = e;
  return (0, a.jsx)("button", {
    type: "button",
    onClick: s,
    "aria-pressed": t,
    className:
      "min-h-11 shrink-0 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff] ".concat(
        t
          ? "border-[#ff6a00] bg-[#1f1207] text-[#ff6a00]"
          : "border-white/5 bg-[#171717] text-white/65 hover:text-white/85",
      ),
    children: l,
  });
}
function f(e) {
  let { active: t, onClick: s, icon: l, label: r } = e;
  return (0, a.jsxs)("button", {
    type: "button",
    onClick: s,
    "aria-pressed": t,
    className:
      "min-h-11 flex-1 rounded-[16px] border px-2 py-3 text-xs font-bold uppercase tracking-[0.06em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff] sm:rounded-[18px] sm:px-3 sm:tracking-[0.08em] ".concat(
        t
          ? "border-[#ffd400] bg-[#1f1904] text-[#ffd400]"
          : "border-white/5 bg-[#151515] text-white/60 hover:text-white/85",
      ),
    children: [l, " ", r],
  });
}
function h(e) {
  let { name: t, photoUrl: s, sizeClass: l } = e;
  return s
    ? (0, a.jsx)("div", {
        className:
          "overflow-hidden rounded-full border border-white/10 ".concat(
            l,
          ),
        children: (0, a.jsx)(i.A, {
          photoUrl: s,
          alt: t,
          width: 80,
          height: 80,
        }),
      })
    : (0, a.jsx)("div", {
        className:
          "flex items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,#444,#151515_72%)] text-lg font-black text-white ".concat(
            l,
          ),
        children: t
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((e) => e[0])
          .join("")
          .toUpperCase(),
      });
}
function g(e) {
  let { entry: t, place: s, sort: l } = e,
    r =
      1 === s
        ? "border-[#ffd400]/40 bg-[#261d03] text-[#ffd400]"
        : 2 === s
          ? "border-white/10 bg-[#1a1a1a] text-white"
          : "border-white/10 bg-[#191919] text-[#d79247]",
    i =
      1 === s
        ? "h-14 bg-[#4f3c02] sm:h-[112px]"
        : 2 === s
          ? "h-12 bg-[#2a2a2d] sm:h-[86px]"
          : "h-12 bg-[#3a2308] sm:h-[76px]";
  return (0, a.jsxs)(n(), {
    href: "/players/".concat(t.playerId),
    className:
      "flex min-w-0 flex-1 flex-col items-center rounded-[22px] border px-2 pt-3 transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff] sm:rounded-[32px] sm:px-4 sm:pt-5 ".concat(
        r,
      ),
    children: [
      (0, a.jsx)(h, {
        name: t.name,
        photoUrl: t.photoUrl,
        sizeClass:
          1 === s
            ? "h-16 w-16 border-2 border-[#ffd400] sm:h-28 sm:w-28 sm:border-[3px]"
            : "h-14 w-14 border-2 border-white/10 sm:h-20 sm:w-20",
      }),
      (0, a.jsxs)("div", {
        className: "mt-2 min-w-0 text-center sm:mt-3",
        children: [
          (0, a.jsx)("div", {
            className:
              "text-[9px] uppercase tracking-[0.14em] text-white/45 sm:text-[11px] sm:tracking-[0.18em]",
            children: 1 === s ? "Лидер" : "".concat(s, " место"),
          }),
          (0, a.jsx)("div", {
            className:
              "mt-1 min-h-9 break-words text-[14px] font-black leading-tight text-white sm:mt-2 sm:min-h-0 sm:text-[clamp(20px,3vw,34px)] sm:leading-none",
            children: t.name,
          }),
          (0, a.jsx)("div", {
            className:
              "mt-2 font-heading text-3xl leading-none sm:mt-3 sm:text-5xl ".concat(
                1 === s
                  ? "text-[#ffd400]"
                  : 2 === s
                    ? "text-white/90"
                    : "text-[#d79247]",
              ),
            children: d(t, l),
          }),
          (0, a.jsx)("div", {
            className:
              "mt-1 text-[9px] uppercase tracking-[0.14em] text-white/45 sm:text-xs sm:tracking-[0.18em]",
            children: c(l),
          }),
          "pts" === l
            ? (0, a.jsx)("div", {
                className: "mt-2 flex justify-center",
                children: (0, a.jsx)(RankMovementBadge, {
                  entry: t,
                  compact: !0,
                }),
              })
            : null,
        ],
      }),
      (0, a.jsxs)("div", {
        className:
          "mt-3 flex w-full items-center justify-center rounded-t-[16px] border-t border-white/6 font-heading text-4xl leading-none sm:mt-5 sm:rounded-t-[20px] sm:text-6xl ".concat(
            i,
          ),
        children: ["#", s],
      }),
    ],
  });
}
function v(e) {
  let { entries: t, sort: s } = e,
    [l, r, n] = [t[0], t[1], t[2]];
  return l
    ? (0, a.jsxs)("section", {
        className: "mt-6 hidden sm:block",
        children: [
          (0, a.jsx)("div", {
            className:
              "mb-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/60 sm:mb-5 sm:text-[14px]",
            children: "Тройка лидеров",
          }),
          (0, a.jsxs)("div", {
            className: "grid grid-cols-3 items-end gap-2 sm:gap-4",
            children: [
              r
                ? (0, a.jsx)(g, { entry: r, place: 2, sort: s })
                : (0, a.jsx)("div", {}),
              (0, a.jsx)(g, { entry: l, place: 1, sort: s }),
              n
                ? (0, a.jsx)(g, { entry: n, place: 3, sort: s })
                : (0, a.jsx)("div", {}),
            ],
          }),
        ],
      })
    : null;
}
function w(e) {
  let { entry: t, sort: s, isMe: isMyEntry = !1 } = e,
    l = (function (e) {
      let t = String(e || "")
        .trim()
        .toLowerCase();
      return "hard" === t
        ? {
            label: "HARD",
            color: "#ff4d43",
            border: "border-[#ff4d43]/45",
            chip: "bg-[#2d1111] text-[#ff4d43]",
          }
        : "advanced" === t || "advance" === t
          ? {
              label: "ADV",
              color: "#26c6ff",
              border: "border-[#26c6ff]/45",
              chip: "bg-[#0d1f29] text-[#26c6ff]",
            }
          : "medium" === t
            ? {
                label: "MED",
                color: "#ffb100",
                border: "border-[#ffb100]/45",
                chip: "bg-[#261b05] text-[#ffcf4d]",
              }
            : {
                label: "EASY",
                color: "#37d45d",
                border: "border-[#37d45d]/45",
                chip: "bg-[#0d2012] text-[#7cf293]",
              };
    })(t.topLevel),
    r = t.tournaments > 0 ? (t.rating / t.tournaments).toFixed(1) : "0";
  return (0, a.jsxs)(n(), {
    id: "ranking-player-".concat(t.playerId),
    href: "/players/".concat(t.playerId),
    className:
      "flex items-center gap-2 rounded-[20px] border bg-[#121212] px-3 py-3 transition hover:border-white/14 hover:bg-[#171717] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff] sm:gap-3 sm:rounded-[24px] sm:px-4 sm:py-4 ".concat(
        isMyEntry
          ? "scroll-mt-32 border-[#ff6a00]/60 bg-[#1d130d] ring-1 ring-[#ff6a00]/25"
          : 1 === t.rank
            ? "border-[#5f490a]"
            : "border-white/6",
      ),
    children: [
      (0, a.jsx)("div", {
        className:
          "w-6 shrink-0 text-center font-heading text-3xl leading-none sm:w-8 sm:text-4xl ".concat(
            t.rank <= 3 ? "text-[#d79247]" : "text-white/78",
          ),
        children: t.rank,
      }),
      (0, a.jsx)(h, {
        name: t.name,
        photoUrl: t.photoUrl,
        sizeClass: "h-11 w-11 shrink-0 sm:h-14 sm:w-14",
      }),
      (0, a.jsxs)("div", {
        className: "min-w-0 flex-1",
        children: [
          (0, a.jsx)("div", {
            className:
              "truncate text-[16px] font-bold text-white sm:text-[18px]",
            children: t.name,
          }),
          (0, a.jsxs)("div", {
            className:
              "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/60 sm:gap-x-3 sm:text-xs",
            children: [
              (0, a.jsxs)("span", {
                children: ["\uD83C\uDFC6 ", t.tournaments],
              }),
              (0, a.jsxs)("span", { children: ["⚡ ", t.rating] }),
              (0, a.jsxs)("span", { children: ["\uD83D\uDCCA ", r] }),
            ],
          }),
          t.gold > 0 || t.silver > 0 || t.bronze > 0
            ? (0, a.jsxs)("div", {
                className:
                  "mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-white/55 sm:mt-2 sm:text-[11px]",
                children: [
                  t.gold > 0
                    ? (0, a.jsxs)("span", {
                        children: ["\uD83E\uDD47 ", t.gold],
                      })
                    : null,
                  t.silver > 0
                    ? (0, a.jsxs)("span", {
                        children: ["\uD83E\uDD48 ", t.silver],
                      })
                    : null,
                  t.bronze > 0
                    ? (0, a.jsxs)("span", {
                        children: ["\uD83E\uDD49 ", t.bronze],
                      })
                    : null,
                ],
              })
            : null,
        ],
      }),
      (0, a.jsxs)("div", {
        className: "flex flex-col items-end gap-2",
        children: [
          (0, a.jsx)("div", {
            className:
              "font-heading text-4xl leading-none sm:text-6xl ".concat(
                1 === t.rank
                  ? "text-[#ffd400]"
                  : t.rank <= 3
                    ? "text-[#d79247]"
                    : "text-white",
              ),
            children: d(t, s),
          }),
          (0, a.jsx)("div", {
            className:
              "text-[10px] uppercase tracking-[0.12em] text-white/60 sm:text-[11px]",
            children: c(s),
          }),
          "pts" === s
            ? (0, a.jsx)(RankMovementBadge, { entry: t })
            : null,
          (0, a.jsx)("div", {
            title: "Лучшая рейтинговая зона: ".concat(l.label),
            className:
              "rounded-[10px] border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] sm:rounded-[12px] sm:px-3 sm:text-sm sm:tracking-[0.12em] "
                .concat(l.border, " ")
                .concat(l.chip),
            children: l.label,
          }),
        ],
      }),
    ],
  });
}
function j(e) {
  let { entry: t } = e,
    s = [
      {
        label: "HARD",
        value: t.hardWins,
        className: "border-[#ff4d43]/45 bg-[#2d1111] text-[#ff4d43]",
      },
      {
        label: "ADV",
        value: t.advancedWins,
        className: "border-[#26c6ff]/45 bg-[#0d1f29] text-[#26c6ff]",
      },
      {
        label: "MED",
        value: t.mediumWins,
        className: "border-[#ffb100]/45 bg-[#261b05] text-[#ffd25b]",
      },
      {
        label: "EASY",
        value: t.lightWins,
        className: "border-[#37d45d]/45 bg-[#0d2012] text-[#7cf293]",
      },
    ].filter((e) => e.value > 0),
    l = [
      {
        label: "KOTC",
        icon: "\uD83D\uDC51",
        value: t.kotcWins,
        className: "border-[#ffd400]/45 bg-[#261d03] text-[#ffd400]",
      },
      {
        label: "THAI",
        icon: "\uD83C\uDFF4",
        value: t.thaiWins,
        className: "border-white/10 bg-[#171717] text-white/72",
      },
      {
        label: "ДАБЛ",
        icon: "⚡",
        value: t.iptWins,
        className: "border-[#26c6ff]/45 bg-[#0d1f29] text-[#26c6ff]",
      },
    ].filter((e) => e.value > 0);
  return (0, a.jsx)(n(), {
    href: "/players/".concat(t.playerId),
    className:
      "rounded-[20px] border border-white/6 bg-[#121212] p-3 transition hover:border-white/14 hover:bg-[#171717] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff] sm:rounded-[24px] sm:p-4",
    children: (0, a.jsxs)("div", {
      className: "flex items-start gap-2 sm:gap-3",
      children: [
        (0, a.jsx)("div", {
          className:
            "w-7 text-center font-heading text-3xl leading-none text-[#ffd400] sm:w-9 sm:text-4xl",
          children: t.rank,
        }),
        (0, a.jsx)(h, {
          name: t.name,
          photoUrl: t.photoUrl,
          sizeClass: "h-11 w-11 shrink-0 sm:h-14 sm:w-14",
        }),
        (0, a.jsxs)("div", {
          className: "min-w-0 flex-1",
          children: [
            (0, a.jsxs)("div", {
              className: "flex items-start justify-between gap-3",
              children: [
                (0, a.jsx)("div", {
                  className:
                    "truncate text-[16px] font-bold text-white sm:text-[20px]",
                  children: t.name,
                }),
                (0, a.jsxs)("div", {
                  className:
                    "shrink-0 text-right text-xs font-bold text-white/72 sm:text-sm",
                  children: [
                    t.gold > 0
                      ? (0, a.jsxs)("div", {
                          className: "text-[#ffd400]",
                          children: ["\uD83E\uDD47", t.gold],
                        })
                      : null,
                    t.silver > 0
                      ? (0, a.jsxs)("div", {
                          children: ["\uD83E\uDD48", t.silver],
                        })
                      : null,
                    t.bronze > 0
                      ? (0, a.jsxs)("div", {
                          className: "text-[#d79247]",
                          children: ["\uD83E\uDD49", t.bronze],
                        })
                      : null,
                  ],
                }),
              ],
            }),
            s.length
              ? (0, a.jsx)("div", {
                  className: "mt-3 flex flex-wrap gap-2",
                  children: s.map((e) =>
                    (0, a.jsxs)(
                      "span",
                      {
                        className:
                          "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] sm:px-3 sm:text-[11px] sm:tracking-[0.12em] ".concat(
                            e.className,
                          ),
                        children: [e.label, " x", e.value],
                      },
                      e.label,
                    ),
                  ),
                })
              : null,
            l.length
              ? (0, a.jsx)("div", {
                  className: "mt-2 flex flex-wrap gap-2",
                  children: l.map((e) =>
                    (0, a.jsxs)(
                      "span",
                      {
                        className:
                          "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] sm:px-3 sm:text-[11px] sm:tracking-[0.12em] ".concat(
                            e.className,
                          ),
                        children: [e.icon, " ", e.label, " x", e.value],
                      },
                      e.label,
                    ),
                  ),
                })
              : null,
          ],
        }),
      ],
    }),
  });
}
function N() {
  return (0, a.jsx)("div", {
    className: "space-y-3",
    "aria-hidden": "true",
    children: [0, 1, 2].map((e) =>
      (0, a.jsxs)(
        "div",
        {
          className:
            "flex animate-pulse items-center gap-3 rounded-[20px] border border-white/6 bg-[#121212] px-3 py-4 sm:rounded-[24px] sm:px-4",
          children: [
            (0, a.jsx)("div", {
              className: "h-8 w-6 rounded bg-white/6",
            }),
            (0, a.jsx)("div", {
              className: "h-12 w-12 rounded-full bg-white/6",
            }),
            (0, a.jsxs)("div", {
              className: "min-w-0 flex-1 space-y-2",
              children: [
                (0, a.jsx)("div", {
                  className: "h-4 w-2/5 rounded bg-white/6",
                }),
                (0, a.jsx)("div", {
                  className: "h-3 w-3/5 rounded bg-white/6",
                }),
              ],
            }),
            (0, a.jsx)("div", {
              className: "h-10 w-14 rounded bg-white/6",
            }),
          ],
        },
        e,
      ),
    ),
  });
}
function k(e) {
  var t, s, r, n;
  let { initialEntries: i, initialType: c, counts: d } = e,
    [o, h] = (0, l.useState)(c),
    [g, k] = (0, l.useState)("all"),
    [y, D] = (0, l.useState)(i),
    [C, E] = (0, l.useState)([]),
    [A, S] = (0, l.useState)(null),
    [_, L] = (0, l.useState)(!1),
    [M, z] = (0, l.useState)(!1),
    [W, U] = (0, l.useState)("pts"),
    [I, T] = (0, l.useState)(""),
    [H, O] = (0, l.useState)(""),
    [F, R] = (0, l.useState)(0),
    [myPlayerId, setMyPlayerId] = (0, l.useState)(null);
  (0, l.useEffect)(() => {
    if (o === c && "all" === g) {
      D(i), L(!1), O("");
      return;
    }
    let e = new AbortController();
    return (
      L(!0),
      O(""),
      fetch(
        "/api/leaderboard?type="
          .concat(o, "&limit=100&format=")
          .concat(g),
        { signal: e.signal },
      )
        .then((e) => {
          if (!e.ok)
            throw Error("Leaderboard request failed: ".concat(e.status));
          return e.json();
        })
        .then((e) => D(Array.isArray(e) ? e : []))
        .catch((e) => {
          "AbortError" !== e.name &&
            (D([]),
            O(
              "Не удалось обновить рейтинг. Проверьте соединение и попробуйте ещё раз.",
            ));
        })
        .finally(() => {
          e.signal.aborted || L(!1);
        }),
      () => e.abort()
    );
  }, [o, g, i, c, F]),
    (0, l.useEffect)(() => {
      if (
        "medals" !== W ||
        ((null == A ? void 0 : A.type) === o &&
          (null == A ? void 0 : A.format) === g)
      )
        return;
      let e = new AbortController();
      return (
        z(!0),
        O(""),
        fetch(
          "/api/leaderboard-medals?type="
            .concat(o, "&limit=100&format=")
            .concat(g),
          { signal: e.signal },
        )
          .then((e) => {
            if (!e.ok)
              throw Error("Medals request failed: ".concat(e.status));
            return e.json();
          })
          .then((e) => {
            E(Array.isArray(e) ? e : []), S({ type: o, format: g });
          })
          .catch((e) => {
            "AbortError" !== e.name &&
              (E([]),
              O(
                "Не удалось загрузить медали. Проверьте соединение и попробуйте ещё раз.",
              ));
          })
          .finally(() => {
            e.signal.aborted || z(!1);
          }),
        () => e.abort()
      );
    }, [g, A, F, W, o]),
    (0, l.useEffect)(() => {
      O("");
    }, [W]);
  let q = (0, l.useMemo)(
      () =>
        (function (e, t) {
          let s = [...e];
          return (
            "avg" === t
              ? s.sort((e, t) => {
                  let s =
                    e.tournaments > 0 ? e.rating / e.tournaments : 0;
                  return (
                    (t.tournaments > 0 ? t.rating / t.tournaments : 0) -
                      s ||
                    t.rating - e.rating ||
                    e.name.localeCompare(t.name, "ru")
                  );
                })
              : "trn" === t
                ? s.sort(
                    (e, t) =>
                      t.tournaments - e.tournaments ||
                      t.rating - e.rating ||
                      e.name.localeCompare(t.name, "ru"),
                  )
                : s.sort(
                    (e, t) =>
                      t.rating - e.rating ||
                      t.tournaments - e.tournaments ||
                      e.name.localeCompare(t.name, "ru"),
                  ),
            s.map((e, t) => ({ ...e, rank: t + 1 }))
          );
        })(y, W),
      [y, W],
    ),
    K = (0, l.useMemo)(() => {
      let e = q;
      if (I.trim()) {
        let t = I.trim().toLowerCase();
        e = e.filter((e) => e.name.toLowerCase().includes(t));
      }
      return e;
    }, [I, q]),
    P = (0, l.useMemo)(() => {
      let e = C;
      if (I.trim()) {
        let t = I.trim().toLowerCase();
        e = e.filter((e) => e.name.toLowerCase().includes(t));
      }
      return e;
    }, [C, I]),
    V = [
      {
        value: "M",
        label: "Мужчины",
        shortLabel: "М",
        count: d.men,
        fullLabel: "Мужской рейтинг",
      },
      {
        value: "W",
        label: "Женщины",
        shortLabel: "Ж",
        count: d.women,
        fullLabel: "Женский рейтинг",
      },
      {
        value: "Mix",
        label: "Микст",
        shortLabel: "Микст",
        count: d.mix,
        fullLabel: "Рейтинг микстов",
      },
    ],
    Y = {
      M: d.menTournaments,
      W: d.womenTournaments,
      Mix: d.mixTournaments,
    },
    B = [
      { value: "all", label: "Все" },
      { value: "kotc", label: "\uD83D\uDC51 KOTC" },
      { value: "thai", label: "\uD83C\uDFF4 THAI" },
      { value: "dt", label: "⚡ Дабл" },
    ],
    G = _ || ("medals" === W && M),
    J = I.trim(),
    Q = "medals" === W ? P.length : K.length,
    X =
      null !=
      (r =
        null == (t = V.find((e) => e.value === o)) ? void 0 : t.fullLabel)
        ? r
        : "Рейтинг",
    Z =
      null !=
      (n =
        null == (s = B.find((e) => e.value === g))
          ? void 0
          : s.label.replace(RegExp("^[^\\p{L}\\p{N}]+", "u"), ""))
        ? n
        : "Все";
  let revealMyPlace = (0, l.useCallback)((e) => {
    T("");
    window.setTimeout(() => {
      var t;
      null == (t = document.getElementById("ranking-player-".concat(e))) ||
        t.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 40);
  }, []);
  return (0, a.jsx)("main", {
    className:
      "mx-auto max-w-[1180px] px-3 pb-28 pt-4 sm:px-4 sm:pb-12 sm:pt-6",
    children: (0, a.jsxs)("section", {
      className:
        "rankings-surface rounded-[28px] border border-white/6 bg-[#0b0b0b] p-3 shadow-[0_30px_90px_rgba(0,0,0,0.38)] sm:rounded-[40px] sm:p-6",
      children: [
        (0, a.jsxs)("header", {
          className:
            "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
          children: [
            (0, a.jsxs)("div", {
              className: "text-left",
              children: [
                (0, a.jsx)("div", {
                  className:
                    "font-heading text-[42px] leading-none text-[#ff5a00] sm:text-[68px]",
                  children: "\uD83D\uDD25 РЕЙТИНГ",
                }),
                (0, a.jsx)("h1", {
                  className:
                    "mt-2 text-[28px] font-black uppercase leading-[0.96] tracking-[-0.04em] text-white sm:mt-3 sm:text-[52px]",
                  children: "Лютых игроков",
                }),
                (0, a.jsx)("p", {
                  className:
                    "mt-2 max-w-2xl text-sm text-white/45 sm:mt-3 sm:text-lg",
                  children:
                    "Итоговые места, рейтинговые зоны и статистика турниров",
                }),
              ],
            }),
            (0, a.jsxs)("div", {
              className:
                "flex flex-wrap items-center gap-2 self-start sm:self-auto sm:justify-end",
              children: [
                (0, a.jsx)(RankingsGuide, {}),
                (0, a.jsx)("div", {
                  className:
                    "rounded-full border border-white/6 bg-[#141414] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60 sm:px-4 sm:text-xs",
                  children: "Обновляется после завершения турнира",
                }),
              ],
            }),
          ],
        }),
        (0, a.jsxs)("div", {
          className: "mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-4 sm:gap-3",
          "aria-describedby": "rankings-counts-note",
          children: [
            (0, a.jsx)(u, {
              value: d.men,
              label: "Мужчины",
              accent: "text-[#ff6a00]",
            }),
            (0, a.jsx)(u, {
              value: d.women,
              label: "Женщины",
              accent: "text-[#ff5bb7]",
            }),
            (0, a.jsx)(u, {
              value: d.mix,
              label: "Микст",
              accent: "text-[#26c6ff]",
            }),
            (0, a.jsx)(u, {
              value: d.total,
              label: "Всего",
              accent: "text-[#ffd400]",
              outlined: !0,
            }),
          ],
        }),
        (0, a.jsx)("p", {
          id: "rankings-counts-note",
          className:
            "mt-2 px-1 text-[11px] leading-relaxed text-white/60 sm:mt-3 sm:text-xs",
          children:
            "«Всего» — число уникальных игроков. Разделы пересекаются: один игрок может играть в нескольких категориях.",
        }),
        (0, a.jsxs)("div", {
          className:
            "mt-5 rounded-[22px] border border-white/6 bg-[#141414] p-2.5 sm:mt-6 sm:rounded-[28px] sm:p-4",
          children: [
            (0, a.jsx)("div", {
              className:
                "mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60 sm:text-xs",
              children: "Раздел рейтинга",
            }),
            (0, a.jsx)("div", {
              className: "grid grid-cols-3 gap-2 sm:gap-3",
              "aria-label": "Выберите раздел рейтинга",
              children: V.map((e) =>
                (0, a.jsxs)(
                  p,
                  {
                    active: o === e.value,
                    ariaLabel: ""
                      .concat(e.fullLabel, ": ")
                      .concat(m(Y[e.value]), ", ")
                      .concat(x(e.count)),
                    onClick: () => {
                      h(e.value), k("all");
                    },
                    children: [
                      (0, a.jsx)("span", {
                        className: "sm:hidden",
                        children: "".concat(e.shortLabel, " · ").concat(e.count),
                      }),
                      (0, a.jsx)("span", {
                        className: "hidden sm:block",
                        children: e.label,
                      }),
                      (0, a.jsxs)("span", {
                        className:
                          "hidden text-[10px] font-medium normal-case tracking-normal text-white/75 sm:block sm:text-[11px]",
                        children: [m(Y[e.value]), " \xb7 ", x(e.count)],
                      }),
                    ],
                  },
                  e.value,
                ),
              ),
            }),
          ],
        }),
        (0, a.jsxs)("div", {
          className: "mt-4",
          children: [
            (0, a.jsx)("div", {
              className:
                "mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60 sm:text-xs",
              children: "Формат турнира",
            }),
            (0, a.jsx)("div", {
              className:
                "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              "aria-label": "Фильтр по формату турнира",
              children: B.map((e) =>
                (0, a.jsx)(
                  b,
                  {
                    active: g === e.value,
                    onClick: () => k(e.value),
                    children: e.label,
                  },
                  e.value,
                ),
              ),
            }),
          ],
        }),
        (0, a.jsxs)("div", {
          className: "mt-4",
          children: [
            (0, a.jsx)("div", {
              className:
                "mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60 sm:text-xs",
              children: "Порядок списка",
            }),
            (0, a.jsx)("div", {
              className: "grid grid-cols-2 gap-2 sm:grid-cols-4",
              children: [
                { value: "pts", label: "РЕЙТИНГ", icon: "⚡" },
                { value: "avg", label: "СР. БАЛЛ", icon: "\uD83D\uDCCA" },
                { value: "trn", label: "ТУРНИРЫ", icon: "\uD83C\uDFC6" },
                {
                  value: "medals",
                  label: "МЕДАЛИ",
                  icon: "\uD83C\uDF96",
                },
              ].map((e) =>
                (0, a.jsx)(
                  f,
                  {
                    active: W === e.value,
                    onClick: () => U(e.value),
                    icon: e.icon,
                    label: e.label,
                  },
                  e.value,
                ),
              ),
            }),
          ],
        }),
        (0, a.jsxs)("div", {
          className: "mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]",
          children: [
            (0, a.jsxs)("label", {
              className:
                "flex min-h-14 items-center gap-3 rounded-[20px] border border-white/6 bg-[#141414] px-4 focus-within:border-[#26c6ff]/55 sm:rounded-[24px]",
              children: [
                (0, a.jsx)("span", {
                  className: "sr-only",
                  children: "Найти игрока по имени",
                }),
                (0, a.jsx)("span", {
                  "aria-hidden": "true",
                  className: "text-2xl text-white/28",
                  children: "⌕",
                }),
                (0, a.jsx)("input", {
                  type: "search",
                  "aria-label": "Найти игрока по имени",
                  value: I,
                  onChange: (e) => T(e.target.value),
                  placeholder: "Найти себя или игрока",
                  className:
                    "min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/28 sm:text-lg",
                }),
                I
                  ? (0, a.jsx)("button", {
                      type: "button",
                      onClick: () => T(""),
                      "aria-label": "Очистить поиск",
                      className:
                        "rounded-full border border-white/6 px-3 py-1.5 text-xs font-bold text-white/55 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff]",
                      children: "Сбросить",
                    })
                  : null,
              ],
            }),
            (0, a.jsxs)("details", {
              className:
                "rounded-[20px] border border-white/6 bg-[#141414] px-4 py-3 text-sm text-white/65 lg:max-w-[320px]",
              children: [
                (0, a.jsx)("summary", {
                  className:
                    "cursor-pointer font-semibold text-white/78 focus-visible:outline-none",
                  children: "Как читать рейтинг",
                }),
                (0, a.jsx)("p", {
                  className: "mt-2 leading-relaxed",
                  children:
                    "Очки начисляются за итоговое место. \xabСр. балл\xbb — очки за один турнир, зона — лучший сыгранный уровень.",
                }),
              ],
            }),
          ],
        }),
        "medals" === W
          ? null
          : (0, a.jsx)(RankingsMyPlace, {
              entries: y,
              categoryLabel: X,
              onPlayerResolved: setMyPlayerId,
              onReveal: revealMyPlace,
            }),
        (0, a.jsxs)("div", {
          className:
            "mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/6 pb-3 text-xs text-white/60",
          "aria-live": "polite",
          children: [
            (0, a.jsxs)("span", { children: [X, " \xb7 ", Z] }),
            (0, a.jsx)("span", {
              children: G
                ? "Обновляем данные…"
                : "".concat(x(Q)).concat(J ? " найдено" : ""),
            }),
          ],
        }),
        G || H || "medals" === W || J
          ? null
          : (0, a.jsx)(v, { entries: q, sort: W }),
        (0, a.jsxs)("section", {
          className: "mt-4 sm:mt-6",
          "aria-labelledby": "rankings-list-title",
          "aria-busy": G,
          children: [
            (0, a.jsxs)("div", {
              className:
                "mb-3 flex items-end justify-between gap-3 sm:mb-4",
              children: [
                (0, a.jsxs)("div", {
                  children: [
                    (0, a.jsx)("h2", {
                      id: "rankings-list-title",
                      className:
                        "text-base font-black uppercase tracking-[0.08em] text-white sm:text-lg",
                      children:
                        "medals" === W
                          ? "Медальный зачёт"
                          : J
                            ? "Результаты поиска"
                            : "Полный рейтинг",
                    }),
                    J
                      ? (0, a.jsxs)("p", {
                          className: "mt-1 text-xs text-white/60",
                          children: ["По запросу \xab", J, "\xbb"],
                        })
                      : null,
                  ],
                }),
                G || H
                  ? null
                  : (0, a.jsx)("span", {
                      className: "shrink-0 text-xs text-white/60",
                      children: x(Q),
                    }),
              ],
            }),
            G
              ? (0, a.jsx)(N, {})
              : H
                ? (0, a.jsxs)("div", {
                    role: "alert",
                    className:
                      "rounded-[24px] border border-[#ff4d43]/35 bg-[#2d1111] px-5 py-8 text-center",
                    children: [
                      (0, a.jsx)("div", {
                        className: "text-base font-bold text-[#ff4d43]",
                        children: "Данные временно недоступны",
                      }),
                      (0, a.jsx)("p", {
                        className:
                          "mx-auto mt-2 max-w-lg text-sm text-white/55",
                        children: H,
                      }),
                      (0, a.jsx)("button", {
                        type: "button",
                        onClick: () => {
                          O(""), S(null), R((e) => e + 1);
                        },
                        className:
                          "mt-4 rounded-full border border-[#ff4d43]/45 px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#ff4d43] transition hover:bg-[#2d1111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff]",
                        children: "Попробовать снова",
                      }),
                    ],
                  })
                : (0, a.jsx)("div", {
                    className: "space-y-3",
                    children:
                      "medals" === W
                        ? P.length
                          ? P.map((e) =>
                              (0, a.jsx)(j, { entry: e }, e.playerId),
                            )
                          : (0, a.jsx)("div", {
                              className:
                                "rounded-[24px] border border-white/6 bg-[#141414] px-5 py-10 text-center text-white/45",
                              children: J
                                ? "Игрок с таким именем не найден"
                                : "В этом разделе пока нет медалей",
                            })
                        : K.length
                          ? K.map((e) =>
                              (0, a.jsx)(
                                w,
                                {
                                  entry: e,
                                  sort: W,
                                  isMe: e.playerId === myPlayerId,
                                },
                                e.playerId,
                              ),
                            )
                          : (0, a.jsx)("div", {
                              className:
                                "rounded-[24px] border border-white/6 bg-[#141414] px-5 py-10 text-center text-white/45",
                              children: J
                                ? "Игрок с таким именем не найден"
                                : "В этом разделе пока нет результатов",
                            }),
                  }),
          ],
        }),
      ],
    }),
  });
}

export default k;
