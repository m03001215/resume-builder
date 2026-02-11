import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Company, Education, Profile } from '../types'

export type SignUpPayload = {
  email: string
  password: string
  firstName: string
  middleName?: string
  lastName: string
  roleTitle: string
  location: string
  linkedinUrl?: string
  phoneNumber?: string
}

export type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  companies: Company[]
  educations: Education[]
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (payload: SignUpPayload) => Promise<string | null>
  signOut: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>
  refreshProfile: () => Promise<void>
  updateProfile: (payload: Partial<Profile>) => Promise<string | null>
  updateCompanies: (payload: Array<Omit<Company, 'profile_id'>>) => Promise<string | null>
  updateEducations: (payload: Array<Omit<Education, 'profile_id'>>) => Promise<string | null>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
