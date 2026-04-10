import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api'
import { fetchAdminUserPool, invalidateAdminUserPoolCache } from '@/lib/admin-user-search'
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
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/toast'
import { formatDateTime } from '@/lib/utils'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  Loader2,
  UserPlus,
  MoreHorizontal,
  Crown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CalendarDays,
} from 'lucide-react'

type UserRecord = Record<string, any>
type VerificationStatus = 'pending' | 'approved' | 'rejected'
type PremiumFilter = 'all' | 'premium' | 'not_premium' | 'expired'
type VerificationFilter = 'all' | VerificationStatus
type UserStatus = 'active' | 'pending_verification' | 'rejected' | 'banned' | 'suspended'

const USER_STATUS_OPTIONS: Array<{ value: UserStatus; label: string; actionLabel: string }> = [
  { value: 'active', label: 'Active', actionLabel: 'Activate' },
  { value: 'pending_verification', label: 'Pending Verification', actionLabel: 'Mark Pending' },
  { value: 'rejected', label: 'Rejected', actionLabel: 'Reject' },
  { value: 'banned', label: 'Banned', actionLabel: 'Ban' },
  { value: 'suspended', label: 'Suspended', actionLabel: 'Suspend' },
]

const DAY_IN_MS = 24 * 60 * 60 * 1000

const isRecord = (value: unknown): value is UserRecord =>
  typeof value === 'object' && value !== null

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return ''
}

const firstBoolean = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value
    }
  }
  return undefined
}

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

const normalizeUserStatus = (value: unknown): UserStatus | '' => {
  const normalized = normalizeSearchText(value).replace(/\s+/g, '_')

  if (normalized === 'active') return 'active'
  if (normalized === 'pending_verification' || normalized === 'pending') return 'pending_verification'
  if (normalized === 'rejected' || normalized === 'declined' || normalized === 'denied') return 'rejected'
  if (normalized === 'banned') return 'banned'
  if (normalized === 'suspended') return 'suspended'

  return ''
}

const getStatusMeta = (status: unknown) => {
  const normalizedStatus = normalizeUserStatus(status)

  switch (normalizedStatus) {
    case 'active':
      return { label: 'Active', variant: 'success' as const }
    case 'pending_verification':
      return { label: 'Pending Verification', variant: 'warning' as const }
    case 'rejected':
      return { label: 'Rejected', variant: 'destructive' as const }
    case 'banned':
      return { label: 'Banned', variant: 'destructive' as const }
    case 'suspended':
      return { label: 'Suspended', variant: 'warning' as const }
    default:
      return { label: typeof status === 'string' && status.trim() ? status : 'Unknown', variant: 'secondary' as const }
  }
}

const uniqueUsersById = (items: UserRecord[]) =>
  Array.from(new Map(items.map((item) => [String(item.id || ''), item])).values()).filter((item) => item.id)

const parseDate = (value?: string) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const getRemainingDays = (dateValue?: string) => {
  const expiryDate = parseDate(dateValue)
  if (!expiryDate) {
    return null
  }

  return Math.ceil((expiryDate.getTime() - Date.now()) / DAY_IN_MS)
}

const toDateInputValue = (value?: string) => {
  const date = parseDate(value)
  if (!date) {
    return ''
  }

  return date.toISOString().slice(0, 10)
}

const toIsoDate = (dateValue: string, mode: 'start' | 'end') => {
  if (!dateValue) {
    return null
  }

  const suffix = mode === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z'
  return new Date(`${dateValue}${suffix}`).toISOString()
}

