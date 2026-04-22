import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { AuthContext, type SignUpPayload } from './auth-context'
import { supabase } from '../lib/supabaseClient'
import type { Company, Education, Profile } from '../types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [educations, setEducations] = useState<Education[]>([])
  const [loading, setLoading] = useState(true)
  const lastUserIdRef = useRef<string | null>(null)

  const loadProfile = useCallback(async (user?: User | null, force = false) => {
    const userId = user?.id
    if (!force && userId && lastUserIdRef.current === userId) return
    if (!userId) {
      setProfile(null)
      setCompanies([])
      setEducations([])
      lastUserIdRef.current = null
      return
    }

    lastUserIdRef.current = userId

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      console.error(profileError)
    }

    if (!profileData) {
      const metadataRole = (user?.user_metadata?.role as string | undefined) ??
        (user?.app_metadata?.role as string | undefined)
      const nextRole = metadataRole ?? 'user'
      const { data: insertedProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: user?.email ?? '',
          first_name: null,
          middle_name: null,
          last_name: null,
          role_title: null,
          location: null,
          linkedin_url: null,
          github_url: null,
          phone_number: null,
          approved_status: nextRole === 'admin',
          role: nextRole,
        })
        .select('*')
        .single()

      if (insertError) {
        console.error(insertError)
        setProfile(null)
        setCompanies([])
        setEducations([])
        return
      }

      setProfile(insertedProfile as Profile)
    } else {
      setProfile(profileData as Profile)
    }

    const { data: companyData } = await supabase
      .from('companies')
      .select('*')
      .eq('profile_id', userId)
      .order('start_date', { ascending: false })

    setCompanies((companyData as Company[]) ?? [])

    const { data: educationData } = await supabase
      .from('educations')
      .select('*')
      .eq('profile_id', userId)
      .order('start_date', { ascending: false })

    setEducations((educationData as Education[]) ?? [])
  }, [])

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user, true)
  }, [loadProfile, session?.user])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      loadProfile(data.session?.user)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      loadProfile(newSession?.user)
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return error.message
    }
    return null
  }, [])

  const signUp = useCallback(async (payload: SignUpPayload) => {
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
    })

    if (error || !data.user) {
      return error?.message ?? 'Unable to sign up.'
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      first_name: payload.firstName,
      middle_name: payload.middleName ?? null,
      last_name: payload.lastName,
      email: payload.email,
      role_title: payload.roleTitle,
      location: payload.location,
      linkedin_url: payload.linkedinUrl ?? null,
      github_url: null,
      phone_number: payload.phoneNumber ?? null,
      approved_status: false,
      role: 'user',
    })

    if (profileError) {
      return profileError.message
    }

    return null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const email = session?.user?.email
      if (!email) return 'Missing active session.'

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })

      if (reauthError) {
        return 'Current password is incorrect.'
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) return error.message
      return null
    },
    [session?.user?.email],
  )

  const updateProfile = useCallback(
    async (payload: Partial<Profile>) => {
      if (!session?.user?.id) return 'Missing active session.'

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', session.user.id)

      if (error) return error.message

      await refreshProfile()
      return null
    },
    [refreshProfile, session],
  )

  const updateCompanies = useCallback(
    async (payload: Array<Omit<Company, 'profile_id'>>) => {
      if (!session?.user?.id) return 'Missing active session.'
      const userId = session.user.id
      const createCompanyId = () => {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
          return crypto.randomUUID()
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`
      }
      const toDateValue = (value?: string | null) => {
        if (!value) return null
        if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`
        return value
      }
      const normalized = payload.map((company) => {
        const normalizedCompany = {
          ...company,
          id: company.id ?? createCompanyId(),
          profile_id: userId,
          start_date: toDateValue(company.start_date),
          end_date: company.is_current ? null : toDateValue(company.end_date),
        }

        return normalizedCompany
      })

      const { data: existingCompanies, error: existingError } = await supabase
        .from('companies')
        .select('id')
        .eq('profile_id', userId)

      if (existingError) return existingError.message

      const incomingIds = new Set(
        normalized
          .map((company) => ('id' in company ? company.id : undefined))
          .filter((id): id is string => Boolean(id)),
      )
      const existingIds = (existingCompanies ?? [])
        .map((company) => company.id)
        .filter((id): id is string => Boolean(id))
      const removedIds = existingIds.filter((id) => !incomingIds.has(id))

      const { error: upsertError } = await supabase
        .from('companies')
        .upsert(normalized, { onConflict: 'id' })

      if (upsertError) return upsertError.message

      if (removedIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('companies')
          .delete()
          .in('id', removedIds)

        if (deleteError) return deleteError.message
      }

      await refreshProfile()
      return null
    },
    [refreshProfile, session],
  )

  const updateEducations = useCallback(
    async (payload: Array<Omit<Education, 'profile_id'>>) => {
      if (!session?.user?.id) return 'Missing active session.'
      const userId = session.user.id
      const createEducationId = () => {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
          return crypto.randomUUID()
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`
      }
      const toDateValue = (value?: string | null) => {
        if (!value) return null
        if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`
        return value
      }

      const normalized = payload.map((education) => ({
        ...education,
        id: education.id ?? createEducationId(),
        profile_id: userId,
        start_date: toDateValue(education.start_date),
        end_date: education.is_current ? null : toDateValue(education.end_date),
      }))

      const { data: existingEducations, error: existingError } = await supabase
        .from('educations')
        .select('id')
        .eq('profile_id', userId)

      if (existingError) return existingError.message

      const incomingIds = new Set(
        normalized
          .map((education) => education.id)
          .filter((id): id is string => Boolean(id)),
      )
      const existingIds = (existingEducations ?? [])
        .map((education) => education.id)
        .filter((id): id is string => Boolean(id))
      const removedIds = existingIds.filter((id) => !incomingIds.has(id))

      const { error: upsertError } = await supabase
        .from('educations')
        .upsert(normalized, { onConflict: 'id' })

      if (upsertError) return upsertError.message

      if (removedIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('educations')
          .delete()
          .in('id', removedIds)

        if (deleteError) return deleteError.message
      }

      await refreshProfile()
      return null
    },
    [refreshProfile, session],
  )

  const value = useMemo(
    () => ({
      session,
      profile,
      companies,
      educations,
      loading,
      signIn,
      signUp,
      signOut,
      changePassword,
      refreshProfile,
      updateProfile,
      updateCompanies,
      updateEducations,
    }),
    [
      session,
      profile,
      companies,
      educations,
      loading,
      signIn,
      signUp,
      signOut,
      changePassword,
      refreshProfile,
      updateProfile,
      updateCompanies,
      updateEducations,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

