import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import LoadingSpinner from './components/LoadingSpinner'
import { PublicOnly, RequireAdmin, RequireApproved, RequireAuth } from './components/RouteGuards'
import { useAuth } from './hooks/useAuth'
import Admin from './pages/Admin'
import AppliedJobDetail from './pages/AppliedJobDetail'
import AppliedJobHistory from './pages/AppliedJobHistory'
import ChangePassword from './pages/ChangePassword'
import Home from './pages/Home'
import PendingApproval from './pages/PendingApproval'
import Profile from './pages/Profile'
import ResumeBuilder from './pages/ResumeBuilder'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'

function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <LoadingSpinner label="Loading workspace" className="border-slate-500/40 border-t-slate-500" />
          Loading workspace...
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      {session && <Navbar />}
      <Routes>
        <Route
          path="/"
          element={
            <RequireApproved>
              <Home />
            </RequireApproved>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <ChangePassword />
            </RequireAuth>
          }
        />
        <Route
          path="/resume-builder"
          element={
            <RequireApproved>
              <ResumeBuilder />
            </RequireApproved>
          }
        />
        <Route
          path="/applied-history"
          element={
            <RequireApproved>
              <AppliedJobHistory />
            </RequireApproved>
          }
        />
        <Route
          path="/applied-history/:id"
          element={
            <RequireApproved>
              <AppliedJobDetail />
            </RequireApproved>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          }
        />
        <Route
          path="/pending"
          element={
            <RequireAuth>
              <PendingApproval />
            </RequireAuth>
          }
        />
        <Route
          path="/signin"
          element={
            <PublicOnly>
              <SignIn />
            </PublicOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnly>
              <SignUp />
            </PublicOnly>
          }
        />
        <Route path="*" element={<Navigate to={session ? '/' : '/signin'} replace />} />
      </Routes>
    </div>
  )
}

export default App
