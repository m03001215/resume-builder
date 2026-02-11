import { useEffect, useRef, useState } from 'react'
import { FiBriefcase, FiBookOpen, FiChevronDown, FiChevronLeft, FiChevronRight, FiUser } from 'react-icons/fi'
import type { Company, Education, Profile } from '../types'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'

type CompanyForm = {
  id?: string
  company_name: string
  start_date: string
  end_date: string
  is_current: boolean
  title: string
  work_mode: Company['work_mode']
  location: string
}

type EducationForm = {
  id?: string
  school_name: string
  degree: string
  field_of_study: string
  start_date: string
  end_date: string
  is_current: boolean
  location: string
}

type ProfileForm = {
  first_name: string
  middle_name: string
  last_name: string
  role_title: string
  location: string
  linkedin_url: string
  phone_number: string
}

type CompanyErrors = {
  start_date?: string
  end_date?: string
}

type EducationErrors = {
  start_date?: string
  end_date?: string
}


const createProfileForm = (profile: Profile): ProfileForm => ({
  first_name: profile.first_name ?? '',
  middle_name: profile.middle_name ?? '',
  last_name: profile.last_name ?? '',
  role_title: profile.role_title ?? '',
  location: profile.location ?? '',
  linkedin_url: profile.linkedin_url ?? '',
  phone_number: profile.phone_number ?? '',
})

const toMonthValue = (value?: string | null) => {
  if (!value) return ''
  if (/^\d{4}-\d{2}$/.test(value)) return value
  return value.slice(0, 7)
}

const generateUuid = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16)
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8
    return value.toString(16)
  })
}

const createCompanyId = () => generateUuid()

const toSortValue = (value?: string) => {
  if (!value) return -1
  if (/^\d{4}-\d{2}$/.test(value)) return new Date(`${value}-01`).getTime()
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? -1 : parsed
}

const getCurrentMonthValue = () => {
  const today = new Date()
  const month = `${today.getMonth() + 1}`.padStart(2, '0')
  return `${today.getFullYear()}-${month}`
}

const workModeOptions = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'Onsite' },
] as const

const validateCompanyDates = (company: CompanyForm, currentMonth: string): CompanyErrors => {
  const errors: CompanyErrors = {}
  const start = company.start_date
  const end = company.end_date

  if (start && start > currentMonth) {
    errors.start_date = 'Start month cannot be in the future.'
  }
  if (!company.is_current && end && end > currentMonth) {
    errors.end_date = 'End month cannot be in the future.'
  }
  if (!company.is_current && start && end && start > end) {
    errors.start_date = 'Start month must be before end month.'
    errors.end_date = 'End month must be after start month.'
  }

  return errors
}

const validateEducationDates = (education: EducationForm, currentMonth: string): EducationErrors => {
  const errors: EducationErrors = {}
  const start = education.start_date
  const end = education.end_date

  if (start && start > currentMonth) {
    errors.start_date = 'Start month cannot be in the future.'
  }
  if (!education.is_current && end && end > currentMonth) {
    errors.end_date = 'End month cannot be in the future.'
  }
  if (!education.is_current && start && end && start > end) {
    errors.start_date = 'Start month must be before end month.'
    errors.end_date = 'End month must be after start month.'
  }

  return errors
}


const sortCompanyForms = (forms: CompanyForm[]) =>
  [...forms].sort((a, b) => {
    const dateA = toSortValue(a.start_date)
    const dateB = toSortValue(b.start_date)
    if (dateA === dateB) {
      return (a.id ?? '').localeCompare(b.id ?? '')
    }
    return dateB - dateA
  })

const sortEducationForms = (forms: EducationForm[]) =>
  [...forms].sort((a, b) => {
    const dateA = toSortValue(a.start_date)
    const dateB = toSortValue(b.start_date)
    if (dateA === dateB) {
      return (a.id ?? '').localeCompare(b.id ?? '')
    }
    return dateB - dateA
  })

const createCompanyForm = (company?: Company | null): CompanyForm => ({
  id: company?.id ?? createCompanyId(),
  company_name: company?.company_name ?? '',
  start_date: toMonthValue(company?.start_date),
  end_date: toMonthValue(company?.end_date),
  is_current: company?.is_current ?? false,
  title: company?.title ?? '',
  work_mode: company?.work_mode ?? 'remote',
  location: company?.location ?? '',
})

