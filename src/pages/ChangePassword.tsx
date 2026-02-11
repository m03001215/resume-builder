import { useState } from 'react'
import { FiEye, FiEyeOff, FiLock } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'

export default function ChangePassword() {
  const { changePassword } = useAuth()
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const validatePassword = (value: string) => {
    const lengthOk = value.length >= 8
    const upperOk = /[A-Z]/.test(value)
    const lowerOk = /[a-z]/.test(value)
    const numberOk = /\d/.test(value)
    const symbolOk = /[^A-Za-z0-9]/.test(value)
    return lengthOk && upperOk && lowerOk && numberOk && symbolOk
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.currentPassword) {
      setError('Please enter your current password.')
      return
    }

    if (!validatePassword(form.newPassword)) {
      setError(
        'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.',
      )
      return
    }

    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const message = await changePassword(form.currentPassword, form.newPassword)
    if (message) {
      setError(message)
      setLoading(false)
      return
    }

    setSuccess('Password updated. Use the new password next time you sign in.')
    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-soft backdrop-blur">
        <div className="mb-5">
          <p className="text-xs font-semibold text-indigo-300">Security</p>
          <h1 className="text-2xl font-semibold text-white">Change your password</h1>
          <p className="mt-2 text-xs text-slate-400">
            Enter your current password to confirm it’s you. Then set a strong new password.
          </p>
        </div>
  <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="text-xs font-medium text-slate-300">
            Current password <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] transition focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400/50">
              <FiLock className="text-indigo-300" />
              <input
                type={showCurrent ? 'text' : 'password'}
                name="currentPassword"
                value={form.currentPassword}
                onChange={handleChange}
                placeholder="Enter current password"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                className="text-slate-400 transition hover:text-white"
                aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
              >
                {showCurrent ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </label>
          <label className="text-xs font-medium text-slate-300">
            New password <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] transition focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400/50">
              <FiLock className="text-indigo-300" />
              <input
                type={showNew ? 'text' : 'password'}
                name="newPassword"
                value={form.newPassword}
                onChange={handleChange}
                placeholder="Create a strong password"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                className="text-slate-400 transition hover:text-white"
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
              >
                {showNew ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Use 8+ characters with uppercase, lowercase, number, and symbol.
            </p>
          </label>
          <label className="text-xs font-medium text-slate-300">
            Confirm new password <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] transition focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400/50">
              <FiLock className="text-indigo-300" />
              <input
                type={showConfirm ? 'text' : 'password'}
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="Repeat the new password"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                className="text-slate-400 transition hover:text-white"
                aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
              >
                {showConfirm ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {success && <p className="text-xs text-emerald-400">{success}</p>}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-2xl bg-indigo-500/80 px-6 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <LoadingSpinner label="Updating password" />
                  Updating...
                </>
              ) : (
                'Update password'
              )}
            </button>
            <Link
              to="/profile"
              className="inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold text-indigo-200 transition hover:bg-white/10 hover:text-white"
            >
              Back to profile
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
