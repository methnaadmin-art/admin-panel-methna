import axios from 'axios'

let API_BASE_URL = import.meta.env.VITE_API_URL || 'https://web-production-afbe4.up.railway.app/api/v1'

if (API_BASE_URL) {
  API_BASE_URL = API_BASE_URL.replace(/['"]/g, '').trim()
  if (!API_BASE_URL.startsWith('http')) {
    API_BASE_URL = `https://${API_BASE_URL}`
  }
  API_BASE_URL = API_BASE_URL.replace(/\/$/, '')
  if (!API_BASE_URL.endsWith('/api/v1')) {
    API_BASE_URL = `${API_BASE_URL}/api/v1`
  }
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

const ALTERNATIVE_REQUEST_STATUS_CODES = new Set([400, 404, 405, 422])

// Attach JWT token + CSRF token + security headers to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const csrfToken = sessionStorage.getItem('csrf_token')
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  config.headers['X-Requested-With'] = 'XMLHttpRequest'
  return config
})

// Unwrap backend's { success, data, timestamp } envelope
api.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === 'object' && 'success' in response.data && 'data' in response.data) {
      response.data = response.data.data
    }
    return response
  },
)

// Handle 401 — attempt refresh or redirect to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refresh_token')
        if (!refreshToken) throw new Error('No refresh token')

        const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        })
        const payload = res.data?.data || res.data

        localStorage.setItem('access_token', payload.accessToken)
        if (payload.refreshToken) {
          localStorage.setItem('refresh_token', payload.refreshToken)
        }

        originalRequest.headers.Authorization = `Bearer ${payload.accessToken}`
        return api(originalRequest)
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

const shouldTryAlternativeRequest = (error: any) => {
  const statusCode = error?.response?.status
  return typeof statusCode === 'number' && ALTERNATIVE_REQUEST_STATUS_CODES.has(statusCode)
}

const tryApiRequests = async <T>(requests: Array<() => Promise<T>>) => {
  let lastError: unknown

  for (let index = 0; index < requests.length; index += 1) {
    try {
      return await requests[index]()
    } catch (error) {
      lastError = error
      const hasMoreRequests = index < requests.length - 1
      if (!hasMoreRequests || !shouldTryAlternativeRequest(error)) {
        break
      }
    }
  }

  throw lastError
}

const getSearchText = (params: Record<string, any>) => {
  for (const candidate of [params.search, params.q, params.query, params.term, params.keyword]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }

  return undefined
}

const extractCollection = (payload: any): any[] => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  for (const key of ['subscriptions', 'conversations', 'messages', 'users', 'items', 'results', 'rows', 'data']) {
    const candidate = payload[key]
    if (Array.isArray(candidate)) {
      return candidate
    }
    if (candidate && typeof candidate === 'object') {
      const nested = extractCollection(candidate)
      if (nested.length > 0) {
        return nested
      }
    }
  }

  return []
}

type SortOrder = 'asc' | 'desc'

export interface AdminUsersQueryParams {
  page?: number
  limit?: number
  status?: string
  search?: string
  role?: string
  plan?: string
  premiumState?: 'all' | 'premium' | 'not_premium' | 'expired'
  verificationState?: 'all' | 'pending' | 'approved' | 'rejected'
  dateFrom?: string
  dateTo?: string
  sortBy?: string
  sortOrder?: SortOrder
}

export interface AdminVerificationQueryParams {
  page?: number
  limit?: number
  search?: string
  status?: 'all' | 'pending' | 'approved' | 'rejected'
  type?: 'all' | 'selfie' | 'identity' | 'marital_status'
  userStatus?: string
  dateFrom?: string
  dateTo?: string
  sortBy?: string
  sortOrder?: SortOrder
}

export interface AdminNotificationsQueryParams {
  page?: number
  limit?: number
  search?: string
  userId?: string
  type?: string
  isRead?: boolean
  dateFrom?: string
  dateTo?: string
  sortBy?: string
  sortOrder?: SortOrder
}

export interface AdminTicketsQueryParams {
  page?: number
  limit?: number
  status?: string
  priority?: string
  search?: string
  userId?: string
  assignedToId?: string
  dateFrom?: string
  dateTo?: string
  sortBy?: string
  sortOrder?: SortOrder
}

export interface AdminPlanFeatures {
  unlimitedLikes?: boolean
  unlimitedRewinds?: boolean
  advancedFilters?: boolean
  seeWhoLikesYou?: boolean
  whoLikedMe?: boolean
  readReceipts?: boolean
  typingIndicators?: boolean
  invisibleMode?: boolean
  ghostMode?: boolean
  passportMode?: boolean
  boost?: boolean
  likes?: boolean
  premiumBadge?: boolean
  hideAds?: boolean
  rematch?: boolean
  videoChat?: boolean
  superLike?: boolean
  profileBoostPriority?: boolean
  priorityMatching?: boolean
  improvedVisits?: boolean
}