const createEducationForm = (education?: Education | null): EducationForm => ({
  id: education?.id ?? createCompanyId(),
  school_name: education?.school_name ?? '',
  degree: education?.degree ?? '',
  field_of_study: education?.field_of_study ?? '',
  start_date: toMonthValue(education?.start_date),
  end_date: toMonthValue(education?.end_date),
  is_current: education?.is_current ?? false,
  location: education?.location ?? '',
})

export default function Profile() {
  const { profile, companies, educations, updateProfile, updateCompanies, updateEducations, refreshProfile } =
    useAuth()

  if (!profile)
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold text-white">We couldn't load your profile yet</h1>
        <p className="text-sm text-slate-400">
          Your account is signed in, but your profile row isn't ready. Please wait a moment and try
          again.
        </p>
        <button
          type="button"
          onClick={() => refreshProfile()}
          className="rounded-2xl bg-indigo-500/80 px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-indigo-500"
        >
          Retry loading profile
        </button>
      </div>
    )

  return (
    <ProfileFormCard
      key={`${profile.id}-${companies.map((company) => company.id).join('-')}-${educations
        .map((education) => education.id)
        .join('-')}`}
      profile={profile}
      companies={companies}
      educations={educations}
      updateProfile={updateProfile}
      updateCompanies={updateCompanies}
      updateEducations={updateEducations}
    />
  )
}

