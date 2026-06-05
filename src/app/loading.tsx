export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 text-white">
      <div className="absolute top-0 left-0 right-0 h-1 overflow-hidden">
        <div className="loading-bar h-full w-1/3 bg-cyan-400" />
      </div>
      <div className="relative flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent border-white/60" />
        </div>
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Chargement</p>
          <p className="mt-2 text-base font-semibold text-white">Transition en cours...</p>
        </div>
      </div>
    </div>
  )
}