export interface AdminPlanLimits {
  dailyLikes?: number
  dailySuperLikes?: number
  dailyCompliments?: number
  monthlyRewinds?: number
  weeklyBoosts?: number
  likesLimit?: number
  boostsLimit?: number
  complimentsLimit?: number
}

export interface AdminPlanPayload {
  code: string
  name: string
  description?: string
  price: number
  currency?: string
  billingCycle?: 'monthly' | 'yearly' | 'weekly' | 'one_time'
  googleProductId?: string
  googleBasePlanId?: string
  stripePriceId?: string
  stripeProductId?: string
  durationDays?: number
  isActive?: boolean
  isVisible?: boolean
  sortOrder?: number
  featureFlags?: AdminPlanFeatures
  limits?: AdminPlanLimits
}

export interface AdminPlan extends AdminPlanPayload {
  id: string
  entitlements?: Record<string, any>
  features?: string[]
  createdAt?: string
  updatedAt?: string
}

// ── Consumable Products ──────────────────────────────────────

export interface ConsumableProduct {
  id: string
  code: string
  title: string
  description: string | null
  type: 'likes_pack' | 'compliments_pack' | 'boosts_pack'
  quantity: number
  price: number
  currency: string
  isActive: boolean
  isArchived: boolean
  platformAvailability: 'all' | 'mobile' | 'web'
  sortOrder: number
  googleProductId: string | null
  stripePriceId: string | null
  stripeProductId: string | null
  createdAt: string
  updatedAt: string
}

export interface ConsumableProductPayload {
  code: string
  title: string
  description?: string
  type: 'likes_pack' | 'compliments_pack' | 'boosts_pack'
  quantity: number
  price: number
  currency?: string
  platformAvailability?: 'all' | 'mobile' | 'web'
  sortOrder?: number
  googleProductId?: string
  stripePriceId?: string
  stripeProductId?: string
}

export interface UserBalances {
  likes: number
  compliments: number
  boosts: number
}

export default api

// ── Auth ─────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  logout: () => api.post('/auth/logout'),
}

// ── Admin ────────────────────────────────────────────────────

