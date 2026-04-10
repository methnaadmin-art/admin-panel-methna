import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adminApi, trustSafetyApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { useToast } from '@/components/ui/toast'
import type { ContentFlag } from '@/types'
import { formatDateTime } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Loader2, Shield, AlertTriangle, CheckCircle, Search, Eye, ExternalLink } from 'lucide-react'

type DisplayFlag = ContentFlag & {
  previewUrl?: string
  documentUrl?: string
  selfieUrl?: string
  userName?: string
  userEmail?: string
  flaggedAt?: string
}

type TrustSafetyRecord = Record<string, any>
type ResolveStatus = 'action_taken' | 'reviewed' | 'dismissed'

const isRecord = (value: unknown): value is TrustSafetyRecord =>
  typeof value === 'object' && value !== null

const extractCollection = (payload: unknown): TrustSafetyRecord[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  if (!isRecord(payload)) {
    return []
  }

  for (const key of ['flags', 'contentFlags', 'results', 'items', 'rows', 'records', 'data']) {
    const candidate = payload[key]
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
    if (isRecord(candidate)) {
      const nested = extractCollection(candidate)
      if (nested.length > 0) {
        return nested
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

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return ''
}

const prefersDocumentAsset = (flag: Pick<DisplayFlag, 'type' | 'entityType' | 'content'>) => {
  const assetHint = `${flag.type || ''} ${flag.entityType || ''} ${flag.content || ''}`.toLowerCase()
  return /document|id\b|passport|certificate|marital|marriage|verification/.test(assetHint)
}

const normalizeFlag = (value: TrustSafetyRecord, index: number): DisplayFlag => {
  const nestedUser = isRecord(value.user)
    ? value.user
    : isRecord(value.reportedUser)
      ? value.reportedUser
      : undefined
  const verification = isRecord(value.verification) ? value.verification : undefined
  const document = isRecord(value.document) ? value.document : undefined
  const selfie = isRecord(value.selfie) ? value.selfie : undefined
  const media = isRecord(value.media) ? value.media : undefined
  const previewUrl = firstString(
    value.previewUrl,
    value.imageUrl,
    value.photoUrl,
    value.mediaUrl,
    media?.url,
    value.contentUrl,
  )
  const documentUrl = firstString(
    value.documentUrl,
    value.identityDocumentUrl,
    value.idDocumentUrl,
    value.maritalDocumentUrl,
    value.martialDocumentUrl,
    value.marriageDocumentUrl,
    document?.url,
    verification?.documentUrl,
    nestedUser?.documentUrl,
  )
  const selfieUrl = firstString(
    value.selfieUrl,
    selfie?.url,
    verification?.selfieUrl,
    nestedUser?.selfieUrl,
  )
  const type = String(value.type || value.flagType || value.category || value.reason || 'UNKNOWN').toUpperCase()
  const source = String(value.source || value.origin || value.flagSource || 'USER_REPORT').toUpperCase()
  const entityType = String(value.entityType || value.targetType || value.resourceType || value.entity || 'USER').toUpperCase()
  const confidenceCandidate = value.confidenceScore ?? value.confidence ?? value.score

  return {
    ...value,
    id: String(value.id || value._id || `flag-${index}`),
    userId: String(value.userId || nestedUser?.id || value.reportedUserId || ''),
    type,
    status: String(value.status || 'PENDING').toUpperCase() as ContentFlag['status'],
    source,
    content: typeof value.content === 'string'
      ? value.content
      : typeof value.message === 'string'
        ? value.message
        : typeof value.description === 'string'
          ? value.description
          : typeof value.reasonText === 'string'
            ? value.reasonText
            : undefined,
    entityType,
    entityId: String(value.entityId || value.targetId || value.resourceId || value.userId || nestedUser?.id || ''),
    confidenceScore: typeof confidenceCandidate === 'number' ? confidenceCandidate : undefined,
    reviewNote: typeof value.reviewNote === 'string' ? value.reviewNote : undefined,
    createdAt: String(value.createdAt || value.flaggedAt || value.updatedAt || new Date().toISOString()),
    user: nestedUser as ContentFlag['user'],
    previewUrl,
    documentUrl,
    selfieUrl,
    userName: firstString(
      value.userName,
      nestedUser?.name,
      `${nestedUser?.firstName || ''} ${nestedUser?.lastName || ''}`.trim(),
    ),
    userEmail: firstString(value.userEmail, nestedUser?.email),
    flaggedAt: firstString(value.flaggedAt, value.createdAt, value.updatedAt),
  }
}

const normalizeDetectionResult = (payload: unknown) => {
  const base = isRecord(payload)
    ? isRecord(payload.data)
      ? payload.data
      : isRecord(payload.result)
        ? payload.result
        : isRecord(payload.analysis)
          ? payload.analysis
          : payload
    : {}

  const reasonsSource = base.reasons ?? base.signals ?? base.flags ?? base.indicators
  const reasons = Array.isArray(reasonsSource)
    ? reasonsSource.map((reason) => String(reason)).filter(Boolean)
    : typeof reasonsSource === 'string' && reasonsSource.trim()
      ? [reasonsSource.trim()]
      : []

  const suspiciousValue = base.isSuspicious ?? base.suspicious ?? base.flagged ?? base.requiresReview
  const trustScore = base.trustScore ?? base.score ?? base.riskScore

  return {
    ...base,
    isSuspicious: Boolean(suspiciousValue),
    reasons,
    trustScore: typeof trustScore === 'number' ? trustScore : undefined,
  }
}

const flagTypeBadge = (type: string) => {
  const normalizedType = String(type || '').toUpperCase()
  const map: Record<string, { variant: any; label: string }> = {
    BAD_WORD: { variant: 'warning', label: 'Bad Word' },
    OFFENSIVE: { variant: 'destructive', label: 'Offensive' },
    SPAM: { variant: 'warning', label: 'Spam' },
    FAKE_PROFILE: { variant: 'destructive', label: 'Fake Profile' },
    INAPPROPRIATE_PHOTO: { variant: 'destructive', label: 'Inappropriate Photo' },
    HARASSMENT: { variant: 'destructive', label: 'Harassment' },
    SCAM: { variant: 'destructive', label: 'Scam' },
  }
  const info = map[normalizedType] || { variant: 'secondary', label: normalizedType || 'UNKNOWN' }
  return <Badge variant={info.variant}>{info.label}</Badge>
}

const sourceBadge = (source: string) => {
  switch (String(source || '').toUpperCase()) {
    case 'AUTO_DETECTED': return <Badge variant="info">Auto</Badge>
    case 'USER_REPORT': return <Badge variant="secondary">User Report</Badge>
    case 'ADMIN_FLAG': return <Badge variant="outline">Admin</Badge>
    default: return <Badge variant="secondary">{source}</Badge>
  }
}

const statusBadge = (status: string) => {
  switch (String(status || '').toUpperCase()) {
    case 'PENDING':
      return <Badge variant="warning">Pending</Badge>
    case 'ACTION_TAKEN':
      return <Badge variant="success">Action Taken</Badge>
    case 'REVIEWED':
      return <Badge variant="info">Reviewed</Badge>
    case 'DISMISSED':
      return <Badge variant="secondary">Dismissed</Badge>
    default:
      return <Badge variant="secondary">{status || 'Unknown'}</Badge>
  }
}

export default function TrustSafetyPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [flags, setFlags] = useState<DisplayFlag[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [resolveLoading, setResolveLoading] = useState(false)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [flagAssets, setFlagAssets] = useState<{ loading: boolean; previewUrl: string; selfieUrl: string; documentUrl: string }>({
    loading: false,
    previewUrl: '',
    selfieUrl: '',
    documentUrl: '',
  })

  // Resolve dialog
  const [resolveDialog, setResolveDialog] = useState<{ open: boolean; flag: DisplayFlag | null }>({
    open: false, flag: null,
  })
  const [resolveStatus, setResolveStatus] = useState<ResolveStatus>('action_taken')
  const [reviewNote, setReviewNote] = useState('')
  const [userActionLoading, setUserActionLoading] = useState<'shadow-ban' | 'remove-shadow-ban' | ''>('')

  // Suspicious detection
  const [detectUserId, setDetectUserId] = useState('')
  const [detectResult, setDetectResult] = useState<any>(null)
  const [detectLoading, setDetectLoading] = useState(false)

  const fetchFlags = async () => {
    setLoading(true)
    try {
      const { data } = await trustSafetyApi.getFlags(page, 20)
      const normalizedFlags = extractCollection(data).map(normalizeFlag)
      setFlags(normalizedFlags)
      setTotal(extractTotal(data, normalizedFlags.length))
    } catch (err) {
      console.error(err)
      setFlags([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFlags() }, [page])

  const loadFlagAssets = async (flag: DisplayFlag) => {
    const initialAssets = {
      previewUrl: flag.previewUrl || '',
      selfieUrl: flag.selfieUrl || '',
      documentUrl: flag.documentUrl || '',
    }

    const targetUserId = firstString(flag.userId, flag.entityType === 'USER' ? flag.entityId : '')
    if (!targetUserId || (initialAssets.previewUrl && (initialAssets.selfieUrl || initialAssets.documentUrl))) {
      setFlagAssets({ loading: false, ...initialAssets })
      return
    }

    setFlagAssets({ loading: true, ...initialAssets })
    try {
      const { data } = await adminApi.getUserDetail(targetUserId)
      const detailPayload = isRecord(data?.user) ? data : isRecord(data?.data) ? data.data : data
      const nestedUser = isRecord(detailPayload?.user) ? detailPayload.user : isRecord(detailPayload) ? detailPayload : null
      const verification = isRecord(detailPayload?.verification) ? detailPayload.verification : null
      const photos = Array.isArray(detailPayload?.photos) ? detailPayload.photos.filter(isRecord) : []
      const selfiePhoto = photos.find((photo: TrustSafetyRecord) => photo.isSelfieVerification)
      const flaggedPhoto = photos.find((photo: TrustSafetyRecord) => firstString(photo.id) === firstString(flag.entityId))

      setFlagAssets({
        loading: false,
        previewUrl: initialAssets.previewUrl || firstString(flaggedPhoto?.url, nestedUser?.photoUrl),
        selfieUrl: initialAssets.selfieUrl || firstString(
          nestedUser?.selfieUrl,
          verification?.selfieUrl,
          selfiePhoto?.url,
        ),
        documentUrl: initialAssets.documentUrl || firstString(
          nestedUser?.documentUrl,
          nestedUser?.identityDocumentUrl,
          nestedUser?.idDocumentUrl,
          nestedUser?.maritalDocumentUrl,
          nestedUser?.martialDocumentUrl,
          nestedUser?.marriageDocumentUrl,
          verification?.documentUrl,
        ),
      })
    } catch (error) {
      console.error('Failed to hydrate trust-safety assets', error)
      setFlagAssets({ loading: false, ...initialAssets })
    }
  }

  const openResolveDialog = (flag: DisplayFlag) => {
    setResolveStatus('action_taken')
    setReviewNote('')
    setResolveDialog({ open: true, flag })
    void loadFlagAssets(flag)
  }

  const handleResolve = async () => {
    if (!resolveDialog.flag) return
    setResolveLoading(true)
    try {
      await trustSafetyApi.resolveFlag(resolveDialog.flag.id, resolveStatus, reviewNote || undefined)
      setResolveDialog({ open: false, flag: null })
      setReviewNote('')
      setFlagAssets({ loading: false, previewUrl: '', selfieUrl: '', documentUrl: '' })
      toast({
        title: t('trustSafety.resolve'),
        description: `${resolveDialog.flag.type} marked as ${resolveStatus.toLowerCase().replace(/_/g, ' ')}`,
        variant: resolveStatus === 'dismissed' ? 'warning' : 'success',
      })
      await fetchFlags()
    } catch (err) {
      console.error(err)
      toast({
        title: t('common.error'),
        description: 'Failed to resolve trust and safety flag',
        variant: 'error',
      })
    } finally {
      setResolveLoading(false)
    }
  }

  const handleUserSafetyAction = async (action: 'shadow-ban' | 'remove-shadow-ban') => {
    const targetUserId = firstString(resolveDialog.flag?.userId, resolveDialog.flag?.entityId)
    if (!targetUserId) {
      return
    }

    setUserActionLoading(action)
    try {
      if (action === 'shadow-ban') {
        await trustSafetyApi.shadowBan(targetUserId)
      } else {
        await trustSafetyApi.removeShadowBan(targetUserId)
      }

      toast({
        title: action === 'shadow-ban' ? 'User shadow banned' : 'Shadow ban removed',
        variant: action === 'shadow-ban' ? 'warning' : 'success',
      })
    } catch (error: any) {
      toast({
        title: 'Trust & Safety action failed',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'error',
      })
    } finally {
      setUserActionLoading('')
    }
  }

  const handleDetect = async () => {
    if (!detectUserId.trim()) return
    setDetectLoading(true)
    setDetectResult(null)
    try {
      const { data } = await trustSafetyApi.detectSuspicious(detectUserId.trim())
      setDetectResult(normalizeDetectionResult(data))
    } catch (err: any) {
      setDetectResult({ error: err.response?.data?.message || 'Detection failed' })
    } finally {
      setDetectLoading(false)
    }
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-6">
      {/* Suspicious Behavior Detection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t('trustSafety.suspiciousDetection')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('trustSafety.enterUserId')}
                value={detectUserId}
                onChange={(e) => setDetectUserId(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={handleDetect} disabled={detectLoading || !detectUserId.trim()}>
              {detectLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
              {t('trustSafety.analyze')}
            </Button>
          </div>

          {detectResult && (
            <div className="mt-4 rounded-lg border p-4">
              {detectResult.error ? (
                <p className="text-sm text-red-600">{detectResult.error}</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t('trustSafety.suspicious')}:</span>
                    <Badge variant={detectResult.isSuspicious ? 'destructive' : 'success'}>
                      {detectResult.isSuspicious ? t('trustSafety.yes') : t('trustSafety.no')}
                    </Badge>
                  </div>
                  {detectResult.reasons?.length > 0 && (
                    <div>
                      <span className="text-sm font-medium">{t('trustSafety.reasons')}:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {detectResult.reasons.map((r: string, i: number) => (
                          <Badge key={i} variant="warning">{r}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {detectResult.trustScore != null && (
                    <p className="text-sm">{t('trustSafety.trustScore')}: <strong>{detectResult.trustScore}</strong></p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Content Flags Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('trustSafety.contentFlags')} ({total})</CardTitle>
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
                    <th className="pb-3 pe-4 font-medium">{t('trustSafety.type')}</th>
                    <th className="pb-3 pe-4 font-medium">{t('trustSafety.source')}</th>
                    <th className="pb-3 pe-4 font-medium">{t('trustSafety.entity')}</th>
                    <th className="pb-3 pe-4 font-medium">{t('users.status')}</th>
                    <th className="pb-3 pe-4 font-medium">{t('trustSafety.content')}</th>
                    <th className="pb-3 pe-4 font-medium">{t('trustSafety.confidence')}</th>
                    <th className="pb-3 pe-4 font-medium">{t('trustSafety.date')}</th>
                    <th className="pb-3 font-medium text-end">{t('trustSafety.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {flags.map((flag) => (
                    <tr key={flag.id} className="hover:bg-muted/50">
                      <td className="py-3 pr-4">{flagTypeBadge(flag.type)}</td>
                      <td className="py-3 pr-4">{sourceBadge(flag.source)}</td>
                      <td className="py-3 pr-4">
                        <span className="text-xs text-muted-foreground">{flag.entityType}</span>
                      </td>
                      <td className="py-3 pr-4">{statusBadge(flag.status)}</td>
                      <td className="py-3 pr-4 max-w-[200px] truncate">
                        {flag.content || '-'}
                      </td>
                      <td className="py-3 pr-4">
                        {flag.confidenceScore != null ? (
                          <span className={flag.confidenceScore > 0.8 ? 'text-red-600 font-bold' : flag.confidenceScore > 0.5 ? 'text-amber-600' : ''}>
                            {(flag.confidenceScore * 100).toFixed(0)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                        {formatDateTime(flag.createdAt)}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => openResolveDialog(flag)}
                        >
                          <CheckCircle className="h-3.5 w-3.5" /> {t('trustSafety.resolve')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {flags.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">{t('trustSafety.noFlags')}</p>
              )}
            </div>
          )}

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
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialog.open} onOpenChange={(open) => {
        setResolveDialog({ ...resolveDialog, open })
        if (!open) {
          setFlagAssets({ loading: false, previewUrl: '', selfieUrl: '', documentUrl: '' })
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trustSafety.resolveFlag')}</DialogTitle>
            <DialogDescription>
              Flag type: <strong>{resolveDialog.flag?.type}</strong> on {resolveDialog.flag?.entityType}
            </DialogDescription>
          </DialogHeader>
          {(resolveDialog.flag?.userName || resolveDialog.flag?.userEmail) && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{resolveDialog.flag?.userName || 'Unknown user'}</p>
              {resolveDialog.flag?.userEmail ? (
                <p className="text-muted-foreground">{resolveDialog.flag.userEmail}</p>
              ) : null}
            </div>
          )}
          {resolveDialog.flag?.content && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground mb-1">Flagged content:</p>
              {resolveDialog.flag.content}
            </div>
          )}
          {flagAssets.loading ? (
            <div className="flex items-center justify-center rounded-lg border p-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            (flagAssets.previewUrl || flagAssets.selfieUrl || flagAssets.documentUrl) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: 'Flagged Asset', url: flagAssets.previewUrl },
                  { label: 'Selfie', url: flagAssets.selfieUrl },
                  { label: prefersDocumentAsset(resolveDialog.flag || { type: '', entityType: '', content: '' }) ? 'Document' : 'Related Document', url: flagAssets.documentUrl },
                ]
                  .filter((asset) => asset.url)
                  .map((asset) => (
                    <button
                      key={`${asset.label}-${asset.url}`}
                      type="button"
                      className="overflow-hidden rounded-lg border text-left hover:bg-muted/40"
                      onClick={() => setPreviewImg(asset.url)}
                    >
                      <img src={asset.url} alt={asset.label} className="h-40 w-full object-cover" />
                      <div className="flex items-center justify-between p-3 text-sm">
                        <span className="font-medium">{asset.label}</span>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
              </div>
            )
          )}
          {resolveDialog.flag?.userId && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => window.open(`/users/${resolveDialog.flag?.userId}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
                Open user profile
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={userActionLoading.length > 0}
                onClick={() => { void handleUserSafetyAction('shadow-ban') }}
              >
                {userActionLoading === 'shadow-ban' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Shadow Ban
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={userActionLoading.length > 0}
                onClick={() => { void handleUserSafetyAction('remove-shadow-ban') }}
              >
                {userActionLoading === 'remove-shadow-ban' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Remove Shadow Ban
              </Button>
            </div>
          )}
          <Select value={resolveStatus} onValueChange={(value) => setResolveStatus(value as ResolveStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="action_taken">{t('trustSafety.actionTaken')}</SelectItem>
              <SelectItem value="reviewed">{t('trustSafety.reviewedNoAction')}</SelectItem>
              <SelectItem value="dismissed">{t('trustSafety.dismissed')}</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            placeholder={t('trustSafety.reviewNote')}
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog({ open: false, flag: null })}>{t('common.cancel')}</Button>
            <Button onClick={handleResolve} disabled={resolveLoading}>
              {resolveLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('common.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImg} onOpenChange={() => setPreviewImg(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Flag asset preview</DialogTitle>
          </DialogHeader>
          {previewImg ? (
            <img src={previewImg} alt="Flag asset preview" className="max-h-[80vh] w-full rounded-lg object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
