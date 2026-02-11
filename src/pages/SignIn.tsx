import { useState } from 'react'
import { FiEye, FiEyeOff, FiLock, FiMail } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'

export default function SignIn() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    const message = await signIn(email, password)
    if (message) setError(message)
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-soft backdrop-blur">
        <div className="mb-5">
          <p className="text-xs font-semibold text-indigo-300">Welcome back</p>
          <h1 className="text-2xl font-semibold text-white">Sign in</h1>
          <p className="mt-2 text-xs text-slate-400">
            Access your profile workspace and keep your resume details fresh.
          </p>
        </div>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block text-xs font-medium text-slate-300">
            Email <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] focus-within:border-indigo-400">
              <FiMail className="text-indigo-300" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
                required
              />
            </div>
          </label>
          <label className="block text-xs font-medium text-slate-300">
            Password <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] focus-within:border-indigo-400">
              <FiLock className="text-indigo-300" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-slate-400 transition hover:text-white"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500/80 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            {loading ? (
              <>
                <LoadingSpinner label="Signing in" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-400">
          New here?{' '}
          <Link to="/signup" className="font-semibold text-indigo-300">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
