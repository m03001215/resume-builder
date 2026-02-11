import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  FiBriefcase,
  FiFileText,
  FiGrid,
  FiLock,
  FiLogOut,
  FiMenu,
  FiShield,
  FiUser,
  FiX,
} from 'react-icons/fi'
import { useAuth } from '../hooks/useAuth'

const linkBase =
  'rounded-full px-4 py-1.5 text-sm font-medium transition hover:bg-white/10 hover:text-white'
const linkActive = 'bg-white/10 text-white ring-1 ring-white/20'
const linkInactive = 'text-slate-200'

export default function Navbar() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isMenuOpen])


  if (!profile) return null

  const isAdmin = profile.role === 'admin'
  const isPending = !profile.approved_status && !isAdmin
  const isHomeActive = location.pathname === '/' || location.pathname === '/pending'
  return (
    <nav className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40">
            <FiGrid className="text-base" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              <span className="bg-gradient-to-r from-indigo-200 via-sky-200 to-emerald-200 bg-clip-text text-transparent">
                AI Resume Hub
              </span>
            </p>
            <p className="text-xs text-slate-400">Your profile workspace</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <NavLink
            to="/"
            className={() => `${linkBase} ${isHomeActive ? linkActive : linkInactive}`}
            end
          >
            <span className="inline-flex items-center gap-2">
              <FiGrid /> Home
            </span>
          </NavLink>
          <NavLink
            to="/resume-builder"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkInactive}`
            }
          >
            <span className="inline-flex items-center gap-2">
              <FiFileText /> Resume
            </span>
          </NavLink>
          <NavLink
            to="/applied-history"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkInactive}`
            }
          >
            <span className="inline-flex items-center gap-2">
              <FiBriefcase /> Applied jobs
            </span>
          </NavLink>
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              <span className="inline-flex items-center gap-2">
                <FiShield /> Admin
              </span>
            </NavLink>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsMobileOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-full border border-white/10 p-2 text-slate-200 transition hover:bg-white/10 hover:text-white md:hidden"
          aria-label={isMobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMobileOpen}
        >
          {isMobileOpen ? <FiX /> : <FiMenu />}
        </button>
        <div ref={menuRef} className="relative hidden items-center gap-3 md:flex">
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="rounded-full px-3 py-1 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            {profile.first_name} {profile.last_name}
          </button>
          {isMenuOpen && (
            <div className="absolute left-0 top-full mt-3 w-56 rounded-2xl border border-white/10 bg-slate-950/90 p-2 shadow-soft backdrop-blur">
              <NavLink
                to="/profile"
                onClick={() => setIsMenuOpen(false)}
                className={({ isActive }) =>
                  `flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/10'
                  }`
                }
              >
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <FiUser /> Profile
                </span>
              </NavLink>
              <NavLink
                to="/change-password"
                onClick={() => setIsMenuOpen(false)}
                className={({ isActive }) =>
                  `flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/10'
                  }`
                }
              >
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <FiLock /> Change password
                </span>
              </NavLink>
              <button
                type="button"
                onClick={() => signOut()}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <FiLogOut /> Sign out
                </span>
              </button>
            </div>
          )}
          {isAdmin && (
            <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-200 ring-1 ring-indigo-400/40">
              Admin
            </span>
          )}
          {isPending ? (
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-400/40">
              Awaiting approval
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
              Approved
            </span>
          )}
        </div>
      </div>
      {isMobileOpen && (
        <div className="border-t border-white/10 bg-slate-950/80 px-6 py-4 backdrop-blur md:hidden">
          <div className="grid gap-2">
            <NavLink
              to="/"
              className={() => `${linkBase} ${isHomeActive ? linkActive : linkInactive}`}
              end
              onClick={() => setIsMobileOpen(false)}
            >
              <span className="inline-flex items-center gap-2">
                <FiGrid /> Home
              </span>
            </NavLink>
            <NavLink
              to="/resume-builder"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
              onClick={() => setIsMobileOpen(false)}
            >
              <span className="inline-flex items-center gap-2">
                <FiFileText /> Resume
              </span>
            </NavLink>
            <NavLink
              to="/applied-history"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
              onClick={() => setIsMobileOpen(false)}
            >
              <span className="inline-flex items-center gap-2">
                <FiBriefcase /> Applied jobs
              </span>
            </NavLink>
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `${linkBase} ${isActive ? linkActive : linkInactive}`
                }
                onClick={() => setIsMobileOpen(false)}
              >
                <span className="inline-flex items-center gap-2">
                  <FiShield /> Admin
                </span>
              </NavLink>
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-3">
            <p className="text-xs font-semibold text-slate-200">
              {profile.first_name} {profile.last_name}
            </p>
            <div className="mt-3 grid gap-2">
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/10'
                  }`
                }
                onClick={() => setIsMobileOpen(false)}
              >
                <FiUser /> Profile
              </NavLink>
              <NavLink
                to="/change-password"
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/10'
                  }`
                }
                onClick={() => setIsMobileOpen(false)}
              >
                <FiLock /> Change password
              </NavLink>
              <button
                type="button"
                onClick={() => {
                  setIsMobileOpen(false)
                  signOut()
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <FiLogOut /> Sign out
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {isAdmin && (
                <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-200 ring-1 ring-indigo-400/40">
                  Admin
                </span>
              )}
              {isPending ? (
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-400/40">
                  Awaiting approval
                </span>
              ) : (
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
                  Approved
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
