import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tournament, PlayerEntry } from '../types'

interface Props {
  tournament: Tournament
  isOpen: boolean
  onClose: () => void
  onConfirm: (entry: PlayerEntry) => void
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 1) return `+7`
  if (digits.length <= 4) return `+7 (${digits.slice(1)}`
  if (digits.length <= 7) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4)}`
  if (digits.length <= 9) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
}

export default function RegistrationModal({ tournament, isOpen, onClose, onConfirm }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [partner, setPartner] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isTeam = tournament.entryType === 'team'

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Введите ФИО'
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 11) e.phone = 'Введите полный номер телефона'
    if (isTeam && !partner.trim()) e.partner = 'Введите ФИО напарника'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleConfirm = () => {
    if (!validate()) return
    onConfirm({
      name: name.trim(),
      phone,
      partnerName: isTeam ? partner.trim() : undefined,
    })
    setName('')
    setPhone('')
    setPartner('')
    setErrors({})
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value))
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] p-8 border-t sm:border border-white/10"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-black">Регистрация</h2>
                <p className="text-zinc-500 text-sm mt-0.5">{tournament.format}</p>
              </div>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-white transition-colors text-2xl w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">
                  {isTeam ? 'Игрок 1 — ваше ФИО' : 'Ваше ФИО'}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иванов Иван Иванович"
                  className={`w-full bg-zinc-800 p-4 rounded-2xl border mt-1 outline-none transition-colors ${
                    errors.name ? 'border-red-500' : 'border-white/5 focus:border-emerald-500'
                  }`}
                />
                {errors.name && <p className="text-red-400 text-xs mt-1 ml-1">{errors.name}</p>}
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">
                  Телефон для связи
                </label>
                <input
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="+7 (___) ___-__-__"
                  inputMode="tel"
                  className={`w-full bg-zinc-800 p-4 rounded-2xl border mt-1 outline-none transition-colors ${
                    errors.phone ? 'border-red-500' : 'border-white/5 focus:border-emerald-500'
                  }`}
                />
                {errors.phone && <p className="text-red-400 text-xs mt-1 ml-1">{errors.phone}</p>}
              </div>

              {isTeam && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">
                    Игрок 2 — ФИО напарника
                  </label>
                  <input
                    value={partner}
                    onChange={(e) => setPartner(e.target.value)}
                    placeholder="Петров Пётр Петрович"
                    className={`w-full bg-zinc-800 p-4 rounded-2xl border mt-1 outline-none transition-colors ${
                      errors.partner ? 'border-red-500' : 'border-white/5 focus:border-emerald-500'
                    }`}
                  />
                  {errors.partner && (
                    <p className="text-red-400 text-xs mt-1 ml-1">{errors.partner}</p>
                  )}
                </div>
              )}

              <p className="text-xs text-zinc-500 pt-2">
                Нажимая кнопку, вы соглашаетесь с регламентом турнира «{tournament.format}».
              </p>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleConfirm}
                className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 transition-colors text-white font-black text-xl rounded-2xl shadow-xl shadow-emerald-900/20"
              >
                Подтвердить запись 🔥
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