export const adminApi = {
  // Dashboard
  getStats: () => api.get('/admin/stats'),

  // Users
  getUsers: (
    pageOrQuery: number | AdminUsersQueryParams = 1,
    limit = 20,
    status?: string,
    search?: string,
    role?: string,
    plan?: string,
  ) => {
    const params: AdminUsersQueryParams =
      typeof pageOrQuery === 'object'
        ? {
            page: pageOrQuery.page ?? 1,
            limit: pageOrQuery.limit ?? 20,
            ...pageOrQuery,
          }
        : {
            page: pageOrQuery,
            limit,
            status,
            search: search || undefined,
            role,
            plan,
          }

    return api.get('/admin/users', { params })
  },
  createUser: (data: { email: string; password: string; firstName: string; lastName: string; role?: string; status?: string }) =>
    api.post('/admin/users', data),
  getUserDetail: (id: string) => api.get(`/admin/users/${id}`),
  getUserActivity: (id: string) => api.get(`/admin/users/${id}/activity`),
  getUserActions: (id: string, page = 1, limit = 30) =>
    api.get(`/admin/users/${id}/actions`, { params: { page, limit } }),
  updateUser: (id: string, data: Record<string, any>) =>
    tryApiRequests([
      () => api.patch(`/admin/users/${id}`, data),
      () => api.put(`/admin/users/${id}`, data),
    ]),
  updateUserStatus: (id: string, status: string, options?: {
    reason?: string;
    moderationReasonCode?: string;
    moderationReasonText?: string;
    actionRequired?: string;
    supportMessage?: string;
    isUserVisible?: boolean;
    expiresAt?: string;
    internalAdminNote?: string;
  }) =>
    tryApiRequests([
      () => api.patch(`/admin/users/${id}/status`, {
        status,
        reason: options?.reason,
        moderationReasonCode: options?.moderationReasonCode,
        moderationReasonText: options?.moderationReasonText,
        actionRequired: options?.actionRequired,
        supportMessage: options?.supportMessage,
        isUserVisible: options?.isUserVisible ?? true,
        expiresAt: options?.expiresAt,
        internalAdminNote: options?.internalAdminNote,
      }),
      () => api.patch(`/admin/users/${id}`, {
        status,
        statusReason: options?.reason || null,
        moderationReasonCode: options?.moderationReasonCode || null,
        moderationReasonText: options?.moderationReasonText || null,
        actionRequired: options?.actionRequired || null,
        supportMessage: options?.supportMessage || null,
        isUserVisible: options?.isUserVisible ?? true,
        moderationExpiresAt: options?.expiresAt || null,
        internalAdminNote: options?.internalAdminNote || null,
      }),
      () => api.put(`/admin/users/${id}`, {
        status,
        statusReason: options?.reason || null,
        moderationReasonCode: options?.moderationReasonCode || null,
        moderationReasonText: options?.moderationReasonText || null,
        actionRequired: options?.actionRequired || null,
        supportMessage: options?.supportMessage || null,
        isUserVisible: options?.isUserVisible ?? true,
        moderationExpiresAt: options?.expiresAt || null,
        internalAdminNote: options?.internalAdminNote || null,
      }),
    ]),
  updateUserPremium: (
    id: string,
    data: { enabled: boolean; startDate?: string | null; expiryDate?: string | null; plan?: string }
  ) => {
    const payload = {
      startDate: data.startDate,
      expiryDate: data.expiryDate,
    }
    const fallbackUserPayload = {
      isPremium: data.enabled,
      premiumStartDate: data.enabled ? data.startDate ?? null : null,
      premiumExpiryDate: data.enabled ? data.expiryDate ?? null : null,
      plan: data.enabled ? (data.plan || 'premium') : 'free',
    }

    if (!data.enabled) {
      return tryApiRequests([
        () => api.delete(`/admin/users/${id}/premium`),
        () => api.patch(`/admin/users/${id}`, fallbackUserPayload),
        () => api.put(`/admin/users/${id}`, fallbackUserPayload),
      ])
    }

    return tryApiRequests([
      () => api.post(`/admin/users/${id}/premium`, payload),
      () => api.patch(`/admin/users/${id}`, fallbackUserPayload),
      () => api.put(`/admin/users/${id}`, fallbackUserPayload),
    ])
  },
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),

  // Document Verification
  getPendingDocuments: () =>
    tryApiRequests([
      () => api.get('/admin/verifications', { params: { page: 1, limit: 200, status: 'pending', type: 'marital_status' } }),
      () => api.get('/admin/documents/pending'),
      () => api.get('/admin/verifications/pending'),
      () => api.get('/admin/verification/documents/pending'),
      () => api.get('/admin/users/pending-documents'),
    ]),
  getVerifications: (params: AdminVerificationQueryParams = {}) =>
    api.get('/admin/verifications', { params }),
  verifyDocument: (userId: string, approved: boolean, rejectionReason?: string) =>
    tryApiRequests([
      () => api.patch(`/admin/users/${userId}/verification/marital-status`, {
        status: approved ? 'approved' : 'rejected',
        rejectionReason: approved ? undefined : rejectionReason,
      }),
      () => api.patch(`/admin/documents/${userId}/verify`, { approved, rejectionReason }),
      () => api.patch(`/admin/users/${userId}/document-verification`, { approved, rejectionReason }),
      () => api.patch(`/admin/users/${userId}/verify-document`, { approved, rejectionReason }),
      () => api.patch(`/admin/users/${userId}`, {
        documentVerified: approved,
        documentRejectionReason: approved ? null : rejectionReason ?? null,
      }),
      () => api.put(`/admin/users/${userId}`, {
        documentVerified: approved,
        documentRejectionReason: approved ? null : rejectionReason ?? null,
      }),
    ]),
  verifySelfie: (userId: string, approved: boolean) =>
    tryApiRequests([
      () => api.patch(`/admin/users/${userId}/verification/selfie`, {
        status: approved ? 'approved' : 'rejected',
      }),
      () => api.patch(`/admin/users/${userId}`, {
        selfieVerified: approved,
        selfieVerificationStatus: approved ? 'approved' : 'rejected',
      }),
      () => api.put(`/admin/users/${userId}`, {
        selfieVerified: approved,
        selfieVerificationStatus: approved ? 'approved' : 'rejected',
      }),
    ]),
  verifyMaritalStatus: (userId: string, approved: boolean, rejectionReason?: string) =>
    tryApiRequests([
      () => api.patch(`/admin/users/${userId}/verification/marital-status`, {
        status: approved ? 'approved' : 'rejected',
        rejectionReason,
      }),
      () => api.patch(`/admin/users/${userId}`, {
        maritalVerified: approved,
        maritalStatusVerified: approved,
        documentVerified: approved,
        maritalVerificationStatus: approved ? 'approved' : 'rejected',
        documentVerificationStatus: approved ? 'approved' : 'rejected',
        documentRejectionReason: approved ? null : rejectionReason ?? null,
      }),
      () => api.put(`/admin/users/${userId}`, {
        maritalVerified: approved,
        maritalStatusVerified: approved,
        documentVerified: approved,
        maritalVerificationStatus: approved ? 'approved' : 'rejected',
        documentVerificationStatus: approved ? 'approved' : 'rejected',
        documentRejectionReason: approved ? null : rejectionReason ?? null,
      }),
    ]),
  autoApproveDocuments: () => api.post('/admin/documents/auto-approve'),

  // Swipes / Activity
  getSwipes: (page = 1, limit = 20, type?: string) => {
    const typeAliases = type === 'pass'
      ? ['pass', 'dislike']
      : type === 'dislike'
        ? ['dislike', 'pass']
        : [type]

    const requests = typeAliases.flatMap((typeAlias) => ([
      () => api.get('/admin/swipes', { params: { page, limit, type: typeAlias } }),
      () => api.get('/admin/activity', { params: { page, limit, type: typeAlias } }),
      () => api.get('/admin/activity-feed', { params: { page, limit, type: typeAlias } }),
      () => api.get('/admin/swipes', { params: { page, limit, actionType: typeAlias } }),
    ]))

    return tryApiRequests(requests)
  },

  // Matches
  getMatches: (page = 1, limit = 20) =>
    api.get('/admin/matches', { params: { page, limit } }),

  // Conversations
  getConversations: (page = 1, limit = 20, search?: string) => {
    const trimmedSearch = typeof search === 'string' ? search.trim() : ''
    const requests = trimmedSearch
      ? [
          () => api.get('/admin/conversations', { params: { page, limit, search: trimmedSearch } }),
          () => api.get('/admin/conversations', { params: { page, limit, q: trimmedSearch } }),
          () => api.get('/admin/conversations', { params: { page, limit, query: trimmedSearch } }),
          () => api.get('/admin/conversations', { params: { page, limit } }),
        ]
      : [
          () => api.get('/admin/conversations', { params: { page, limit } }),
        ]

    return tryApiRequests(requests)
  },
  getConversationMessages: (id: string, page = 1, limit = 50, search?: string) => {
    const trimmedSearch = typeof search === 'string' ? search.trim() : ''
    const requests = trimmedSearch
      ? [
          () => api.get(`/admin/conversations/${id}/messages`, { params: { page, limit, search: trimmedSearch } }),
          () => api.get(`/admin/conversations/${id}/messages`, { params: { page, limit, q: trimmedSearch } }),
          () => api.get(`/admin/conversations/${id}/messages`, { params: { page, limit, query: trimmedSearch } }),
          () => api.get(`/admin/conversations/${id}/messages`, { params: { page, limit } }),
        ]
      : [
          () => api.get(`/admin/conversations/${id}/messages`, { params: { page, limit } }),
        ]

    return tryApiRequests(requests)
  },
  lockConversation: (id: string, reason: string) =>
    api.patch(`/admin/conversations/${id}/lock`, { isLocked: true, lockReason: reason }),
  unlockConversation: (id: string) =>
    api.patch(`/admin/conversations/${id}/lock`, { isLocked: false }),
  flagConversation: (id: string, reason: string) =>
    api.patch(`/admin/conversations/${id}/flag`, { isFlagged: true, flagReason: reason }),
  unflagConversation: (id: string) =>
    api.patch(`/admin/conversations/${id}/flag`, { isFlagged: false }),

  // Reports
  getReports: (page = 1, limit = 20, status?: string) =>
    api.get('/admin/reports', { params: { page, limit, status } }),
  resolveReport: (id: string, status: string, moderatorNote?: string) =>
    api.patch(`/admin/reports/${id}`, { status, moderatorNote }),

  // Photos
  getPendingPhotos: (page = 1, limit = 20) =>
    api.get('/admin/photos/pending', { params: { page, limit } }),
  moderatePhoto: async (id: string, status: string, moderationNote?: string) => {
    const candidates = Array.from(
      new Set(
        [status, status?.toUpperCase(), status?.toLowerCase()].filter(
          (value): value is string => typeof value === 'string' && value.length > 0
        )
      )
    )

    let lastError: unknown
    for (const candidate of candidates) {
      try {
        return await api.patch(`/admin/photos/${id}/moderate`, {
          status: candidate,
          moderationNote,
        })
      } catch (error: any) {
        lastError = error
        const statusCode = error?.response?.status
        if (statusCode !== 400 && statusCode !== 422) {
          break
        }
      }
    }

    throw lastError
  },

  // Notifications
  getNotifications: (params: AdminNotificationsQueryParams = {}) =>
    api.get('/admin/notifications', {
      params: {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        ...params,
      },
    }),
  sendNotification: (data: { userId?: string; title: string; body: string; type?: string; broadcast?: boolean; filters?: Record<string, any> }) =>
    api.post('/admin/notifications/send', data),
  previewNotificationRecipients: (filters: Record<string, any>) =>
    api.post('/admin/notifications/preview', filters),

  // Support Tickets
  getTickets: (
    pageOrQuery: number | AdminTicketsQueryParams = 1,
    limit = 20,
    status?: string,
  ) => {
    const params: AdminTicketsQueryParams =
      typeof pageOrQuery === 'object'
        ? {
            page: pageOrQuery.page ?? 1,
            limit: pageOrQuery.limit ?? 20,
            ...pageOrQuery,
          }
        : {
            page: pageOrQuery,
            limit,
            status,
          }

    return api.get('/admin/tickets', { params })
  },
  replyToTicket: (id: string, reply: string, status?: string) =>
    api.patch(`/admin/tickets/${id}/reply`, { reply, status }),

  // Ads
  getAds: () => api.get('/admin/ads'),
  createAd: (data: Record<string, any>) => api.post('/admin/ads', data),
  updateAd: (id: string, data: Record<string, any>) => api.patch(`/admin/ads/${id}`, data),
  deleteAd: (id: string) => api.delete(`/admin/ads/${id}`),

  // Boosts
  getBoosts: (page = 1, limit = 20) =>
    api.get('/admin/boosts', { params: { page, limit } }),

  // Subscriptions
  getSubscriptions: (page = 1, limit = 20, plan?: string, userId?: string) =>
    tryApiRequests([
      () => api.get('/admin/subscriptions', { params: { page, limit, plan, userId } }),
      () => api.get('/admin/subscriptions', { params: { page, limit, plan, id: userId } }),
      () => api.get('/admin/subscriptions', { params: { page, limit, plan } }),
    ]),
  getUserSubscriptionHistory: async (userId: string) => {
    try {
      return await tryApiRequests([
        () => api.get(`/admin/users/${userId}/subscription-history`),
        () => api.get(`/admin/users/${userId}/subscriptions`),
      ])
    } catch (primaryError) {
      let currentPage = 1
      let totalPages = 1
      const filteredSubscriptions: any[] = []

      while (currentPage <= totalPages && currentPage <= 6) {
        const response = await api.get('/admin/subscriptions', {
          params: { page: currentPage, limit: 100 },
        })

        const items = extractCollection(response.data).filter((subscription) => {
          if (!subscription || typeof subscription !== 'object') {
            return false
          }

          return subscription.userId === userId || subscription.user?.id === userId
        })

        filteredSubscriptions.push(...items)

        const total = Number(response.data?.total ?? response.data?.pagination?.total ?? items.length)
        totalPages = total > 0 ? Math.ceil(total / 100) : currentPage
        currentPage += 1
      }

      if (filteredSubscriptions.length === 0) {
        throw primaryError
      }

      return {
        data: filteredSubscriptions,
      }
    }
  },

  // Plans
  getPlans: () =>
    tryApiRequests([
      () => api.get<AdminPlan[]>('/admin/plans'),
      () => api.get<AdminPlan[]>('/subscriptions/plans'),
    ]),
  createPlan: (data: AdminPlanPayload) => api.post<AdminPlan>('/admin/plans', data),
  updatePlan: (id: string, data: Partial<AdminPlanPayload>) => api.put<AdminPlan>(`/admin/plans/${id}`, data),
  deletePlan: (id: string) => api.delete(`/admin/plans/${id}`),
  overrideSubscription: (userId: string, data: { planId: string, durationDays: number }) =>
    api.post(`/admin/users/${userId}/subscription/override`, data),

  // Consumable Products
  getConsumableProducts: (filters?: { type?: string; active?: boolean; archived?: boolean; search?: string }) =>
    api.get('/consumables/admin/products', { params: filters }),
  createConsumableProduct: (data: ConsumableProductPayload) =>
    api.post<ConsumableProduct>('/consumables/admin/products', data),
  updateConsumableProduct: (id: string, data: Partial<ConsumableProductPayload> & { isActive?: boolean; isArchived?: boolean }) =>
    api.post<ConsumableProduct>(`/consumables/admin/products/${id}`, data),
  archiveConsumableProduct: (id: string) =>
    api.post(`/consumables/admin/products/${id}/archive`),
  getUserBalances: (userId: string) =>
    api.get<UserBalances>(`/consumables/admin/users/${userId}/balances`),
  adjustUserBalance: (userId: string, data: { type: 'likes' | 'compliments' | 'boosts'; delta: number; reason: string }) =>
    api.post(`/consumables/admin/users/${userId}/balances/adjust`, data),
  getUserConsumablePurchases: (userId: string, page = 1, limit = 20) =>
    api.get(`/consumables/admin/users/${userId}/purchases`, { params: { page, limit } }),

  // Daily Insights
  getDailyInsights: (page = 1, limit = 20) =>
    tryApiRequests([
      () => api.get('/daily-insights/admin', { params: { page, limit } }),
      () => api.get('/admin/daily-insights', { params: { page, limit } }),
      () => api.get('/daily-insights', { params: { page, limit } }),
    ]),
  createDailyInsight: (data: { content: string; author?: string; category?: string; scheduledDate?: string }) =>
    tryApiRequests([
      () => api.post('/daily-insights', data),
      () => api.post('/admin/daily-insights', data),
    ]),
  updateDailyInsight: (id: string, data: Record<string, any>) =>
    tryApiRequests([
      () => api.patch(`/daily-insights/${id}`, data),
      () => api.put(`/daily-insights/${id}`, data),
      () => api.patch(`/admin/daily-insights/${id}`, data),
      () => api.put(`/admin/daily-insights/${id}`, data),
    ]),
  deleteDailyInsight: (id: string) =>
    tryApiRequests([
      () => api.delete(`/daily-insights/${id}`),
      () => api.delete(`/admin/daily-insights/${id}`),
    ]),
  seedDailyInsights: () =>
    tryApiRequests([
      () => api.post('/daily-insights/seed'),
      () => api.post('/admin/daily-insights/seed'),
    ]),
}

