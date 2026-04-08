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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatDateTime } from '@/lib/utils'
import {
  Loader2,
  Heart,
  HeartOff,
  MessageCircleHeart,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from 'lucide-react'

type ActivityType = 'like' | 'compliment' | 'pass'

type ActivityUser = {
  id?: string
  firstName?: string
  lastName?: string
  username?: string
  email?: string
}

type ActivityItem = {
  id: string
  type: ActivityType
  actor: ActivityUser | null
  actorId?: string
  target: ActivityUser | null
  targetId?: string
  message?: string
  createdAt?: string
}

type ActivityRecord = Record<string, any>

const typeConfig: Record<ActivityType, { label: string; color: string; icon: typeof Heart }> = {
  like: { label: 'Like', color: 'bg-pink-100 text-pink-700', icon: Heart },
  compliment: { label: 'Compliment', color: 'bg-amber-100 text-amber-700', icon: MessageCircleHeart },
  pass: { label: 'Dislike', color: 'bg-gray-100 text-gray-700', icon: HeartOff },
}

const isRecord = (value: unknown): value is ActivityRecord =>
  typeof value === 'object' && value !== null

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

const normalizeActivityType = (value: unknown): ActivityType | null => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''

  switch (raw) {
    case 'like':
    case 'liked':
    case 'swipe_right':
      return 'like'
    case 'compliment':
    case 'compliment_message':
      return 'compliment'
    case 'pass':
    case 'dislike':
    case 'swipe_left':
      return 'pass'
    default:
      return null
  }
}

const extractItems = (payload: unknown): ActivityRecord[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  if (!isRecord(payload)) {
    return []
  }

  for (const key of ['swipes', 'items', 'results', 'activity', 'rows', 'data']) {
    const candidate = payload[key]
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
    if (isRecord(candidate)) {
      const nestedItems = extractItems(candidate)
      if (nestedItems.length > 0) {
        return nestedItems
      }
    }
  }

  return []
}

const extractTotal = (payload: unknown, fallback: number) => {
  if (!isRecord(payload)) {
    return fallback
  }

  const directTotal = payload.total
  if (typeof directTotal === 'number') {
    return directTotal
  }

  const metaTotal = isRecord(payload.meta) ? payload.meta.total : undefined
  if (typeof metaTotal === 'number') {
    return metaTotal
  }

  const paginationTotal = isRecord(payload.pagination) ? payload.pagination.total : undefined
  if (typeof paginationTotal === 'number') {
    return paginationTotal
  }

  const count = payload.count
  if (typeof count === 'number') {
    return count
  }

  return fallback
}

const normalizeUser = (...candidates: unknown[]): ActivityUser | null => {
  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      return candidate as ActivityUser
    }
  }

  return null
}

const getUserName = (user: ActivityUser | null, fallbackId?: string) => {
  if (user) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    if (fullName) return fullName
    if (user.username) return user.username
    if (user.email) return user.email
  }

  if (fallbackId) {
    return fallbackId.slice(0, 8)
  }

  return 'Unknown'
}

const getUserInitial = (user: ActivityUser | null) =>
  firstString(user?.firstName?.[0], user?.username?.[0], user?.email?.[0]) || '?'

const normalizeActivityItem = (item: ActivityRecord, index: number): ActivityItem | null => {
  const type = normalizeActivityType(item.type || item.actionType || item.action || item.kind)
  if (!type) {
    return null
  }

  const actor = normalizeUser(item.swiper, item.liker, item.actor, item.fromUser, item.user)
  const target = normalizeUser(item.target, item.liked, item.receiver, item.toUser, item.matchedUser)
  const actorId = firstString(item.swiperId, item.likerId, item.actorId, item.fromUserId, actor?.id)
  const targetId = firstString(item.targetId, item.likedId, item.receiverId, item.toUserId, target?.id)
  const createdAt = firstString(item.createdAt, item.timestamp, item.date)
  const message = firstString(item.message, item.complimentMessage, item.note, item.text)

  return {
    id: firstString(item.id, item._id) || `${type}-${actorId || 'unknown'}-${targetId || 'unknown'}-${createdAt || index}`,
    type,
    actor,
    actorId,
    target,
    targetId,
    message,
    createdAt,
  }
}

