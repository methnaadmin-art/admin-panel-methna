import { adminApi } from './api'

type AdminUserRecord = Record<string, any>

const ADMIN_USER_POOL_PAGE_SIZE = 100
const ADMIN_USER_POOL_MAX_PAGES = 25
const ADMIN_USER_POOL_CACHE_TTL_MS = 30_000
const ADMIN_USER_SEARCH_CACHE_TTL_MS = 15_000

const adminUserPoolCache = new Map<string, { expiresAt: number; users: AdminUserRecord[] }>()
const adminUserSearchCache = new Map<string, { expiresAt: number; users: AdminUserRecord[] }>()

const isRecord = (value: unknown): value is AdminUserRecord =>
  typeof value === 'object' && value !== null

const extractUsers = (payload: unknown): AdminUserRecord[] => {
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

const uniqueUsersById = (items: AdminUserRecord[]) =>
  Array.from(new Map(items.map((item) => [String(item.id || ''), item])).values()).filter((item) => item.id)

const buildCacheKey = (status?: string, role?: string, plan?: string) =>
  JSON.stringify({
    status: status || 'all',
    role: role || 'all',
    plan: plan || 'all',
  })

export const invalidateAdminUserPoolCache = () => {
  adminUserPoolCache.clear()
  adminUserSearchCache.clear()
}

export const searchAdminUsers = async ({
  query,
  limit = 8,
}: {
  query: string
  limit?: number
}) => {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return []
  }

  const cacheKey = JSON.stringify({
    query: trimmedQuery.toLowerCase(),
    limit,
  })
  const cachedEntry = adminUserSearchCache.get(cacheKey)

  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.users
  }

  const response = await adminApi.searchUsers(trimmedQuery, 1, limit)
  const users = uniqueUsersById(extractUsers(response.data)).slice(0, limit)

  adminUserSearchCache.set(cacheKey, {
    expiresAt: Date.now() + ADMIN_USER_SEARCH_CACHE_TTL_MS,
    users,
  })

  return users
}

export const fetchAdminUserPool = async ({
  status,
  role,
  plan,
  force = false,
}: {
  status?: string
  role?: string
  plan?: string
  force?: boolean
}) => {
  const cacheKey = buildCacheKey(status, role, plan)
  const cachedEntry = adminUserPoolCache.get(cacheKey)

  if (!force && cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.users
  }

  const firstResponse = await adminApi.getUsers(
    1,
    ADMIN_USER_POOL_PAGE_SIZE,
    status,
    undefined,
    role,
    plan,
  )

  const firstPageUsers = extractUsers(firstResponse.data)
  const totalUsers = extractTotal(firstResponse.data, firstPageUsers.length)
  const totalPages = firstPageUsers.length === 0
    ? 1
    : Math.min(
        Math.max(
          Math.ceil(totalUsers / ADMIN_USER_POOL_PAGE_SIZE),
          firstPageUsers.length === ADMIN_USER_POOL_PAGE_SIZE ? 2 : 1,
        ),
        ADMIN_USER_POOL_MAX_PAGES,
      )

  if (totalPages <= 1) {
    const users = uniqueUsersById(firstPageUsers)
    adminUserPoolCache.set(cacheKey, {
      expiresAt: Date.now() + ADMIN_USER_POOL_CACHE_TTL_MS,
      users,
    })
    return users
  }

  const settledResponses = await Promise.allSettled(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      adminApi.getUsers(
        index + 2,
        ADMIN_USER_POOL_PAGE_SIZE,
        status,
        undefined,
        role,
        plan,
      )
    )
  )

  const users = uniqueUsersById([
    ...firstPageUsers,
    ...settledResponses.flatMap((result) => {
      if (result.status !== 'fulfilled') {
        return []
      }

      return extractUsers(result.value.data)
    }),
  ])

  adminUserPoolCache.set(cacheKey, {
    expiresAt: Date.now() + ADMIN_USER_POOL_CACHE_TTL_MS,
    users,
  })

  return users
}