function ProfileFormCard({
  profile,
  companies,
  educations,
  updateProfile,
  updateCompanies,
  updateEducations,
}: {
  profile: Profile
  companies: Company[]
  educations: Education[]
  updateProfile: (payload: Partial<Profile>) => Promise<string | null>
  updateCompanies: (payload: Array<Omit<Company, 'profile_id'>>) => Promise<string | null>
  updateEducations: (payload: Array<Omit<Education, 'profile_id'>>) => Promise<string | null>
}) {
  const [profileForm, setProfileForm] = useState(() => createProfileForm(profile))
  const [companyForms, setCompanyForms] = useState(() =>
    sortCompanyForms(
      companies.length > 0
        ? companies.map((company) => createCompanyForm(company))
        : [],
    ),
  )
  const [activeCompanyIndex, setActiveCompanyIndex] = useState(0)
  const [companyErrors, setCompanyErrors] = useState<Record<string, CompanyErrors>>({})
  const [educationForms, setEducationForms] = useState(() =>
    sortEducationForms(
      educations.length > 0
        ? educations.map((education) => createEducationForm(education))
        : [],
    ),
  )
  const [activeEducationIndex, setActiveEducationIndex] = useState(0)
  const [educationErrors, setEducationErrors] = useState<Record<string, EducationErrors>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null)
  const [saving, setSaving] = useState(false)
  const [isWorkModeOpen, setIsWorkModeOpen] = useState(false)
  const workModeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isWorkModeOpen) return
    const handleClick = (event: MouseEvent) => {
      if (workModeRef.current && !workModeRef.current.contains(event.target as Node)) {
        setIsWorkModeOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isWorkModeOpen])

  const handleProfileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setProfileForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const updateCompanyField = (index: number, name: string, value: string) => {
    const currentMonth = getCurrentMonthValue()
    setCompanyForms((prev) => {
      const next = prev.map((company, currentIndex) =>
        currentIndex === index
          ? {
              ...company,
              [name]: value,
            }
          : company,
      )

      const activeId = next[index].id ?? `company-${index}`
      setCompanyErrors((prevErrors) => ({
        ...prevErrors,
        [activeId]: validateCompanyDates(next[index], currentMonth),
      }))

      if (name === 'start_date') {
        const sorted = sortCompanyForms(next)
        setActiveCompanyIndex(
          Math.max(0, sorted.findIndex((company) => company.id === next[index].id)),
        )
        return sorted
      }

      return next
    })
  }

  const handleCompanyChange = (
    index: number,
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    updateCompanyField(index, event.target.name, event.target.value)
  }

  const handleCompanyToggle = (index: number) => {
    const currentMonth = getCurrentMonthValue()
    setCompanyForms((prev) =>
      prev.map((company, currentIndex) => {
        if (currentIndex !== index) return company
        const nextCompany = {
          ...company,
          is_current: !company.is_current,
          end_date: company.is_current ? company.end_date : '',
        }
        const activeId = nextCompany.id ?? `company-${index}`
        setCompanyErrors((prevErrors) => ({
          ...prevErrors,
          [activeId]: validateCompanyDates(nextCompany, currentMonth),
        }))
        return nextCompany
      }),
    )
  }

  const handleEducationChange = (
    index: number,
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target
    const currentMonth = getCurrentMonthValue()
    setEducationForms((prev) => {
      const next = prev.map((education, currentIndex) =>
        currentIndex === index
          ? {
              ...education,
              [name]: value,
            }
          : education,
      )

      const activeId = next[index].id ?? `education-${index}`
      setEducationErrors((prevErrors) => ({
        ...prevErrors,
        [activeId]: validateEducationDates(next[index], currentMonth),
      }))

      if (name === 'start_date') {
        const sorted = sortEducationForms(next)
        setActiveEducationIndex(
          Math.max(0, sorted.findIndex((education) => education.id === next[index].id)),
        )
        return sorted
      }

      return next
    })
  }

  const handleEducationToggle = (index: number) => {
    const currentMonth = getCurrentMonthValue()
    setEducationForms((prev) =>
      prev.map((education, currentIndex) => {
        if (currentIndex !== index) return education
        const nextEducation = {
          ...education,
          is_current: !education.is_current,
          end_date: education.is_current ? education.end_date : '',
        }
        const activeId = nextEducation.id ?? `education-${index}`
        setEducationErrors((prevErrors) => ({
          ...prevErrors,
          [activeId]: validateEducationDates(nextEducation, currentMonth),
        }))
        return nextEducation
      }),
    )
  }

  const handleAddEducation = () => {
    setEducationForms((prev) => {
      const newEducation = createEducationForm()
      const next = [...prev, newEducation]
      const sorted = sortEducationForms(next)
      const newId = next[next.length - 1].id
      setActiveEducationIndex(
        Math.max(0, sorted.findIndex((education) => education.id === newId)),
      )
      return sorted
    })
    const newEducation = createEducationForm()
    const activeId = newEducation.id ?? `education-${educationForms.length}`
    setEducationErrors((prevErrors) => ({
      ...prevErrors,
      [activeId]: validateEducationDates(newEducation, getCurrentMonthValue()),
    }))
  }

  const handleRemoveEducation = (index: number) => {
    setEducationForms((prev) => {
      const removedId = prev[index]?.id
      const next = prev.filter((_, currentIndex) => currentIndex !== index)
      if (next.length === 0) {
        setActiveEducationIndex(0)
        return []
      }
      const sorted = sortEducationForms(next)
      const fallbackIndex = Math.max(0, sorted.findIndex((education) => education.id === removedId))
      setActiveEducationIndex(Math.min(fallbackIndex, sorted.length - 1))
      return sorted
    })
    setEducationErrors((prevErrors) => {
      const nextErrors = { ...prevErrors }
      const removedKey = educationForms[index]?.id
      if (removedKey) {
        delete nextErrors[removedKey]
      }
      return nextErrors
    })
  }

  const goToPreviousEducation = () => {
    setActiveEducationIndex((prev) => Math.max(0, prev - 1))
  }

  const goToNextEducation = () => {
    if (educationForms.length === 0) return
    setActiveEducationIndex((prev) => Math.min(educationForms.length - 1, prev + 1))
  }

  const handleAddCompany = () => {
    setIsWorkModeOpen(false)
    setCompanyForms((prev) => {
      const newCompany = createCompanyForm()
      const next = [...prev, newCompany]
      const sorted = sortCompanyForms(next)
      const newId = next[next.length - 1].id
      setActiveCompanyIndex(
        Math.max(0, sorted.findIndex((company) => company.id === newId)),
      )
      return sorted
    })
    const newCompany = createCompanyForm()
    const activeId = newCompany.id ?? `company-${companyForms.length}`
    setCompanyErrors((prevErrors) => ({
      ...prevErrors,
      [activeId]: validateCompanyDates(newCompany, getCurrentMonthValue()),
    }))
  }

  const handleRemoveCompany = (index: number) => {
    setIsWorkModeOpen(false)
    setCompanyForms((prev) => {
      const removedId = prev[index]?.id
      const next = prev.filter((_, currentIndex) => currentIndex !== index)
      if (next.length === 0) {
        setActiveCompanyIndex(0)
        return []
      }
      const sorted = sortCompanyForms(next)
      const fallbackIndex = Math.max(0, sorted.findIndex((company) => company.id === removedId))
      setActiveCompanyIndex(Math.min(fallbackIndex, sorted.length - 1))
      return sorted
    })
    setCompanyErrors((prevErrors) => {
      const nextErrors = { ...prevErrors }
      const removedKey = companyForms[index]?.id
      if (removedKey) {
        delete nextErrors[removedKey]
      }
      return nextErrors
    })
  }

  const goToPreviousCompany = () => {
    setIsWorkModeOpen(false)
    setActiveCompanyIndex((prev) => Math.max(0, prev - 1))
  }

  const goToNextCompany = () => {
    if (companyForms.length === 0) return
    setIsWorkModeOpen(false)
    setActiveCompanyIndex((prev) => Math.min(companyForms.length - 1, prev + 1))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setMessageType(null)

    const currentMonth = getCurrentMonthValue()
    const nextErrors: Record<string, CompanyErrors> = {}
    companyForms.forEach((company, index) => {
      const key = company.id ?? `company-${index}`
      const errors = validateCompanyDates(company, currentMonth)
      if (Object.keys(errors).length > 0) {
        nextErrors[key] = errors
      }
    })
    setCompanyErrors(nextErrors)

    const nextEducationErrors: Record<string, EducationErrors> = {}
    educationForms.forEach((education, index) => {
      const key = education.id ?? `education-${index}`
      const errors = validateEducationDates(education, currentMonth)
      if (Object.keys(errors).length > 0) {
        nextEducationErrors[key] = errors
      }
    })
    setEducationErrors(nextEducationErrors)

    if (Object.keys(nextErrors).length > 0 || Object.keys(nextEducationErrors).length > 0) {
      setSaving(false)
      setMessage('Please fix the date errors before saving.')
      setMessageType('error')
      return
    }

    const profileError = await updateProfile({
      first_name: profileForm.first_name,
      middle_name: profileForm.middle_name || null,
      last_name: profileForm.last_name,
      role_title: profileForm.role_title,
      location: profileForm.location,
      linkedin_url: profileForm.linkedin_url || null,
      phone_number: profileForm.phone_number || null,
    })

    const companyError = await updateCompanies(
      companyForms.map((companyForm) => ({
        id: companyForm.id,
        company_name: companyForm.company_name,
        start_date: companyForm.start_date || null,
        end_date: companyForm.is_current ? null : companyForm.end_date || null,
        is_current: companyForm.is_current,
        title: companyForm.title || null,
        work_mode: companyForm.work_mode,
        location: companyForm.location || null,
      })),
    )

    const educationError = await updateEducations(
      educationForms.map((educationForm) => ({
        id: educationForm.id,
        school_name: educationForm.school_name,
        degree: educationForm.degree || null,
        field_of_study: educationForm.field_of_study || null,
        start_date: educationForm.start_date || null,
        end_date: educationForm.is_current ? null : educationForm.end_date || null,
        is_current: educationForm.is_current,
        location: educationForm.location || null,
      })),
    )

    const combinedError = profileError ?? companyError ?? educationError
    setMessage(combinedError ?? 'Profile updated successfully.')
    setMessageType(combinedError ? 'error' : 'success')
    setSaving(false)
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6">
        <p className="text-xs font-semibold text-indigo-300">Profile</p>
        <h1 className="text-2xl font-semibold text-white">Update your information</h1>
        <p className="mt-2 text-xs text-slate-400">
          Keep your contact and company details ready for resume generation.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-2">
  <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <FiUser className="text-indigo-300" /> Personal information
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-300">
              First name <span className="text-red-400">*</span>
              <input
                name="first_name"
                value={profileForm.first_name}
                onChange={handleProfileChange}
                placeholder="Jane"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-slate-300">
              Middle name <span className="text-slate-400">(optional)</span>
              <input
                name="middle_name"
                value={profileForm.middle_name}
                onChange={handleProfileChange}
                placeholder="A."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-slate-300">
              Last name <span className="text-red-400">*</span>
              <input
                name="last_name"
                value={profileForm.last_name}
                onChange={handleProfileChange}
                placeholder="Doe"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                required
              />
            </label>
            <label className="text-xs font-medium text-slate-300">
              Role <span className="text-red-400">*</span>
              <input
                name="role_title"
                value={profileForm.role_title}
                onChange={handleProfileChange}
                placeholder="Frontend Developer"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                required
              />
            </label>
            <label className="text-xs font-medium text-slate-300">
              Location <span className="text-red-400">*</span>
              <input
                name="location"
                value={profileForm.location}
                onChange={handleProfileChange}
                placeholder="New York, NY"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                required
              />
            </label>
            <label className="text-xs font-medium text-slate-300">
              Email <span className="text-red-400">*</span>
              <input
                value={profile.email}
                disabled
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-2.5 text-[13px] text-slate-400"
              />
            </label>
            <label className="text-xs font-medium text-slate-300">
              LinkedIn URL <span className="text-slate-400">(optional)</span>
              <input
                name="linkedin_url"
                value={profileForm.linkedin_url}
                onChange={handleProfileChange}
                placeholder="https://www.linkedin.com/in/your-handle"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-slate-300">
              Phone number <span className="text-slate-400">(optional)</span>
              <input
                name="phone_number"
                value={profileForm.phone_number}
                onChange={handleProfileChange}
                placeholder="+1 555 0100"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
              />
            </label>
          </div>
        </section>
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur">
          <div className="flex flex-col items-start gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <FiBriefcase className="text-indigo-300" /> Company history
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goToPreviousCompany}
                disabled={companyForms.length === 0 || activeCompanyIndex === 0}
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  <FiChevronLeft /> Previous
                </span>
              </button>
              <button
                type="button"
                onClick={goToNextCompany}
                disabled={companyForms.length === 0 || activeCompanyIndex >= companyForms.length - 1}
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  Next <FiChevronRight />
                </span>
              </button>
              <button
                type="button"
                onClick={handleAddCompany}
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200"
              >
                Add company
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-5">
            {companyForms.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-200">
                      Company {activeCompanyIndex + 1} of {companyForms.length}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Use the arrows to switch between company entries.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCompany(activeCompanyIndex)}
                    className="rounded-full border border-rose-400/40 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-300"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-medium text-slate-300">
                    Company name <span className="text-red-400">*</span>
                    <input
                      name="company_name"
                      value={companyForms[activeCompanyIndex].company_name}
                      onChange={(event) => handleCompanyChange(activeCompanyIndex, event)}
                      placeholder="Acme Inc."
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-300">
                    Title <span className="text-red-400">*</span>
                    <input
                      name="title"
                      value={companyForms[activeCompanyIndex].title}
                      onChange={(event) => handleCompanyChange(activeCompanyIndex, event)}
                      placeholder="Senior Product Designer"
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-300">
                    Work mode <span className="text-red-400">*</span>
                    <div
                      ref={workModeRef}
                      tabIndex={-1}
                      onBlurCapture={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setIsWorkModeOpen(false)
                        }
                      }}
                      className="relative mt-2"
                    >
                      <button
                        type="button"
                        onClick={() => setIsWorkModeOpen((prev) => !prev)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setIsWorkModeOpen(false)
                          }
                        }}
                        aria-haspopup="listbox"
                        aria-expanded={isWorkModeOpen}
                        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-900 px-4 py-2.5 text-[13px] text-slate-100 transition focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/50"
                      >
                        <span>
                          {
                            workModeOptions.find(
                              (option) => option.value === companyForms[activeCompanyIndex].work_mode,
                            )?.label
                          }
                        </span>
                        <FiChevronDown
                          className={`text-sm text-slate-400 transition ${
                            isWorkModeOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isWorkModeOpen && (
                        <div
                          role="listbox"
                          className="absolute z-20 mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/95 p-1 shadow-soft backdrop-blur"
                        >
                          {workModeOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              role="option"
                              aria-selected={
                                companyForms[activeCompanyIndex].work_mode === option.value
                              }
                              onMouseDown={(event) => {
                                event.preventDefault()
                                updateCompanyField(activeCompanyIndex, 'work_mode', option.value)
                                setIsWorkModeOpen(false)
                              }}
                              onClick={() => {
                                updateCompanyField(activeCompanyIndex, 'work_mode', option.value)
                                setIsWorkModeOpen(false)
                              }}
                              className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition ${
                                companyForms[activeCompanyIndex].work_mode === option.value
                                  ? 'bg-white/10 text-white'
                                  : 'text-slate-200 hover:bg-white/10'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                  <label className="text-xs font-medium text-slate-300">
                    Location <span className="text-slate-400">(optional)</span>
                    <input
                      name="location"
                      value={companyForms[activeCompanyIndex].location}
                      onChange={(event) => handleCompanyChange(activeCompanyIndex, event)}
                      placeholder="New York, NY"
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                    />
                  </label>
                  <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                    <label className="text-xs font-medium text-slate-300">
                      Start date <span className="text-red-400">*</span>
                      <input
                        type="month"
                        name="start_date"
                        value={companyForms[activeCompanyIndex].start_date}
                        onChange={(event) => handleCompanyChange(activeCompanyIndex, event)}
                        placeholder="2023-01"
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                      />
                      {companyErrors[companyForms[activeCompanyIndex].id ?? '']?.start_date && (
                        <span className="mt-2 block text-[11px] text-red-400">
                          {companyErrors[companyForms[activeCompanyIndex].id ?? '']?.start_date}
                        </span>
                      )}
                    </label>
                    <label className="text-xs font-medium text-slate-300">
                      End date <span className="text-slate-400">(optional)</span>
                      <input
                        type="month"
                        name="end_date"
                        value={companyForms[activeCompanyIndex].end_date}
                        onChange={(event) => handleCompanyChange(activeCompanyIndex, event)}
                        disabled={companyForms[activeCompanyIndex].is_current}
                        placeholder="2024-01"
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                      />
                      {companyErrors[companyForms[activeCompanyIndex].id ?? '']?.end_date && (
                        <span className="mt-2 block text-[11px] text-red-400">
                          {companyErrors[companyForms[activeCompanyIndex].id ?? '']?.end_date}
                        </span>
                      )}
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-300 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={companyForms[activeCompanyIndex].is_current}
                      onChange={() => handleCompanyToggle(activeCompanyIndex)}
                      className="h-4 w-4 appearance-none rounded border border-white/20 bg-slate-900 transition checked:border-indigo-400 checked:bg-indigo-500 checked:bg-[image:url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2020%2020%22%20fill=%22white%22%3E%3Cpath%20d=%22M16.704%205.293a1%201%200%200%201%200%201.414l-7.5%207.5a1%201%200%200%201-1.414%200l-3.5-3.5a1%201%200%201%201%201.414-1.414l2.793%202.793%206.793-6.793a1%201%200%200%201%201.414%200Z%22/%3E%3C/svg%3E')] checked:bg-center checked:bg-no-repeat focus:ring-2 focus:ring-indigo-400/40"
                    />
                    I currently work here
                  </label>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                No companies added yet. Click “Add company” to create your first entry.
              </div>
            )}
          </div>
        </section>
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur">
          <div className="flex flex-col items-start gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <FiBookOpen className="text-indigo-300" /> Education
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goToPreviousEducation}
                disabled={educationForms.length === 0 || activeEducationIndex === 0}
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  <FiChevronLeft /> Previous
                </span>
              </button>
              <button
                type="button"
                onClick={goToNextEducation}
                disabled={
                  educationForms.length === 0 || activeEducationIndex >= educationForms.length - 1
                }
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  Next <FiChevronRight />
                </span>
              </button>
              <button
                type="button"
                onClick={handleAddEducation}
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200"
              >
                Add education
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-5">
            {educationForms.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-200">
                      Education {activeEducationIndex + 1} of {educationForms.length}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Use the arrows to switch between education entries.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveEducation(activeEducationIndex)}
                    className="rounded-full border border-rose-400/40 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-300"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-medium text-slate-300">
                    School name <span className="text-red-400">*</span>
                    <input
                      name="school_name"
                      value={educationForms[activeEducationIndex].school_name}
                      onChange={(event) => handleEducationChange(activeEducationIndex, event)}
                      placeholder="State University"
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-300">
                    Degree <span className="text-red-400">*</span>
                    <input
                      name="degree"
                      value={educationForms[activeEducationIndex].degree}
                      onChange={(event) => handleEducationChange(activeEducationIndex, event)}
                      placeholder="B.S."
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-300">
                    Field of study <span className="text-red-400">*</span>
                    <input
                      name="field_of_study"
                      value={educationForms[activeEducationIndex].field_of_study}
                      onChange={(event) => handleEducationChange(activeEducationIndex, event)}
                      placeholder="Computer Science"
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-300">
                    Location <span className="text-slate-400">(optional)</span>
                    <input
                      name="location"
                      value={educationForms[activeEducationIndex].location}
                      onChange={(event) => handleEducationChange(activeEducationIndex, event)}
                      placeholder="Boston, MA"
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                    />
                  </label>
                  <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                    <label className="text-xs font-medium text-slate-300">
                      Start date <span className="text-red-400">*</span>
                      <input
                        type="month"
                        name="start_date"
                        value={educationForms[activeEducationIndex].start_date}
                        onChange={(event) => handleEducationChange(activeEducationIndex, event)}
                        placeholder="2019-09"
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                      />
                      {educationErrors[educationForms[activeEducationIndex].id ?? '']?.start_date && (
                        <span className="mt-2 block text-[11px] text-red-400">
                          {educationErrors[educationForms[activeEducationIndex].id ?? '']?.start_date}
                        </span>
                      )}
                    </label>
                    <label className="text-xs font-medium text-slate-300">
                      End date <span className="text-slate-400">(optional)</span>
                      <input
                        type="month"
                        name="end_date"
                        value={educationForms[activeEducationIndex].end_date}
                        onChange={(event) => handleEducationChange(activeEducationIndex, event)}
                        disabled={educationForms[activeEducationIndex].is_current}
                        placeholder="2023-06"
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                      />
                      {educationErrors[educationForms[activeEducationIndex].id ?? '']?.end_date && (
                        <span className="mt-2 block text-[11px] text-red-400">
                          {educationErrors[educationForms[activeEducationIndex].id ?? '']?.end_date}
                        </span>
                      )}
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-300 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={educationForms[activeEducationIndex].is_current}
                      onChange={() => handleEducationToggle(activeEducationIndex)}
                      className="h-4 w-4 appearance-none rounded border border-white/20 bg-slate-900 transition checked:border-indigo-400 checked:bg-indigo-500 checked:bg-[image:url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2020%2020%22%20fill=%22white%22%3E%3Cpath%20d=%22M16.704%205.293a1%201%200%200%201%200%201.414l-7.5%207.5a1%201%200%200%201-1.414%200l-3.5-3.5a1%201%200%201%201%201.414-1.414l2.793%202.793%206.793-6.793a1%201%200%200%201%201.414%200Z%22/%3E%3C/svg%3E')] checked:bg-center checked:bg-no-repeat focus:ring-2 focus:ring-indigo-400/40"
                    />
                    I currently study here
                  </label>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                No education added yet. Click “Add education” to create your first entry.
              </div>
            )}
          </div>
        </section>
        <div className="lg:col-span-2">
          {message && (
            <p
              className={`mb-4 rounded-2xl px-4 py-2 text-sm ${
                messageType === 'error'
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-white/5 text-slate-300'
              }`}
            >
              {message}
            </p>
          )}
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-500/80 px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
          >
            {saving ? (
              <>
                <LoadingSpinner label="Saving profile" />
                Saving...
              </>
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
