import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function RequireAuth({ children }: { children: ReactElement }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/signin" replace />
  return children
}

export function RequireApproved({ children }: { children: ReactElement }) {
  const { session, profile, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/signin" replace />
  if (!profile)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Setting up your profile...
      </div>
    )
  if (!profile.approved_status && profile.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-3xl border border-amber-400/30 bg-amber-500/10 p-6 text-center text-sm text-amber-100 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            Approval pending
          </p>
          <h2 className="mt-3 text-xl font-semibold text-white">Your account is awaiting approval</h2>
          <p className="mt-2 text-sm text-amber-100/80">
            You can’t access this page until an admin approves your account. Please check back soon.
          </p>
        </div>
      </div>
    )
  }
  return children
}

export function RequireAdmin({ children }: { children: ReactElement }) {
  const { session, profile, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/signin" replace />
  if (!profile)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Setting up your admin profile...
      </div>
    )
  if (profile.role !== 'admin') return <Navigate to="/" replace />
  return children
}

export function PublicOnly({ children }: { children: ReactElement }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <Navigate to="/" replace />
  return children
}
