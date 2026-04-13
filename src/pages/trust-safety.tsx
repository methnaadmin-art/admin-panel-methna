import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adminApi, trustSafetyApi } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
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
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Shield,
  AlertTriangle,
  CheckCircle,
  Search,
  Eye,
  ExternalLink,
  ImageIcon,
  FileBadge2,
  MessageSquareWarning,
  Ban,
  ShieldCheck,
} from 'lucide-react'

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
type EvidenceAsset = {
  label: string
  url: string
  icon: typeof ImageIcon
}

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

const getConfidencePercent = (flag?: Pick<DisplayFlag, 'confidenceScore'> | null) =>
  typeof flag?.confidenceScore === 'number'
    ? Math.max(0, Math.min(100, Math.round(flag.confidenceScore * 100)))
    : null

const getRiskMeta = (flag?: Pick<DisplayFlag, 'confidenceScore'> | null) => {
  const confidencePercent = getConfidencePercent(flag)

  if (confidencePercent === null) {
    return {
      label: 'Unscored',
      tone: 'text-muted-foreground',
      badgeVariant: 'secondary' as const,
    }
  }

  if (confidencePercent >= 85) {
    return {
      label: 'High Risk',
      tone: 'text-red-600',
      badgeVariant: 'destructive' as const,
    }
  }

  if (confidencePercent >= 60) {
    return {
      label: 'Needs Review',
      tone: 'text-amber-600',
      badgeVariant: 'warning' as const,
    }
  }

  return {
    label: 'Low Risk',
    tone: 'text-emerald-600',
    badgeVariant: 'success' as const,
  }
}

