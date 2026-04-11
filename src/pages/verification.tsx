import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Shield,
  XCircle,
} from 'lucide-react'

interface PendingVerificationUser {
  id: string
  firstName: string
  lastName: string
  email: string
  selfieUrl: string
  userImageUrl: string
  selfieVerified: boolean
  verificationStatus: 'pending' | 'approved' | 'rejected'
  status: string
  createdAt: string
}

interface PendingDocUser {
  id: string
  firstName: string
  lastName: string
  email: string
  documentUrl: string
  documentType: string
  userImageUrl: string
  documentVerified: boolean
  verificationStatus: 'pending' | 'approved' | 'rejected'
  status: string
  createdAt: string
}

type ApiRecord = Record<string, any>
type UserStatus = 'active' | 'pending_verification' | 'rejected' | 'banned' | 'suspended'

const USER_POOL_PAGES = 5
const REFRESH_INTERVAL_MS = 15000

const isRecord = (value: unknown): value is ApiRecord =>
  typeof value === 'object' && value !== null

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
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
  return false
}

const normalizeVerificationStatus = (
  statusCandidates: unknown[],
  booleanCandidates: unknown[],
  rejectionCandidates: unknown[] = []
): 'pending' | 'approved' | 'rejected' => {
  for (const statusCandidate of statusCandidates) {
    if (typeof statusCandidate !== 'string') {
      continue
    }

    const normalized = statusCandidate.toLowerCase().trim()
    if (!normalized) {
      continue
    }

    if (normalized.includes('approved') || normalized.includes('verified') || normalized.includes('accepted')) {
      return 'approved'
    }

    if (normalized.includes('rejected') || normalized.includes('declined') || normalized.includes('denied')) {
      return 'rejected'
    }
  }

  for (const rejectionCandidate of rejectionCandidates) {
    if (typeof rejectionCandidate === 'string' && rejectionCandidate.trim().length > 0) {
      return 'rejected'
    }
  }

  if (booleanCandidates.some((candidate) => candidate === true)) {
    return 'approved'
  }

  return 'pending'
}

const extractItems = (payload: unknown): ApiRecord[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  if (!isRecord(payload)) {
    return []
  }

  for (const key of ['users', 'documents', 'items', 'results', 'rows', 'data']) {
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

const uniqueById = <T extends { id?: string }>(items: T[]) => {
  const seen = new Map<string, T>()
  items.forEach((item) => {
    if (typeof item.id === 'string' && item.id.length > 0) {
      seen.set(item.id, item)
    }
  })
  return Array.from(seen.values())
}

const getPhotoFromArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return ''
  }

  return firstString(
    ...value.map((item) => {
      if (!isRecord(item)) {
        return ''
      }

      return firstString(item.url, item.photoUrl, item.imageUrl, item.avatarUrl)
    })
  )
}

const getUserImageUrl = (record: ApiRecord, nestedUser: ApiRecord | null) => {
  const recordProfile = isRecord(record.profile) ? record.profile : null
  const nestedProfile = nestedUser && isRecord(nestedUser.profile) ? nestedUser.profile : null

  return firstString(
    record.profileImage,
    record.profilePhoto,
    record.avatar,
    record.avatarUrl,
    record.photoUrl,
    nestedUser?.profileImage,
    nestedUser?.profilePhoto,
    nestedUser?.avatar,
    nestedUser?.avatarUrl,
    nestedUser?.photoUrl,
    recordProfile?.photoUrl,
    recordProfile?.avatar,
    nestedProfile?.photoUrl,
    nestedProfile?.avatar,
    getPhotoFromArray(record.photos),
    getPhotoFromArray(nestedUser?.photos),
  )
}

