import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api'
import { fetchAdminUserPool } from '@/lib/admin-user-search'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Loader2, Search, Eye, MapPin, ChevronLeft, ChevronRight } from 'lucide-react'

type SearchResultUser = Record<string, any>
type VerificationFilter = 'all' | 'pending' | 'approved' | 'rejected'
type PremiumFilter = 'all' | 'premium' | 'not_premium' | 'expired'
type UserStatus = 'active' | 'pending_verification' | 'rejected' | 'banned' | 'suspended'

const SEARCH_PAGE_SIZE = 20

const USER_STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'pending_verification', label: 'Pending Verification' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'banned', label: 'Banned' },
  { value: 'suspended', label: 'Suspended' },
]

const isRecord = (value: unknown): value is SearchResultUser =>
  typeof value === 'object' && value !== null

const extractResults = (payload: unknown): SearchResultUser[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  if (!isRecord(payload)) {
    return []
  }

  for (const key of ['users', 'results', 'items', 'profiles', 'records', 'rows', 'matches', 'data']) {
    const candidate = payload[key]
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
    if (isRecord(candidate)) {
      const nestedResults = extractResults(candidate)
      if (nestedResults.length > 0) {
        return nestedResults
      }
    }
  }

  return []
}

const normalizeSearchUser = (value: SearchResultUser, index: number): SearchResultUser => {
  const nestedUser = isRecord(value.user) ? value.user : undefined
  const nestedProfile = isRecord(value.profile)
    ? value.profile
    : nestedUser && isRecord(nestedUser.profile)
      ? nestedUser.profile
      : undefined

  const source = nestedUser || value
  const fullName = typeof source.name === 'string'
    ? source.name.trim()
    : typeof value.name === 'string'
      ? value.name.trim()
      : ''
  const [derivedFirstName = '', ...derivedLastName] = fullName ? fullName.split(/\s+/) : []

  return {
    ...value,
    ...source,
    id: source.id || value.id || source.userId || value.userId || `search-user-${index}`,
    firstName: source.firstName || value.firstName || derivedFirstName,
    lastName: source.lastName || value.lastName || derivedLastName.join(' '),
    email: source.email || value.email || '',
    status: source.status || value.status || 'unknown',
    role: source.role || value.role,
    selfieVerified: Boolean(source.selfieVerified ?? value.selfieVerified ?? source.verified ?? value.verified),
    city: source.city || value.city || nestedProfile?.city,
    profile: nestedProfile || source.profile || value.profile,
  }
}

const normalizeSearchText = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const normalizeUserStatus = (value: unknown): UserStatus | '' => {
  const normalized = normalizeSearchText(value).replace(/\s+/g, '_')

  if (normalized === 'active') return 'active'
  if (normalized === 'pending_verification' || normalized === 'pending') return 'pending_verification'
  if (normalized === 'rejected' || normalized === 'declined' || normalized === 'denied') return 'rejected'
  if (normalized === 'banned') return 'banned'
  if (normalized === 'suspended') return 'suspended'

  return ''
}

const getStatusMeta = (status: unknown) => {
  const normalizedStatus = normalizeUserStatus(status)

  switch (normalizedStatus) {
    case 'active':
      return { label: 'Active', variant: 'success' as const }
    case 'pending_verification':
      return { label: 'Pending Verification', variant: 'warning' as const }
    case 'rejected':
      return { label: 'Rejected', variant: 'destructive' as const }
    case 'banned':
      return { label: 'Banned', variant: 'destructive' as const }
    case 'suspended':
      return { label: 'Suspended', variant: 'warning' as const }
    default:
      return { label: typeof status === 'string' && status.trim() ? status : 'Unknown', variant: 'secondary' as const }
  }
}

const verificationBadge = (label: string, status: 'pending' | 'approved' | 'rejected') => {
  const variant = status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : 'warning'
  return (
    <Badge variant={variant} className="text-[10px]">
      {label}: {status}
    </Badge>
  )
}

