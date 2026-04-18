import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatDateTime } from '@/lib/utils'
import {
  Loader2,
  Crown,
  Star,
  Gift,
  Zap,
  ChevronLeft,
  ChevronRight,
  Eye,
  Rocket,
  Edit2,
  Search,
  ArrowUpDown,
  FilterX,
} from 'lucide-react'

const SUBSCRIPTION_POOL_PAGE_SIZE = 100
const SUBSCRIPTION_POOL_MAX_PAGES = 12

const normalizeSearchText = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const extractSubscriptions = (payload: any): any[] => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  return payload.subscriptions || payload.items || payload.results || payload.rows || payload.data || []
}

export default function SubscriptionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({ free: 0, trial: 0, premium: 0, gold: 0 })
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(true)

  const [boosts, setBoosts] = useState<any[]>([])
  const [boostsLoading, setBoostsLoading] = useState(false)
  const [showBoosts, setShowBoosts] = useState(false)

  // Override State
  const [plans, setPlans] = useState<any[]>([])
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [overrideData, setOverrideData] = useState({ planId: '', durationDays: 30 })

  useEffect(() => {
    adminApi.getPlans().then(res => setPlans(res.data)).catch(console.error)
  }, [])

  const fetchSubscriptions = async () => {
    setLoading(true)
    try {
      const baseQuery = {
        plan: planFilter === 'all' ? undefined : planFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        sortBy,
        sortOrder,
      }
      const trimmedSearch = searchQuery.trim()

      if (trimmedSearch) {
        const firstResponse = await adminApi.getSubscriptions({
          page: 1,
          limit: SUBSCRIPTION_POOL_PAGE_SIZE,
          ...baseQuery,
        })
        const firstPageItems = extractSubscriptions(firstResponse.data)
        const totalRecords = Number(firstResponse.data?.total ?? firstPageItems.length)
        const totalPages = Math.min(
          Math.max(1, Math.ceil(totalRecords / SUBSCRIPTION_POOL_PAGE_SIZE)),
          SUBSCRIPTION_POOL_MAX_PAGES
        )

        const remainingResponses =
          totalPages > 1
            ? await Promise.all(
                Array.from({ length: totalPages - 1 }, (_, index) =>
                  adminApi.getSubscriptions({
                    page: index + 2,
                    limit: SUBSCRIPTION_POOL_PAGE_SIZE,
                    ...baseQuery,
                  })
                )
              )
            : []

        const subscriptionPool = [
          ...firstPageItems,
          ...remainingResponses.flatMap((response) => extractSubscriptions(response.data)),
        ]
        const filteredSubscriptions = subscriptionPool.filter((subscription) =>
          matchesSearchQuery(subscription, trimmedSearch)
        )
        const startIndex = (page - 1) * limit

        setSubscriptions(filteredSubscriptions.slice(startIndex, startIndex + limit))
        setTotal(filteredSubscriptions.length)
        setCounts(buildPlanCounts(subscriptionPool))
        return
      }

      const { data } = await adminApi.getSubscriptions({
        page,
        limit,
        search: undefined,
        ...baseQuery,
      })
      const items = extractSubscriptions(data)
      setSubscriptions(items)
      setTotal(Number(data?.total ?? items.length))
      if (data?.counts) {
        setCounts({
          free: Number(data.counts.free ?? 0),
          trial: Number(data.counts.trial ?? 0),
          premium: Number(data.counts.premium ?? 0),
          gold: Number(data.counts.gold ?? 0),
        })
      } else {
        setCounts(buildPlanCounts(items))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchBoosts = async () => {
    setBoostsLoading(true)
    try {
      const { data } = await adminApi.getBoosts()
      setBoosts(data.boosts || data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setBoostsLoading(false)
    }
  }

  useEffect(() => { fetchSubscriptions() }, [page, planFilter, statusFilter, searchQuery, sortBy, sortOrder])

  const resetFilters = () => {
    setPlanFilter('all')
    setStatusFilter('all')
    setSearchQuery('')
    setSortBy('createdAt')
    setSortOrder('desc')
    setPage(1)
  }

  const totalPages = Math.ceil(total / limit)

  const resolvePlanCode = (subscription: any) =>
    String(subscription.planEntity?.code || subscription.plan || 'free').toLowerCase()

  const matchesSearchQuery = (subscription: any, query: string) => {
    const normalizedQuery = normalizeSearchText(query)
    if (!normalizedQuery) {
      return true
    }

    const fields = [
      subscription.id,
      subscription.userId,
      subscription.status,
      subscription.plan,
      subscription.planCode,
      subscription.planEntity?.code,
      subscription.planEntity?.name,
      subscription.user?.email,
      subscription.user?.username,
      subscription.user?.firstName,
      subscription.user?.lastName,
      `${subscription.user?.firstName || ''} ${subscription.user?.lastName || ''}`.trim(),
      `${subscription.user?.lastName || ''} ${subscription.user?.firstName || ''}`.trim(),
    ]

    return fields.some((field) => normalizeSearchText(field).includes(normalizedQuery))
  }

  const buildPlanCounts = (items: any[]) =>
    items.reduce(
      (accumulator, subscription) => {
        const planCode = resolvePlanCode(subscription)
        if (planCode in accumulator) {
          accumulator[planCode as keyof typeof accumulator] += 1
        }
        return accumulator
      },
      { free: 0, trial: 0, premium: 0, gold: 0 }
    )

  const planBadge = (plan: string) => {
    switch (plan.toLowerCase()) {
      case 'trial': return <Badge className="bg-sky-500 text-white">Trial</Badge>
      case 'gold': return <Badge className="bg-amber-500 text-white">Gold</Badge>
      case 'premium': return <Badge className="bg-purple-500 text-white">Premium</Badge>
      default: return <Badge variant="secondary">Free</Badge>
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge variant="success">Active</Badge>
      case 'trial': return <Badge className="bg-sky-500 text-white">Trial</Badge>
      case 'past_due': return <Badge variant="warning">Past Due</Badge>
      case 'cancelled': return <Badge variant="warning">Cancelled</Badge>
      case 'expired': return <Badge variant="secondary">Expired</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('subscriptions.title')}</h1>
        <p className="text-muted-foreground">{t('subscriptions.subtitle')}</p>
      </div>

      <div className="flex justify-end">
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => navigate('/plans')}>
            <Edit2 className="h-4 w-4" />
            Manage Plans
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => navigate('/subscriptions/finance')}>
            <Crown className="h-4 w-4" />
            Open Finance Screen
          </Button>
        </div>
      </div>

      {/* Plan Breakdown */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setPlanFilter('free'); setPage(1) }}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-slate-100 p-3"><Gift className="h-6 w-6 text-slate-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Free</p>
              <p className="text-2xl font-bold">{counts.free}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setPlanFilter('trial'); setPage(1) }}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-sky-100 p-3"><Zap className="h-6 w-6 text-sky-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Trial</p>
              <p className="text-2xl font-bold">{counts.trial}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setPlanFilter('premium'); setPage(1) }}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-purple-100 p-3"><Star className="h-6 w-6 text-purple-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Premium</p>
              <p className="text-2xl font-bold">{counts.premium}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setPlanFilter('gold'); setPage(1) }}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-amber-100 p-3"><Crown className="h-6 w-6 text-amber-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Gold</p>
              <p className="text-2xl font-bold">{counts.gold}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setShowBoosts(!showBoosts); if (!showBoosts && boosts.length === 0) fetchBoosts() }}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-orange-100 p-3"><Rocket className="h-6 w-6 text-orange-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Boosts</p>
              <p className="text-2xl font-bold">{boosts.length || '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Boosts Section */}
      {showBoosts && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Rocket className="h-5 w-5 text-orange-500" /> Profile Boosts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {boostsLoading ? (
              <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : boosts.length === 0 ? (
              <p className="py-4 text-center text-muted-foreground">No boosts found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">User</th>
                      <th className="pb-2 pr-4 font-medium">Type</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 pr-4 font-medium">Views Gained</th>
                      <th className="pb-2 pr-4 font-medium">Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {boosts.map((b: any) => (
                      <tr key={b.id} className="hover:bg-muted/50">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(`/users/${b.userId}`)}>
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px]">{b.user?.firstName?.[0] || '?'}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium">{b.user ? `${b.user.firstName} ${b.user.lastName}` : b.userId?.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-4"><Badge variant="outline" className="text-[10px] capitalize">{b.type}</Badge></td>
                        <td className="py-2 pr-4">
                          <Badge variant={b.isActive ? 'success' : 'secondary'}>{b.isActive ? 'Active' : 'Expired'}</Badge>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{b.profileViewsGained || 0}</td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs">{b.expiresAt ? formatDateTime(b.expiresAt) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by user name, email, subscription ID..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
          />
        </div>

        <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1) }}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('users.allPlans')}</SelectItem>
            <SelectItem value="free">{t('users.free')}</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="premium">{t('users.premium')}</SelectItem>
            <SelectItem value="gold">{t('users.gold')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1) }}>
          <SelectTrigger>
            <ArrowUpDown className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">Created</SelectItem>
            <SelectItem value="startDate">Start Date</SelectItem>
            <SelectItem value="endDate">End Date</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="plan">Plan</SelectItem>
            <SelectItem value="email">User Email</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortOrder} onValueChange={(v) => { setSortOrder(v as 'asc' | 'desc'); setPage(1) }}>
          <SelectTrigger>
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Descending</SelectItem>
            <SelectItem value="asc">Ascending</SelectItem>
          </SelectContent>
        </Select>

        <div className="sm:col-span-2 lg:col-span-6 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{total} {t('nav.subscriptions')}</span>
          <Button variant="outline" size="sm" className="gap-2" onClick={resetFilters}>
            <FilterX className="h-4 w-4" /> Reset Filters
          </Button>
        </div>
      </div>

      {/* Subscriptions Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('nav.subscriptions')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : subscriptions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{t('subscriptions.noSubscriptions')}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 pr-4 font-medium">User</th>
                      <th className="pb-3 pr-4 font-medium">Plan</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 pr-4 font-medium">Start</th>
                      <th className="pb-3 pr-4 font-medium">End</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {subscriptions.map((sub: any) => (
                      <tr key={sub.id} className="hover:bg-muted/50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                {sub.user?.firstName?.[0] || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">
                                {sub.user ? `${sub.user.firstName} ${sub.user.lastName}` : sub.userId?.slice(0, 8)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{sub.user?.email || ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4">{planBadge(resolvePlanCode(sub))}</td>
                        <td className="py-3 pr-4">{statusBadge(sub.status)}</td>
                        <td className="py-3 pr-4 text-muted-foreground text-xs">{sub.startDate ? formatDateTime(sub.startDate) : '-'}</td>
                        <td className="py-3 pr-4 text-muted-foreground text-xs">{sub.endDate ? formatDateTime(sub.endDate) : '-'}</td>
                        <td className="py-3 text-right">
                          <Button size="icon" variant="ghost" onClick={() => {
                            setSelectedUserId(sub.userId)
                            setIsOverrideModalOpen(true)
                          }}>
                            <Edit2 className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => navigate(`/users/${sub.userId}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-muted-foreground">{t('common.page')} {page} {t('common.of')} {totalPages}</p>
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Override Modal */}
      {isOverrideModalOpen && (
        <Dialog open={isOverrideModalOpen} onOpenChange={setIsOverrideModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Override User Subscription</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Select Plan</label>
                <Select value={overrideData.planId} onValueChange={v => setOverrideData({...overrideData, planId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select a plan..." /></SelectTrigger>
                  <SelectContent>
                    {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Duration (Days)</label>
                <Input type="number" value={overrideData.durationDays} onChange={e => setOverrideData({...overrideData, durationDays: Number(e.target.value)})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOverrideModalOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
                if (!selectedUserId || !overrideData.planId) return;
                try {
                  await adminApi.overrideSubscription(selectedUserId, overrideData)
                  setIsOverrideModalOpen(false)
                  fetchSubscriptions()
                } catch(e) { console.error(e) }
              }}>Save Override</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
