import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuthStore } from './store/authStore'
import { useDarkModeStore } from './store/darkModeStore'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Contacts from './pages/Contacts'
import ContactDetail from './pages/ContactDetail'
import Deals from './pages/Deals'
import Tasks from './pages/Tasks'
import Settings from './pages/Settings'

export default function App() {
  const setUser = useAuthStore((s) => s.setUser)
  const setLoading = useAuthStore((s) => s.setLoading)
  const { isDark, setDark } = useDarkModeStore()

  // Sync auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [setUser, setLoading])

  // Follow OS preference changes (only if user hasn't manually set a preference)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('deskly-theme')) setDark(e.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [setDark])

  // Keep <html> class in sync whenever isDark changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/contacts/:id" element={<ContactDetail />} />
            <Route path="/deals" element={<Deals />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
