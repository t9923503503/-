export default function ThaiLiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-dvh bg-[#07070f] text-white"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 12px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {children}
    </div>
  );
}
