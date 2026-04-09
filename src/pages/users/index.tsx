import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { User, UserStatus } from '@/types'
import { formatDateTime } from '@/lib/utils'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Ban,
  Shield,
  Trash2,
  Loader2,
  UserPlus,
} from 'lucide-react'

type UserRecord = Record<string, any>

const isRecord = (value: unknown): value is UserRecord =>
  typeof value === 'object' && value !== null

const extractUsers = (payload: unknown): UserRecord[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  if (!isRecord(payload)) {
    return []
  }

  for (const key of ['users', 'results', 'items', 'records', 'rows', 'data']) {
    const candidate = payload[key]
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
    if (isRecord(candidate)) {
      const nestedUsers = extractUsers(candidate)
      if (nestedUsers.length > 0) {
        return nestedUsers
      }
    }
  }

  return []
}

const extractTotal = (payload: unknown, fallback: number): number => {
  if (!isRecord(payload)) {
    return fallback
  }

  for (const candidate of [
    payload.total,
    payload.totalCount,
    payload.count,
    isRecord(payload.meta) ? payload.meta.total : undefined,
    isRecord(payload.pagination) ? payload.pagination.total : undefined,
  ]) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
  }

  return isRecord(payload.data) ? extractTotal(payload.data, fallback) : fallback
}

const normalizeSearchText = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const uniqueUsersById = (items: UserRecord[]) =>
  Array.from(new Map(items.map((item) => [String(item.id || ''), item])).values()).filter((item) => item.id)

