import { useTournamentsStore } from '../store/tournaments'
import TournamentCard from '../components/TournamentCard'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function Profile() {
  const { tournaments, currentUser } = useTournamentsStore()
  const navigate = useNavigate()

  const myTournaments = tournaments.filter((t) =>
    t.players.some((p) => p.name === currentUser),
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto pb-24 p-4"
    >
      <header className="mb-8 pt-6">
        <h1 className="text-4xl font-black">👤 Мой профиль</h1>
        <p className="text-zinc-400 mt-2">
          Вы вошли как <span className="text-white font-bold">{currentUser}</span>
        </p>
      </header>

      <h2 className="text-2xl font-bold mb-5 border-b border-white/10 pb-4">Мои турниры</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {myTournaments.length === 0 ? (
          <div className="col-span-full text-center py-16 opacity-50 bg-zinc-900 rounded-3xl">
            <div className="text-5xl mb-3">🏖️</div>
            <p className="text-lg font-semibold">Вы пока не записаны ни на один турнир</p>
          </div>
        ) : (
          myTournaments.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              onClick={() => navigate(`/tournament/${t.id}`)}
            />
          ))
        )}
      </div>
    </motion.div>
  )
}
