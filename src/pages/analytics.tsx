import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adminApi, analyticsApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/stats-card'
import { Loader2, Users, TrendingUp, Heart, Repeat } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DashboardStats } from '@/types'

type AnalyticsRecord = Record<string, any>

interface AnalyticsDashboardView {
  totalUsers?: number
  dailyActiveUsers?: number
  totalMatches?: number
  matchesToday?: number
  totalMessages?: number
  premiumUsers?: number
  conversionRate?: number
  retentionRate?: number
}

interface ConversionView {
  totalLikes?: number
  totalMatches?: number
  conversionRate?: number
}

interface RetentionView {
  cohortSize?: number
  retainedUsers?: number
  retentionRate?: number
}

const isRecord = (value: unknown): value is AnalyticsRecord =>
  typeof value === 'object' && value !== null

const parseNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined

    const normalized = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = parseNumber(value)
    if (parsed !== undefined) {
      return parsed
    }
  }

  return undefined
}

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return ''
}

const unwrapRecord = (payload: unknown): AnalyticsRecord | null => {
  if (!isRecord(payload)) {
    return null
  }

  const nestedCandidates = [payload.data, payload.analytics, payload.summary, payload.metrics]
  for (const candidate of nestedCandidates) {
    if (isRecord(candidate)) {
      return candidate
    }
  }

  return payload
}

const extractArray = (payload: unknown): AnalyticsRecord[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  if (!isRecord(payload)) {
    return []
  }

  for (const key of ['items', 'results', 'series', 'data', 'rows', 'timeline', 'matches']) {
    const candidate = payload[key]
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
    if (isRecord(candidate)) {
      const nested = extractArray(candidate)
      if (nested.length > 0) {
        return nested
      }
    }
  }

  return []
}

const formatPercent = (value?: number) => {
  if (value === undefined) return '-'
  const normalized = value > 1 ? value : value * 100
  return `${normalized.toFixed(1)}%`
}

const normalizeDashboard = (payload: unknown, stats: DashboardStats | null): AnalyticsDashboardView => {
  const source = unwrapRecord(payload)
  const engagement = source && isRecord(source.engagement) ? source.engagement : null
  const retention = source && isRecord(source.retention) ? source.retention : null

  return {
    totalUsers: firstNumber(source?.totalUsers, source?.users, stats?.users.total),
    dailyActiveUsers: firstNumber(source?.dailyActiveUsers, source?.dau, engagement?.dau),
    totalMatches: firstNumber(source?.totalMatches, source?.matches, stats?.content.totalMatches),
    matchesToday: firstNumber(source?.matchesToday, source?.todayMatches),
    totalMessages: firstNumber(source?.totalMessages, source?.messages, stats?.content.totalMessages),
    premiumUsers: firstNumber(source?.premiumUsers, stats?.revenue.premiumUsers),
    conversionRate: firstNumber(source?.conversionRate, source?.conversion, stats?.revenue.conversionRate),
    retentionRate: firstNumber(source?.retentionRate, retention?.day7, source?.retention),
  }
}

const normalizeMatchesData = (payload: unknown) =>
  extractArray(payload)
    .map((item, index) => ({
      date: firstString(item.date, item.day, item.label, item.name, item.period, item.createdAt) || `Item ${index + 1}`,
      count: firstNumber(item.count, item.matches, item.total, item.value) ?? 0,
    }))
    .filter((item) => item.count > 0 || item.date.startsWith('Item ') === false)

const normalizeConversion = (
  payload: unknown,
  stats: DashboardStats | null,
  dashboard: AnalyticsDashboardView,
): ConversionView => {
  const source = unwrapRecord(payload)
  const totalLikes = firstNumber(source?.totalLikes, source?.likes, stats?.swipes.totalLikes)
  const totalMatches = firstNumber(source?.totalMatches, source?.matches, dashboard.totalMatches, stats?.content.totalMatches)
  const directRate = firstNumber(source?.conversionRate, source?.rate, dashboard.conversionRate, stats?.revenue.conversionRate)
  const derivedRate = totalLikes && totalLikes > 0 && totalMatches !== undefined ? totalMatches / totalLikes : undefined

  return {
    totalLikes,
    totalMatches,
    conversionRate: directRate ?? derivedRate,
  }
}

const normalizeRetention = (payload: unknown, dashboard: AnalyticsDashboardView): RetentionView => {
  const source = unwrapRecord(payload)
  return {
    cohortSize: firstNumber(source?.cohortSize, source?.size, source?.totalUsers),
    retainedUsers: firstNumber(source?.retainedUsers, source?.retained, source?.activeUsers),
    retentionRate: firstNumber(source?.retentionRate, source?.rate, dashboard.retentionRate),
  }
}

const normalizeDau = (payload: unknown, dashboard: AnalyticsDashboardView) => {
  const source = unwrapRecord(payload)
  return firstNumber(source?.dau, source?.dailyActiveUsers, source?.value, payload, dashboard.dailyActiveUsers)
}

