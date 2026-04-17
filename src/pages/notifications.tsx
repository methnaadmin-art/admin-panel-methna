import { useEffect, useMemo, useState } from 'react'
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
import { formatDateTime } from '@/lib/utils'
import {
  Loader2,
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  FilterX,
  ArrowUpDown,
  UserRound,
} from 'lucide-react'

type AdminNotification = Record<string, any>

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

export default function NotificationsPage() {
  const { t } = useTranslation()
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [userIdFilter, setUserIdFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [readFilter, setReadFilter] = useState<'all' | 'read' | 'unread'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = {
        page,
        limit,
        sortBy,
        sortOrder,
      }

      if (search.trim()) params.search = search.trim()
      if (userIdFilter.trim()) params.userId = userIdFilter.trim()
      if (typeFilter !== 'all') params.type = typeFilter
      if (readFilter === 'read') params.isRead = true
      if (readFilter === 'unread') params.isRead = false
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo

      const { data } = await adminApi.getNotifications(params)
      setNotifications(data.notifications || data || [])
      setTotal(Number(data.total || 0))
    } catch (err) {
      console.error(err)
      setNotifications([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [page, search, userIdFilter, typeFilter, readFilter, dateFrom, dateTo, sortBy, sortOrder])

  const unreadVisibleCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications]
  )

  const resetFilters = () => {
    setSearch('')
    setUserIdFilter('')
    setTypeFilter('all')
    setReadFilter('all')
    setDateFrom('')
    setDateTo('')
    setSortBy('createdAt')
    setSortOrder('desc')
    setPage(1)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('notifications.title')}</h1>
        <p className="text-muted-foreground">Admin notifications history with full filtering and search.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-blue-50 p-3">
              <Bell className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Matching</p>
              <p className="text-2xl font-bold">{total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-amber-50 p-3">
              <UserRound className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Unread In View</p>
              <p className="text-2xl font-bold">{unreadVisibleCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-emerald-50 p-3">
              <ArrowUpDown className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Page</p>
              <p className="text-2xl font-bold">{page}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search title, body, user, notification ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <Input
          placeholder="User ID"
          value={userIdFilter}
          onChange={(e) => {
            setUserIdFilter(e.target.value)
            setPage(1)
          }}
        />

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
          </SelectContent>
        </Select>

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

        <div>
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

        <div>
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

        <div className="sm:col-span-2 lg:col-span-6 flex justify-end">
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
                    const name = `${notification.user?.firstName || ''} ${notification.user?.lastName || ''}`.trim()
                    const userLabel = name || notification.user?.email || notification.userId || 'Unknown user'

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
                        <td className="py-3 pr-4 text-muted-foreground max-w-[360px] truncate">{notification.body || '-'}</td>
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
