import { createBrowserRouter } from 'react-router-dom'
import App from './App'
import Calendar from './pages/Calendar'
import TournamentPage from './pages/Tournament'
import CreateTournament from './pages/CreateTournament'
import Profile from './pages/Profile'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Calendar /> },
      { path: 'create', element: <CreateTournament /> },
      { path: 'profile', element: <Profile /> },
      { path: 'tournament/:id', element: <TournamentPage /> },
    ],
  },
])
