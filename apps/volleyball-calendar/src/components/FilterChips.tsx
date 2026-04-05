import { motion } from 'framer-motion'

interface Option {
  label: string
  value: string
}

interface FilterChipsProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
}

export default function FilterChips({ options, value, onChange }: FilterChipsProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <motion.button
            key={opt.value}
            whileTap={{ scale: 0.93 }}
            onClick={() => onChange(opt.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors select-none ${
              active
                ? 'bg-white text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {opt.label}
          </motion.button>
        )
      })}
    </div>
  )
}
