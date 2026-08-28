import Link from 'next/link';

export default function PlayFinishAndResultButton({ postId, compact = false }: { postId: string; compact?: boolean }) {
  return (
    <Link
      href={`/partner/${postId}/live`}
      className={compact
        ? 'inline-flex min-h-10 items-center justify-center rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white'
        : 'inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-black text-white shadow-lg shadow-orange-950/20'}
    >
      Провести игру
    </Link>
  );
}
