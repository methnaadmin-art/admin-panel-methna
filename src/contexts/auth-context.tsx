import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { authApi } from '@/lib/api'
import type { User } from '@/types'

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isAdmin: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const isAdminUser = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const role = (value as { role?: unknown }).role
  return typeof role === 'string' && ['admin', 'moderator', 'staff'].includes(role.toLowerCase())
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const storedUser = localStorage.getItem('admin_user')

    if (token && storedUser) {
      try {
        const parsed = JSON.parse(storedUser)
        if (isAdminUser(parsed)) {
          setUser(parsed)
        } else {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('admin_user')
        }
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('admin_user')
      }
    }
    setIsLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password)
    
    // Safely unwrap data in case the Axios interceptor didn't strip the envelope
    const data = response.data?.data || response.data
    const userData = data.user || data
    
    const accessToken = data.accessToken || data.access_token
    const refreshToken = data.refreshToken || data.refresh_token
    if (!accessToken) {
      throw new Error('Login response is missing an access token.')
    }

    if (!isAdminUser(userData)) {
      throw new Error('Access denied. Admin or staff role required.')
    }

    localStorage.setItem('access_token', accessToken)
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken)
    localStorage.setItem('admin_user', JSON.stringify(userData))

    setUser(userData)
  }, [])

  const logout = useCallback(() => {
    authApi.logout().catch(() => {})
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('admin_user')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: !!user && isAdminUser(user),
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
