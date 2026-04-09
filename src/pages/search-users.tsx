import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminApi, searchApi } from '@/lib/api'
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
    performSearch(urlQuery, statusFilter, roleFilter)
  }, [urlQuery, page, statusFilter, roleFilter])

  const handleSearch = () => {
    const nextQuery = searchQuery.trim()
    const nextSearchUrl = nextQuery ? `/search?q=${encodeURIComponent(nextQuery)}` : '/search'

    // If nothing changed, still allow explicit retry while on same page.
    if (nextQuery === urlQuery && page === 1) {
      performSearch(nextQuery, statusFilter, roleFilter)
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

  const performSearch = async (query?: string, status?: string, role?: string) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    try {
      const trimmedQuery = query?.trim()
      const userListRequest = () =>
        adminApi.getUsers(
          page,
          20,
          status !== 'all' ? status : undefined,
          trimmedQuery || undefined,
          role !== 'all' ? role : undefined,
        )

      let payload: unknown

      if (trimmedQuery) {
        try {
          const { data } = await searchApi.search({
            q: trimmedQuery,
            query: trimmedQuery,
            search: trimmedQuery,
            page,
            limit: 20,
            status: status !== 'all' ? status : undefined,
            role: role !== 'all' ? role : undefined,
          })
          payload = data

          const searchResults = extractResults(payload).map(normalizeSearchUser)
          const searchTotal = extractTotal(payload, searchResults.length)

          if (requestId !== requestIdRef.current) {
            return
          }

          if (searchResults.length > 0 || searchTotal > 0) {
            setResults(searchResults)
            setTotal(searchTotal)
            return
          }
        } catch (searchError) {
          console.warn('Dedicated search endpoint failed, falling back to admin users search.', searchError)
        }
      }

      const { data } = await userListRequest()
      payload = data
      const list = extractResults(payload).map(normalizeSearchUser)
      if (requestId !== requestIdRef.current) {
        return
      }
      setResults(list)
      setTotal(extractTotal(payload, list.length))
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

  const totalPages = Math.ceil(total / 20)

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Name or Email</label>
              <Input
                placeholder="Search by name, email..."
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
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="pending_verification">Pending</SelectItem>
                  <SelectItem value="deactivated">Deactivated</SelectItem>
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
                      <Badge variant={user.status === 'active' ? 'success' : user.status === 'suspended' ? 'destructive' : 'secondary'} className="text-[10px] capitalize">{user.status}</Badge>
                      {user.role && user.role !== 'user' && <Badge variant="info" className="text-[10px] capitalize">{user.role}</Badge>}
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
