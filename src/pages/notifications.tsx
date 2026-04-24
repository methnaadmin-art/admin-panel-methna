import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpDown,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Loader2,
  Search,
  UserRound,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import { searchAdminUsers } from '@/lib/admin-user-search'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type AdminNotification = Record<string, any>
type AdminUserCandidate = Record<string, any>
const NOTIFICATION_SEARCH_WINDOW_LIMIT = 250

const typeBadge = (rawType: string) => {
  const type = (rawType || '').toLowerCase().trim()

  switch (type) {
    case 'match':
      return <Badge variant="success">Match</Badge>
    case 'message':
      return <Badge variant="info">Message</Badge>
    case 'like':
      return <Badge variant="default">Like</Badge>
    case 'subscription':
      return <Badge variant="warning">Subscription</Badge>
    case 'ticket':
      return <Badge variant="secondary">Ticket</Badge>
    case 'verification':
      return <Badge variant="info">Verification</Badge>
    case 'system':
      return <Badge variant="secondary">System</Badge>
    default:
      return <Badge variant="outline">{rawType || 'Unknown'}</Badge>
  }
}

const candidateLabel = (candidate: AdminUserCandidate) => {
  const fullName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim()
  return fullName || candidate.email || candidate.username || candidate.id
}

const notificationUserLabel = (notification: AdminNotification) => {
  const fullName = `${notification.user?.firstName || ''} ${notification.user?.lastName || ''}`.trim()
  return fullName || notification.user?.email || notification.user?.username || notification.userId || 'Unknown user'
}

const extractNotificationRecords = (payload: any): AdminNotification[] => {
  const records = payload?.notifications || payload?.items || payload?.results || payload?.data || payload || []
  return Array.isArray(records) ? records : []
}

const notificationMatchesSearch = (notification: AdminNotification, rawQuery: string) => {
  const terms = rawQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  if (terms.length === 0) {
    return true
  }

  const fullName = `${notification.user?.firstName || ''} ${notification.user?.lastName || ''}`.trim()
  const searchableValues = [
    notification.id,
    notification.title,
    notification.body,
    notification.type,
    notification.userId,
    notification.user?.id,
    notification.user?.email,
    notification.user?.username,
    notification.user?.firstName,
    notification.user?.lastName,
    fullName,
  ]
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map((value) => String(value).toLowerCase())

  return terms.every((term) => searchableValues.some((value) => value.includes(term)))
}

