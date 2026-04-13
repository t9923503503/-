'use client';

interface Props {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone: 'danger' | 'success' | 'neutral';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Отмена',
  tone,
  onConfirm,
  onCancel,
}: Props) {
  const confirmColor =
    tone === 'danger'
      ? 'bg-rose-600 active:bg-rose-700'
      : tone === 'success'
        ? 'bg-emerald-600 active:bg-emerald-700'
        : 'bg-slate-600 active:bg-slate-700';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b1222] p-6 text-white shadow-2xl">
        <h2
          className="text-center text-2xl font-bold uppercase tracking-wide"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          {title}
        </h2>
        {message && (
          <p className="mt-3 text-center text-sm text-white/70">{message}</p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[64px] rounded-2xl text-lg font-bold uppercase tracking-wide text-white transition active:scale-[0.98] ${confirmColor}`}
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[56px] rounded-2xl border border-white/15 bg-white/5 text-base font-semibold uppercase tracking-wide text-white/80 transition active:scale-[0.98] active:bg-white/10"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
