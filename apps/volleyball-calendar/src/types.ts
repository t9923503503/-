export type Category = 'men' | 'women' | 'mix'
export type EntryType = 'individual' | 'team'

export interface PlayerEntry {
  name: string
  phone: string
  partnerName?: string
}

export interface Tournament {
  id: string
  category: Category
  entryType: EntryType
  format: string
  level: 'Beginner' | 'Medium' | 'Pro'
  startTs: number
  price: number
  slots: { taken: number; total: number }
  status: 'upcoming' | 'past' | 'live'
  players: PlayerEntry[]
}
