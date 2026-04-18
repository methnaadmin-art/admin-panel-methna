import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Loader2, Crown, Wallet, TrendingUp, CalendarClock, RefreshCw, Eye } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const PAGE_SIZE = 100
const MAX_PAGES = 8
const DAY_IN_MS = 24 * 60 * 60 * 1000

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return ''
}

const parseSafeDate = (value?: string | null) => {
  if (!value) {
    return null
  }

  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

const normalizePlanCode = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim().toLowerCase()
    }
  }

  return 'free'
}

const formatPlanLabel = (planCode: string) => {
  switch (planCode) {
    case 'trial':
      return 'Trial'
    case 'gold':
      return 'Gold'
    case 'premium':
      return 'Premium'
    default:
      return 'Free'
  }
}

const getPlanBadgeClass = (planCode: string) => {
  switch (planCode) {
    case 'trial':
      return 'bg-sky-500 text-white'
    case 'gold':
      return 'bg-amber-500 text-white'
    case 'premium':
      return 'bg-purple-500 text-white'
    default:
      return ''
  }
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)

const getCollection = (payload: any) => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  return payload.subscriptions || payload.items || payload.results || payload.rows || payload.data || []
}

export default function SubscriptionFinancePage() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<any[]>([])
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadFinanceData = async () => {
      setLoading(true)
      setError('')

      try {
        const plansResponse = await adminApi.getPlans()
        const plansPayload: any = plansResponse.data
        const nextPlans = Array.isArray(plansPayload)
          ? plansPayload
          : Array.isArray(plansPayload?.plans)
            ? plansPayload.plans
            : []
        setPlans(nextPlans)

        const loadedSubscriptions: any[] = []
        let currentPage = 1
        let totalPages = 1

        while (currentPage <= totalPages && currentPage <= MAX_PAGES) {
          const response = await adminApi.getSubscriptions(currentPage, PAGE_SIZE)
          const items = getCollection(response.data)
          loadedSubscriptions.push(...items)

          const total = Number(response.data?.total ?? loadedSubscriptions.length)
          totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
          currentPage += 1
        }

        setSubscriptions(loadedSubscriptions)
      } catch (loadError: any) {
        console.error(loadError)
        setError(loadError?.response?.data?.message || 'Failed to load subscription finance data.')
      } finally {
        setLoading(false)
      }
    }

    void loadFinanceData()
  }, [])

  const planLookup = useMemo(() => {
    const lookup = new Map<string, any>()
    plans.forEach((plan) => {
      const code = normalizePlanCode(plan.code, plan.name)
      lookup.set(code, plan)
    })
    return lookup
  }, [plans])

  const normalizedSubscriptions = useMemo(() => {
    return subscriptions.map((subscription) => {
      const planCode = normalizePlanCode(
        subscription.plan,
        subscription.planCode,
        subscription.planEntity?.code,
        subscription.planEntity?.name,
      )
      const planEntity = subscription.planEntity || planLookup.get(planCode)
      const planPrice = Number(planEntity?.price ?? subscription.amount ?? subscription.price ?? 0)
      const startDate = parseSafeDate(pickString(subscription.startDate, subscription.createdAt))
      const endDate = parseSafeDate(pickString(subscription.endDate, subscription.expiryDate))
      const durationDays = Number(planEntity?.durationDays) > 0
        ? Number(planEntity.durationDays)
        : startDate && endDate
          ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / DAY_IN_MS))
          : 30
      const monthlyEquivalent = durationDays > 0 ? planPrice * (30 / durationDays) : planPrice
      const status = pickString(subscription.status).toLowerCase() || 'active'

      return {
        id: pickString(subscription.id, `${subscription.userId}-${subscription.createdAt}-${planCode}`),
        userId: pickString(subscription.userId, subscription.user?.id),
        userName: pickString(
          `${pickString(subscription.user?.firstName)} ${pickString(subscription.user?.lastName)}`.trim(),
          subscription.user?.email,
          pickString(subscription.userId).slice(0, 8)
        ),
        userEmail: pickString(subscription.user?.email),
        planCode,
        planLabel: pickString(planEntity?.name) || formatPlanLabel(planCode),
        status,
        amount: planCode === 'free' || planCode === 'trial' ? 0 : planPrice,
        monthlyEquivalent: planCode === 'free' || planCode === 'trial' ? 0 : monthlyEquivalent,
        startDate,
        endDate,
        createdAt: pickString(subscription.createdAt),
      }
    })
  }, [planLookup, subscriptions])

  const financeSummary = useMemo(() => {
    const activePaid = normalizedSubscriptions.filter(
      (subscription) =>
        subscription.planCode !== 'free' &&
        subscription.planCode !== 'trial' &&
        subscription.status === 'active'
    )
    const totalCollected = normalizedSubscriptions.reduce((sum, subscription) => sum + subscription.amount, 0)
    const monthlyProjection = activePaid.reduce((sum, subscription) => sum + subscription.monthlyEquivalent, 0)
    const expiringSoonCount = activePaid.filter((subscription) => {
      if (!subscription.endDate) {
        return false
      }

      const remainingDays = Math.ceil((subscription.endDate.getTime() - Date.now()) / DAY_IN_MS)
      return remainingDays >= 0 && remainingDays <= 7
    }).length

    const revenueByPlan = normalizedSubscriptions.reduce<Record<string, { count: number; revenue: number; active: number }>>((accumulator, subscription) => {
      const key = subscription.planCode
      accumulator[key] ||= { count: 0, revenue: 0, active: 0 }
      accumulator[key].count += 1
      accumulator[key].revenue += subscription.amount
      if (subscription.status === 'active') {
        accumulator[key].active += 1
      }
      return accumulator
    }, {})

    return {
      totalCollected,
      monthlyProjection,
      activePaidCount: activePaid.length,
      expiringSoonCount,
      revenueByPlan,
    }
  }, [normalizedSubscriptions])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subscription Finance</h1>
          <p className="text-muted-foreground">
            Revenue visibility for premium plans, active paid members, and upcoming expiries.
          </p>
        </div>

        <Button variant="outline" className="gap-2" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" />
          Refresh finance
        </Button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                  <Wallet className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Collected</p>
                  <p className="text-2xl font-bold">{formatMoney(financeSummary.totalCollected)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Projected Monthly</p>
                  <p className="text-2xl font-bold">{formatMoney(financeSummary.monthlyProjection)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-2xl bg-purple-100 p-3 text-purple-700">
                  <Crown className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Paid Users</p>
                  <p className="text-2xl font-bold">{financeSummary.activePaidCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                  <CalendarClock className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expiring In 7 Days</p>
                  <p className="text-2xl font-bold">{financeSummary.expiringSoonCount}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr,1.4fr]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Revenue by Plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(financeSummary.revenueByPlan).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No subscription revenue data available yet.</p>
                ) : (
                  Object.entries(financeSummary.revenueByPlan).map(([planCode, planSummary]) => (
                    <div key={planCode} className="rounded-xl border bg-muted/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <Badge className={getPlanBadgeClass(planCode)}>{formatPlanLabel(planCode)}</Badge>
                        <span className="text-sm font-semibold">{formatMoney(planSummary.revenue)}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                        <div>
                          <p className="text-xs uppercase tracking-wide">Records</p>
                          <p className="mt-1 text-base font-semibold text-foreground">{planSummary.count}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide">Active</p>
                          <p className="mt-1 text-base font-semibold text-foreground">{planSummary.active}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Recent Subscription Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {normalizedSubscriptions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No subscription activity found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-3 pr-4 font-medium">User</th>
                          <th className="pb-3 pr-4 font-medium">Plan</th>
                          <th className="pb-3 pr-4 font-medium">Amount</th>
                          <th className="pb-3 pr-4 font-medium">Status</th>
                          <th className="pb-3 pr-4 font-medium">Created</th>
                          <th className="pb-3 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {normalizedSubscriptions.slice(0, 20).map((subscription) => (
                          <tr key={subscription.id} className="hover:bg-muted/40">
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarFallback className="bg-primary/10 text-primary">
                                    {subscription.userName.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium">{subscription.userName}</p>
                                  <p className="text-xs text-muted-foreground">{subscription.userEmail || subscription.userId}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 pr-4">
                              <Badge className={getPlanBadgeClass(subscription.planCode)}>{subscription.planLabel}</Badge>
                            </td>
                            <td className="py-3 pr-4 font-medium">{formatMoney(subscription.amount)}</td>
                            <td className="py-3 pr-4">
                              <Badge variant={subscription.status === 'active' ? 'success' : subscription.status === 'expired' ? 'secondary' : 'warning'}>
                                {subscription.status}
                              </Badge>
                            </td>
                            <td className="py-3 pr-4 text-xs text-muted-foreground">
                              {subscription.createdAt ? formatDateTime(subscription.createdAt) : '-'}
                            </td>
                            <td className="py-3 text-right">
                              <Button size="icon" variant="ghost" onClick={() => navigate(`/users/${subscription.userId}`)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
