import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api'
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

export default function SearchUsersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)

  // Search query (from header search bar or manual input)
  const urlQuery = (searchParams.get('q') || '').trim()
  const [searchQuery, setSearchQuery] = useState(urlQuery)
  const [submittedQuery, setSubmittedQuery] = useState(urlQuery)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  // Sync with header search bar query (?q=...)
  useEffect(() => {
    setSearchQuery(urlQuery)
    setSubmittedQuery(urlQuery)
    setPage(1)
  }, [urlQuery])

  // Perform search when submitted query, filters, or page changes
  useEffect(() => {
    performSearch(submittedQuery, statusFilter, roleFilter)
  }, [submittedQuery, page, statusFilter, roleFilter])

  const handleSearch = () => {
    const nextQuery = searchQuery.trim()

    // If nothing changed, still allow explicit retry while on same page.
    if (nextQuery == submittedQuery && page === 1) {
      performSearch(nextQuery, statusFilter, roleFilter)
      return
    }

    setSubmittedQuery(nextQuery)
    setPage(1)
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
    setLoading(true)
    try {
      const { data } = await adminApi.getUsers(
        page,
        20,
        status !== 'all' ? status : undefined,
        query?.trim() || undefined,
        role !== 'all' ? role : undefined,
      )
      const list = Array.isArray(data) ? data : data?.users || []
      setResults(list)
      setTotal(data?.total ?? list.length)
    } catch (err) {
      console.error(err)
      setResults([])
      setTotal(0)
    } finally {
      setLoading(false)
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
