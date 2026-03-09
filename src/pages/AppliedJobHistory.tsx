import { useCallback, useEffect, useState } from 'react'
import { FiExternalLink, FiFileText, FiSearch, FiUser } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import type { AppliedJob } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

type AppliedJobRow = AppliedJob & {
  profiles?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
  } | null
}

const truncateFileName = (value: string, max = 48) =>
  value.length > max ? `${value.slice(0, max).trim()}…` : value

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

export default function AppliedJobHistory() {
  const { profile } = useAuth()
  const [entries, setEntries] = useState<AppliedJobRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
  const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const term = search.trim()
    let query = supabase
      .from('applied_jobs')
      .select(
        'id, profile_id, company_name, job_title, job_description, resume_name, cover_letter_name, skills, created_at, profiles(first_name,last_name,email)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to)

    if (profile?.role !== 'admin') {
      query = query.eq('profile_id', profile?.id ?? '')
    }

    if (term) {
      const baseFilters = [
        `company_name.ilike.%${term}%`,
        `job_title.ilike.%${term}%`,
        `job_description.ilike.%${term}%`,
        `resume_name.ilike.%${term}%`,
        `cover_letter_name.ilike.%${term}%`,
      ]

      query = query.or(baseFilters.join(','))
    }

    const { data, error: fetchError, count } = await query
    if (fetchError) {
      setError(fetchError.message)
      toast.error(fetchError.message)
      setEntries([])
    } else {
      const nextTotalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize))
      if (page > nextTotalPages) {
        setPage(nextTotalPages)
        setEntries([])
        setTotalCount(count ?? 0)
        setLoading(false)
        return
      }
      setEntries((data as AppliedJobRow[]) ?? [])
      setTotalCount(count ?? 0)
    }
    setLoading(false)
  }, [page, pageSize, profile?.id, profile?.role, search])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEntries()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchEntries])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value)
    setPage(1)
  }

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(event.target.value))
    setPage(1)
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold text-indigo-300">Applied job history</p>
          <h1 className="text-2xl font-semibold text-white">Applications tracker</h1>
          <p className="mt-2 text-xs text-slate-400">
            Review which resume and cover letter were used per job description.
          </p>
        </div>
        <div className="flex w-full max-w-md items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2">
          <FiSearch className="text-slate-400" />
          <input
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by company, resume name, JD, or username"
            className="w-full bg-transparent text-sm text-slate-100 focus:outline-none"
          />
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <LoadingSpinner label="Loading applications" className="border-slate-400/40 border-t-slate-400" />
            Loading applications...
          </div>
        ) : (
          <div className="space-y-4">
            {error && <p className="text-xs text-rose-400">{error}</p>}
            {entries.length === 0 ? (
              <p className="text-xs text-slate-400">
                {entries.length === 0
                  ? 'No applied jobs saved yet.'
                  : 'No matching applications found.'}
              </p>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto app-scrollbar">
                  <table className="w-full border-separate border-spacing-y-2 text-left text-xs text-slate-200">
                    <thead className="text-[11px] uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Company</th>
                        <th className="px-3 py-2">Resume</th>
                        {profile?.role === 'admin' && <th className="px-3 py-2">User</th>}
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => {
                        const userLabel = [entry.profiles?.first_name, entry.profiles?.last_name]
                          .filter(Boolean)
                          .join(' ')
                        return (
                          <tr key={entry.id} className="rounded-2xl bg-slate-900/60">
                            <td className="px-3 py-3">
                              <div className="text-sm font-semibold text-white">
                                {entry.company_name || 'Company'}
                              </div>
                              <div className="text-xs text-slate-400">
                                Applied {formatDate(entry.created_at)}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-300">
                              <div className="flex items-center gap-2">
                                <FiFileText className="text-indigo-200" />
                                <span title={entry.resume_name}>
                                  {truncateFileName(entry.resume_name)}
                                </span>
                              </div>
                            </td>
                            {profile?.role === 'admin' && (
                              <td className="px-3 py-3 text-slate-300">
                                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                                  <FiUser className="text-indigo-200" />
                                  {userLabel || entry.profiles?.email || 'Unknown user'}
                                </div>
                              </td>
                            )}
                            <td className="px-3 py-3 text-right">
                              <Link
                                to={`/applied-history/${entry.id}`}
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200"
                              >
                                Details <FiExternalLink />
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>Rows per page</span>
                    <select
                      value={pageSize}
                      onChange={handlePageSizeChange}
                      className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs text-slate-100 focus:border-indigo-400 focus:outline-none"
                    >
                      {[10, 25, 50, 100].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    <span>
                      Showing {entries.length} of {totalCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      disabled={page === 1}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span>
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={page >= totalPages}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
