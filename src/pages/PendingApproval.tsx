import { useState } from 'react'
import { FiClock } from 'react-icons/fi'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'

export default function PendingApproval() {
  const { profile, refreshProfile } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleRefresh = async () => {
    setLoading(true)
    await refreshProfile()
    setLoading(false)
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="max-w-xl rounded-3xl border border-white/10 bg-slate-950/70 px-10 py-12 text-center shadow-soft backdrop-blur">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40">
          <FiClock className="text-xl" />
        </div>
        <p className="text-sm font-semibold text-amber-200">Approval pending</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Hang tight, {profile?.first_name}</h1>
        <p className="mt-4 text-sm text-slate-400">
          An admin needs to approve your account before you can access the dashboard. We'll notify you
          as soon as it happens.
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
        >
          {loading ? (
            <>
              <LoadingSpinner label="Checking status" className="border-slate-200/40 border-t-slate-200" />
              Checking status...
            </>
          ) : (
            'Refresh status'
          )}
        </button>
      </div>
    </div>
  )
}
