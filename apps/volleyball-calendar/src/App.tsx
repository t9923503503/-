import { Outlet, NavLink } from 'react-router-dom'

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 pb-20">
      <Outlet />

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-lg border-t border-white/10 z-50">
        <div className="max-w-md mx-auto flex justify-between items-center px-8 py-2 relative">

          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 transition-all ${
                isActive ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
              }`
            }
          >
            <span className="text-2xl">📅</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Календарь</span>
          </NavLink>

          <NavLink
            to="/create"
            className={({ isActive }) =>
              `absolute left-1/2 -translate-x-1/2 -top-6 flex items-center justify-center w-14 h-14 rounded-full transition-all shadow-lg ${
                isActive
                  ? 'bg-emerald-400 shadow-emerald-400/50 scale-110'
                  : 'bg-emerald-600 shadow-emerald-600/30 hover:scale-105 active:scale-95'
              }`
            }
          >
            <span className="text-3xl text-white mb-1">+</span>
          </NavLink>

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 transition-all ${
                isActive ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
              }`
            }
          >
            <span className="text-2xl">👤</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Профиль</span>
          </NavLink>

        </div>
      </nav>
    </div>
  )
}