const normalizeUserStatus = (value: unknown): UserStatus | '' => {
  const normalized = typeof value === 'string' ? value.toLowerCase().trim().replace(/\s+/g, '_') : ''

  if (normalized === 'active') return 'active'
  if (normalized === 'pending_verification' || normalized === 'pending') return 'pending_verification'
  if (normalized === 'rejected' || normalized === 'declined' || normalized === 'denied') return 'rejected'
  if (normalized === 'banned') return 'banned'
  if (normalized === 'suspended') return 'suspended'

  return ''
}

const userStatusBadge = (status: string) => {
  const normalizedStatus = normalizeUserStatus(status)

  if (normalizedStatus === 'active') {
    return <Badge variant="success">Active</Badge>
  }

  if (normalizedStatus === 'pending_verification') {
    return <Badge variant="warning">Pending Verification</Badge>
  }

  if (normalizedStatus === 'rejected') {
    return <Badge variant="destructive">Rejected</Badge>
  }

  if (normalizedStatus === 'banned') {
    return <Badge variant="destructive">Banned</Badge>
  }

  if (normalizedStatus === 'suspended') {
    return <Badge variant="warning">Suspended</Badge>
  }

  return <Badge variant="secondary">{status || 'Unknown'}</Badge>
}

const verificationStatusBadge = (status: 'pending' | 'approved' | 'rejected') => {
  if (status === 'approved') {
    return <Badge variant="success">Approved</Badge>
  }

  if (status === 'rejected') {
    return <Badge variant="destructive">Rejected</Badge>
  }

  return <Badge variant="warning">Pending</Badge>
}

const formatSubmittedAt = (value: string) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Just now'
  }

  return date.toLocaleString()
}

const normalizePendingSelfieUser = (record: ApiRecord): PendingVerificationUser | null => {
  const nestedUser = isRecord(record.user) ? record.user : null
  const verification = isRecord(record.verification) ? record.verification : null
  const selfie = isRecord(record.selfie) ? record.selfie : null
  const selfieSub = isRecord(verification?.selfie) ? verification!.selfie : null

  const id = firstString(record.userId, nestedUser?.id, record.id)
  const selfieUrl = firstString(
    selfieSub?.url,
    record.selfieUrl,
    selfie?.url,
    verification?.selfieUrl,
    nestedUser?.selfieUrl,
  )

  if (!id || !selfieUrl) {
    return null
  }

  return {
    id,
    firstName: firstString(record.firstName, nestedUser?.firstName) || 'User',
    lastName: firstString(record.lastName, nestedUser?.lastName),
    email: firstString(record.email, nestedUser?.email),
    selfieUrl,
    userImageUrl: getUserImageUrl(record, nestedUser),
    selfieVerified: firstBoolean(record.selfieVerified, nestedUser?.selfieVerified, verification?.selfieVerified),
    verificationStatus: normalizeVerificationStatus(
      [
        selfieSub?.status,
        record.selfieVerificationStatus,
        record.selfieStatus,
        verification?.selfieVerificationStatus,
        verification?.selfieStatus,
      ],
      [
        record.selfieVerified,
        nestedUser?.selfieVerified,
        verification?.selfieVerified,
      ],
      [
        selfieSub?.rejectionReason,
        record.selfieRejectionReason,
        verification?.selfieRejectionReason,
      ]
    ),
    status: firstString(record.status, nestedUser?.status) || 'pending_verification',
    createdAt: firstString(selfieSub?.submittedAt, record.createdAt, record.updatedAt, nestedUser?.createdAt) || new Date().toISOString(),
  }
}

