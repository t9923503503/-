import PlayerPhoto from '@/components/ui/PlayerPhoto';

export default function CoachAvatar({ name, photoUrl, size = 'md' }: { name: string; photoUrl: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizing = size === 'lg' ? 'h-20 w-20 text-2xl' : size === 'sm' ? 'h-10 w-10 text-sm' : 'h-12 w-12 text-base';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'LP';
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-cyan-400/25 bg-cyan-400/10 font-black text-cyan-200 ${sizing}`}>
      {photoUrl ? <PlayerPhoto photoUrl={photoUrl} alt={name} width={80} height={80} className="h-full w-full object-cover" /> : initials}
    </span>
  );
}