// ── Analytics ────────────────────────────────────────────────

export const analyticsApi = {
  getDashboard: () =>
    tryApiRequests([
      () => api.get('/analytics/dashboard'),
      () => api.get('/admin/analytics/dashboard'),
      () => api.get('/analytics/admin/dashboard'),
    ]),
  getDau: (date?: string) =>
    tryApiRequests([
      () => api.get('/analytics/dau', { params: { date } }),
      () => api.get('/analytics/daily-active-users', { params: { date } }),
      () => api.get('/admin/analytics/dau', { params: { date } }),
      () => api.get('/admin/analytics/daily-active-users', { params: { date } }),
    ]),
  getConversion: (days = 30) =>
    tryApiRequests([
      () => api.get('/analytics/conversion', { params: { days } }),
      () => api.get('/analytics/conversion-rate', { params: { days } }),
      () => api.get('/admin/analytics/conversion', { params: { days } }),
      () => api.get('/admin/analytics/conversion-rate', { params: { days } }),
    ]),
  getRetention: (cohortDays = 7) =>
    tryApiRequests([
      () => api.get('/analytics/retention', { params: { cohortDays } }),
      () => api.get('/admin/analytics/retention', { params: { cohortDays } }),
      () => api.get('/analytics/retention-cohort', { params: { cohortDays } }),
    ]),
  getMatchesOverTime: (days = 30) =>
    tryApiRequests([
      () => api.get('/analytics/matches-over-time', { params: { days } }),
      () => api.get('/admin/analytics/matches-over-time', { params: { days } }),
      () => api.get('/analytics/matches-timeline', { params: { days } }),
      () => api.get('/analytics/matches-over-time', { params: { rangeDays: days } }),
    ]),
}