export default function AnalyticsPage() {
  const { t } = useTranslation()
  const [dashboard, setDashboard] = useState<AnalyticsDashboardView | null>(null)
  const [matchesData, setMatchesData] = useState<Array<{ date: string; count: number }>>([])
  const [conversion, setConversion] = useState<ConversionView | null>(null)
  const [retention, setRetention] = useState<RetentionView | null>(null)
  const [dau, setDau] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [dashRes, matchRes, convRes, retRes, dauRes, statsRes] = await Promise.allSettled([
          analyticsApi.getDashboard(),
          analyticsApi.getMatchesOverTime(30),
          analyticsApi.getConversion(30),
          analyticsApi.getRetention(7),
          analyticsApi.getDau(),
          adminApi.getStats(),
        ])

        const statsPayload =
          statsRes.status === 'fulfilled' && isRecord(statsRes.value.data)
            ? (statsRes.value.data as DashboardStats)
            : null

        const dashboardView = normalizeDashboard(
          dashRes.status === 'fulfilled' ? dashRes.value.data : null,
          statsPayload,
        )

        setDashboard(dashboardView)
        setMatchesData(
          matchRes.status === 'fulfilled'
            ? normalizeMatchesData(matchRes.value.data)
            : []
        )
        setConversion(
          normalizeConversion(
            convRes.status === 'fulfilled' ? convRes.value.data : null,
            statsPayload,
            dashboardView,
          )
        )
        setRetention(
          normalizeRetention(
            retRes.status === 'fulfilled' ? retRes.value.data : null,
            dashboardView,
          )
        )
        setDau(
          normalizeDau(
            dauRes.status === 'fulfilled' ? dauRes.value.data : null,
            dashboardView,
          )
        )
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const hasDashboardMetrics = Boolean(
    dashboard && [
      dashboard.totalUsers,
      dashboard.totalMatches,
      dashboard.totalMessages,
      dashboard.premiumUsers,
      dashboard.dailyActiveUsers,
      dashboard.matchesToday,
    ].some((value) => value !== undefined)
  )

  if (!hasDashboardMetrics && matchesData.length === 0) {
    return <div className="text-center text-muted-foreground">{t('common.noData')}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('analytics.title')}</h1>
        <p className="text-muted-foreground">{t('analytics.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title={t('dashboard.dau')}
          value={dau ?? dashboard?.dailyActiveUsers ?? '-'}
          icon={Users}
        />
        <StatsCard
          title={t('dashboard.conversionRate')}
          value={formatPercent(conversion?.conversionRate ?? dashboard?.conversionRate)}
          subtitle={t('analytics.likesToMatches')}
          icon={TrendingUp}
          iconColor="text-blue-500"
        />
        <StatsCard
          title={t('dashboard.retention')}
          value={formatPercent(retention?.retentionRate ?? dashboard?.retentionRate)}
          subtitle={t('analytics.sevenDayCohort')}
          icon={Repeat}
          iconColor="text-amber-500"
        />
        <StatsCard
          title={t('analytics.matchesToday')}
          value={dashboard?.matchesToday ?? '-'}
          icon={Heart}
          iconColor="text-pink-500"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('dashboard.matchesOverTime')}</CardTitle>
          </CardHeader>
          <CardContent>
            {matchesData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={matchesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#2D7A4F"
                    fill="#2D7A4F"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    name="Matches"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-muted-foreground">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('analytics.platformOverview')}</CardTitle>
          </CardHeader>
          <CardContent>
            {hasDashboardMetrics ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={[
                    { name: 'Users', value: dashboard?.totalUsers || 0 },
                    { name: 'Matches', value: dashboard?.totalMatches || 0 },
                    { name: 'Messages', value: dashboard?.totalMessages || 0 },
                    { name: 'Premium', value: dashboard?.premiumUsers || 0 },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2D7A4F" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-muted-foreground">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('analytics.likeToMatchConversion')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{conversion?.totalLikes ?? '-'}</p>
                <p className="text-xs text-muted-foreground">{t('dashboard.totalLikes')}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{conversion?.totalMatches ?? dashboard?.totalMatches ?? '-'}</p>
                <p className="text-xs text-muted-foreground">{t('dashboard.totalMatches')}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold text-primary">
                  {formatPercent(conversion?.conversionRate ?? dashboard?.conversionRate)}
                </p>
                <p className="text-xs text-muted-foreground">{t('dashboard.conversionRate')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('analytics.userRetention')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{retention?.cohortSize ?? '-'}</p>
                <p className="text-xs text-muted-foreground">{t('analytics.cohortSize')}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{retention?.retainedUsers ?? '-'}</p>
                <p className="text-xs text-muted-foreground">{t('analytics.retained')}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold text-primary">
                  {formatPercent(retention?.retentionRate ?? dashboard?.retentionRate)}
                </p>
                <p className="text-xs text-muted-foreground">{t('dashboard.retention')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