export default function ActivityPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(30)
  const [typeFilter, setTypeFilter] = useState<'all' | ActivityType>('all')
  const [loading, setLoading] = useState(true)

  const counts = activities.reduce<Record<ActivityType, number>>((acc, item) => {
    acc[item.type] += 1
    return acc
  }, { like: 0, compliment: 0, pass: 0 })

  const fetchActivity = async () => {
    setLoading(true)
    try {
      const type = typeFilter === 'all' ? undefined : typeFilter
      const { data } = await adminApi.getSwipes(page, limit, type)
      const normalizedItems = extractItems(data)
        .map(normalizeActivityItem)
        .filter((item): item is ActivityItem => item !== null)

      setActivities(normalizedItems)
      setTotal(typeFilter === 'all' ? extractTotal(data, normalizedItems.length) : extractTotal(data, normalizedItems.length))
    } catch (err) {
      console.error(err)
      setActivities([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchActivity()
  }, [page, typeFilter])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('activity.title')}</h1>
        <p className="text-muted-foreground">See who sent compliments, likes, and dislikes across the platform.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.entries(typeConfig) as Array<[ActivityType, typeof typeConfig[ActivityType]]>).map(([key, cfg]) => {
          const Icon = cfg.icon
          const statValue = typeFilter === key ? total : counts[key]

          return (
            <Card
              key={key}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => {
                setTypeFilter(key)
                setPage(1)
              }}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-lg p-2.5 ${cfg.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{cfg.label}s</p>
                  <p className="text-lg font-bold">{statValue}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={typeFilter}
          onValueChange={(value: 'all' | ActivityType) => {
            setTypeFilter(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="like">Likes</SelectItem>
            <SelectItem value="compliment">Compliments</SelectItem>
            <SelectItem value="pass">Dislikes</SelectItem>
          </SelectContent>
        </Select>

        {typeFilter !== 'all' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTypeFilter('all')
              setPage(1)
            }}
          >
            {t('common.all')}
          </Button>
        )}

        <span className="text-sm text-muted-foreground">{total} {t('common.total')}</span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('activity.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : activities.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{t('common.noData')}</p>
          ) : (
            <>
              <div className="space-y-2">
                {activities.map((activity) => {
                  const cfg = typeConfig[activity.type]
                  const Icon = cfg.icon
                  const actorName = getUserName(activity.actor, activity.actorId)
                  const targetName = getUserName(activity.target, activity.targetId)

                  return (
                    <div
                      key={activity.id}
                      className="flex flex-col gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 md:flex-row md:items-center"
                    >
                      <button
                        type="button"
                        className="flex min-w-[160px] items-center gap-2 text-left"
                        onClick={() => activity.actorId && navigate(`/users/${activity.actorId}`)}
                        disabled={!activity.actorId}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-pink-50 text-xs text-pink-600">
                            {getUserInitial(activity.actor)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm font-medium">{actorName}</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <Badge className={`gap-1 px-2.5 py-1 ${cfg.color}`} variant="secondary">
                          <Icon className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">{cfg.label}</span>
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>

                      <button
                        type="button"
                        className="flex min-w-[160px] items-center gap-2 text-left"
                        onClick={() => activity.targetId && navigate(`/users/${activity.targetId}`)}
                        disabled={!activity.targetId}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-purple-50 text-xs text-purple-600">
                            {getUserInitial(activity.target)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm font-medium">{targetName}</span>
                      </button>

                      {activity.message && (
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs italic text-muted-foreground">"{activity.message}"</p>
                        </div>
                      )}

                      <span className="ms-auto whitespace-nowrap text-[10px] text-muted-foreground">
                        {activity.createdAt ? formatDateTime(activity.createdAt) : '-'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-muted-foreground">{t('common.page')} {page} {t('common.of')} {totalPages}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