// ── Trust & Safety ───────────────────────────────────────────

export const trustSafetyApi = {
  getFlags: (page = 1, limit = 20) =>
    tryApiRequests([
      () => api.get('/trust-safety/admin/flags', { params: { page, limit } }),
      () => api.get('/admin/trust-safety/flags', { params: { page, limit } }),
      () => api.get('/admin/content-flags', { params: { page, limit } }),
      () => api.get('/trust-safety/flags', { params: { page, limit } }),
    ]),
  resolveFlag: (id: string, status: string, note?: string) => {
    const normalizedStatus = typeof status === 'string' ? status.trim() : ''
    const statusAliases = Array.from(
      new Set(
        [
          normalizedStatus,
          normalizedStatus.toLowerCase(),
          normalizedStatus.toUpperCase(),
        ].filter((value): value is string => value.length > 0)
      )
    )

    return tryApiRequests(
      statusAliases.flatMap((statusAlias) => ([
        () => api.patch(`/trust-safety/admin/flags/${id}`, { status: statusAlias, note }),
        () => api.patch(`/trust-safety/admin/flags/${id}`, { status: statusAlias, reviewNote: note }),
        () => api.patch(`/trust-safety/admin/flags/${id}`, { status: statusAlias, moderatorNote: note }),
        () => api.patch(`/trust-safety/admin/flags/${id}`, { resolution: statusAlias, note }),
        () => api.patch(`/trust-safety/admin/flags/${id}/resolve`, { status: statusAlias, note }),
        () => api.patch(`/trust-safety/admin/flags/${id}/resolve`, { status: statusAlias, reviewNote: note }),
        () => api.patch(`/trust-safety/admin/flags/${id}/resolve`, { status: statusAlias, moderatorNote: note }),
        () => api.post(`/trust-safety/admin/flags/${id}/resolve`, { status: statusAlias, note }),
        () => api.patch(`/admin/trust-safety/flags/${id}`, { status: statusAlias, note }),
        () => api.patch(`/admin/content-flags/${id}`, { status: statusAlias, note }),
        () => api.patch(`/admin/content-flags/${id}`, { status: statusAlias, reviewNote: note }),
        () => api.patch(`/admin/content-flags/${id}`, { status: statusAlias, moderatorNote: note }),
        () => api.patch(`/admin/content-flags/${id}`, { resolution: statusAlias, moderatorNote: note }),
        () => api.patch(`/admin/content-flags/${id}/resolve`, { status: statusAlias, reviewNote: note }),
        () => api.patch(`/admin/content-flags/${id}/resolve`, { status: statusAlias, moderatorNote: note }),
        () => api.post(`/admin/content-flags/${id}/resolve`, { status: statusAlias, reviewNote: note }),
        () => api.put(`/admin/content-flags/${id}`, { status: statusAlias, note }),
      ]))
    )
  },
  shadowBan: (userId: string) =>
    tryApiRequests([
      () => api.patch(`/admin/users/${userId}/status`, {
        status: 'shadow_suspended',
        moderationReasonCode: 'POLICY_VIOLATION',
        actionRequired: 'WAIT_FOR_REVIEW',
        isUserVisible: true,
      }),
      () => api.post(`/trust-safety/admin/shadow-ban/${userId}`),
      () => api.post(`/trust-safety/admin/users/${userId}/shadow-ban`),
      () => api.post(`/admin/users/${userId}/shadow-ban`),
      () => api.patch(`/admin/users/${userId}`, { isShadowBanned: true, status: 'shadow_suspended' }),
      () => api.put(`/admin/users/${userId}`, { isShadowBanned: true, status: 'shadow_suspended' }),
    ]),
  removeShadowBan: (userId: string) =>
    tryApiRequests([
      () => api.patch(`/admin/users/${userId}/status`, {
        status: 'active',
      }),
      () => api.post(`/trust-safety/admin/remove-shadow-ban/${userId}`),
      () => api.post(`/trust-safety/admin/users/${userId}/remove-shadow-ban`),
      () => api.post(`/admin/users/${userId}/remove-shadow-ban`),
      () => api.patch(`/admin/users/${userId}`, { isShadowBanned: false, status: 'active' }),
      () => api.put(`/admin/users/${userId}`, { isShadowBanned: false, status: 'active' }),
    ]),
  detectSuspicious: (userId: string) =>
    tryApiRequests([
      () => api.post(`/trust-safety/admin/detect-suspicious/${userId}`),
      () => api.get(`/trust-safety/admin/detect-suspicious/${userId}`),
      () => api.post(`/trust-safety/admin/users/${userId}/detect-suspicious`),
      () => api.get(`/trust-safety/admin/users/${userId}/detect-suspicious`),
      () => api.post(`/admin/users/${userId}/detect-suspicious`),
      () => api.get(`/admin/users/${userId}/detect-suspicious`),
      () => api.post(`/admin/trust-safety/detect-suspicious/${userId}`),
    ]),
}

