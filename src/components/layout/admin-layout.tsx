import { useEffect, useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { Sidebar } from './sidebar'
import { Header } from './header'

export function AdminLayout() {
  const { isAuthenticated, isAdmin, isLoading } = useAuth()
  const location = useLocation()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [location.pathname])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!isAdmin) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex min-h-screen overflow-hidden bg-background">
      <div
        className={`fixed inset-0 z-40 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden ${
          mobileSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobileSidebarOpen(false)}
        aria-hidden={!mobileSidebarOpen}
      />

      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onNavigate={() => setMobileSidebarOpen(false)}
        onRequestClose={() => setMobileSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setMobileSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
