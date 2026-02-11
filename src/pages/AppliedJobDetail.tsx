import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FiBriefcase, FiCopy, FiFileText, FiUser } from 'react-icons/fi'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import type { AppliedJob } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'

type AppliedJobRow = AppliedJob & {
  profiles?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
  } | null
}

const formatDate = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AppliedJobDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [entry, setEntry] = useState<AppliedJobRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  const handleCopyJD = async (text: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1500)
    } catch {
      setCopyStatus('error')
      window.setTimeout(() => setCopyStatus('idle'), 1500)
    }
  }

  const fetchEntry = useCallback(async () => {
    if (!id) {
      setError('Missing application id.')
      return
    }
    setLoading(true)
    setError(null)
    let query = supabase
      .from('applied_jobs')
      .select('id, profile_id, company_name, job_title, job_description, resume_name, cover_letter_name, skills, created_at, profiles(first_name,last_name,email)')
      .eq('id', id)

    if (profile?.role !== 'admin') {
      query = query.eq('profile_id', profile?.id ?? '')
    }

    const { data, error: fetchError } = await query.single()
    if (fetchError) {
      setError(fetchError.message)
      setEntry(null)
    } else {
      setEntry((data as AppliedJobRow) ?? null)
    }
    setLoading(false)
  }, [id, profile?.id, profile?.role])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEntry()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchEntry])

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-300">Applied job details</p>
          <h1 className="text-2xl font-semibold text-white">Application details</h1>
        </div>
        <Link
          to="/applied-history"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200"
        >
          Back to history
        </Link>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-soft backdrop-blur">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <LoadingSpinner label="Loading application" className="border-slate-400/40 border-t-slate-400" />
            Loading application...
          </div>
        ) : error ? (
          <p className="text-xs text-rose-400">{error}</p>
        ) : !entry ? (
          <p className="text-xs text-slate-400">Application not found.</p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  {entry.job_title || 'Role'}
                  {entry.company_name ? ` · ${entry.company_name}` : ''}
                </p>
                <p className="mt-1 text-xs text-slate-400">Applied {formatDate(entry.created_at)}</p>
              </div>
              {profile?.role === 'admin' && (
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                  <FiUser className="text-indigo-200" />
                  {[entry.profiles?.first_name, entry.profiles?.last_name]
                    .filter(Boolean)
                    .join(' ') || entry.profiles?.email || 'Unknown user'}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <FiFileText className="text-indigo-200" />
                <span className="font-semibold">Resume:</span>
                <span>{entry.resume_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <FiFileText className="text-emerald-200" />
                <span className="font-semibold">Cover letter:</span>
                <span>{entry.cover_letter_name}</span>
              </div>
            </div>

            {entry.skills && entry.skills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {entry.skills.map((skill) => (
                  <span
                    key={`${entry.id}-${skill}`}
                    className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-xs text-slate-300">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <FiBriefcase className="text-indigo-200" /> Job description
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyJD(entry.job_description)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200"
                >
                  <FiCopy />
                  {copyStatus === 'copied'
                    ? 'Copied'
                    : copyStatus === 'error'
                      ? 'Copy failed'
                      : 'Copy JD'}
                </button>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed text-slate-200">
                {entry.job_description}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