const userMatchesQuery = (user: UserRecord, query: string) => {
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

const statusBadge = (status: string, t: (k: string) => string) => {
  switch (status) {
    case 'active': return <Badge variant="success">{t('users.active')}</Badge>
    case 'suspended': return <Badge variant="warning">{t('users.suspended')}</Badge>
    case 'banned': return <Badge variant="destructive">{t('users.banned')}</Badge>
    default: return <Badge variant="secondary">{status}</Badge>
  }
}

export default function UsersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [planFilter, setPlanFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)

  // Create user dialog
  const [createDialog, setCreateDialog] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', firstName: '', lastName: '', role: 'user', status: 'active' })
  const [createLoading, setCreateLoading] = useState(false)

  // Status change dialog
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; user: User | null; newStatus: string }>({
    open: false, user: null, newStatus: '',
  })

  // Delete dialog
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: User | null }>({
    open: false, user: null,
  })

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const status = statusFilter === 'all' ? undefined : statusFilter
      const role = roleFilter === 'all' ? undefined : roleFilter
      const plan = planFilter === 'all' ? undefined : planFilter
      const trimmedSearch = search.trim()

      const applyPaginatedLocalResults = async () => {
        const settledResponses = await Promise.allSettled(
          Array.from({ length: 5 }, (_, index) =>
            adminApi.getUsers(index + 1, 100, status, undefined, role, plan)
          )
        )

        const fallbackPool = uniqueUsersById(
          settledResponses.flatMap((result) => {
            if (result.status !== 'fulfilled') {
              return []
            }

            return extractUsers(result.value.data)
          })
        ) as User[]

        const filteredPool = fallbackPool.filter((user) => userMatchesQuery(user, trimmedSearch))
        const start = (page - 1) * limit
        setUsers(filteredPool.slice(start, start + limit))
        setTotal(filteredPool.length)
      }

      const res = await adminApi.getUsers(page, limit, status, trimmedSearch || undefined, role, plan)
      const payload = res.data
      const userList = extractUsers(payload) as User[]

      if (!trimmedSearch) {
        setUsers(userList)
        setTotal(extractTotal(payload, userList.length))
        return
      }

      const filteredList = userList.filter((user) => userMatchesQuery(user, trimmedSearch))
      if (filteredList.length > 0 && filteredList.length === userList.length) {
        setUsers(filteredList)
        setTotal(extractTotal(payload, filteredList.length))
        return
      }

      await applyPaginatedLocalResults()
    } catch (err) {
      console.error('Failed to fetch users:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [page, statusFilter, roleFilter, planFilter, search])

  useEffect(() => {
    const nextSearch = searchInput.trim()
    if (nextSearch === search) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setPage(1)
      setSearch(nextSearch)
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [searchInput, search])

  const handleStatusChange = async () => {
    if (!statusDialog.user) return
    try {
      await adminApi.updateUserStatus(statusDialog.user.id, statusDialog.newStatus)
      setStatusDialog({ open: false, user: null, newStatus: '' })
      fetchUsers()
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  const handleDelete = async () => {
    if (!deleteDialog.user) return
    try {
      await adminApi.deleteUser(deleteDialog.user.id)
      setDeleteDialog({ open: false, user: null })
      fetchUsers()
    } catch (err) {
      console.error('Failed to delete user:', err)
    }
  }

  const handleCreateUser = async () => {
    setCreateLoading(true)
    try {
      await adminApi.createUser(createForm)
      setCreateDialog(false)
      setCreateForm({ email: '', password: '', firstName: '', lastName: '', role: 'user', status: 'active' })
      fetchUsers()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create user')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleSearchSubmit = () => {
    setSearch(searchInput.trim())
    setPage(1)
  }

  const filteredUsers = users

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('users.title')}</h1>
          <p className="text-muted-foreground">{t('users.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateDialog(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> {t('users.createUser')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('users.search')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('users.allStatuses')}</SelectItem>
            <SelectItem value="active">{t('users.active')}</SelectItem>
            <SelectItem value="suspended">{t('users.suspended')}</SelectItem>
            <SelectItem value="banned">{t('users.banned')}</SelectItem>
            <SelectItem value="pending_verification">{t('reports.pending')}</SelectItem>
            <SelectItem value="deactivated">{t('users.deactivated')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('users.allRoles')}</SelectItem>
            <SelectItem value="user">{t('users.user')}</SelectItem>
            <SelectItem value="admin">{t('users.admin')}</SelectItem>
            <SelectItem value="moderator">{t('users.moderator')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('users.allPlans')}</SelectItem>
            <SelectItem value="free">{t('users.free')}</SelectItem>
            <SelectItem value="premium">{t('users.premium')}</SelectItem>
            <SelectItem value="gold">{t('users.gold')}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleSearchSubmit}>{t('common.search')}</Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('users.title')} ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pe-4 font-medium">{t('users.name')}</th>
                    <th className="pb-3 pe-4 font-medium">{t('users.email')}</th>
                    <th className="pb-3 pe-4 font-medium">{t('users.role')}</th>
                    <th className="pb-3 pe-4 font-medium">{t('users.status')}</th>
                    <th className="pb-3 pe-4 font-medium">{t('userDetail.trustScore')}</th>
                    <th className="pb-3 pe-4 font-medium">{t('users.joined')}</th>
                    <th className="pb-3 font-medium text-end">{t('users.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {user.firstName?.[0]}{user.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.firstName} {user.lastName}</p>
                            {user.isShadowBanned && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Shadow Banned</Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{user.email}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {user.role?.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">{statusBadge(user.status, t)}</td>
                      <td className="py-3 pr-4">
                        <span className={user.trustScore < 30 ? 'text-red-600 font-bold' : user.trustScore < 60 ? 'text-amber-600' : 'text-emerald-600'}>
                          {user.trustScore}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                        {formatDateTime(user.createdAt)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => navigate(`/users/${user.id}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setStatusDialog({
                              open: true,
                              user,
                              newStatus: user.status === 'banned' ? 'active' : 'banned',
                            })}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-500 hover:text-red-600"
                            onClick={() => setDeleteDialog({ open: true, user })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredUsers.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">{t('users.noUsers')}</p>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <p className="text-sm text-muted-foreground">
                {t('common.page')} {page} {t('common.of')} {totalPages} ({total})
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

      {/* Status Change Dialog */}
      <Dialog open={statusDialog.open} onOpenChange={(open) => setStatusDialog({ ...statusDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.status')}</DialogTitle>
            <DialogDescription>
              Set <strong>{statusDialog.user?.firstName} {statusDialog.user?.lastName}</strong> status to <strong>{statusDialog.newStatus}</strong>?
            </DialogDescription>
          </DialogHeader>
          <Select value={statusDialog.newStatus} onValueChange={(v) => setStatusDialog({ ...statusDialog, newStatus: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t('users.active')}</SelectItem>
              <SelectItem value="suspended">{t('users.suspended')}</SelectItem>
              <SelectItem value="banned">{t('users.banned')}</SelectItem>
              <SelectItem value="inactive">{t('users.deactivated')}</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog({ open: false, user: null, newStatus: '' })}>{t('common.cancel')}</Button>
            <Button onClick={handleStatusChange}>{t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.deleteUser')}</DialogTitle>
            <DialogDescription>
              This will soft-delete <strong>{deleteDialog.user?.firstName} {deleteDialog.user?.lastName}</strong>. This action can be reversed in the database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, user: null })}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t('common.delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('users.createUser')}</DialogTitle>
            <DialogDescription>{t('users.subtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">{t('users.name')}</label>
                <Input value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium">{t('users.name')}</label>
                <Input value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">{t('users.email')}</label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium">{t('login.password')}</label>
              <Input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">{t('users.role')}</label>
                <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{t('users.user')}</SelectItem>
                    <SelectItem value="admin">{t('users.admin')}</SelectItem>
                    <SelectItem value="moderator">{t('users.moderator')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">{t('users.status')}</label>
                <Select value={createForm.status} onValueChange={(v) => setCreateForm({ ...createForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('users.active')}</SelectItem>
                    <SelectItem value="suspended">{t('users.suspended')}</SelectItem>
                    <SelectItem value="pending_verification">{t('reports.pending')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleCreateUser} disabled={createLoading || !createForm.email || !createForm.password || !createForm.firstName || !createForm.lastName}>
              {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('users.createUser')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