export default function NotificationsPage() {
  const { t } = useTranslation()
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [loading, setLoading] = useState(true)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUserCandidate | null>(null)
  const [userLookup, setUserLookup] = useState('')
  const [userIdFilter, setUserIdFilter] = useState('')
  const [userCandidates, setUserCandidates] = useState<AdminUserCandidate[]>([])
  const [userLookupLoading, setUserLookupLoading] = useState(false)
  const [userLookupAttempted, setUserLookupAttempted] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [readFilter, setReadFilter] = useState<'all' | 'read' | 'unread'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    const query = userLookup.trim()

    if (query.length < 2 || selectedUser?.id && query === candidateLabel(selectedUser)) {
      setUserCandidates([])
      setUserLookupLoading(false)
      setUserLookupAttempted(false)
      return
    }

    let cancelled = false
    const timeout = window.setTimeout(() => {
      setUserLookupLoading(true)
      setUserLookupAttempted(false)
      searchAdminUsers({ query, limit: 8 })
        .then((users) => {
          if (!cancelled) {
            setUserCandidates(users)
            setUserLookupAttempted(true)
          }
        })
        .catch((error) => {
          console.error('[NotificationsPage] Failed to search users', error)
          if (!cancelled) {
            setUserCandidates([])
            setUserLookupAttempted(true)
          }
        })
        .finally(() => {
          if (!cancelled) {
            setUserLookupLoading(false)
          }
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [selectedUser, userLookup])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const baseParams: Record<string, any> = {
        limit,
        sortBy,
        sortOrder,
      }

      if (userIdFilter) baseParams.userId = userIdFilter
      if (typeFilter !== 'all') baseParams.type = typeFilter
      if (readFilter === 'read') baseParams.isRead = true
      if (readFilter === 'unread') baseParams.isRead = false
      if (dateFrom) baseParams.dateFrom = dateFrom
      if (dateTo) baseParams.dateTo = dateTo

      if (search) {
        const { data } = await adminApi.getNotifications({
          ...baseParams,
          page: 1,
          limit: NOTIFICATION_SEARCH_WINDOW_LIMIT,
        })
        const filteredRecords = extractNotificationRecords(data).filter((notification) =>
          notificationMatchesSearch(notification, search)
        )
        const startIndex = (page - 1) * limit
        const endIndex = startIndex + limit

        setNotifications(filteredRecords.slice(startIndex, endIndex))
        setTotal(filteredRecords.length)
        return
      }

      const { data } = await adminApi.getNotifications({
        ...baseParams,
        page,
      })
      const records = extractNotificationRecords(data)
      setNotifications(records)
      setTotal(Number(data.total || data.count || records.length || 0))
    } catch (error) {
      console.error(error)
      setNotifications([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [page, limit, search, userIdFilter, typeFilter, readFilter, dateFrom, dateTo, sortBy, sortOrder])

  const unreadVisibleCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications]
  )

  const resetFilters = () => {
    setSearchInput('')
    setSearch('')
    setSelectedUser(null)
    setUserLookup('')
    setUserIdFilter('')
    setUserCandidates([])
    setUserLookupAttempted(false)
    setTypeFilter('all')
    setReadFilter('all')
    setDateFrom('')
    setDateTo('')
    setSortBy('createdAt')
    setSortOrder('desc')
    setPage(1)
  }

  const totalPages = Math.ceil(total / limit)
  const showUserLookupDropdown = userLookup.trim().length >= 2 && (userLookupLoading || userCandidates.length > 0 || userLookupAttempted)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('notifications.title')}</h1>
        <p className="text-muted-foreground">Search, filter, and review notification history with scalable user lookup.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-violet-50 p-3">
              <Bell className="h-6 w-6 text-violet-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Notifications</p>
              <p className="text-2xl font-bold">{total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-fuchsia-50 p-3">
              <UserRound className="h-6 w-6 text-fuchsia-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Unread In View</p>
              <p className="text-2xl font-bold">{unreadVisibleCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-violet-50 p-3">
              <ArrowUpDown className="h-6 w-6 text-violet-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Page</p>
              <p className="text-2xl font-bold">{page}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12">
        <div className="relative sm:col-span-2 xl:col-span-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search title, body, notification ID, user name, email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="relative sm:col-span-2 xl:col-span-4">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search user by name, email, username, or ID"
            value={userLookup}
            onChange={(e) => {
              setUserLookup(e.target.value)
              setSelectedUser(null)
              setUserIdFilter('')
              setUserLookupAttempted(false)
              setPage(1)
            }}
          />

          {showUserLookupDropdown && (
            <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-background shadow-xl">
              {userLookupLoading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching users...
                </div>
              ) : userCandidates.length > 0 ? (
                userCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className="flex w-full items-start justify-between gap-3 border-b px-3 py-3 text-left last:border-b-0 hover:bg-muted/50"
                    onClick={() => {
                      setSelectedUser(candidate)
                      setUserLookup(candidateLabel(candidate))
                      setUserIdFilter(candidate.id)
                      setUserCandidates([])
                      setUserLookupAttempted(false)
                      setPage(1)
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{candidateLabel(candidate)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {candidate.email || candidate.username || candidate.phone || candidate.id}
                      </p>
                    </div>
                    {selectedUser?.id === candidate.id && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                  </button>
                ))
              ) : (
                <p className="px-3 py-3 text-sm text-muted-foreground">No users found for this search.</p>
              )}
            </div>
          )}

          {selectedUser && (
            <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">{candidateLabel(selectedUser)}</span>
              <span className="ml-2 text-xs text-muted-foreground">{selectedUser.id}</span>
            </div>
          )}
        </div>

        <div className="xl:col-span-2">
          <Select
            value={typeFilter}
            onValueChange={(value) => {
              setTypeFilter(value)
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="message">Message</SelectItem>
              <SelectItem value="match">Match</SelectItem>
              <SelectItem value="like">Like</SelectItem>
              <SelectItem value="subscription">Subscription</SelectItem>
              <SelectItem value="ticket">Ticket</SelectItem>
              <SelectItem value="verification">Verification</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="xl:col-span-2">
          <Select
            value={readFilter}
            onValueChange={(value) => {
              setReadFilter(value as 'all' | 'read' | 'unread')
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Read status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Read States</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="xl:col-span-2">
          <Select
            value={sortBy}
            onValueChange={(value) => {
              setSortBy(value)
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Created</SelectItem>
              <SelectItem value="type">Type</SelectItem>
              <SelectItem value="isRead">Read</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="xl:col-span-2">
          <Select
            value={sortOrder}
            onValueChange={(value) => {
              setSortOrder(value as 'asc' | 'desc')
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Descending</SelectItem>
              <SelectItem value="asc">Ascending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="xl:col-span-2">
          <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> From
          </label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="xl:col-span-2">
          <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> To
          </label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="flex justify-end sm:col-span-2 xl:col-span-12">
          <Button variant="outline" size="sm" className="gap-2" onClick={resetFilters}>
            <FilterX className="h-4 w-4" /> Reset Filters
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Notification Records</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No notifications found for the selected filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">User</th>
                    <th className="pb-3 pr-4 font-medium">Type</th>
                    <th className="pb-3 pr-4 font-medium">Title</th>
                    <th className="pb-3 pr-4 font-medium">Body</th>
                    <th className="pb-3 pr-4 font-medium">Read</th>
                    <th className="pb-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {notifications.map((notification) => {
                    const userLabel = notificationUserLabel(notification)

                    return (
                      <tr key={notification.id} className="hover:bg-muted/50">
                        <td className="py-3 pr-4">
                          <div className="space-y-0.5">
                            <p className="font-medium">{userLabel}</p>
                            <p className="text-xs text-muted-foreground">{notification.userId || '-'}</p>
                          </div>
                        </td>
                        <td className="py-3 pr-4">{typeBadge(notification.type)}</td>
                        <td className="py-3 pr-4 font-medium">{notification.title || '-'}</td>
                        <td className="max-w-[360px] py-3 pr-4 text-muted-foreground truncate">{notification.body || '-'}</td>
                        <td className="py-3 pr-4">
                          <Badge variant={notification.isRead ? 'secondary' : 'warning'}>
                            {notification.isRead ? 'Read' : 'Unread'}
                          </Badge>
                        </td>
                        <td className="py-3 text-xs text-muted-foreground">{formatDateTime(notification.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
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