// ── Security ─────────────────────────────────────────────────

export const securityApi = {
  getBlacklist: () => api.get('/security/admin/blacklist'),
  addToBlacklist: (domain: string, reason: string) =>
    api.post('/security/admin/blacklist', { domain, reason }),
  removeFromBlacklist: (domain: string) =>
    api.delete(`/security/admin/blacklist/${domain}`),
  getDevices: () => api.get('/security/devices'),
  revokeDevice: (id: string) => api.delete(`/security/devices/${id}`),
  getLoginHistory: () => api.get('/security/login-history'),
}

// ── Matching ────────────────────────────────────────────────

// ── Monetization ────────────────────────────────────────────

export const monetizationApi = {
  getStatus: () => api.get('/monetization/status'),
  getFeatures: () => api.get('/monetization/features'),
  getRemainingLikes: () => api.get('/monetization/remaining-likes'),
  subscribe: (plan: string) => api.post('/monetization/subscribe', { plan }),
  purchaseBoost: () => api.post('/monetization/boost'),
  getBoostStatus: () => api.get('/monetization/boost'),
}

// ── Subscriptions ───────────────────────────────────────────

export const subscriptionsApi = {
  getMe: () => api.get('/subscriptions/me'),
  create: (plan: string) => api.post('/subscriptions', { plan }),
  cancel: () => api.delete('/subscriptions'),
  getPlans: () => api.get('/subscriptions/plans'),
}

