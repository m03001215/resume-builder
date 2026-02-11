import { FiStar } from 'react-icons/fi'
import { useAuth } from '../hooks/useAuth'

export default function Home() {
  const { profile } = useAuth()

  if (profile && !profile.approved_status && profile.role !== 'admin') {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="max-w-md rounded-3xl border border-amber-400/30 bg-amber-500/10 px-10 py-12 text-center shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            Approval pending
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Your account is awaiting approval</h2>
          <p className="mt-3 text-sm text-amber-100/80">
            You can’t access the dashboard until an admin approves your account. Please check back soon.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 px-12 py-16 text-center shadow-soft backdrop-blur">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40">
          <FiStar className="text-xl" />
        </div>
        <p className="mt-4 text-sm font-semibold text-indigo-300">Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold">
          <span className="bg-gradient-to-r from-indigo-200 via-sky-200 to-emerald-200 bg-clip-text text-transparent">
            AI Resume Hub
          </span>
        </h1>
        <p className="mt-4 text-sm text-slate-400">
          Your approved profile is ready for resume building.
        </p>
      </div>
    </div>
  )
}
