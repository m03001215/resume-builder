import { useEffect, useMemo, useState } from 'react'
import { FiCheckCircle, FiTrash2, FiUserCheck, FiXCircle } from 'react-icons/fi'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import type { Profile } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'

export default function Admin() {
  const { session } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentUserId = session?.user?.id ?? null

  const fetchProfiles = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setProfiles([])
    } else {
      setError(null)
      setProfiles((data as Profile[]) ?? [])
    }
    setLoading(false)
  }

  const visibleProfiles = useMemo(
    () => profiles.filter((profile) => profile.role !== 'admin'),
    [profiles],
  )
  const selectedCount = useMemo(
    () => Array.from(selectedIds).filter((id) => id !== currentUserId).length,
    [selectedIds, currentUserId],
  )
  const allSelected = useMemo(
    () =>
      visibleProfiles.length > 0 &&
      visibleProfiles.every((profile) => selectedIds.has(profile.id)),
    [visibleProfiles, selectedIds],
  )

  const toggleSelect = (profileId: string) => {
    if (profileId === currentUserId) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(profileId)) {
        next.delete(profileId)
      } else {
        next.add(profileId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(visibleProfiles.map((profile) => profile.id)))
  }

  const updateApproval = async (profileId: string, approved: boolean) => {
    const { error: approveError } = await supabase
      .from('profiles')
      .update({ approved_status: approved })
      .eq('id', profileId)

    if (approveError) {
      setError(approveError.message)
      return
    }
    fetchProfiles()
  }

  const handleDelete = async (ids: string[]) => {
    const safeIds = ids.filter((id) => id !== currentUserId)
    if (safeIds.length === 0) return
    const confirm = window.confirm(
      'Delete selected users? This removes their profile, company, and education data.',
    )
    if (!confirm) return

    const { error: educationDeleteError } = await supabase
      .from('educations')
      .delete()
      .in('profile_id', safeIds)

    if (educationDeleteError) {
      setError(educationDeleteError.message)
      return
    }

    const { error: companyDeleteError } = await supabase
      .from('companies')
      .delete()
      .in('profile_id', safeIds)

    if (companyDeleteError) {
      setError(companyDeleteError.message)
      return
    }

    const { error: deleteError } = await supabase
      .from('profiles')
      .delete()
      .in('id', safeIds)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setSelectedIds(new Set())
    fetchProfiles()
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProfiles()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold text-indigo-300">Admin</p>
          <h1 className="text-2xl font-semibold text-white">User management</h1>
          <p className="mt-2 text-xs text-slate-400">
            Approve, disapprove, or remove users. Deleting removes profile + company data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={fetchProfiles}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <LoadingSpinner label="Refreshing" className="border-slate-200/40 border-t-slate-200" />
                Refreshing...
              </>
            ) : (
              'Refresh'
            )}
          </button>
          <button
            type="button"
            onClick={() => handleDelete(Array.from(selectedIds))}
            disabled={selectedCount === 0}
            className="rounded-full bg-rose-500/80 px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <FiTrash2 /> Delete selected ({selectedCount})
            </span>
          </button>
        </div>
      </div>
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <LoadingSpinner label="Loading users" className="border-slate-400/40 border-t-slate-400" />
            Loading users...
          </div>
        ) : (
          <div className="space-y-4">
            {error && <p className="text-xs text-rose-500">{error}</p>}
            {visibleProfiles.length === 0 ? (
              <p className="text-xs text-slate-400">
                {error ? 'Unable to load users.' : 'Click refresh to load users.'}
              </p>
            ) : (
              <div className="overflow-x-auto app-scrollbar">
                <table className="w-full border-separate border-spacing-y-2 text-left text-xs text-slate-200">
                  <thead className="text-[11px] uppercase text-slate-400">
                    <tr>
                      <th className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 appearance-none rounded border border-white/20 bg-slate-900 transition checked:border-indigo-400 checked:bg-indigo-500 checked:bg-[image:url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2020%2020%22%20fill=%22white%22%3E%3Cpath%20d=%22M16.704%205.293a1%201%200%200%201%200%201.414l-7.5%207.5a1%201%200%200%201-1.414%200l-3.5-3.5a1%201%200%201%201%201.414-1.414l2.793%202.793%206.793-6.793a1%201%200%200%201%201.414%200Z%22/%3E%3C/svg%3E')] checked:bg-center checked:bg-no-repeat focus:ring-2 focus:ring-indigo-400/40"
                        />
                      </th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProfiles.map((profile) => {
                      const isSelf = profile.id === currentUserId
                      return (
                        <tr key={profile.id} className="rounded-2xl bg-slate-900/50">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={!isSelf && selectedIds.has(profile.id)}
                              onChange={() => toggleSelect(profile.id)}
                              disabled={isSelf}
                              className="h-4 w-4 appearance-none rounded border border-white/20 bg-slate-900 transition checked:border-indigo-400 checked:bg-indigo-500 checked:bg-[image:url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2020%2020%22%20fill=%22white%22%3E%3Cpath%20d=%22M16.704%205.293a1%201%200%200%201%200%201.414l-7.5%207.5a1%201%200%200%201-1.414%200l-3.5-3.5a1%201%200%201%201%201.414-1.414l2.793%202.793%206.793-6.793a1%201%200%200%201%201.414%200Z%22/%3E%3C/svg%3E')] checked:bg-center checked:bg-no-repeat focus:ring-2 focus:ring-indigo-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2 font-semibold text-white">
                              <FiUserCheck className="text-indigo-300" />
                              {profile.first_name} {profile.last_name}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-400">{profile.email}</td>
                          <td className="px-3 py-3">
                            <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-300">
                              {profile.role}
                            </span>
                            {isSelf && (
                              <span className="ml-2 rounded-full bg-indigo-500/20 px-2 py-1 text-xs text-indigo-200">
                                You
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {profile.approved_status ? (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-200">
                                Approved
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-500/20 px-2 py-1 text-xs text-amber-200">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              {profile.approved_status ? (
                                <button
                                  type="button"
                                  onClick={() => updateApproval(profile.id, false)}
                                  className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-indigo-400"
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <FiXCircle /> Disapprove
                                  </span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => updateApproval(profile.id, true)}
                                  className="rounded-full bg-indigo-500/80 px-3 py-1 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-indigo-500"
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <FiCheckCircle /> Approve
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDelete([profile.id])}
                                disabled={isSelf}
                                className="rounded-full border border-rose-400/40 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <span className="inline-flex items-center gap-2">
                                  <FiTrash2 /> Delete
                                </span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        Note: Admin accounts are hidden here and cannot be deleted from this view. Deleting users
        removes their profile and company rows. Auth users must be removed separately (service role
        or dashboard).
      </p>
    </div>
  )
}