const normalizeVerificationStatus = (
  statusCandidates: unknown[],
  booleanCandidates: unknown[],
  rejectionReasonCandidates: unknown[] = []
): VerificationStatus => {
  for (const statusCandidate of statusCandidates) {
    if (typeof statusCandidate !== 'string') {
      continue
    }

    const normalized = statusCandidate.toLowerCase().trim()
    if (!normalized) {
      continue
    }

    if (
      normalized.includes('approved') ||
      normalized.includes('verified') ||
      normalized.includes('accepted')
    ) {
      return 'approved'
    }

    if (
      normalized.includes('rejected') ||
      normalized.includes('declined') ||
      normalized.includes('denied') ||
      normalized.includes('failed')
    ) {
      return 'rejected'
    }
  }

  for (const rejectionReason of rejectionReasonCandidates) {
    if (typeof rejectionReason === 'string' && rejectionReason.trim().length > 0) {
      return 'rejected'
    }
  }

  const explicitBoolean = firstBoolean(...booleanCandidates)
  if (explicitBoolean === true) {
    return 'approved'
  }

  return 'pending'
}

const getSelfieStatus = (user: UserRecord): VerificationStatus => {
  const verification = isRecord(user.verification) ? user.verification : undefined

  return normalizeVerificationStatus(
    [
      user.selfieVerificationStatus,
      user.selfieStatus,
      verification?.selfieVerificationStatus,
      verification?.selfieStatus,
    ],
    [
      user.selfieVerified,
      user.isSelfieVerified,
      verification?.selfieVerified,
    ],
    [
      user.selfieRejectionReason,
      verification?.selfieRejectionReason,
    ]
  )
}

const getMaritalStatus = (user: UserRecord): VerificationStatus => {
  const verification = isRecord(user.verification) ? user.verification : undefined

  return normalizeVerificationStatus(
    [
      user.maritalVerificationStatus,
      user.maritalStatusVerificationStatus,
      user.documentVerificationStatus,
      user.documentStatus,
      verification?.maritalVerificationStatus,
      verification?.documentVerificationStatus,
      verification?.maritalStatus,
      verification?.documentStatus,
    ],
    [
      user.maritalVerified,
      user.maritalStatusVerified,
      user.documentVerified,
      verification?.maritalVerified,
      verification?.documentVerified,
    ],
    [
      user.maritalRejectionReason,
      user.documentRejectionReason,
      verification?.maritalRejectionReason,
      verification?.documentRejectionReason,
    ]
  )
}

const getProfileImageUrl = (user: UserRecord) => {
  const profile = isRecord(user.profile) ? user.profile : undefined
  const firstPhotoUrl = Array.isArray(user.photos)
    ? firstString(...user.photos.map((photo) => (isRecord(photo) ? photo.url : '')))
    : ''

  return firstString(
    user.profileImage,
    user.profilePhoto,
    user.avatar,
    user.avatarUrl,
    user.photoUrl,
    profile?.photoUrl,
    profile?.avatar,
    firstPhotoUrl,
  )
}

const getPremiumSnapshot = (user: UserRecord) => {
  const subscription = isRecord(user.subscription) ? user.subscription : undefined

  const plan = firstString(
    subscription?.plan,
    user.plan,
    user.currentPlan,
    user.subscriptionPlan,
    user.membershipPlan,
  ).toLowerCase()

  const subscriptionStatus = firstString(
    subscription?.status,
    user.subscriptionStatus,
    user.membershipStatus,
  ).toLowerCase()

  const startDate = firstString(
    subscription?.startDate,
    subscription?.startedAt,
    user.premiumStartDate,
    user.premiumStartAt,
    user.planStartDate,
  ) || undefined

  const endDate = firstString(
    subscription?.endDate,
    subscription?.expiresAt,
    user.premiumExpiryDate,
    user.premiumExpiresAt,
    user.planExpiryDate,
  ) || undefined

  const explicitPremiumBoolean = firstBoolean(
    user.isPremium,
    user.premiumEnabled,
    user.premium,
    subscription?.isPremium,
  )

  const planSuggestsPremium = plan === 'premium' || plan === 'gold'
  const statusSuggestsPremium = subscriptionStatus === 'active' && plan !== 'free'

  const enabled = explicitPremiumBoolean ?? (planSuggestsPremium || statusSuggestsPremium)
  const remainingDays = getRemainingDays(endDate)
  const expired = subscriptionStatus === 'expired' || (remainingDays !== null && remainingDays < 0)

  return {
    enabled,
    plan: plan || (enabled ? 'premium' : 'free'),
    startDate,
    endDate,
    remainingDays,
    expired,
  }
}

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

