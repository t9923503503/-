import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTournamentsStore } from '../store/tournaments'
import { motion } from 'framer-motion'
import { Category, EntryType } from '../types'

export default function CreateTournament() {
  const navigate = useNavigate()
  const addTournament = useTournamentsStore((state) => state.addTournament)

  const [form, setForm] = useState({
    format: 'King of the Court',
    category: 'mix' as Category,
    entryType: 'individual' as EntryType,
    level: 'Medium' as 'Beginner' | 'Medium' | 'Pro',
    date: '',
    time: '19:00',
    price: 1500,
    totalSlots: 12,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.date) return alert('Выберите дату!')

    const startTs = new Date(`${form.date}T${form.time}`).getTime()

    addTournament({
      format: form.format,
      category: form.category,
      entryType: form.entryType,
      level: form.level,
      startTs,
      price: form.price,
      totalSlots: form.totalSlots,
    })

    navigate('/')
    alert('✅ Турнир создан и уже в календаре!')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-xl mx-auto p-6 pb-32"
    >
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-4"
      >
        ← Назад
      </button>
      <h1 className="text-3xl font-black mb-6">Создать турнир 🏖️</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-zinc-400">Название / Формат</span>
          <input
            required
            type="text"
            value={form.format}
            onChange={(e) => setForm({ ...form, format: e.target.value })}
            className="bg-zinc-900 border border-white/10 p-4 rounded-2xl outline-none focus:border-emerald-500 transition-colors"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-zinc-400">Категория</span>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
              className="bg-zinc-900 border border-white/10 p-4 rounded-2xl outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="mix">Микст</option>
              <option value="men">Мужчины</option>
              <option value="women">Женщины</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-zinc-400">Тип заявки</span>
            <select
              value={form.entryType}
              onChange={(e) => setForm({ ...form, entryType: e.target.value as EntryType })}
              className="bg-zinc-900 border border-white/10 p-4 rounded-2xl outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="individual">Соло (индивидуально)</option>
              <option value="team">Парами (команда)</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-zinc-400">Дата</span>
            <input
              required
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="bg-zinc-900 border border-white/10 p-4 rounded-2xl outline-none focus:border-emerald-500 transition-colors [color-scheme:dark]"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-zinc-400">Время</span>
            <input
              required
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              className="bg-zinc-900 border border-white/10 p-4 rounded-2xl outline-none focus:border-emerald-500 transition-colors [color-scheme:dark]"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-zinc-400">Уровень</span>
            <select
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value as 'Beginner' | 'Medium' | 'Pro' })}
              className="bg-zinc-900 border border-white/10 p-4 rounded-2xl outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="Beginner">Beginner (Новички)</option>
              <option value="Medium">Medium (Средний)</option>
              <option value="Pro">Pro (Профи)</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-zinc-400">Всего мест</span>
            <input
              required
              type="number"
              min="2"
              max="64"
              value={form.totalSlots}
              onChange={(e) => setForm({ ...form, totalSlots: Number(e.target.value) })}
              className="bg-zinc-900 border border-white/10 p-4 rounded-2xl outline-none focus:border-emerald-500 transition-colors"
            />
          </label>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-sm text-zinc-400">Цена (₽)</span>
          <input
            required
            type="number"
            step="100"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            className="bg-zinc-900 border border-white/10 p-4 rounded-2xl outline-none focus:border-emerald-500 transition-colors"
          />
        </label>

        <motion.button
          whileTap={{ scale: 0.97 }}
          type="submit"
          className="mt-4 w-full py-5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-500 transition-colors text-lg font-bold rounded-2xl"
        >
          Создать турнир ✅
        </motion.button>
      </form>
    </motion.div>
  )
}