const uniqueUsersById = (items: SearchResultUser[]) =>
  Array.from(new Map(items.map((item) => [String(item.id || ''), item])).values()).filter((item) => item.id)

const userMatchesQuery = (user: SearchResultUser, query: string) => {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) {
    return true
  }

  const fields = [
    user.firstName,
    user.lastName,
    `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    user.name,
    user.email,
    user.username,
    user.phone,
    user.city,
    user.profile?.city,
    user.profile?.country,
    user.id,
  ]

  return fields.some((field) => normalizeSearchText(field).includes(normalizedQuery))
}

const parseDate = (value: unknown) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const normalizeVerificationStatus = (statusCandidates: unknown[], boolCandidates: unknown[]): 'pending' | 'approved' | 'rejected' => {
  for (const statusCandidate of statusCandidates) {
    if (typeof statusCandidate !== 'string') {
      continue
    }

    const normalized = statusCandidate.toLowerCase().trim()
    if (!normalized) {
      continue
    }

    if (normalized.includes('approved') || normalized.includes('verified')) {
      return 'approved'
    }

    if (normalized.includes('rejected') || normalized.includes('denied') || normalized.includes('declined')) {
      return 'rejected'
    }
  }

  if (boolCandidates.some((candidate) => candidate === true)) {
    return 'approved'
  }

  return 'pending'
}

const getSelfieStatus = (user: SearchResultUser) =>
  normalizeVerificationStatus(
    [
      user.selfieVerificationStatus,
      user.selfieStatus,
      user.verification?.selfieStatus,
    ],
    [
      user.selfieVerified,
      user.verification?.selfieVerified,
    ]
  )

const getMaritalStatus = (user: SearchResultUser) =>
  normalizeVerificationStatus(
    [
      user.maritalVerificationStatus,
      user.documentVerificationStatus,
      user.verification?.maritalStatus,
      user.verification?.documentStatus,
    ],
    [
      user.maritalStatusVerified,
      user.documentVerified,
      user.verification?.maritalVerified,
      user.verification?.documentVerified,
    ]
  )

const getPremiumSnapshot = (user: SearchResultUser) => {
  const plan = normalizeSearchText(user.subscription?.plan || user.plan || user.currentPlan)
  const status = normalizeSearchText(user.subscription?.status || user.subscriptionStatus)
  const isPremium = user.isPremium === true || user.premium === true || user.premiumEnabled === true || plan === 'premium' || plan === 'gold'

  const expiryCandidate = user.subscription?.endDate || user.subscription?.expiresAt || user.premiumExpiryDate || user.premiumExpiresAt
  const expiryDate = parseDate(expiryCandidate)
  const expired = status === 'expired' || (expiryDate ? expiryDate.getTime() < Date.now() : false)

  return { isPremium, expired }
}

const userMatchesAdvancedFilters = (
  user: SearchResultUser,
  premiumFilter: PremiumFilter,
  verificationFilter: VerificationFilter
) => {
  const premium = getPremiumSnapshot(user)

  if (premiumFilter === 'premium' && (!premium.isPremium || premium.expired)) {
    return false
  }

  if (premiumFilter === 'not_premium' && premium.isPremium) {
    return false
  }

  if (premiumFilter === 'expired' && !premium.expired) {
    return false
  }

  if (verificationFilter !== 'all') {
    const selfieStatus = getSelfieStatus(user)
    const maritalStatus = getMaritalStatus(user)

    if (verificationFilter === 'approved' && !(selfieStatus === 'approved' && maritalStatus === 'approved')) {
      return false
    }

    if (verificationFilter === 'rejected' && !(selfieStatus === 'rejected' || maritalStatus === 'rejected')) {
      return false
    }

    if (verificationFilter === 'pending' && !(selfieStatus === 'pending' || maritalStatus === 'pending')) {
      return false
    }
  }

  return true
}

const extractTotal = (payload: unknown, fallback: number): number => {
  if (!isRecord(payload)) {
    return fallback
  }

  for (const candidate of [
    payload.total,
    payload.totalCount,
    payload.count,
    payload.meta && isRecord(payload.meta) ? payload.meta.total : undefined,
    payload.pagination && isRecord(payload.pagination) ? payload.pagination.total : undefined,
  ]) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
  }

  if (isRecord(payload.data)) {
    return extractTotal(payload.data, fallback)
  }

  return fallback
}

export default function SearchUsersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const requestIdRef = useRef(0)

  // Search query (from header search bar or manual input)
  const urlQuery = (searchParams.get('q') || '').trim()
  const [searchQuery, setSearchQuery] = useState(urlQuery)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>('all')
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>('all')
  const [page, setPage] = useState(1)

  // Sync with header search bar query (?q=...)
  useEffect(() => {
    setSearchQuery(urlQuery)
    setPage(1)
  }, [urlQuery])

  useEffect(() => {
    const nextQuery = searchQuery.trim()
    if (nextQuery === urlQuery) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const nextSearchUrl = nextQuery ? `/search?q=${encodeURIComponent(nextQuery)}` : '/search'
      setPage(1)
      navigate(nextSearchUrl, { replace: true })
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [searchQuery, urlQuery, navigate])

  // Perform search when query from URL, filters, or page changes
  useEffect(() => {
    performSearch(urlQuery, statusFilter, roleFilter, premiumFilter, verificationFilter)
  }, [urlQuery, page, statusFilter, roleFilter, premiumFilter, verificationFilter])

  const handleSearch = () => {
    const nextQuery = searchQuery.trim()
    const nextSearchUrl = nextQuery ? `/search?q=${encodeURIComponent(nextQuery)}` : '/search'

    // If nothing changed, still allow explicit retry while on same page.
    if (nextQuery === urlQuery && page === 1) {
      performSearch(nextQuery, statusFilter, roleFilter, premiumFilter, verificationFilter)
      return
    }

    setPage(1)
    navigate(nextSearchUrl, { replace: nextQuery === urlQuery })
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    setPage(1)
  }

  const handleRoleFilterChange = (value: string) => {
    setRoleFilter(value)
    setPage(1)
  }

  const handlePremiumFilterChange = (value: PremiumFilter) => {
    setPremiumFilter(value)
    setPage(1)
  }

  const handleVerificationFilterChange = (value: VerificationFilter) => {
    setVerificationFilter(value)
    setPage(1)
  }

  const fetchFrontendMatches = async (
    query: string,
    status?: string,
    role?: string,
    premium?: PremiumFilter,
    verification?: VerificationFilter
  ) => {
    const plan = premium === 'premium'
      ? 'premium'
      : premium === 'not_premium'
        ? 'free'
        : undefined

    const userPool = await fetchAdminUserPool({
      status: status !== 'all' ? status : undefined,
      role: role !== 'all' ? role : undefined,
      plan,
    })

    const fallbackPool = uniqueUsersById(
      userPool.map(normalizeSearchUser)
    )

    const filteredPool = fallbackPool.filter((user) =>
      userMatchesQuery(user, query) &&
      userMatchesAdvancedFilters(user, premium || 'all', verification || 'all')
    )
    const start = (page - 1) * SEARCH_PAGE_SIZE
    return {
      results: filteredPool.slice(start, start + SEARCH_PAGE_SIZE),
      total: filteredPool.length,
    }
  }

  const performSearch = async (
    query?: string,
    status?: string,
    role?: string,
    premium?: PremiumFilter,
    verification?: VerificationFilter
  ) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    try {
      const trimmedQuery = query?.trim()
      const plan = premium === 'premium'
        ? 'premium'
        : premium === 'not_premium'
          ? 'free'
          : undefined

      const userListRequest = () =>
        adminApi.getUsers(
          page,
          SEARCH_PAGE_SIZE,
          status !== 'all' ? status : undefined,
          undefined,
          role !== 'all' ? role : undefined,
          plan,
        )

      const requiresLocalAggregation = Boolean(
        trimmedQuery || premium === 'expired' || verification !== 'all'
      )

      if (requiresLocalAggregation) {
        const frontendMatches = await fetchFrontendMatches(
          trimmedQuery || '',
          status,
          role,
          premium,
          verification,
        )

        if (requestId !== requestIdRef.current) {
          return
        }

        setResults(frontendMatches.results)
        setTotal(frontendMatches.total)
        return
      }

      const { data } = await userListRequest()
      const payload = data
      const list = extractResults(payload).map(normalizeSearchUser)
      const listAfterAdvancedFilters = list.filter((user) =>
        userMatchesAdvancedFilters(user, premium || 'all', verification || 'all')
      )
      if (requestId !== requestIdRef.current) {
        return
      }
      setResults(listAfterAdvancedFilters)
      setTotal(extractTotal(payload, listAfterAdvancedFilters.length))
    } catch (err) {
      console.error(err)
      if (requestId === requestIdRef.current) {
        setResults([])
        setTotal(0)
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }

  const totalPages = Math.ceil(total / SEARCH_PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('searchUsers.title')}</h1>
        <p className="text-muted-foreground">{t('searchUsers.subtitle')}</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" /> {t('searchUsers.filters')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
            <div className="lg:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Name, Email, or User ID</label>
              <Input
                placeholder="Search by name, email, or user ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('users.status')}</label>
              <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {USER_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('users.role')}</label>
              <Select value={roleFilter} onValueChange={handleRoleFilterChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('users.allRoles')}</SelectItem>
                  <SelectItem value="user">{t('users.user')}</SelectItem>
                  <SelectItem value="moderator">{t('users.moderator')}</SelectItem>
                  <SelectItem value="admin">{t('users.admin')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Premium</label>
              <Select value={premiumFilter} onValueChange={(value) => handlePremiumFilterChange(value as PremiumFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Premium</SelectItem>
                  <SelectItem value="premium">Premium Active</SelectItem>
                  <SelectItem value="not_premium">Not Premium</SelectItem>
                  <SelectItem value="expired">Expired Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Verification</label>
              <Select value={verificationFilter} onValueChange={(value) => handleVerificationFilterChange(value as VerificationFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={loading} className="w-full gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {t('searchUsers.search')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('searchUsers.results')} ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {t('searchUsers.noResults')}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((user: any, i: number) => (
                <div
                  key={user.id || i}
                  className="flex items-start gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/users/${user.id}`)}
                >
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {user.firstName?.[0] || '?'}{user.lastName?.[0] || ''}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {user.firstName ? `${user.firstName} ${user.lastName || ''}` : user.email || `User ${(user.id || '').slice(0, 8)}`}
                      </p>
                      {user.selfieVerified && <Badge variant="info" className="text-[10px]">Verified</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{user.email}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      {(user.profile?.city || user.city) && (
                        <>
                          <MapPin className="h-3 w-3" />
                          <span>{user.profile?.city || user.city}{user.profile?.country ? `, ${user.profile.country}` : ''}</span>
                        </>
                      )}
                    </div>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      <Badge variant={getStatusMeta(user.status).variant} className="text-[10px]">
                        {getStatusMeta(user.status).label}
                      </Badge>
                      {user.role && user.role !== 'user' && <Badge variant="info" className="text-[10px] capitalize">{user.role}</Badge>}
                      {verificationBadge('Selfie', getSelfieStatus(user))}
                      {verificationBadge('Marital', getMaritalStatus(user))}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/users/${user.id}`) }}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <p className="text-sm text-muted-foreground">{t('common.page')} {page} {t('common.of')} {totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
