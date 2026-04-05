import { useParams, useNavigate } from 'react-router-dom'
import { useTournamentsStore } from '../store/tournaments'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import RegistrationModal from '../components/RegistrationModal'
import { PlayerEntry } from '../types'

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const t = useTournamentsStore((state) => state.tournaments.find((tour) => tour.id === id))
  const { currentUser, joinTournament, leaveTournament } = useTournamentsStore()

  const [showModal, setShowModal] = useState(false)

  if (!t)
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center min-h-[80vh] text-center px-6"
      >
        <div className="text-7xl mb-6">🔍</div>
        <h2 className="text-3xl font-black">Турнир не найден</h2>
        <p className="text-zinc-500 mt-3 mb-8">Возможно, он был удалён или ссылка устарела</p>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/')}
          className="px-8 py-3 bg-white text-zinc-900 font-bold rounded-full"
        >
          ← В календарь
        </motion.button>
      </motion.div>
    )

  const share = () => {
    if (navigator.share) {
      navigator.share({ title: t.format, text: `Присоединяйся! ${t.format}`, url: location.href })
    } else {
      navigator.clipboard.writeText(location.href)
      alert('Ссылка скопирована 📋')
    }
  }

  const isFull = t.slots.taken >= t.slots.total
  const isAlreadyJoined = t.players.some((p) => p.name === currentUser)
  const isPast = t.status === 'past'

  const handleConfirm = (entry: PlayerEntry) => {
    joinTournament(t.id, entry)
    setShowModal(false)
  }

  const dateStr = new Date(t.startTs).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl mx-auto p-6 pb-28"
      >
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-4"
        >
          ← Назад
        </button>

        <h1 className="text-4xl font-black mt-2">{t.format}</h1>

        <div className="flex flex-wrap items-center gap-3 mt-3 mb-2">
          <span className="text-zinc-400 text-sm">{dateStr}</span>
          <span className="bg-zinc-800 text-zinc-300 text-xs font-semibold px-2 py-1 rounded-full">
            {t.level}
          </span>
          <span className="bg-zinc-800 text-zinc-300 text-xs font-semibold px-2 py-1 rounded-full">
            {t.price.toLocaleString('ru-RU')} ₽
          </span>
        </div>

        <button
          onClick={share}
          className="mt-2 text-emerald-400 hover:text-emerald-300 text-sm transition-colors"
        >
          📤 Поделиться с друзьями
        </button>

        <div className="my-8 bg-zinc-900 p-6 rounded-3xl">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-xl font-bold">Участники</h3>
            <span className="text-sm bg-zinc-800 px-3 py-1 rounded-full text-zinc-300">
              {t.slots.taken} / {t.slots.total}
            </span>
          </div>

          {t.players.length > 0 ? (
            <ul className="space-y-3">
              <AnimatePresence>
                {t.players.map((player) => (
                  <motion.li
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: 20 }}
                    key={player.name}
                    className="flex items-center justify-between p-3 bg-zinc-950/50 rounded-2xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-tr from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center font-bold text-zinc-900 shrink-0">
                        {player.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium leading-tight">
                          {player.name}
                          {player.name === currentUser && (
                            <span className="text-xs text-emerald-400 ml-2">(Вы)</span>
                          )}
                        </p>
                        {player.partnerName && (
                          <p className="text-xs text-zinc-500 mt-0.5">+ {player.partnerName}</p>
                        )}
                      </div>
                    </div>

                    {player.name === currentUser && !isPast && (
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => leaveTournament(t.id, player.name)}
                        className="text-zinc-600 hover:text-red-400 transition-colors p-2"
                        aria-label="Отменить запись"
                      >
                        ❌
                      </motion.button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="text-center text-zinc-500 py-6">Пока никого нет. Будь первым! 🏐</p>
          )}
        </div>

        {!isPast && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => !isAlreadyJoined && !isFull && setShowModal(true)}
            disabled={isAlreadyJoined || isFull}
            className={`w-full py-5 text-lg font-bold rounded-2xl transition-all ${
              isAlreadyJoined
                ? 'bg-emerald-900/30 text-emerald-400 cursor-default'
                : isFull
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {isAlreadyJoined ? '✅ Вы записаны' : isFull ? 'Мест нет ❌' : 'Записаться 🔥'}
          </motion.button>
        )}

        {isAlreadyJoined && !isPast && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => leaveTournament(t.id, currentUser)}
            className="w-full py-3 mt-3 text-sm font-semibold rounded-2xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            Отменить запись
          </motion.button>
        )}

        {isPast && (
          <div className="w-full py-4 text-center text-zinc-500 bg-zinc-900 rounded-2xl font-semibold">
            Турнир завершён
          </div>
        )}
      </motion.div>

      <RegistrationModal
        tournament={t}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={handleConfirm}
      />
    </>
  )
}
