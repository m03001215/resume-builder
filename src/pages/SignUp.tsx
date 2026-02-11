import { useState } from 'react'
import { FiBriefcase, FiEye, FiEyeOff, FiLock, FiMail, FiMapPin, FiPhone, FiUser } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'

export default function SignUp() {
  const { signUp } = useAuth()
  const [form, setForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    roleTitle: '',
    location: '',
    email: '',
    password: '',
    confirmPassword: '',
    linkedinUrl: '',
    phoneNumber: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  const validateLinkedIn = (value: string) => {
    if (!value) return true
    try {
      const url = new URL(value)
      return url.hostname.includes('linkedin.com')
    } catch {
      return false
    }
  }

  const validatePassword = (value: string) => {
    const lengthOk = value.length >= 8
    const upperOk = /[A-Z]/.test(value)
    const lowerOk = /[a-z]/.test(value)
    const numberOk = /\d/.test(value)
    const symbolOk = /[^A-Za-z0-9]/.test(value)
    return lengthOk && upperOk && lowerOk && numberOk && symbolOk
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    if (!validateEmail(form.email)) {
      setError('Please enter a valid email address.')
      setLoading(false)
      return
    }
    if (!validatePassword(form.password)) {
      setError(
        'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.',
      )
      setLoading(false)
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      setLoading(false)
      return
    }
    if (!validateLinkedIn(form.linkedinUrl)) {
      setError('LinkedIn URL must be a valid linkedin.com link.')
      setLoading(false)
      return
    }
    if (!form.roleTitle.trim()) {
      setError('Please enter your role.')
      setLoading(false)
      return
    }
    if (!form.location.trim()) {
      setError('Please enter your location.')
      setLoading(false)
      return
    }
    const message = await signUp({
      email: form.email,
      password: form.password,
      firstName: form.firstName,
      middleName: form.middleName || undefined,
      lastName: form.lastName,
      roleTitle: form.roleTitle,
      location: form.location,
      linkedinUrl: form.linkedinUrl || undefined,
      phoneNumber: form.phoneNumber || undefined,
    })
    if (message) setError(message)
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-soft backdrop-blur">
        <div className="mb-5">
          <p className="text-xs font-semibold text-indigo-300">Get started</p>
          <h1 className="text-2xl font-semibold text-white">Create your account</h1>
          <p className="mt-2 text-xs text-slate-400">
            Admin approval is required before accessing the dashboard.
          </p>
        </div>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="text-xs font-medium text-slate-300">
            First name <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] focus-within:border-indigo-400">
              <FiUser className="text-indigo-300" />
              <input
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                placeholder="Jane"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
                required
              />
            </div>
          </label>
          <label className="text-xs font-medium text-slate-300">
            Middle name (optional)
            <input
              name="middleName"
              value={form.middleName}
              onChange={handleChange}
              placeholder="A."
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <label className="text-xs font-medium text-slate-300">
            Last name <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] focus-within:border-indigo-400">
              <FiUser className="text-indigo-300" />
              <input
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                placeholder="Doe"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
                required
              />
            </div>
          </label>
          <label className="text-xs font-medium text-slate-300">
            Role <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] focus-within:border-indigo-400">
              <FiBriefcase className="text-indigo-300" />
              <input
                name="roleTitle"
                value={form.roleTitle}
                onChange={handleChange}
                placeholder="Frontend Developer"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
                required
              />
            </div>
          </label>
          <label className="text-xs font-medium text-slate-300">
            Location <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] focus-within:border-indigo-400">
              <FiMapPin className="text-indigo-300" />
              <input
                name="location"
                value={form.location}
                onChange={handleChange}
                placeholder="New York, NY"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
                required
              />
            </div>
          </label>
          <label className="text-xs font-medium text-slate-300">
            Phone number <span className="text-slate-400">(optional)</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] focus-within:border-indigo-400">
              <FiPhone className="text-indigo-300" />
              <input
                name="phoneNumber"
                value={form.phoneNumber}
                onChange={handleChange}
                placeholder="+1 555 0100"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
              />
            </div>
          </label>
          <label className="text-xs font-medium text-slate-300">
            LinkedIn URL <span className="text-slate-400">(optional)</span>
            <input
              type="url"
              name="linkedinUrl"
              value={form.linkedinUrl}
              onChange={handleChange}
              placeholder="https://www.linkedin.com/in/your-handle"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <label className="text-xs font-medium text-slate-300">
            Email <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] focus-within:border-indigo-400">
              <FiMail className="text-indigo-300" />
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
                required
              />
            </div>
          </label>
          <label className="text-xs font-medium text-slate-300">
            Password <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] focus-within:border-indigo-400">
              <FiLock className="text-indigo-300" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
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
            <p className="mt-2 text-[11px] text-slate-400">
              Use 8+ characters with uppercase, lowercase, number, and symbol.
            </p>
          </label>
          <label className="text-xs font-medium text-slate-300">
            Confirm password <span className="text-red-400">*</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] focus-within:border-indigo-400">
              <FiLock className="text-indigo-300" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full bg-transparent text-[13px] text-slate-100 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="text-slate-400 transition hover:text-white"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </label>
          <div className="md:col-span-2">
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500/80 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              {loading ? (
                <>
                  <LoadingSpinner label="Creating account" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>
          </div>
        </form>
        <p className="mt-5 text-center text-xs text-slate-400">
          Already have an account?{' '}
          <Link to="/signin" className="font-semibold text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