const normalizePendingDocUser = (record: ApiRecord): PendingDocUser | null => {
  const nestedUser = isRecord(record.user) ? record.user : null
  const verification = isRecord(record.verification) ? record.verification : null
  const document = isRecord(record.document) ? record.document : null
  const maritalSub = isRecord(verification?.marital_status) ? verification!.marital_status : null

  const id = firstString(record.userId, nestedUser?.id, record.id)
  const documentUrl = firstString(
    maritalSub?.url,
    record.documentUrl,
    record.identityDocumentUrl,
    record.idDocumentUrl,
    record.maritalDocumentUrl,
    record.martialDocumentUrl,
    record.marriageDocumentUrl,
    document?.url,
    verification?.documentUrl,
    nestedUser?.documentUrl,
  )

  if (!id || !documentUrl) {
    return null
  }

  return {
    id,
    firstName: firstString(record.firstName, nestedUser?.firstName) || 'User',
    lastName: firstString(record.lastName, nestedUser?.lastName),
    email: firstString(record.email, nestedUser?.email),
    documentUrl,
    documentType: firstString(
      record.documentType,
      record.identityDocumentType,
      record.maritalDocumentType,
      record.martialDocumentType,
      document?.type,
      verification?.documentType,
      nestedUser?.documentType,
    ) || 'Marital Document',
    userImageUrl: getUserImageUrl(record, nestedUser),
    documentVerified: firstBoolean(
      record.documentVerified,
      record.isDocumentVerified,
      document?.verified,
      verification?.documentVerified,
      nestedUser?.documentVerified,
    ),
    verificationStatus: normalizeVerificationStatus(
      [
        maritalSub?.status,
        record.maritalVerificationStatus,
        record.maritalStatusVerificationStatus,
        record.documentVerificationStatus,
        verification?.maritalVerificationStatus,
        verification?.documentVerificationStatus,
      ],
      [
        record.maritalVerified,
        record.maritalStatusVerified,
        record.documentVerified,
        nestedUser?.maritalVerified,
        nestedUser?.maritalStatusVerified,
        nestedUser?.documentVerified,
      ],
      [
        maritalSub?.rejectionReason,
        record.maritalRejectionReason,
        record.documentRejectionReason,
      ]
    ),
    status: firstString(record.status, nestedUser?.status) || 'pending_verification',
    createdAt: firstString(maritalSub?.submittedAt, record.createdAt, record.updatedAt, nestedUser?.createdAt) || new Date().toISOString(),
  }
}

const loadUserPool = async () => {
  const settledResponses = await Promise.allSettled(
    Array.from({ length: USER_POOL_PAGES }, (_, index) => adminApi.getUsers(index + 1, 100))
  )

  return uniqueById(
    settledResponses.flatMap((result) => {
      if (result.status !== 'fulfilled') {
        return []
      }

      return extractItems(result.value.data).filter((item) => typeof item.id === 'string' && item.id.length > 0)
    })
  )
}