const getUserInitials = (flag?: Pick<DisplayFlag, 'userName' | 'userEmail'> | null) => {
  const base = firstString(flag?.userName, flag?.userEmail, 'User')
  const parts = base.split(/\s+/).filter(Boolean)

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

const getEvidenceAssets = (flag: DisplayFlag | null, assets: { previewUrl: string; selfieUrl: string; documentUrl: string }): EvidenceAsset[] => {
  if (!flag) {
    return []
  }

  const documentLabel = prefersDocumentAsset(flag) ? 'Verification Document' : 'Related Document'

  return [
    { label: 'Flagged Asset', url: assets.previewUrl, icon: ImageIcon },
    { label: 'Selfie Evidence', url: assets.selfieUrl, icon: ImageIcon },
    { label: documentLabel, url: assets.documentUrl, icon: FileBadge2 },
  ].filter((asset) => asset.url)
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

  const evidenceAssets = getEvidenceAssets(resolveDialog.flag, flagAssets)
  const confidencePercent = getConfidencePercent(resolveDialog.flag)
  const riskMeta = getRiskMeta(resolveDialog.flag)

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
        <DialogContent className="max-w-5xl overflow-hidden p-0 sm:rounded-2xl [&>button]:right-5 [&>button]:top-5 [&>button]:rounded-full [&>button]:border [&>button]:border-white/15 [&>button]:bg-white/10 [&>button]:text-white [&>button]:opacity-100 hover:[&>button]:bg-white/20">
          <DialogHeader className="bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.35),_transparent_35%),linear-gradient(135deg,#0f172a_0%,#111827_45%,#1f2937_100%)] px-6 py-6 text-white sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-transparent bg-white/10 text-white">Moderation Review</Badge>
                  {resolveDialog.flag ? flagTypeBadge(resolveDialog.flag.type) : null}
                  {resolveDialog.flag ? sourceBadge(resolveDialog.flag.source) : null}
                  {resolveDialog.flag ? statusBadge(resolveDialog.flag.status) : null}
                </div>
                <div className="space-y-2">
                  <DialogTitle className="text-2xl font-semibold tracking-tight text-white">
                    {t('trustSafety.resolveFlag')}
                  </DialogTitle>
                  <DialogDescription className="max-w-2xl text-sm text-slate-200">
                    Review the evidence, confirm the user impact, and take the right moderation action without leaving this case.
                  </DialogDescription>
                </div>
              </div>

              <div className="min-w-[220px] rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">Risk Signal</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-3xl font-semibold text-white">
                      {confidencePercent !== null ? `${confidencePercent}%` : '--'}
                    </p>
                    <p className="text-sm text-slate-300">{riskMeta.label}</p>
                  </div>
                  <Badge variant={riskMeta.badgeVariant}>{riskMeta.label}</Badge>
                </div>
                <Progress value={confidencePercent ?? 0} className="mt-4 bg-white/15" />
              </div>
            </div>
          </DialogHeader>

          <div className="max-h-[82vh] overflow-y-auto bg-background">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_360px]">
              <div className="space-y-6 p-6 sm:p-8">
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-14 w-14 ring-4 ring-slate-100">
                        {resolveDialog.flag?.selfieUrl ? (
                          <AvatarImage src={resolveDialog.flag.selfieUrl} alt={resolveDialog.flag.userName || 'Flagged user'} />
                        ) : null}
                        <AvatarFallback className="bg-slate-900 text-sm font-semibold text-white">
                          {getUserInitials(resolveDialog.flag)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-1">
                        <p className="text-base font-semibold">
                          {resolveDialog.flag?.userName || 'Unknown user'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {resolveDialog.flag?.userEmail || 'No email available'}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {resolveDialog.flag ? flagTypeBadge(resolveDialog.flag.type) : null}
                          {resolveDialog.flag ? sourceBadge(resolveDialog.flag.source) : null}
                          {resolveDialog.flag ? statusBadge(resolveDialog.flag.status) : null}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 text-sm sm:min-w-[220px]">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entity</p>
                        <p className="mt-1 font-medium">{resolveDialog.flag?.entityType || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Flagged At</p>
                        <p className="mt-1 font-medium">
                          {resolveDialog.flag?.createdAt ? formatDateTime(resolveDialog.flag.createdAt) : 'Unknown'}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <MessageSquareWarning className="h-4 w-4 text-amber-500" />
                    Case Summary
                  </div>
                  <Separator className="my-4" />
                  {resolveDialog.flag?.content ? (
                    <div className="rounded-2xl bg-muted/60 p-4 text-sm leading-6 text-foreground">
                      {resolveDialog.flag.content}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                      No flagged text content was attached to this case.
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Evidence Gallery</p>
                      <p className="text-sm text-muted-foreground">Open any asset to inspect the evidence full screen.</p>
                    </div>
                    {evidenceAssets.length > 0 ? (
                      <Badge variant="outline">{evidenceAssets.length} evidence item{evidenceAssets.length > 1 ? 's' : ''}</Badge>
                    ) : null}
                  </div>
                  <Separator className="my-4" />

                  {flagAssets.loading ? (
                    <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed bg-muted/30">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : evidenceAssets.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {evidenceAssets.map((asset) => {
                        const AssetIcon = asset.icon

                        return (
                          <button
                            key={`${asset.label}-${asset.url}`}
                            type="button"
                            className="group overflow-hidden rounded-2xl border bg-background text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                            onClick={() => setPreviewImg(asset.url)}
                          >
                            <div className="relative h-48 overflow-hidden bg-slate-100">
                              <img
                                src={asset.url}
                                alt={asset.label}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/70 via-slate-950/15 to-transparent p-3 text-white">
                                <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm">
                                  <AssetIcon className="h-3.5 w-3.5" />
                                  {asset.label}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between p-4">
                              <div>
                                <p className="text-sm font-semibold">{asset.label}</p>
                                <p className="text-xs text-muted-foreground">Click to inspect in detail</p>
                              </div>
                              <Eye className="h-4 w-4 text-muted-foreground transition-transform group-hover:scale-110" />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 text-center">
                      <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
                      <p className="mt-4 text-sm font-medium">No evidence assets available</p>
                      <p className="mt-1 max-w-md text-sm text-muted-foreground">
                        This case does not currently include preview media, selfie evidence, or a related verification document.
                      </p>
                    </div>
                  )}
                </section>
              </div>

              <aside className="relative border-t bg-slate-50/60 p-6 sm:p-8 lg:border-l lg:border-t-0">
                <div className="space-y-6 lg:sticky lg:top-0">
                  <section className="rounded-2xl border bg-background p-5 shadow-sm">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Moderator Action</p>
                      <p className="text-sm text-muted-foreground">
                        Choose the final outcome and leave a note for future audit history.
                      </p>
                    </div>
                    <Separator className="my-4" />
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Resolution
                        </label>
                        <Select value={resolveStatus} onValueChange={(value) => setResolveStatus(value as ResolveStatus)}>
                          <SelectTrigger className="h-11 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="action_taken">{t('trustSafety.actionTaken')}</SelectItem>
                            <SelectItem value="reviewed">{t('trustSafety.reviewedNoAction')}</SelectItem>
                            <SelectItem value="dismissed">{t('trustSafety.dismissed')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Review Note
                        </label>
                        <Textarea
                          className="min-h-[140px] rounded-xl"
                          placeholder={t('trustSafety.reviewNote')}
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                        />
                      </div>
                    </div>
                  </section>

                  {resolveDialog.flag?.userId && (
                    <section className="rounded-2xl border bg-background p-5 shadow-sm">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">User Safety Controls</p>
                        <p className="text-sm text-muted-foreground">Take immediate action on the flagged account when needed.</p>
                      </div>
                      <Separator className="my-4" />
                      <div className="grid gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="justify-start gap-2 rounded-xl"
                          onClick={() => window.open(`/users/${resolveDialog.flag?.userId}`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open user profile
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="justify-start gap-2 rounded-xl border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                          disabled={userActionLoading.length > 0}
                          onClick={() => { void handleUserSafetyAction('shadow-ban') }}
                        >
                          {userActionLoading === 'shadow-ban' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                          Shadow Ban User
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="justify-start gap-2 rounded-xl border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                          disabled={userActionLoading.length > 0}
                          onClick={() => { void handleUserSafetyAction('remove-shadow-ban') }}
                        >
                          {userActionLoading === 'remove-shadow-ban' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          Remove Shadow Ban
                        </Button>
                      </div>
                    </section>
                  )}

                  <div className="sticky bottom-0 -mx-6 -mb-6 border-t bg-slate-50/95 px-6 py-4 backdrop-blur sm:-mx-8 sm:-mb-8 sm:px-8">
                    <DialogFooter className="gap-2 sm:justify-stretch sm:space-x-0">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setResolveDialog({ open: false, flag: null })}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button className="rounded-xl" onClick={handleResolve} disabled={resolveLoading}>
                        {resolveLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                        {t('common.submit')}
                      </Button>
                    </DialogFooter>
                  </div>
                </div>
              </aside>
            </div>
          </div>
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
