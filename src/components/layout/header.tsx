import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Languages,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sun,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useTheme } from '@/contexts/theme-context'
import { adminApi } from '@/lib/api'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

const breadcrumbMap: Record<string, string[]> = {
  '/': ['breadcrumb.overview'],
  '/analytics': ['breadcrumb.overview', 'breadcrumb.analytics'],
  '/users': ['breadcrumb.usersContent', 'breadcrumb.allUsers'],
  '/search': ['breadcrumb.usersContent', 'breadcrumb.search'],
  '/verification': ['breadcrumb.usersContent', 'breadcrumb.verification'],
  '/photos': ['breadcrumb.usersContent', 'breadcrumb.photos'],
  '/activity': ['breadcrumb.social', 'breadcrumb.activity'],
  '/matches': ['breadcrumb.social', 'breadcrumb.matches'],
  '/chat': ['breadcrumb.social', 'breadcrumb.chat'],
  '/notifications': ['breadcrumb.communication', 'breadcrumb.notifications'],
  '/send-notifications': ['breadcrumb.communication', 'breadcrumb.sendPush'],
  '/support': ['breadcrumb.communication', 'breadcrumb.support'],
  '/subscriptions': ['breadcrumb.revenue', 'breadcrumb.subscriptions'],
  '/monetization': ['breadcrumb.revenue', 'breadcrumb.monetization'],
  '/ads': ['breadcrumb.revenue', 'breadcrumb.ads'],
  '/reports': ['breadcrumb.safety', 'breadcrumb.reports'],
  '/trust-safety': ['breadcrumb.safety', 'breadcrumb.trustSafety'],
  '/security': ['breadcrumb.safety', 'breadcrumb.security'],
  '/audit-logs': ['breadcrumb.safety', 'breadcrumb.auditLogs'],
  '/guide': ['breadcrumb.guide'],
}

interface HeaderProps {
  onOpenSidebar?: () => void
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const isRtl = i18n.language === 'ar'
  const searchTimeoutRef = useRef<number | null>(null)

  const match = Object.entries(breadcrumbMap).find(
    ([path]) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
  )
  const breadcrumbKeys = match?.[1] || []

  const isUserDetail = location.pathname.match(/^\/users\/[^/]+$/)
  const finalBreadcrumb = isUserDetail
    ? ['breadcrumb.usersContent', 'breadcrumb.allUsers', 'breadcrumb.userDetail']
    : breadcrumbKeys

  useEffect(() => {
    adminApi.getStats()
      .then((res) => {
        const stats = res.data
        setPendingCount((stats.reports?.pending || 0) + (stats.content?.pendingPhotos || 0))
      })
      .catch(() => {})
  }, [location.pathname])

  useEffect(() => {
    if (!location.pathname.startsWith('/search')) return
    const currentQuery = new URLSearchParams(location.search).get('q') || ''
    setSearchQuery(currentQuery)
  }, [location.pathname, location.search])

  useEffect(() => () => {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  const queueSearchNavigation = (value: string) => {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      const query = value.trim()
      const currentQuery = new URLSearchParams(location.search).get('q') || ''
      const isSearchPage = location.pathname.startsWith('/search')

      if (!query) {
        if (isSearchPage && currentQuery) {
          navigate('/search', { replace: true })
        }
        return
      }

      if (isSearchPage && query === currentQuery.trim()) {
        return
      }

      navigate(`/search?q=${encodeURIComponent(query)}`, { replace: isSearchPage })
    }, 350)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current)
    }

    const query = searchQuery.trim()
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  const switchLanguage = (lng: string) => {
    i18n.changeLanguage(lng)
  }

  const Chevron = isRtl ? ChevronLeft : ChevronRight
  const mobileBreadcrumb = finalBreadcrumb.length > 0
    ? t(finalBreadcrumb[finalBreadcrumb.length - 1])
    : t('app.name')

  return (
    <header className="shrink-0 border-b bg-background/80 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 lg:hidden"
            onClick={onOpenSidebar}
            title={t('nav.dashboard')}
          >
            <Menu className="h-4 w-4" />
          </Button>

          <div className="min-w-0">
            <nav className="hidden items-center text-sm sm:flex">
              {finalBreadcrumb.map((key, i) => (
                <span key={i} className="flex items-center">
                  {i > 0 && <Chevron className="mx-1.5 h-3 w-3 text-muted-foreground/50" />}
                  <span className={i === finalBreadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                    {t(key)}
                  </span>
                </span>
              ))}
            </nav>
            <p className="truncate text-sm font-semibold sm:hidden">{mobileBreadcrumb}</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="order-3 relative w-full md:order-none md:max-w-sm md:flex-1">
          <Search className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground`} />
          <Input
            placeholder={t('header.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => {
              const nextValue = e.target.value
              setSearchQuery(nextValue)
              queueSearchNavigation(nextValue)
            }}
            className={`${isRtl ? 'pr-9' : 'pl-9'} h-10 border-0 bg-muted/60 focus-visible:ring-1`}
          />
        </form>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title={t('header.language')}>
                <Languages className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => switchLanguage('en')} className={i18n.language === 'en' ? 'bg-accent' : ''}>
                {t('header.english')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => switchLanguage('ar')} className={i18n.language === 'ar' ? 'bg-accent' : ''}>
                {t('header.arabic')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground"
            onClick={toggleTheme}
            title={theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground"
            onClick={() => window.location.reload()}
            title={t('header.refresh')}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 text-muted-foreground"
            onClick={() => navigate('/reports')}
            title={t('header.pendingItems')}
          >
            <Bell className="h-4 w-4" />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-xs font-semibold leading-none">{user?.firstName} {user?.lastName}</span>
                  <Badge variant="outline" className="mt-0.5 h-4 px-1.5 text-[9px] font-medium">
                    {user?.role?.toUpperCase()}
                  </Badge>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/security')}>
                <Settings className="me-2 h-4 w-4" /> {t('header.settings')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/audit-logs')}>
                <Shield className="me-2 h-4 w-4" /> {t('nav.auditLogs')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/guide')}>
                <Languages className="me-2 h-4 w-4" /> {t('nav.guide')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-600">
                <LogOut className="me-2 h-4 w-4" /> {t('app.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