// ── Chat ────────────────────────────────────────────────────

export const chatApi = {
  getConversations: () => api.get('/chat/conversations'),
  getMessages: (conversationId: string) =>
    api.get(`/chat/conversations/${conversationId}/messages`),
  markRead: (conversationId: string) =>
    api.patch(`/chat/conversations/${conversationId}/read`),
  markDelivered: (conversationId: string) =>
    api.patch(`/chat/conversations/${conversationId}/delivered`),
  muteConversation: (conversationId: string) =>
    api.patch(`/chat/conversations/${conversationId}/mute`),
  getUnreadCount: () => api.get('/chat/unread'),
}

// ── Notifications ───────────────────────────────────────────

export const notificationsApi = {
  getAll: () => api.get('/notifications'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  remove: (id: string) => api.delete(`/notifications/${id}`),
  getSettings: () => api.get('/notifications/settings'),
  updateSettings: (settings: Record<string, boolean>) =>
    api.patch('/notifications/settings', settings),
}

// ── Search ──────────────────────────────────────────────────

export const searchApi = {
  search: (params: Record<string, any>) => {
    const searchText = getSearchText(params)
    const adminUserParams = searchText
      ? { ...params, search: searchText }
      : params

    return tryApiRequests([
      () => api.get('/search', { params }),
      () => api.get('/admin/search', { params }),
      () => api.get('/admin/users/search', { params }),
      () => api.get('/admin/users', { params: adminUserParams }),
    ])
  },
}

// ── Matches ─────────────────────────────────────────────────

export const matchesApi = {
  getAll: () => api.get('/matches'),
  getSuggestions: () => api.get('/matches/suggestions'),
  getNearby: () => api.get('/matches/nearby'),
  getDiscover: () => api.get('/matches/discover'),
  unmatch: (id: string) => api.delete(`/matches/${id}`),
}

// ── Swipes ──────────────────────────────────────────────────

export const swipesApi = {
  swipe: (targetUserId: string, type: string, message?: string) =>
    api.post('/swipes', { targetUserId, type, message }),
  whoLikedMe: () => api.get('/swipes/who-liked-me'),
  getCompatibility: (targetUserId: string) =>
    api.get(`/swipes/compatibility/${targetUserId}`),
}

// ── Categories ─────────────────────────────────────────────

export const categoriesApi = {
  getAll: () => api.get('/categories'),
  getAllAdmin: () => api.get('/categories/admin/all'),
  getOne: (id: string) => api.get(`/categories/${id}`),
  getUsers: (id: string, page = 1, limit = 20) =>
    api.get(`/categories/${id}/users`, { params: { page, limit } }),
  create: (data: Record<string, any>) => api.post('/categories', data),
  update: (id: string, data: Record<string, any>) =>
    api.patch(`/categories/${id}`, data),
  remove: (id: string) => api.delete(`/categories/${id}`),
  rebuild: (id: string) => api.post(`/categories/${id}/rebuild`),
}

// ── Reports (user-facing) ───────────────────────────────────

export const userReportsApi = {
  create: (reportedId: string, reason: string, details?: string) =>
    api.post('/reports', { reportedId, reason, details }),
  block: (id: string) => api.post(`/reports/block/${id}`),
  unblock: (id: string) => api.delete(`/reports/block/${id}`),
  getBlocked: () => api.get('/reports/blocked'),
}

// ── Content Management (CMS) ────────────────────────────────

export const contentApi = {
  // Static Pages
  getAllContent: () => api.get('/content'),
  createContent: (data: Record<string, any>) => api.post('/content', data),
  updateContent: (id: string, data: Record<string, any>) => api.patch(`/content/${id}`, data),
  deleteContent: (id: string) => api.delete(`/content/${id}`),

  // FAQs
  getAllFaqs: () => api.get('/content/faqs/all'),
  createFaq: (data: Record<string, any>) => api.post('/content/faqs', data),
  updateFaq: (id: string, data: Record<string, any>) => api.patch(`/content/faqs/${id}`, data),
  deleteFaq: (id: string) => api.delete(`/content/faqs/${id}`),

  // Jobs
  getAllJobs: () => api.get('/content/jobs/all'),
  createJob: (data: Record<string, any>) => api.post('/content/jobs', data),
  updateJob: (id: string, data: Record<string, any>) => api.patch(`/content/jobs/${id}`, data),
  deleteJob: (id: string) => api.delete(`/content/jobs/${id}`),
}