const userMatchesPremiumFilter = (user: UserRecord, premiumFilter: PremiumFilter) => {
  if (premiumFilter === 'all') {
    return true
  }

  const premium = getPremiumSnapshot(user)

  if (premiumFilter === 'premium') {
    return premium.enabled && !premium.expired
  }

  if (premiumFilter === 'not_premium') {
    return !premium.enabled
  }

  return premium.expired
}

const userMatchesVerificationFilter = (user: UserRecord, verificationFilter: VerificationFilter) => {
  if (verificationFilter === 'all') {
    return true
  }

  const selfieStatus = getSelfieStatus(user)
  const maritalStatus = getMaritalStatus(user)

  if (verificationFilter === 'approved') {
    return selfieStatus === 'approved' && maritalStatus === 'approved'
  }

  if (verificationFilter === 'rejected') {
    return selfieStatus === 'rejected' || maritalStatus === 'rejected'
  }

  return selfieStatus === 'pending' || maritalStatus === 'pending'
}

const statusBadge = (status: string) => {
  const meta = getStatusMeta(status)
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

const verificationBadge = (label: string, status: VerificationStatus) => {
  const variant = status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : 'warning'
  return (
    <Badge variant={variant} className="text-[10px]">
      {label}: {status}
    </Badge>
  )
}

const premiumBadge = (user: UserRecord) => {
  const premium = getPremiumSnapshot(user)

  if (!premium.enabled) {
    return <Badge variant="secondary">Free</Badge>
  }

  if (premium.expired) {
    return <Badge variant="warning">Expired</Badge>
  }

  return (
    <Badge className="bg-amber-500 text-white">
      <Crown className="mr-1 h-3 w-3" />
      {(premium.plan || 'premium').toUpperCase()}
    </Badge>
  )
}

interface PremiumDialogState {
  open: boolean
  user: UserRecord | null
  enabled: boolean
  startDate: string
  expiryDate: string
}

export default function UsersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [users, setUsers] = useState<UserRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>('all')
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>('all')

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [createDialog, setCreateDialog] = useState(false)
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'user',
    status: 'active',
  })
  const [createLoading, setCreateLoading] = useState(false)

  const [statusDialog, setStatusDialog] = useState<{ open: boolean; user: UserRecord | null; newStatus: string }>({
    open: false,
    user: null,
    newStatus: '',
  })
  const [statusUpdating, setStatusUpdating] = useState(false)

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: UserRecord | null }>({
    open: false,
    user: null,
  })
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [premiumDialog, setPremiumDialog] = useState<PremiumDialogState>({
    open: false,
    user: null,
    enabled: false,
    startDate: '',
    expiryDate: '',
  })
  const [premiumSaving, setPremiumSaving] = useState(false)

  const [rowActionLoading, setRowActionLoading] = useState('')

  const patchUserInTable = (userId: string, update: (user: UserRecord) => UserRecord) => {
    setUsers((currentUsers) =>
      currentUsers.map((user) => (user.id === userId ? update(user) : user))
    )
  }

  const fetchUsers = async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const status = statusFilter === 'all' ? undefined : statusFilter
      const role = roleFilter === 'all' ? undefined : roleFilter
      const plan = premiumFilter === 'premium'
        ? 'premium'
        : premiumFilter === 'not_premium'
          ? 'free'
          : undefined
      const trimmedSearch = search.trim()

      const applyFilters = (items: UserRecord[]) =>
        items.filter((user) =>
          userMatchesQuery(user, trimmedSearch) &&
          userMatchesPremiumFilter(user, premiumFilter) &&
          userMatchesVerificationFilter(user, verificationFilter)
        )

      const shouldAggregateLocally = Boolean(
        trimmedSearch || verificationFilter !== 'all' || premiumFilter === 'expired'
      )

      if (shouldAggregateLocally) {
        const fallbackPool = uniqueUsersById(
          await fetchAdminUserPool({
            status,
            role,
            plan,
          })
        )

        const filteredPool = applyFilters(fallbackPool)
        const start = (page - 1) * limit
        setUsers(filteredPool.slice(start, start + limit))
        setTotal(filteredPool.length)
        return
      }

      const response = await adminApi.getUsers(page, limit, status, undefined, role, plan)
      const payload = response.data
      const userList = extractUsers(payload)
      const filteredList = applyFilters(userList)

      setUsers(filteredList)
      setTotal(extractTotal(payload, filteredList.length))
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Failed to load users. Please retry.'
      setErrorMessage(message)
      setUsers([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [page, statusFilter, roleFilter, premiumFilter, verificationFilter, search])

  useEffect(() => {
    const refreshId = window.setInterval(() => {
      void fetchUsers()
    }, 15000)

    return () => window.clearInterval(refreshId)
  }, [page, statusFilter, roleFilter, premiumFilter, verificationFilter, search])

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

  const openPremiumDialog = (user: UserRecord) => {
    const premium = getPremiumSnapshot(user)
    setPremiumDialog({
      open: true,
      user,
      enabled: premium.enabled,
      startDate: toDateInputValue(premium.startDate),
      expiryDate: toDateInputValue(premium.endDate),
    })
  }

  const handleStatusChange = async () => {
    if (!statusDialog.user) {
      return
    }

    setStatusUpdating(true)
    try {
      await adminApi.updateUserStatus(statusDialog.user.id, statusDialog.newStatus)
      invalidateAdminUserPoolCache()
      patchUserInTable(statusDialog.user.id, (user) => ({
        ...user,
        status: statusDialog.newStatus,
      }))
      toast({ title: 'User status updated', variant: 'success' })
      setStatusDialog({ open: false, user: null, newStatus: '' })
      await fetchUsers()
    } catch (error: any) {
      toast({
        title: 'Failed to update status',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'error',
      })
    } finally {
      setStatusUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteDialog.user) {
      return
    }

    setDeleteLoading(true)
    try {
      await adminApi.deleteUser(deleteDialog.user.id)
      invalidateAdminUserPoolCache()
      toast({ title: 'User deleted', variant: 'warning' })
      setDeleteDialog({ open: false, user: null })
      await fetchUsers()
    } catch (error: any) {
      toast({
        title: 'Failed to delete user',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'error',
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleCreateUser = async () => {
    setCreateLoading(true)
    try {
      await adminApi.createUser(createForm)
      invalidateAdminUserPoolCache()
      setCreateDialog(false)
      setCreateForm({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        role: 'user',
        status: 'active',
      })
      toast({ title: 'User created', variant: 'success' })
      await fetchUsers()
    } catch (error: any) {
      toast({
        title: 'Failed to create user',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'error',
      })
    } finally {
      setCreateLoading(false)
    }
  }

  const handleSavePremium = async () => {
    if (!premiumDialog.user) {
      return
    }

    setPremiumSaving(true)
    try {
      const nextStartDate = premiumDialog.enabled ? toIsoDate(premiumDialog.startDate, 'start') : null
      const nextExpiryDate = premiumDialog.enabled ? toIsoDate(premiumDialog.expiryDate, 'end') : null
      const nextSubscriptionStatus =
        premiumDialog.enabled && previewRemainingDays !== null && previewRemainingDays < 0
          ? 'expired'
          : premiumDialog.enabled
            ? 'active'
            : 'inactive'

      await adminApi.updateUserPremium(premiumDialog.user.id, {
        enabled: premiumDialog.enabled,
        startDate: nextStartDate,
        expiryDate: nextExpiryDate,
      })
      invalidateAdminUserPoolCache()

      patchUserInTable(premiumDialog.user.id, (user) => {
        const currentSubscription = isRecord(user.subscription) ? user.subscription : {}

        return {
          ...user,
          isPremium: premiumDialog.enabled,
          premiumEnabled: premiumDialog.enabled,
          premium: premiumDialog.enabled,
          premiumStartDate: nextStartDate,
          premiumExpiryDate: nextExpiryDate,
          subscription: {
            ...currentSubscription,
            isPremium: premiumDialog.enabled,
            plan: premiumDialog.enabled ? currentSubscription.plan || 'premium' : 'free',
            status: nextSubscriptionStatus,
            startDate: nextStartDate,
            endDate: nextExpiryDate,
          },
        }
      })

      toast({
        title: premiumDialog.enabled ? 'Premium updated' : 'Premium disabled',
        variant: 'success',
      })

      setPremiumDialog({
        open: false,
        user: null,
        enabled: false,
        startDate: '',
        expiryDate: '',
      })

      await fetchUsers()
    } catch (error: any) {
      toast({
        title: 'Failed to update premium status',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'error',
      })
    } finally {
      setPremiumSaving(false)
    }
  }

  const handleVerifySelfie = async (user: UserRecord, approved: boolean) => {
    const actionKey = `selfie:${user.id}`
    setRowActionLoading(actionKey)

    try {
      await adminApi.verifySelfie(user.id, approved)
      invalidateAdminUserPoolCache()
      patchUserInTable(user.id, (currentUser) => ({
        ...currentUser,
        selfieVerified: approved,
        selfieVerificationStatus: approved ? 'approved' : 'rejected',
        selfieStatus: approved ? 'approved' : 'rejected',
        selfieRejectionReason: approved ? undefined : 'Rejected by admin review',
        verification: {
          ...(isRecord(currentUser.verification) ? currentUser.verification : {}),
          selfieVerified: approved,
          selfieVerificationStatus: approved ? 'approved' : 'rejected',
          selfieStatus: approved ? 'approved' : 'rejected',
          selfieRejectionReason: approved ? undefined : 'Rejected by admin review',
        },
      }))
      toast({
        title: approved ? 'Selfie approved' : 'Selfie rejected',
        variant: approved ? 'success' : 'warning',
      })
      await fetchUsers()
    } catch (error: any) {
      toast({
        title: 'Failed to update selfie verification',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'error',
      })
    } finally {
      setRowActionLoading('')
    }
  }

  const handleVerifyMarital = async (user: UserRecord, approved: boolean) => {
    const actionKey = `marital:${user.id}`
    setRowActionLoading(actionKey)

    try {
      await adminApi.verifyMaritalStatus(user.id, approved, approved ? undefined : 'Rejected by admin review')
      invalidateAdminUserPoolCache()
      patchUserInTable(user.id, (currentUser) => ({
        ...currentUser,
        maritalStatusVerified: approved,
        documentVerified: approved,
        maritalVerificationStatus: approved ? 'approved' : 'rejected',
        documentVerificationStatus: approved ? 'approved' : 'rejected',
        documentStatus: approved ? 'approved' : 'rejected',
        documentRejectionReason: approved ? undefined : 'Rejected by admin review',
        verification: {
          ...(isRecord(currentUser.verification) ? currentUser.verification : {}),
          maritalVerified: approved,
          documentVerified: approved,
          maritalVerificationStatus: approved ? 'approved' : 'rejected',
          documentVerificationStatus: approved ? 'approved' : 'rejected',
          documentStatus: approved ? 'approved' : 'rejected',
          documentRejectionReason: approved ? undefined : 'Rejected by admin review',
        },
      }))
      toast({
        title: approved ? 'Marital verification approved' : 'Marital verification rejected',
        variant: approved ? 'success' : 'warning',
      })
      await fetchUsers()
    } catch (error: any) {
      toast({
        title: 'Failed to update marital verification',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'error',
      })
    } finally {
      setRowActionLoading('')
    }
  }

  const premiumRangeInvalid =
    premiumDialog.enabled &&
    premiumDialog.startDate.length > 0 &&
    premiumDialog.expiryDate.length > 0 &&
    premiumDialog.startDate > premiumDialog.expiryDate

  const previewRemainingDays = useMemo(() => {
    if (!premiumDialog.expiryDate) {
      return null
    }

    return getRemainingDays(`${premiumDialog.expiryDate}T23:59:59.999Z`)
  }, [premiumDialog.expiryDate])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('users.title')}</h1>
          <p className="text-muted-foreground">{t('users.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateDialog(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> {t('users.createUser')}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or user ID..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && setSearch(searchInput.trim())}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('users.allStatuses')}</SelectItem>
            {USER_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={premiumFilter} onValueChange={(value: PremiumFilter) => { setPremiumFilter(value); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Premium" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Premium</SelectItem>
            <SelectItem value="premium">Premium Active</SelectItem>
            <SelectItem value="not_premium">Not Premium</SelectItem>
            <SelectItem value="expired">Expired Premium</SelectItem>
          </SelectContent>
        </Select>

        <Select value={verificationFilter} onValueChange={(value: VerificationFilter) => { setVerificationFilter(value); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Verification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Verification</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={(value) => { setRoleFilter(value); setPage(1) }}>
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
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

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
                    <th className="pb-3 pe-4 font-medium">{t('users.status')}</th>
                    <th className="pb-3 pe-4 font-medium">Premium</th>
                    <th className="pb-3 pe-4 font-medium">Verification</th>
                    <th className="pb-3 pe-4 font-medium">{t('users.joined')}</th>
                    <th className="pb-3 font-medium text-end">{t('users.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((user) => {
                    const selfieStatus = getSelfieStatus(user)
                    const maritalStatus = getMaritalStatus(user)
                    const premium = getPremiumSnapshot(user)
                    const profileImageUrl = getProfileImageUrl(user)

                    return (
                      <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              {profileImageUrl ? <AvatarImage src={profileImageUrl} alt={`${user.firstName || ''} ${user.lastName || ''}`} /> : null}
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                {user.firstName?.[0] || '?'}{user.lastName?.[0] || ''}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{firstString(user.firstName, user.name)} {user.lastName || ''}</p>
                              {user.isShadowBanned && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Shadow Banned</Badge>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{user.email}</td>
                        <td className="py-3 pr-4">
                          <div className="space-y-2">
                            {statusBadge(user.status)}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                setStatusDialog({
                                  open: true,
                                  user,
                                  newStatus: normalizeUserStatus(user.status) || 'active',
                                })
                              }
                            >
                              Set Status
                            </Button>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              {premiumBadge(user)}
                              {premium.expired && <Badge variant="warning">Expired</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {premium.endDate
                                ? `${formatDateTime(premium.endDate)}${premium.remainingDays !== null ? ` (${premium.remainingDays >= 0 ? `${premium.remainingDays}d left` : `${Math.abs(premium.remainingDays)}d overdue`})` : ''}`
                                : 'No expiry date'}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-1">
                            {verificationBadge('Selfie', selfieStatus)}
                            {verificationBadge('Marital', maritalStatus)}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                          {formatDateTime(user.createdAt)}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => navigate(`/users/${user.id}`)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openPremiumDialog(user)}>
                              Premium
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost">
                                  {rowActionLoading.startsWith(`selfie:${user.id}`) || rowActionLoading.startsWith(`marital:${user.id}`)
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <MoreHorizontal className="h-4 w-4" />}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>User Actions</DropdownMenuLabel>
                                <DropdownMenuItem onSelect={() => navigate(`/users/${user.id}`)}>
                                  View Profile
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {USER_STATUS_OPTIONS.map((option) => (
                                  <DropdownMenuItem
                                    key={option.value}
                                    onSelect={() => setStatusDialog({ open: true, user, newStatus: option.value })}
                                  >
                                    {option.actionLabel}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => openPremiumDialog(user)}>
                                  Set Premium
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => { void handleVerifySelfie(user, true) }}>
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                                  Approve Selfie
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => { void handleVerifySelfie(user, false) }}>
                                  <XCircle className="mr-2 h-4 w-4 text-red-600" />
                                  Reject Selfie
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => { void handleVerifyMarital(user, true) }}>
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                                  Approve Marital
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => { void handleVerifyMarital(user, false) }}>
                                  <XCircle className="mr-2 h-4 w-4 text-red-600" />
                                  Reject Marital
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onSelect={() => setDeleteDialog({ open: true, user })}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete User
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {users.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">{t('users.noUsers')}</p>
              )}
            </div>
          )}

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

      <Dialog open={statusDialog.open} onOpenChange={(open) => setStatusDialog({ ...statusDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.status')}</DialogTitle>
            <DialogDescription>
              Set <strong>{statusDialog.user?.firstName} {statusDialog.user?.lastName}</strong> status to{' '}
              <strong>{getStatusMeta(statusDialog.newStatus).label}</strong>?
            </DialogDescription>
          </DialogHeader>
          <Select value={statusDialog.newStatus} onValueChange={(value) => setStatusDialog({ ...statusDialog, newStatus: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USER_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog({ open: false, user: null, newStatus: '' })}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleStatusChange} disabled={statusUpdating || !statusDialog.newStatus}>
              {statusUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.deleteUser')}</DialogTitle>
            <DialogDescription>
              This will soft-delete <strong>{deleteDialog.user?.firstName} {deleteDialog.user?.lastName}</strong>. This action can be reversed in the database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, user: null })}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={premiumDialog.open} onOpenChange={(open) => setPremiumDialog({ ...premiumDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Premium Control
            </DialogTitle>
            <DialogDescription>
              Toggle premium access, set start/expiry dates, and review remaining time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Premium Enabled</p>
                <p className="text-xs text-muted-foreground">Switch ON/OFF for this user subscription.</p>
              </div>
              <Switch
                checked={premiumDialog.enabled}
                onCheckedChange={(checked) => setPremiumDialog((prev) => ({ ...prev, enabled: checked }))}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                <Input
                  type="date"
                  value={premiumDialog.startDate}
                  disabled={!premiumDialog.enabled}
                  onChange={(event) => setPremiumDialog((prev) => ({ ...prev, startDate: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Expiry Date</label>
                <Input
                  type="date"
                  value={premiumDialog.expiryDate}
                  disabled={!premiumDialog.enabled}
                  onChange={(event) => setPremiumDialog((prev) => ({ ...prev, expiryDate: event.target.value }))}
                />
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Premium Timeline
              </div>

              {premiumDialog.enabled ? (
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    Remaining days:{' '}
                    <span className="font-semibold text-foreground">
                      {previewRemainingDays === null ? 'N/A' : previewRemainingDays}
                    </span>
                  </p>
                  {previewRemainingDays !== null && previewRemainingDays < 0 && (
                    <Badge variant="warning">Expired</Badge>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Premium is currently disabled.</p>
              )}
            </div>

            {premiumRangeInvalid && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mr-2 inline h-4 w-4" />
                Expiry date must be after start date.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPremiumDialog({ open: false, user: null, enabled: false, startDate: '', expiryDate: '' })}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSavePremium}
              disabled={
                premiumSaving ||
                premiumRangeInvalid ||
                (premiumDialog.enabled && (!premiumDialog.startDate || !premiumDialog.expiryDate))
              }
            >
              {premiumSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Premium'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('users.createUser')}</DialogTitle>
            <DialogDescription>{t('users.subtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">First Name</label>
                <Input value={createForm.firstName} onChange={(event) => setCreateForm({ ...createForm, firstName: event.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium">Last Name</label>
                <Input value={createForm.lastName} onChange={(event) => setCreateForm({ ...createForm, lastName: event.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">{t('users.email')}</label>
              <Input type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium">{t('login.password')}</label>
              <Input type="password" value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">{t('users.role')}</label>
                <Select value={createForm.role} onValueChange={(value) => setCreateForm({ ...createForm, role: value })}>
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
                <Select value={createForm.status} onValueChange={(value) => setCreateForm({ ...createForm, status: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {USER_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={handleCreateUser}
              disabled={
                createLoading ||
                !createForm.email ||
                !createForm.password ||
                !createForm.firstName ||
                !createForm.lastName
              }
            >
              {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('users.createUser')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
