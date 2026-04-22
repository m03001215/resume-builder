export type UserRole = 'user' | 'admin'

export type Profile = {
  id: string
  first_name: string
  middle_name?: string | null
  last_name: string
  email: string
  role_title?: string | null
  location?: string | null
  linkedin_url?: string | null
  github_url?: string | null
  phone_number?: string | null
  approved_status: boolean
  role: UserRole
}

export type Company = {
  id?: string
  profile_id: string
  company_name: string
  start_date?: string | null
  end_date?: string | null
  is_current?: boolean | null
  title?: string | null
  work_mode: 'remote' | 'hybrid' | 'onsite'
  location?: string | null
}

export type Education = {
  id?: string
  profile_id: string
  school_name: string
  degree?: string | null
  field_of_study?: string | null
  start_date?: string | null
  end_date?: string | null
  is_current?: boolean | null
  location?: string | null
}

export type AppliedJob = {
  id: string
  profile_id: string
  company_name?: string | null
  job_title?: string | null
  job_description: string
  resume_name: string
  cover_letter_name: string
  skills?: string[] | null
  created_at?: string | null
}