export default function VerificationPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [tab, setTab] = useState('selfie')
  const [selfieUsers, setSelfieUsers] = useState<PendingVerificationUser[]>([])
  const [maritalUsers, setMaritalUsers] = useState<PendingDocUser[]>([])
  const [selfieLoading, setSelfieLoading] = useState(true)
  const [maritalLoading, setMaritalLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const refreshVerificationData = async (silent = false) => {
    if (!silent) {
      setSelfieLoading(true)
      setMaritalLoading(true)
    }

    try {
      const [userPool, pendingDocumentsResult] = await Promise.all([
        loadUserPool(),
        adminApi.getPendingDocuments().catch(() => null),
      ])

      const nextSelfieUsers = uniqueById(
        userPool
          .map(normalizePendingSelfieUser)
          .filter((user): user is PendingVerificationUser => Boolean(user))
      )

      const pendingDocumentRecords = pendingDocumentsResult
        ? extractItems(pendingDocumentsResult.data)
        : []

      const nextMaritalUsers = uniqueById(
        [...pendingDocumentRecords, ...userPool]
          .map(normalizePendingDocUser)
          .filter((user): user is PendingDocUser => Boolean(user))
      )

      setSelfieUsers(nextSelfieUsers)
      setMaritalUsers(nextMaritalUsers)
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      console.error(error)
      if (!silent) {
        toast({
          title: t('common.error'),
          description: 'Failed to load verification items.',
          variant: 'error',
        })
      }
    } finally {
      setSelfieLoading(false)
      setMaritalLoading(false)
    }
  }

  useEffect(() => {
    void refreshVerificationData()

    const refreshId = window.setInterval(() => {
      void refreshVerificationData(true)
    }, REFRESH_INTERVAL_MS)

    return () => window.clearInterval(refreshId)
  }, [])

  const applySelfieDecision = (userId: string, approved: boolean) => {
    setSelfieUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              selfieVerified: approved,
              verificationStatus: approved ? 'approved' : 'rejected',
            }
          : user
      )
    )
  }

  const applyMaritalDecision = (userId: string, approved: boolean) => {
    setMaritalUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              documentVerified: approved,
              verificationStatus: approved ? 'approved' : 'rejected',
            }
          : user
      )
    )
  }

  const handleSelfieDecision = async (userId: string, approved: boolean) => {
    const actionKey = `selfie:${userId}`
    setActionLoading(actionKey)

    try {
      await adminApi.verifySelfie(userId, approved)
      applySelfieDecision(userId, approved)
      toast({
        title: approved ? t('verification.approved') : t('verification.rejected'),
        description: approved ? t('verification.selfieApprovedDesc') : t('verification.selfieRejectedDesc'),
        variant: approved ? 'success' : 'warning',
      })
      await refreshVerificationData(true)
    } catch (error) {
      console.error(error)
      toast({
        title: t('common.error'),
        description: 'Failed to update selfie verification.',
        variant: 'error',
      })
    } finally {
      setActionLoading('')
    }
  }

  const handleMaritalDecision = async (userId: string, approved: boolean) => {
    const actionKey = `marital:${userId}`
    setActionLoading(actionKey)

    try {
      await adminApi.verifyMaritalStatus(userId, approved, approved ? undefined : 'Rejected by admin review')
      applyMaritalDecision(userId, approved)
      toast({
        title: approved ? t('verification.approved') : t('verification.rejected'),
        description: approved ? t('verification.docApprovedDesc') : t('verification.docRejectedDesc'),
        variant: approved ? 'success' : 'warning',
      })
      await refreshVerificationData(true)
    } catch (error) {
      console.error(error)
      toast({
        title: t('common.error'),
        description: 'Failed to update marital status verification.',
        variant: 'error',
      })
    } finally {
      setActionLoading('')
    }
  }

  const pendingSelfieCount = selfieUsers.filter((user) => user.verificationStatus === 'pending').length
  const pendingMaritalCount = maritalUsers.filter((user) => user.verificationStatus === 'pending').length
  const totalPendingCount = pendingSelfieCount + pendingMaritalCount

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('verification.title')}</h1>
          <p className="text-muted-foreground">
            Selfie uploads and marital documents are reviewed in separate queues with automatic refresh.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Syncing...'}
          </Badge>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void refreshVerificationData()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-semibold text-foreground">Clear review queues for the client</p>
            <p className="text-muted-foreground">
              Selfie Verification confirms the uploaded selfie. Marital Status Verification reviews the uploaded marital document.
              Every successful admin action refreshes the UI immediately, and the page re-syncs automatically every 15 seconds.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending Reviews</p>
            <p className="mt-2 text-2xl font-bold">{totalPendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Selfie Queue</p>
            <p className="mt-2 text-2xl font-bold">{pendingSelfieCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Marital Queue</p>
            <p className="mt-2 text-2xl font-bold">{pendingMaritalCount}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="selfie" className="gap-2">
            <Camera className="h-4 w-4" />
            Selfie Verification
            {pendingSelfieCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {pendingSelfieCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="marital" className="gap-2">
            <FileText className="h-4 w-4" />
            Marital Status Verification
            {pendingMaritalCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {pendingMaritalCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="selfie" className="space-y-4">
          {selfieLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : selfieUsers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                <div>
                  <p className="text-lg font-medium">{t('verification.allCaughtUp')}</p>
                  <p className="text-sm">No selfie uploads are waiting for review.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {selfieUsers.map((user) => (
                <Card key={user.id} className="overflow-hidden">
                  <div
                    className="relative aspect-[4/3] cursor-pointer bg-muted"
                    onClick={() => setPreviewImg(user.selfieUrl)}
                  >
                    <img
                      src={user.selfieUrl}
                      alt={`${user.firstName} ${user.lastName} selfie`}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all hover:bg-black/20">
                      <Eye className="h-8 w-8 text-white opacity-0 transition-opacity hover:opacity-90" />
                    </div>
                    <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                      {verificationStatusBadge(user.verificationStatus)}
                    </div>
                  </div>

                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        {user.userImageUrl ? <AvatarImage src={user.userImageUrl} alt={`${user.firstName} ${user.lastName}`} /> : null}
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {user.firstName?.[0] || '?'}{user.lastName?.[0] || ''}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{user.firstName} {user.lastName}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email || `User ${user.id.slice(0, 8)}`}</p>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => navigate(`/users/${user.id}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {userStatusBadge(user.status)}
                      <Badge variant="info">Selfie Upload</Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Uploaded {formatSubmittedAt(user.createdAt)}
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        className="gap-2 bg-emerald-500 text-white hover:bg-emerald-600"
                        disabled={actionLoading === `selfie:${user.id}`}
                        onClick={() => void handleSelfieDecision(user.id, true)}
                      >
                        {actionLoading === `selfie:${user.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        className="gap-2"
                        disabled={actionLoading === `selfie:${user.id}`}
                        onClick={() => void handleSelfieDecision(user.id, false)}
                      >
                        {actionLoading === `selfie:${user.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="marital" className="space-y-4">
          {maritalLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : maritalUsers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                <div>
                  <p className="text-lg font-medium">{t('verification.allCaughtUp')}</p>
                  <p className="text-sm">No marital documents are waiting for review.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {maritalUsers.map((user) => (
                <Card key={user.id} className="overflow-hidden">
                  <div
                    className="relative aspect-[4/3] cursor-pointer bg-muted"
                    onClick={() => setPreviewImg(user.documentUrl)}
                  >
                    <img
                      src={user.documentUrl}
                      alt={`${user.firstName} ${user.lastName} document`}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all hover:bg-black/20">
                      <Eye className="h-8 w-8 text-white opacity-0 transition-opacity hover:opacity-90" />
                    </div>
                    <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                      {verificationStatusBadge(user.verificationStatus)}
                      <Badge variant="info">{user.documentType.replace(/_/g, ' ')}</Badge>
                    </div>
                  </div>

                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        {user.userImageUrl ? <AvatarImage src={user.userImageUrl} alt={`${user.firstName} ${user.lastName}`} /> : null}
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {user.firstName?.[0] || '?'}{user.lastName?.[0] || ''}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{user.firstName} {user.lastName}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email || `User ${user.id.slice(0, 8)}`}</p>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => navigate(`/users/${user.id}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {userStatusBadge(user.status)}
                      <Badge variant="info">
                        <Shield className="mr-1 h-3 w-3" />
                        Marital Document
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Uploaded {formatSubmittedAt(user.createdAt)}
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        className="gap-2 bg-emerald-500 text-white hover:bg-emerald-600"
                        disabled={actionLoading === `marital:${user.id}`}
                        onClick={() => void handleMaritalDecision(user.id, true)}
                      >
                        {actionLoading === `marital:${user.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        className="gap-2"
                        disabled={actionLoading === `marital:${user.id}`}
                        onClick={() => void handleMaritalDecision(user.id, false)}
                      >
                        {actionLoading === `marital:${user.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewImg} onOpenChange={() => setPreviewImg(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Verification Preview</DialogTitle>
          </DialogHeader>
          {previewImg && (
            <img src={previewImg} alt="Verification preview" className="max-h-[85vh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
