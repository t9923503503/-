import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Tournament, PlayerEntry, Category, EntryType } from '../types'

interface TournamentsStore {
  tournaments: Tournament[]
  filters: { category: string; entry: string; showPast: boolean }
  currentUser: string
  setFilters: (f: Partial<TournamentsStore['filters']>) => void
  getById: (id: string) => Tournament | undefined
  joinTournament: (id: string, entry: PlayerEntry) => void
  leaveTournament: (id: string, playerName: string) => void
  addTournament: (t: Omit<Tournament, 'id' | 'slots' | 'status' | 'players'> & { totalSlots: number }) => void
}

export const useTournamentsStore = create<TournamentsStore>()(
  persist(
    (set, get) => ({
      currentUser: 'Иван Волейболист',
      tournaments: [
        {
          id: 't_101',
          category: 'mix' as Category,
          entryType: 'individual' as EntryType,
          format: 'King of the Court',
          level: 'Medium',
          startTs: 1743174000000,
          price: 1500,
          slots: { taken: 2, total: 12 },
          status: 'upcoming',
          players: [
            { name: 'Анна С.', phone: '+7 (999) 111-22-33' },
            { name: 'Олег М.', phone: '+7 (999) 444-55-66' },
          ],
        },
        {
          id: 't_102',
          category: 'men' as Category,
          entryType: 'team' as EntryType,
          format: 'Double Elimination',
          level: 'Pro',
          startTs: Date.now() + 7200000,
          price: 2000,
          slots: { taken: 0, total: 12 },
          status: 'upcoming',
          players: [],
        },
        {
          id: 't_100',
          category: 'women' as Category,
          entryType: 'individual' as EntryType,
          format: 'Олимпийка',
          level: 'Beginner',
          startTs: Date.now() - 86400000 * 10,
          price: 800,
          slots: { taken: 16, total: 16 },
          status: 'past',
          players: [],
        },
      ] as Tournament[],
      filters: { category: 'all', entry: 'all', showPast: false },

      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),

      getById: (id) => get().tournaments.find((t) => t.id === id),

      joinTournament: (id, entry) =>
        set((state) => ({
          tournaments: state.tournaments.map((t) =>
            t.id === id &&
            t.slots.taken < t.slots.total &&
            !t.players.some((p) => p.name === entry.name)
              ? {
                  ...t,
                  slots: { ...t.slots, taken: t.slots.taken + 1 },
                  players: [...t.players, entry],
                }
              : t,
          ),
        })),

      leaveTournament: (id, playerName) =>
        set((state) => ({
          tournaments: state.tournaments.map((t) =>
            t.id === id && t.players.some((p) => p.name === playerName)
              ? {
                  ...t,
                  slots: { ...t.slots, taken: Math.max(0, t.slots.taken - 1) },
                  players: t.players.filter((p) => p.name !== playerName),
                }
              : t,
          ),
        })),

      addTournament: (data) =>
        set((state) => ({
          tournaments: [
            ...state.tournaments,
            {
              id: `t_${Date.now()}`,
              category: data.category,
              entryType: data.entryType,
              format: data.format,
              level: data.level,
              startTs: data.startTs,
              price: data.price,
              slots: { taken: 0, total: data.totalSlots },
              status: 'upcoming',
              players: [],
            },
          ],
        })),
    }),
    { name: 'beach-volley' },
  ),
)
