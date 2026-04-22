import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  LayoutDashboard,
  Users,
  Flag,
  BarChart3,
  Shield,
  Lock,
  LogOut,
  Heart,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Bell,
  Search,
  CreditCard,
  Activity,
  Headphones,
  Megaphone,
  Crown,
  Settings2,
  Send,
  FileCheck,
  FileText,
  ScrollText,
  BookOpen,
  Sparkles,
  Smartphone,
  ShoppingCart,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { adminApi } from '@/lib/api'
import methnaLogo from '@/assets/methna-logo.png'

interface NavItem {
  to: string
  labelKey: string
  icon: LucideIcon
  badge?: number
}

interface NavSection {
  titleKey: string
  icon: LucideIcon
  items: NavItem[]
}

interface SidebarProps {
  mobileOpen?: boolean
  onNavigate?: () => void
  onRequestClose?: () => void
}

const navSections: NavSection[] = [
  {
    titleKey: 'nav.overview',
    icon: LayoutDashboard,
    items: [
      { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { to: '/analytics', labelKey: 'nav.analytics', icon: BarChart3 },
    ],
  },
  {
    titleKey: 'nav.usersContent',
    icon: Users,
    items: [
      { to: '/users', labelKey: 'nav.allUsers', icon: Users },
      { to: '/search', labelKey: 'nav.searchDiscovery', icon: Search },
      { to: '/verification', labelKey: 'nav.verification', icon: FileCheck },
    ],
  },
  {
    titleKey: 'Content',
    icon: FileText,
    items: [
      { to: '/content', icon: FileText, labelKey: 'Content CMS' }
    ]
  },
  {
    titleKey: 'nav.social',
    icon: Heart,
    items: [
      { to: '/activity', labelKey: 'nav.activityFeed', icon: Activity },
      { to: '/matches', labelKey: 'nav.matches', icon: Heart },
      { to: '/chat', labelKey: 'nav.conversations', icon: MessageSquare },
    ],
  },
  {
    titleKey: 'nav.communication',
    icon: Bell,
    items: [
      { to: '/notifications', labelKey: 'nav.notifications', icon: Bell },
      { to: '/send-notifications', labelKey: 'nav.sendPush', icon: Send },
      { to: '/app-updates', labelKey: 'App Updates', icon: Smartphone },
      { to: '/support', labelKey: 'nav.supportTickets', icon: Headphones },
      { to: '/daily-insights', labelKey: 'nav.dailyInsights', icon: Sparkles },
    ],
  },
  {
    titleKey: 'nav.revenue',
    icon: CreditCard,
    items: [
      { to: '/subscriptions', labelKey: 'nav.subscriptions', icon: Crown },
      { to: '/subscriptions/finance', labelKey: 'Subscription Finance', icon: CreditCard },
      { to: '/plans', labelKey: 'Plans', icon: Settings2 },
      { to: '/consumables', labelKey: 'Consumables', icon: ShoppingCart },
      { to: '/monetization', labelKey: 'nav.monetization', icon: CreditCard },
      { to: '/ads', labelKey: 'nav.adCampaigns', icon: Megaphone },
    ],
  },
  {
    titleKey: 'nav.safetySecurity',
    icon: Shield,
    items: [
      { to: '/reports', labelKey: 'nav.reports', icon: Flag },
      { to: '/trust-safety', labelKey: 'nav.trustSafety', icon: Shield },
      { to: '/security', labelKey: 'nav.security', icon: Lock },
      { to: '/audit-logs', labelKey: 'nav.auditLogs', icon: ScrollText },
    ],
  },
]

export function Sidebar({ mobileOpen = false, onNavigate, onRequestClose }: SidebarProps) {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    // All sections start expanded so all nav buttons are visible
    const initial: Record<string, boolean> = {}
    navSections.forEach((section) => { initial[section.titleKey] = true })
    return initial
  })
  const [badges, setBadges] = useState<Record<string, number>>({})
  const isRtl = i18n.language === 'ar'
  const isPathActive = (to: string) =>
    location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`))

  // Determine which section is active and auto-expand it
  useEffect(() => {
    const active: Record<string, boolean> = {}
    navSections.forEach((section) => {
      const hasActive = section.items.some(
        (item) => isPathActive(item.to)
      )
      if (hasActive) active[section.titleKey] = true
    })
    setOpenSections((prev) => ({ ...prev, ...active }))
  }, [location.pathname])

  // Fetch badge counts
  useEffect(() => {
    adminApi.getStats()
      .then((res) => {
        const stats = res.data
        setBadges({
          '/reports': stats.reports?.pending || 0,
          '/verification': (stats.content?.pendingPhotos || 0) + (stats.users?.pendingVerification || 0),
        })
      })
      .catch(() => {})
  }, [])

  const toggleSection = (titleKey: string) => {
    setOpenSections((prev) => ({ ...prev, [titleKey]: !prev[titleKey] }))
  }

  const CollapseIcon = isRtl
    ? (collapsed ? ChevronLeft : ChevronRight)
    : (collapsed ? ChevronRight : ChevronLeft)
  const effectiveCollapsed = collapsed && !mobileOpen

  const handleNavigate = () => {
    onNavigate?.()
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-[min(86vw,320px)] -translate-x-full flex-col border-e border-white/10 bg-sidebar bg-[radial-gradient(circle_at_top,_rgba(174,91,255,0.24),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(232,121,249,0.18),_transparent_18%)] text-sidebar-foreground shadow-2xl transition-all duration-300 select-none lg:static lg:z-auto lg:h-screen lg:translate-x-0 lg:shadow-none',
          mobileOpen && 'translate-x-0',
          effectiveCollapsed ? 'lg:w-[68px]' : 'lg:w-[272px]'
        )}
      >
        {/* Logo */}
        <div className="flex h-20 items-center gap-3 px-4 shrink-0">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.35rem] border border-white/10 bg-white/10 shadow-[0_16px_34px_rgba(216,51,255,0.25)] backdrop-blur-sm">
            <div className="absolute inset-0 rounded-[1.35rem] bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.28),transparent_58%),linear-gradient(145deg,rgba(174,91,255,0.48),rgba(216,70,239,0.26),rgba(124,58,237,0.24))]" />
            <img src={methnaLogo} alt="Methna logo" className="relative h-10 w-10 object-contain drop-shadow-[0_10px_22px_rgba(235,62,255,0.45)]" />
          </div>
          {!effectiveCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-bold tracking-[0.02em]">{t('app.name')}</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-sidebar-foreground/45">{t('app.subtitle')}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onRequestClose}
            className="ms-auto rounded-lg p-2 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <Separator className="bg-sidebar-accent/60" />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          {navSections.map((section) => {
            const isOpen = openSections[section.titleKey] ?? false
            const sectionHasActive = section.items.some(
              (item) => isPathActive(item.to)
            )
            const sectionBadgeTotal = section.items.reduce((sum, item) => sum + (badges[item.to] || 0), 0)

            return (
              <div key={section.titleKey} className="mb-1">
                {effectiveCollapsed ? (
                  <div className="mb-1 flex justify-center py-1">
                    <div className={cn('h-px w-6', sectionHasActive ? 'bg-primary' : 'bg-sidebar-accent/60')} />
                  </div>
                ) : (
                  <button
                    onClick={() => toggleSection(section.titleKey)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                      sectionHasActive
                        ? 'text-primary'
                        : 'text-sidebar-foreground/40 hover:text-sidebar-foreground/60'
                    )}
                  >
                    <span className={cn('flex-1', isRtl ? 'text-right' : 'text-left')}>{t(section.titleKey)}</span>
                    {sectionBadgeTotal > 0 && (
                      <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                        {sectionBadgeTotal}
                      </span>
                    )}
                    <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
                  </button>
                )}

                <div className={cn('space-y-0.5 overflow-hidden transition-all', effectiveCollapsed ? '' : isOpen ? 'max-h-96' : 'max-h-0')}>
                  {section.items.map((item) => {
                    const isActive = isPathActive(item.to)
                    const badge = badges[item.to] || 0

                    const link = (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all',
                          isActive
                            ? 'bg-primary/15 text-primary shadow-sm'
                            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        )}
                        onClick={handleNavigate}
                      >
                        <item.icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} />
                        {!effectiveCollapsed && (
                          <>
                            <span className="flex-1 truncate">{t(item.labelKey)}</span>
                            {badge > 0 && (
                              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                                {badge > 99 ? '99+' : badge}
                              </span>
                            )}
                          </>
                        )}
                        {effectiveCollapsed && badge > 0 && (
                          <span className="absolute end-1 top-0.5 flex h-2 w-2 rounded-full bg-red-500" />
                        )}
                      </NavLink>
                    )

                    if (effectiveCollapsed) {
                      return (
                        <Tooltip key={item.to}>
                          <TooltipTrigger asChild>
                            <div className="relative">{link}</div>
                          </TooltipTrigger>
                          <TooltipContent side={isRtl ? 'left' : 'right'} className="font-medium">
                            {t(item.labelKey)}
                            {badge > 0 && <span className="ms-2 text-red-500">({badge})</span>}
                          </TooltipContent>
                        </Tooltip>
                      )
                    }

                    return link
                  })}
                </div>
              </div>
            )
          })}

          {/* Guide links */}
          <div className="mt-2 pt-2 border-t border-sidebar-accent/40 space-y-1">
            <NavLink
              to="/guide"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all',
                location.pathname === '/guide'
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
              onClick={handleNavigate}
            >
              <BookOpen className={cn('h-4 w-4 shrink-0', location.pathname === '/guide' && 'text-primary')} />
              {!effectiveCollapsed && <span className="flex-1 truncate">{t('nav.guide')}</span>}
            </NavLink>
          </div>
        </nav>

        <Separator className="bg-sidebar-accent/60" />

        {/* User & Collapse */}
        <div className="p-3 shrink-0">
          {!effectiveCollapsed && user && (
            <div className="mb-3 rounded-lg bg-sidebar-accent/40 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                  {user.firstName?.[0]}{user.lastName?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{user.firstName} {user.lastName}</p>
                  <p className="text-[10px] text-sidebar-foreground/40 truncate">{user.email}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                handleNavigate()
                logout()
              }}
              className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 hover:bg-red-500/15 hover:text-red-400 transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!effectiveCollapsed && <span className="text-xs font-medium">{t('app.signOut')}</span>}
            </button>

            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden rounded-lg p-2 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground lg:block"
            >
              <CollapseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
