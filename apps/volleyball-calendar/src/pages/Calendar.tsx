import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTournamentsStore } from '../store/tournaments'
import FilterChips from '../components/FilterChips'
import TournamentCard from '../components/TournamentCard'

const CATEGORY_OPTIONS = [
  { label: 'Все', value: 'all' },
  { label: 'Микст', value: 'mix' },
  { label: 'Мужчины', value: 'men' },
  { label: 'Женщины', value: 'women' },
]

const ENTRY_OPTIONS = [
  { label: 'Любой формат', value: 'all' },
  { label: '👤 Соло', value: 'individual' },
  { label: '👥 Парами', value: 'team' },
]

export default function Calendar() {
  const navigate = useNavigate()
  const { tournaments, filters, setFilters } = useTournamentsStore()

  const filtered = useMemo(() => {
    return tournaments.filter((t) => {
      if (!filters.showPast && t.status === 'past') return false
      if (filters.showPast && t.status !== 'past') return false
      if (filters.category !== 'all' && t.category !== filters.category) return false
      if (filters.entry !== 'all' && t.entryType !== filters.entry) return false
      return true
    })
  }, [tournaments, filters])

  return (
    <div className="max-w-5xl mx-auto p-4 pb-8">
      <header className="pt-6 pb-5">
        <h1 className="text-3xl font-black mb-1">🏐 Турниры</h1>
        <p className="text-zinc-500 text-sm mb-5">Пляжный волейбол — Сургут</p>

        <div className="flex gap-2 mb-5">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setFilters({ showPast: false })}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
              !filters.showPast
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            Ближайшие
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setFilters({ showPast: true })}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
              filters.showPast
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            Архив
          </motion.button>
        </div>

        <div className="flex flex-col gap-3">
          <FilterChips
            options={CATEGORY_OPTIONS}
            value={filters.category}
            onChange={(v) => setFilters({ category: v })}
          />
          <FilterChips
            options={ENTRY_OPTIONS}
            value={filters.entry}
            onChange={(v) => setFilters({ entry: v })}
          />
        </div>
      </header>

      <motion.div
        layout
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="col-span-full flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="text-6xl mb-4">🏖️</div>
              <h2 className="text-xl font-bold text-zinc-300 mb-2">
                {filters.showPast ? 'Архив пуст' : 'Нет турниров'}
              </h2>
              <p className="text-zinc-500 text-sm">
                {filters.showPast
                  ? 'Прошедших турниров с такими фильтрами нет'
                  : 'Попробуй изменить фильтры или создай свой турнир'}
              </p>
            </motion.div>
          ) : (
            filtered.map((t) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                onClick={() => navigate(`/tournament/${t.id}`)}
              />
            ))
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
