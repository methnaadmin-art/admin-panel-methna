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

type ApiRecord = Record<string, any>
type VerificationDecision = 'pending' | 'approved' | 'rejected'
type VerificationTab = 'selfie' | 'identity' | 'marital'
type DocumentVerificationType = 'identity' | 'marital_status'
type UserStatus = 'active' | 'pending_verification' | 'rejected' | 'banned' | 'suspended'

interface PendingVerificationUser {
  id: string
  firstName: string
  lastName: string
  email: string
  selfieUrl: string
  userImageUrl: string
  selfieVerified: boolean
  verificationStatus: VerificationDecision
  status: string
  createdAt: string
}

interface PendingDocumentUser {
  id: string
  firstName: string
  lastName: string
  email: string
  documentUrl: string
  documentType: string
  verificationType: DocumentVerificationType
  queueLabel: string
  userImageUrl: string
  documentVerified: boolean
  verificationStatus: VerificationDecision
  status: string
  createdAt: string
}

interface PreviewAsset {
  kind: 'image' | 'pdf'
  title: string
  url: string
}

const REFRESH_INTERVAL_MS = 15000
const VERIFICATION_QUEUE_LIMIT = 100

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
): VerificationDecision => {
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

    if (
      normalized.includes('rejected') ||
      normalized.includes('declined') ||
      normalized.includes('denied') ||
      normalized.includes('reverify')
    ) {
      return 'rejected'
    }

    if (normalized.includes('pending') || normalized.includes('review')) {
      return 'pending'
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

const verificationStatusBadge = (status: VerificationDecision) => {
  if (status === 'approved') {
    return <Badge variant="success">Verified</Badge>
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

const prettifyDocumentType = (value: string, fallback: string) => {
  const source = value.trim().length > 0 ? value : fallback
  return source
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const isPdfAsset = (url: string) => {
  const normalized = url.toLowerCase()
  return /\.pdf($|[?#])/.test(normalized) || normalized.includes('/raw/upload/') || normalized.includes('f_pdf')
}

const buildPreviewAsset = (url: string, title: string): PreviewAsset => ({
  kind: isPdfAsset(url) ? 'pdf' : 'image',
  title,
  url,
})

const normalizePendingSelfieUser = (record: ApiRecord): PendingVerificationUser | null => {
  const nestedUser = isRecord(record.user) ? record.user : null
  const verification = isRecord(record.verification) ? record.verification : null
  const selfie = isRecord(record.selfie) ? record.selfie : null
  const selfieSub = isRecord(verification?.selfie) ? verification.selfie : null

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
    createdAt: firstString(
      selfieSub?.submittedAt,
      record.selfieSubmittedAt,
      record.createdAt,
      record.updatedAt,
      nestedUser?.createdAt,
    ) || new Date().toISOString(),
  }
}

const normalizePendingDocumentUser = (
  record: ApiRecord,
  verificationType: DocumentVerificationType
): PendingDocumentUser | null => {
  const nestedUser = isRecord(record.user) ? record.user : null
  const verification = isRecord(record.verification) ? record.verification : null
  const identitySub = isRecord(verification?.identity) ? verification.identity : null
  const maritalSub = isRecord(verification?.marital_status) ? verification.marital_status : null

  const id = firstString(record.userId, nestedUser?.id, record.id)
  const documentUrl = verificationType === 'identity'
    ? firstString(
        identitySub?.url,
        record.documentUrl,
        record.identityDocumentUrl,
        record.idDocumentUrl,
        verification?.documentUrl,
        nestedUser?.documentUrl,
      )
    : firstString(
        maritalSub?.url,
        record.maritalDocumentUrl,
        record.martialDocumentUrl,
        record.marriageDocumentUrl,
        record.marriageCertUrl,
        record.marriageCertificateUrl,
        record.certificateUrl,
      )

  if (!id || !documentUrl) {
    return null
  }

  const documentType = verificationType === 'identity'
    ? prettifyDocumentType(
        firstString(
          record.documentType,
          record.identityDocumentType,
          nestedUser?.documentType,
        ),
        'Identity Document'
      )
    : prettifyDocumentType(
        firstString(
          record.maritalDocumentType,
          record.martialDocumentType,
          record.marriageDocumentType,
          record.documentType,
        ),
        'Marriage Certificate'
      )

  const verificationStatus = verificationType === 'identity'
    ? normalizeVerificationStatus(
        [
          identitySub?.status,
          record.documentVerificationStatus,
          record.identityVerificationStatus,
          record.idDocumentStatus,
          verification?.documentVerificationStatus,
          verification?.identityVerificationStatus,
        ],
        [
          record.documentVerified,
          record.isDocumentVerified,
          nestedUser?.documentVerified,
          verification?.documentVerified,
        ],
        [
          identitySub?.rejectionReason,
          record.documentRejectionReason,
          verification?.documentRejectionReason,
        ]
      )
    : normalizeVerificationStatus(
        [
          maritalSub?.status,
          record.maritalVerificationStatus,
          record.maritalStatusVerificationStatus,
          record.marriageCertStatus,
          verification?.maritalVerificationStatus,
          verification?.maritalStatusVerificationStatus,
        ],
        [
          record.maritalVerified,
          record.maritalStatusVerified,
          verification?.maritalVerified,
          verification?.maritalStatusVerified,
        ],
        [
          maritalSub?.rejectionReason,
          record.maritalRejectionReason,
          record.marriageCertRejectionReason,
        ]
      )

  const documentVerified = verificationType === 'identity'
    ? firstBoolean(
        record.documentVerified,
        record.isDocumentVerified,
        nestedUser?.documentVerified,
        verification?.documentVerified,
      )
    : verificationStatus === 'approved'

  return {
    id,
    firstName: firstString(record.firstName, nestedUser?.firstName) || 'User',
    lastName: firstString(record.lastName, nestedUser?.lastName),
    email: firstString(record.email, nestedUser?.email),
    documentUrl,
    documentType,
    verificationType,
    queueLabel: verificationType === 'identity' ? 'Identity Document' : 'Marital Document',
    userImageUrl: getUserImageUrl(record, nestedUser),
    documentVerified,
    verificationStatus,
    status: firstString(record.status, nestedUser?.status) || 'pending_verification',
    createdAt: firstString(
      verificationType === 'identity' ? identitySub?.submittedAt : maritalSub?.submittedAt,
      record.documentSubmittedAt,
      record.createdAt,
      record.updatedAt,
      nestedUser?.createdAt,
    ) || new Date().toISOString(),
  }
}

export default function VerificationPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [tab, setTab] = useState<VerificationTab>('selfie')
  const [statusFilter, setStatusFilter] = useState<VerificationDecision>('pending')
  const [selfieUsers, setSelfieUsers] = useState<PendingVerificationUser[]>([])
  const [identityUsers, setIdentityUsers] = useState<PendingDocumentUser[]>([])
  const [maritalUsers, setMaritalUsers] = useState<PendingDocumentUser[]>([])
  const [loading, setLoading] = useState({
    selfie: true,
    identity: true,
    marital: true,
  })
  const [actionLoading, setActionLoading] = useState('')
  const [previewAsset, setPreviewAsset] = useState<PreviewAsset | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const refreshVerificationData = async (silent = false) => {
    if (!silent) {
      setLoading({
        selfie: true,
        identity: true,
        marital: true,
      })
    }

    try {
      const [selfieQueueResult, identityQueueResult, maritalQueueResult] = await Promise.all([
        adminApi.getVerifications({ page: 1, limit: VERIFICATION_QUEUE_LIMIT, status: statusFilter, type: 'selfie' }),
        adminApi.getVerifications({ page: 1, limit: VERIFICATION_QUEUE_LIMIT, status: statusFilter, type: 'identity' }),
        adminApi.getVerifications({ page: 1, limit: VERIFICATION_QUEUE_LIMIT, status: statusFilter, type: 'marital_status' }),
      ])

      const nextSelfieUsers = uniqueById(
        extractItems(selfieQueueResult.data)
          .map(normalizePendingSelfieUser)
          .filter((user): user is PendingVerificationUser => Boolean(user))
      )

      const nextIdentityUsers = uniqueById(
        extractItems(identityQueueResult.data)
          .map((record) => normalizePendingDocumentUser(record, 'identity'))
          .filter((user): user is PendingDocumentUser => Boolean(user))
      )

      const nextMaritalUsers = uniqueById(
        extractItems(maritalQueueResult.data)
          .map((record) => normalizePendingDocumentUser(record, 'marital_status'))
          .filter((user): user is PendingDocumentUser => Boolean(user))
      )

      setSelfieUsers(nextSelfieUsers)
      setIdentityUsers(nextIdentityUsers)
      setMaritalUsers(nextMaritalUsers)
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      console.error(error)

      if (!silent) {
        toast({
          title: t('common.error'),
          description: 'Failed to load verification queues.',
          variant: 'error',
        })
      }
    } finally {
      setLoading({
        selfie: false,
        identity: false,
        marital: false,
      })
    }
  }

  useEffect(() => {
    void refreshVerificationData()

    const refreshId = window.setInterval(() => {
      void refreshVerificationData(true)
    }, REFRESH_INTERVAL_MS)

    return () => window.clearInterval(refreshId)
  }, [statusFilter])

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

  const applyDocumentDecision = (
    verificationType: DocumentVerificationType,
    userId: string,
    approved: boolean
  ) => {
    const nextStatus: VerificationDecision = approved ? 'approved' : 'rejected'
    const applyDecision = (currentUsers: PendingDocumentUser[]): PendingDocumentUser[] =>
      currentUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              documentVerified: approved,
              verificationStatus: nextStatus,
            }
          : user
      )

    if (verificationType === 'identity') {
      setIdentityUsers((currentUsers) => applyDecision(currentUsers))
      return
    }

    setMaritalUsers((currentUsers) => applyDecision(currentUsers))
  }

  const handleSelfieDecision = async (userId: string, approved: boolean) => {
    const currentUser = selfieUsers.find((user) => user.id === userId)
    if (currentUser?.verificationStatus === 'approved' && !approved) {
      toast({
        title: 'Already verified',
        description: 'This selfie is already verified and locked. Ask the user to re-upload if it needs review again.',
        variant: 'warning',
      })
      return
    }

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

  const handleDocumentDecision = async (
    verificationType: DocumentVerificationType,
    userId: string,
    approved: boolean
  ) => {
    const currentUsers = verificationType === 'identity' ? identityUsers : maritalUsers
    const currentUser = currentUsers.find((user) => user.id === userId)

    if (currentUser?.verificationStatus === 'approved' && !approved) {
      toast({
        title: 'Already verified',
        description: 'This document is already verified and locked. Ask the user to upload a new file for another review.',
        variant: 'warning',
      })
      return
    }

    const actionKey = `${verificationType}:${userId}`
    setActionLoading(actionKey)

    try {
      if (verificationType === 'identity') {
        await adminApi.verifyDocument(userId, approved, approved ? undefined : 'Rejected by admin review')
      } else {
        await adminApi.verifyMaritalStatus(userId, approved, approved ? undefined : 'Rejected by admin review')
      }

      applyDocumentDecision(verificationType, userId, approved)
      toast({
        title: approved ? t('verification.approved') : t('verification.rejected'),
        description: verificationType === 'identity'
          ? approved
            ? t('verification.docApprovedDesc')
            : t('verification.docRejectedDesc')
          : approved
            ? 'The marital document was approved and stays attached to the marital verification record.'
            : 'The marital document was rejected and the user must upload a replacement before another review.',
        variant: approved ? 'success' : 'warning',
      })
      await refreshVerificationData(true)
    } catch (error) {
      console.error(error)
      toast({
        title: t('common.error'),
        description: verificationType === 'identity'
          ? 'Failed to update identity verification.'
          : 'Failed to update marital verification.',
        variant: 'error',
      })
    } finally {
      setActionLoading('')
    }
  }

  const pendingSelfieCount = selfieUsers.filter((user) => user.verificationStatus === 'pending').length
  const pendingIdentityCount = identityUsers.filter((user) => user.verificationStatus === 'pending').length
  const pendingMaritalCount = maritalUsers.filter((user) => user.verificationStatus === 'pending').length
  const totalPendingCount = pendingSelfieCount + pendingIdentityCount + pendingMaritalCount

  const renderQueueEmptyState = (description: string) => (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
        <CheckCircle2 className="h-12 w-12 text-emerald-400" />
        <div>
          <p className="text-lg font-medium">{t('verification.allCaughtUp')}</p>
          <p className="text-sm">{description}</p>
        </div>
      </CardContent>
    </Card>
  )

  const renderSelfieQueue = () => {
    if (loading.selfie) {
      return (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )
    }

    if (selfieUsers.length === 0) {
      return renderQueueEmptyState('No selfie uploads match this filter.')
    }

    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {selfieUsers.map((user) => (
          <Card key={user.id} className="overflow-hidden">
            <div
              className="relative aspect-[4/3] cursor-pointer bg-muted"
              onClick={() => setPreviewAsset(buildPreviewAsset(user.selfieUrl, `${user.firstName} ${user.lastName} selfie`))}
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

              {user.verificationStatus === 'pending' ? (
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
              ) : user.verificationStatus === 'approved' ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <p className="font-medium">Verified and locked</p>
                  <p className="mt-1 text-xs text-emerald-700">This selfie stays approved until the user submits a new upload.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <p className="font-medium">Rejected</p>
                  <p className="mt-1 text-xs text-red-700">Waiting for a replacement selfie before another review can happen.</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const renderDocumentQueue = (
    users: PendingDocumentUser[],
    verificationType: DocumentVerificationType
  ) => {
    const isIdentityQueue = verificationType === 'identity'
    const queueLoading = isIdentityQueue ? loading.identity : loading.marital
    const actionPrefix = verificationType
    const emptyCopy = isIdentityQueue
      ? 'No identity documents match this filter.'
      : 'No marital documents match this filter.'

    if (queueLoading) {
      return (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )
    }

    if (users.length === 0) {
      return renderQueueEmptyState(emptyCopy)
    }

    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {users.map((user) => {
          const preview = buildPreviewAsset(
            user.documentUrl,
            `${user.firstName} ${user.lastName} ${user.queueLabel.toLowerCase()}`
          )

          return (
            <Card key={`${verificationType}:${user.id}`} className="overflow-hidden">
              <div
                className="relative aspect-[4/3] cursor-pointer bg-muted"
                onClick={() => setPreviewAsset(preview)}
              >
                {preview.kind === 'image' ? (
                  <img
                    src={user.documentUrl}
                    alt={`${user.firstName} ${user.lastName} document`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-100 text-slate-700">
                    <FileText className="h-12 w-12" />
                    <p className="text-sm font-medium">PDF Document</p>
                    <p className="px-6 text-center text-xs text-slate-500">Open the preview to review the uploaded file.</p>
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all hover:bg-black/20">
                  <Eye className="h-8 w-8 text-white opacity-0 transition-opacity hover:opacity-90" />
                </div>
                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                  {verificationStatusBadge(user.verificationStatus)}
                  <Badge variant="info">{user.queueLabel}</Badge>
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
                  <Badge variant="info" className="gap-1">
                    {isIdentityQueue ? <Shield className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                    {user.documentType}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  Uploaded {formatSubmittedAt(user.createdAt)}
                </p>

                {user.verificationStatus === 'pending' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="gap-2 bg-emerald-500 text-white hover:bg-emerald-600"
                      disabled={actionLoading === `${actionPrefix}:${user.id}`}
                      onClick={() => void handleDocumentDecision(verificationType, user.id, true)}
                    >
                      {actionLoading === `${actionPrefix}:${user.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      disabled={actionLoading === `${actionPrefix}:${user.id}`}
                      onClick={() => void handleDocumentDecision(verificationType, user.id, false)}
                    >
                      {actionLoading === `${actionPrefix}:${user.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Reject
                    </Button>
                  </div>
                ) : user.verificationStatus === 'approved' ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <p className="font-medium">Verified and locked</p>
                    <p className="mt-1 text-xs text-emerald-700">
                      {isIdentityQueue
                        ? 'This identity document is approved and the record is now stable.'
                        : 'This marital document stays attached to the marital verification record.'}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    <p className="font-medium">Rejected</p>
                    <p className="mt-1 text-xs text-red-700">
                      {isIdentityQueue
                        ? 'Waiting for a replacement identity document before another review.'
                        : 'Waiting for a replacement marital document before another review.'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('verification.title')}</h1>
          <p className="text-muted-foreground">{t('verification.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="rounded-md border px-3 py-1.5 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as VerificationDecision)}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
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
            <p className="font-semibold text-foreground">Review queues stay isolated</p>
            <p className="text-muted-foreground">
              Selfies, identity documents, and marital documents now refresh independently and each action calls the matching backend workflow.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            <p className="text-sm text-muted-foreground">Identity Queue</p>
            <p className="mt-2 text-2xl font-bold">{pendingIdentityCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Marital Queue</p>
            <p className="mt-2 text-2xl font-bold">{pendingMaritalCount}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as VerificationTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="selfie" className="gap-2">
            <Camera className="h-4 w-4" />
            Selfie
            {pendingSelfieCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {pendingSelfieCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="identity" className="gap-2">
            <Shield className="h-4 w-4" />
            Identity
            {pendingIdentityCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {pendingIdentityCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="marital" className="gap-2">
            <FileText className="h-4 w-4" />
            Marital
            {pendingMaritalCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {pendingMaritalCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="selfie" className="space-y-4">
          {renderSelfieQueue()}
        </TabsContent>

        <TabsContent value="identity" className="space-y-4">
          {renderDocumentQueue(identityUsers, 'identity')}
        </TabsContent>

        <TabsContent value="marital" className="space-y-4">
          {renderDocumentQueue(maritalUsers, 'marital_status')}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(previewAsset)} onOpenChange={(open) => { if (!open) setPreviewAsset(null) }}>
        <DialogContent className="max-w-4xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>{previewAsset?.title || 'Verification Preview'}</DialogTitle>
          </DialogHeader>

          {previewAsset && previewAsset.kind === 'image' ? (
            <img
              src={previewAsset.url}
              alt={previewAsset.title}
              className="max-h-[85vh] w-full rounded-lg object-contain"
            />
          ) : previewAsset ? (
            <iframe
              src={previewAsset.url}
              title={previewAsset.title}
              className="h-[85vh] w-full rounded-lg border"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
