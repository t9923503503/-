import { motion } from 'framer-motion'
import { Tournament } from '../types'

const CATEGORY_COLOR: Record<Tournament['category'], string> = {
  mix: 'bg-purple-500',
  men: 'bg-blue-500',
  women: 'bg-pink-500',
}

const CATEGORY_LABEL: Record<Tournament['category'], string> = {
  mix: 'Микст',
  men: 'Мужчины',
  women: 'Женщины',
}

const ENTRY_LABEL: Record<Tournament['entryType'], string> = {
  individual: '👤 Соло',
  team: '👥 Парами',
}

const LEVEL_COLOR: Record<Tournament['level'], string> = {
  Beginner: 'text-green-400 bg-green-400/10',
  Medium: 'text-yellow-400 bg-yellow-400/10',
  Pro: 'text-red-400 bg-red-400/10',
}

interface Props {
  tournament: Tournament
  onClick: () => void
}

export default function TournamentCard({ tournament: t, onClick }: Props) {
  const pct = Math.round((t.slots.taken / t.slots.total) * 100)
  const isFull = t.slots.taken >= t.slots.total

  const share = (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `${window.location.origin}/tournament/${t.id}`
    if (navigator.share) {
      navigator.share({ title: t.format, text: `Турнир: ${t.format}`, url })
    } else {
      navigator.clipboard.writeText(url)
      alert('Ссылка скопирована 📋')
    }
  }

  const dateStr = new Date(t.startTs).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative bg-zinc-900 rounded-2xl overflow-hidden cursor-pointer border border-white/5 hover:border-white/15 transition-colors group"
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${CATEGORY_COLOR[t.category]}`} />

      <div className="pl-5 pr-4 pt-4 pb-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-lg font-bold leading-tight group-hover:text-white transition-colors">
            {t.format}
          </h3>
          <button
            onClick={share}
            className="text-zinc-500 hover:text-zinc-300 active:scale-90 transition-all p-1 -mr-1 -mt-1 shrink-0"
            aria-label="Поделиться"
          >
            📤
          </button>
        </div>

        <p className="text-sm text-zinc-400 mb-3">{dateStr}</p>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${LEVEL_COLOR[t.level]}`}>
            {t.level}
          </span>
          <span className="text-xs font-semibold px-2 py-1 rounded-full text-zinc-400 bg-zinc-800">
            {CATEGORY_LABEL[t.category]}
          </span>
          <span className="text-xs font-semibold px-2 py-1 rounded-full text-zinc-400 bg-zinc-800">
            {ENTRY_LABEL[t.entryType]}
          </span>
          <span className="text-xs font-semibold px-2 py-1 rounded-full text-emerald-400 bg-emerald-400/10">
            {t.price.toLocaleString('ru-RU')} ₽
          </span>
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>Мест занято</span>
            {isFull ? (
              <span className="text-red-400 font-semibold">Мест нет</span>
            ) : (
              <span>
                {t.slots.taken} / {t.slots.total}
              </span>
            )}
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isFull ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onClick}
          className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-sm font-semibold rounded-xl transition-colors"
        >
          Перейти →
        </motion.button>
      </div>
    </motion.div>
  )
}
