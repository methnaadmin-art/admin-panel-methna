import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminApi, trustSafetyApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
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
import type { UserDetail, SubscriptionHistoryEntry } from '@/types'
import { UserStatus } from '@/types'
import { formatDate, formatDateTime } from '@/lib/utils'
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Shield,
  ShieldOff,
  Ban,
  UserCheck,
  Crown,
  Loader2,
  AlertTriangle,
  Heart,
  Sparkles,
  MessageCircleHeart,
  MessageSquare,
  HeartOff,
  Rocket,
  ShieldBan,
  BarChart3,
  Edit,
  Save,
  Camera,
  FileCheck,
  FileText,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Settings,
  Globe,
  Calendar,
  Fingerprint,
  Activity,
  Send,
  X,
} from 'lucide-react'

const SUBSCRIPTION_DAY_MS = 24 * 60 * 60 * 1000

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

const formatPlanLabel = (planCode?: string) => {
  switch ((planCode || '').toLowerCase()) {
    case 'gold':
      return 'Gold'
    case 'premium':
      return 'Premium'
    default:
      return 'Free'
  }
}

const getPlanBadgeClass = (planCode?: string) => {
  switch ((planCode || '').toLowerCase()) {
    case 'gold':
      return 'bg-amber-500 text-white'
    case 'premium':
      return 'bg-purple-500 text-white'
    default:
      return ''
  }
}

const deriveBillingCycle = (entry: Record<string, any>) => {
  const explicitCycle = pickString(entry.billingCycle, entry.interval, entry.period)
  if (explicitCycle) {
    return explicitCycle
  }

  const startDate = parseSafeDate(pickString(entry.startDate))
  const endDate = parseSafeDate(pickString(entry.endDate))

  if (startDate && endDate) {
    const durationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / SUBSCRIPTION_DAY_MS))
    if (durationDays >= 330) {
      return 'yearly'
    }
    if (durationDays >= 27 && durationDays <= 45) {
      return 'monthly'
    }
    return `${durationDays} days`
  }

  return 'manual'
}

const normalizeSubscriptionHistoryEntry = (entry: any): SubscriptionHistoryEntry | null => {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const planCode = normalizePlanCode(
    entry.planCode,
    entry.plan,
    entry.planEntity?.code,
    entry.planEntity?.name,
  )

  const startDate = pickString(entry.startDate, entry.createdAt)
  const endDate = pickString(entry.endDate, entry.expiryDate, entry.updatedAt)
  const userId = pickString(entry.userId, entry.user?.id)
  const createdAt = pickString(entry.createdAt, startDate, endDate) || new Date().toISOString()

  return {
    id: pickString(entry.id, entry.subscriptionId, entry.stripeSubscriptionId, `${userId || 'user'}-${createdAt}-${planCode}`),
    userId,
    planId: pickString(entry.planId, entry.planEntity?.id),
    planCode,
    planName: pickString(entry.planName, entry.planEntity?.name) || formatPlanLabel(planCode),
    billingCycle: deriveBillingCycle(entry),
    status: pickString(entry.status) || 'active',
    startDate,
    endDate,
    stripeSubscriptionId: pickString(entry.stripeSubscriptionId),
    stripePriceId: pickString(entry.stripePriceId, entry.paymentReference),
    createdAt,
  }
}

export default function UserDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [activity, setActivity] = useState<any>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [editLoading, setEditLoading] = useState(false)

  // Suspicious detection
  const [suspicious, setSuspicious] = useState<any>(null)
  const [detectLoading, setDetectLoading] = useState(false)

  // Notification dialog
  const [notifDialog, setNotifDialog] = useState(false)
  const [notifForm, setNotifForm] = useState({ title: '', body: '', type: 'system' })
  const [notifLoading, setNotifLoading] = useState(false)

  // Moderation dialog
  const [modDialog, setModDialog] = useState<{ open: boolean; status: string }>({ open: false, status: '' })
  const [modForm, setModForm] = useState({
    reason: '',
    moderationReasonCode: '' as string,
    moderationReasonText: '',
    actionRequired: '' as string,
    supportMessage: '',
    isUserVisible: true,
    expiresAt: '',
    internalAdminNote: '',
  })
  const [modLoading, setModLoading] = useState(false)

  // Subscription history
  const [subHistory, setSubHistory] = useState<SubscriptionHistoryEntry[]>([])
  const [subHistoryLoading, setSubHistoryLoading] = useState(false)

  // Photo moderation reason
  const [photoModDialog, setPhotoModDialog] = useState<{ open: boolean; photoId: string; approved: boolean; isSelfie: boolean }>({ open: false, photoId: '', approved: false, isSelfie: false })
  const [photoModReason, setPhotoModReason] = useState('')

  const REASON_CODES = [
    'IDENTITY_VERIFICATION_FAILED',
    'SELFIE_VERIFICATION_FAILED',
    'MARRIAGE_DOCUMENT_REQUIRED',
    'INAPPROPRIATE_LANGUAGE',
    'HARASSMENT_REPORT',
    'MULTIPLE_USER_REPORTS',
    'FAKE_PROFILE_SUSPECTED',
    'SPAM_BEHAVIOR',
    'POLICY_VIOLATION',
    'UNDER_REVIEW',
    'OTHER',
  ]

  const ACTION_OPTIONS = [
    'REUPLOAD_IDENTITY_DOCUMENT',
    'RETAKE_SELFIE',
    'UPLOAD_MARRIAGE_DOCUMENT',
    'CONTACT_SUPPORT',
    'WAIT_FOR_REVIEW',
    'NO_ACTION',
    'VERIFY_PHONE',
    'VERIFY_EMAIL',
  ]

  // Auto-suggest actionRequired when reasonCode changes
  const autoSuggestAction = (reasonCode: string): string => {
    const map: Record<string, string> = {
      IDENTITY_VERIFICATION_FAILED: 'REUPLOAD_IDENTITY_DOCUMENT',
      SELFIE_VERIFICATION_FAILED: 'RETAKE_SELFIE',
      MARRIAGE_DOCUMENT_REQUIRED: 'UPLOAD_MARRIAGE_DOCUMENT',
      INAPPROPRIATE_LANGUAGE: 'CONTACT_SUPPORT',
      HARASSMENT_REPORT: 'CONTACT_SUPPORT',
      MULTIPLE_USER_REPORTS: 'WAIT_FOR_REVIEW',
      FAKE_PROFILE_SUSPECTED: 'WAIT_FOR_REVIEW',
      SPAM_BEHAVIOR: 'CONTACT_SUPPORT',
      POLICY_VIOLATION: 'CONTACT_SUPPORT',
      UNDER_REVIEW: 'WAIT_FOR_REVIEW',
      OTHER: 'CONTACT_SUPPORT',
    }
    return map[reasonCode] || 'NO_ACTION'
  }

  // Auto-suggest support message when reasonCode changes
  const autoSuggestMessage = (reasonCode: string): string => {
    const map: Record<string, string> = {
      IDENTITY_VERIFICATION_FAILED: 'Your identity document was not approved. Please re-upload a clear, valid photo of your ID.',
      SELFIE_VERIFICATION_FAILED: 'Your selfie verification did not pass. Please retake your selfie in good lighting.',
      MARRIAGE_DOCUMENT_REQUIRED: 'To complete verification, please upload your marriage document.',
      INAPPROPRIATE_LANGUAGE: 'Your account has been flagged for inappropriate language. Please review our community guidelines.',
      HARASSMENT_REPORT: 'Your account has been reported for harassment. Please contact support if you believe this is an error.',
      MULTIPLE_USER_REPORTS: 'Your account has received multiple reports and is under review. Please wait while we investigate.',
      FAKE_PROFILE_SUSPECTED: 'Your profile has been flagged as potentially inauthentic. Please verify your identity to restore full access.',
      SPAM_BEHAVIOR: 'Spam-like behavior has been detected on your account. Please contact support to resolve this.',
      POLICY_VIOLATION: 'Your account has been restricted due to a policy violation. Please contact support for details.',
      UNDER_REVIEW: 'Your account is currently under review. We will notify you once the review is complete.',
      OTHER: 'Your account has been restricted. Please contact support for more information.',
    }
    return map[reasonCode] || ''
  }

  // Normalize response: handle both { user, profile, photos, subscription } and flat user object
  const normalizeDetail = (data: any): UserDetail | null => {
    if (!data) return null
    // Standard shape: { user, profile, photos, subscription, premium }
    if (data.user && typeof data.user === 'object' && data.user.id) {
      return data as UserDetail
    }
    // Flat shape: the data IS the user object directly
    if (data.id && data.email) {
      return { user: data, profile: data.profile || null, photos: data.photos || [], subscription: data.subscription || null, premium: data.premium || null }
    }
    // Nested: { data: { user, ... } } (double-wrapped)
    if (data.data && typeof data.data === 'object') {
      return normalizeDetail(data.data)
    }
    return null
  }

  const reload = async () => {
    if (!id) return
    try {
      const res = await adminApi.getUserDetail(id)
      const d = normalizeDetail(res.data)
      if (d) setDetail(d)
    } catch (err: any) {
      console.error('reload error', err)
    }
  }

  useEffect(() => {
    if (!id) return
    setLoading(true)
    adminApi.getUserDetail(id)
      .then((res) => {
        console.log('[UserDetail] API response:', res.data)
        const d = normalizeDetail(res.data)
        if (!d) {
          console.error('[UserDetail] Could not normalize response:', res.data)
          toast({ title: 'Error', description: 'Unexpected API response format', variant: 'error' })
          return
        }
        setDetail(d)
        const u = d.user
        setEditForm({
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          phone: u.phone || '',
          role: u.role,
          status: u.status,
          trustScore: u.trustScore,
          notificationsEnabled: u.notificationsEnabled,
          bio: d.profile?.bio || '',
          city: d.profile?.city || '',
          country: d.profile?.country || '',
          dateOfBirth: d.profile?.dateOfBirth || '',
        })
      })
      .catch((err) => {
        console.error('[UserDetail] API error:', err)
        const msg = err.response?.data?.message || err.message || 'Failed to load user details'
        toast({ title: 'Error loading user', description: msg, variant: 'error' })
      })
      .finally(() => setLoading(false))

    setActivityLoading(true)
    adminApi.getUserActivity(id)
      .then((res) => setActivity(res.data))
      .catch((err) => console.error('[UserDetail] Activity error:', err))
      .finally(() => setActivityLoading(false))

    setSubHistoryLoading(true)
    adminApi.getUserSubscriptionHistory(id)
      .then((res) => {
        const data = res.data
        const rawHistory = Array.isArray(data) ? data : data?.subscriptions || data?.data || []
        setSubHistory(
          rawHistory
            .map((entry: any) => normalizeSubscriptionHistoryEntry(entry))
            .filter((entry: SubscriptionHistoryEntry | null): entry is SubscriptionHistoryEntry => Boolean(entry))
        )
      })
      .catch((err) => console.error('[UserDetail] Sub history error:', err))
      .finally(() => setSubHistoryLoading(false))
  }, [id])

  const handleStatusChange = async (status: string) => {
    if (!id) return
    setModDialog({ open: true, status })
  }

  const confirmStatusChange = async () => {
    if (!id || !modDialog.status) return
    setModLoading(true)
    try {
      await adminApi.updateUserStatus(id, modDialog.status, {
        reason: modForm.reason || undefined,
        moderationReasonCode: modForm.moderationReasonCode || undefined,
        moderationReasonText: modForm.moderationReasonText || undefined,
        actionRequired: modForm.actionRequired || undefined,
        supportMessage: modForm.supportMessage || undefined,
        isUserVisible: modForm.isUserVisible,
        expiresAt: modForm.expiresAt || undefined,
        internalAdminNote: modForm.internalAdminNote || undefined,
      } as any)
      await reload()
      toast({ title: 'Status Updated', description: `User status changed to ${modDialog.status}`, variant: 'success' })
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'error' })
    } finally {
      setModLoading(false)
      setModDialog({ open: false, status: '' })
      setModForm({ reason: '', moderationReasonCode: '', moderationReasonText: '', actionRequired: '', supportMessage: '', isUserVisible: true, expiresAt: '', internalAdminNote: '' })
    }
  }

  const handleShadowBan = async () => {
    if (!id) return
    setActionLoading('shadowban')
    try {
      if (detail?.user.isShadowBanned) {
        await trustSafetyApi.removeShadowBan(id)
        toast({ title: 'Shadow Ban Removed', variant: 'success' })
      } else {
        await trustSafetyApi.shadowBan(id)
        toast({ title: 'User Shadow Banned', variant: 'warning' })
      }
      await reload()
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to toggle shadow ban', variant: 'error' })
    } finally {
      setActionLoading('')
    }
  }

  const handleSaveEdit = async () => {
    if (!id) return
    setEditLoading(true)
    try {
      await adminApi.updateUser(id, editForm)
      await reload()
      setEditing(false)
      toast({ title: 'User Updated', description: 'Changes saved successfully', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Error', description: err.response?.data?.message || 'Failed to save', variant: 'error' })
    } finally {
      setEditLoading(false)
    }
  }

  const handleDetectSuspicious = async () => {
    if (!id) return
    setDetectLoading(true)
    try {
      const res = await trustSafetyApi.detectSuspicious(id)
      setSuspicious(res.data)
    } catch {
      toast({ title: 'Error', description: 'Failed to run detection', variant: 'error' })
    } finally {
      setDetectLoading(false)
    }
  }

  const handleSendNotification = async () => {
    if (!id) return
    setNotifLoading(true)
    try {
      await adminApi.sendNotification({ userId: id, ...notifForm })
      toast({ title: 'Notification Sent', variant: 'success' })
      setNotifDialog(false)
      setNotifForm({ title: '', body: '', type: 'system' })
    } catch {
      toast({ title: 'Error', description: 'Failed to send notification', variant: 'error' })
    } finally {
      setNotifLoading(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!id) return
    if (!window.confirm('Are you sure you want to delete this user? This action is soft-delete.')) return
    setActionLoading('delete')
    try {
      await adminApi.deleteUser(id)
      toast({ title: 'User Deleted', variant: 'warning' })
      navigate('/users')
    } catch {
      toast({ title: 'Error', description: 'Failed to delete user', variant: 'error' })
    } finally {
      setActionLoading('')
    }
  }

  const handlePhotoModeration = async (photoId: string, approved: boolean, isSelfieVerification: boolean) => {
    if (!id) return

    try {
      await adminApi.moderatePhoto(photoId, approved ? 'approved' : 'rejected', photoModReason || undefined)

      if (isSelfieVerification) {
        await adminApi.verifySelfie(id, approved)
      }

      await reload()
      toast({
        title: approved ? 'Photo Approved' : 'Photo Rejected',
        description: isSelfieVerification
          ? approved
            ? 'Selfie verification status was updated.'
            : 'Selfie verification status was reset.'
          : 'Photo moderation status was updated.',
        variant: approved ? 'success' : 'warning',
      })
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to moderate photo', variant: 'error' })
    } finally {
      setPhotoModDialog({ open: false, photoId: '', approved: false, isSelfie: false })
      setPhotoModReason('')
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!detail) {
    return <div className="text-center text-muted-foreground">{t('userDetail.notFound')}</div>
  }

  const { user, profile, photos, subscription, premium } = detail
  const sortedSubscriptionHistory = [...subHistory].sort(
    (left, right) => new Date(right.createdAt || right.startDate).getTime() - new Date(left.createdAt || left.startDate).getTime()
  )
  const currentSubscriptionView = (() => {
    if (subscription) {
      const planCode = normalizePlanCode(subscription.plan)
      return {
        planCode,
        planLabel: formatPlanLabel(planCode),
        status: pickString(subscription.status) || 'active',
        startDate: pickString(subscription.startDate),
        endDate: pickString(subscription.endDate),
        billingCycle: 'current plan',
      }
    }

    if (premium?.isPremium || premium?.startDate || premium?.expiryDate) {
      return {
        planCode: 'premium',
        planLabel: 'Premium',
        status: premium?.isExpired ? 'expired' : premium?.isPremium ? 'active' : 'free',
        startDate: pickString(premium?.startDate),
        endDate: pickString(premium?.expiryDate),
        billingCycle: 'manual',
      }
    }

    const activeHistory = sortedSubscriptionHistory.find((entry) => entry.status.toLowerCase() === 'active')
    const fallbackHistory = activeHistory || sortedSubscriptionHistory[0]

    if (!fallbackHistory) {
      return null
    }

    return {
      planCode: normalizePlanCode(fallbackHistory.planCode),
      planLabel: fallbackHistory.planName || formatPlanLabel(fallbackHistory.planCode),
      status: fallbackHistory.status,
      startDate: fallbackHistory.startDate,
      endDate: fallbackHistory.endDate,
      billingCycle: fallbackHistory.billingCycle,
    }
  })()
  const subscriptionRemainingDays = (() => {
    const targetDate = premium?.expiryDate || currentSubscriptionView?.endDate
    const parsedDate = parseSafeDate(targetDate)

    if (!parsedDate) {
      return null
    }

    return Math.ceil((parsedDate.getTime() - Date.now()) / SUBSCRIPTION_DAY_MS)
  })()
  const lastSubscriptionEvent = sortedSubscriptionHistory[0] || null

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button variant="ghost" onClick={() => navigate('/users')} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> {t('userDetail.backToUsers')}
      </Button>

      {/* User Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Avatar className="h-16 w-16">
              {photos?.[0]?.url ? <AvatarImage src={photos[0].url} /> : null}
              <AvatarFallback className="text-lg bg-primary/10 text-primary">
                {user.firstName?.[0]}{user.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">{user.firstName} {user.lastName}</h2>
                <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role?.toUpperCase()}</Badge>
                <Badge variant={user.status === UserStatus.ACTIVE ? 'success' : (user.status === UserStatus.BANNED || user.status === UserStatus.CLOSED) ? 'destructive' : 'warning'}>{user.status}</Badge>
                {user.selfieVerified && <Badge variant="info">Selfie Verified</Badge>}
                {user.isShadowBanned && <Badge variant="destructive">Shadow Banned</Badge>}
                {user.emailVerified && <Badge variant="outline" className="text-emerald-600 border-emerald-200">Email Verified</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>ID: <code className="text-[10px] bg-muted px-1 rounded">{user.id}</code></span>
                <span>Joined {formatDate(user.createdAt)}</span>
                {user.lastLoginAt && <span>Last login {formatDateTime(user.lastLoginAt)}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setNotifDialog(true)} className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> {t('userDetail.notify')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(true); setActiveTab('edit') }} className="gap-1.5">
                <Edit className="h-3.5 w-3.5" /> {t('common.edit')}
              </Button>
              <Button size="sm" variant="destructive" onClick={handleDeleteUser} disabled={actionLoading === 'delete'} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}
              </Button>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
            {user.status !== UserStatus.ACTIVE && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange(UserStatus.ACTIVE)} disabled={!!actionLoading} className="gap-1.5">
                <UserCheck className="h-3.5 w-3.5" /> {actionLoading === UserStatus.ACTIVE ? '...' : t('userDetail.activate')}
              </Button>
            )}
            {user.status !== UserStatus.LIMITED && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange(UserStatus.LIMITED)} disabled={!!actionLoading} className="gap-1.5 text-yellow-600 border-yellow-200 hover:bg-yellow-50">
                <Settings className="h-3.5 w-3.5" /> Limit
              </Button>
            )}
            {user.status !== UserStatus.SUSPENDED && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange(UserStatus.SUSPENDED)} disabled={!!actionLoading} className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50">
                <AlertTriangle className="h-3.5 w-3.5" /> {actionLoading === UserStatus.SUSPENDED ? '...' : t('userDetail.suspend')}
              </Button>
            )}
            {user.status !== UserStatus.SHADOW_SUSPENDED && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange(UserStatus.SHADOW_SUSPENDED)} disabled={!!actionLoading} className="gap-1.5 text-purple-600 border-purple-200 hover:bg-purple-50">
                <EyeOff className="h-3.5 w-3.5" /> Shadow Suspend
              </Button>
            )}
            {user.status !== UserStatus.BANNED && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange(UserStatus.BANNED)} disabled={!!actionLoading} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                <Ban className="h-3.5 w-3.5" /> {actionLoading === UserStatus.BANNED ? '...' : t('userDetail.ban')}
              </Button>
            )}
            {user.status !== UserStatus.CLOSED && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange(UserStatus.CLOSED)} disabled={!!actionLoading} className="gap-1.5 text-gray-600 border-gray-200 hover:bg-gray-50">
                <X className="h-3.5 w-3.5" /> {actionLoading === UserStatus.CLOSED ? '...' : 'Close Account'}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleShadowBan} disabled={!!actionLoading} className="gap-1.5">
              {user.isShadowBanned ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
              {actionLoading === 'shadowban' ? '...' : user.isShadowBanned ? t('userDetail.unShadowBan') : t('userDetail.shadowBan')}
            </Button>
            <Button size="sm" variant="outline" onClick={handleDetectSuspicious} disabled={detectLoading} className="gap-1.5">
              <Fingerprint className="h-3.5 w-3.5" /> {detectLoading ? t('userDetail.analyzing') : t('userDetail.detectSuspicious')}
            </Button>
          </div>

          {/* Suspicious results */}
          {suspicious && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-800 mb-1">{t('userDetail.suspiciousAnalysis')}</p>
              <pre className="text-xs text-amber-700 whitespace-pre-wrap">{JSON.stringify(suspicious, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">{t('userDetail.overview')}</TabsTrigger>
          <TabsTrigger value="edit">{t('userDetail.editUser')}</TabsTrigger>
          <TabsTrigger value="activity">{t('userDetail.activity')}</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="photos">{t('userDetail.photos')} ({photos?.length || 0})</TabsTrigger>
          <TabsTrigger value="verification">{t('userDetail.verification')}</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Profile Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('userDetail.profileInfo')}</CardTitle>
              </CardHeader>
              <CardContent>
                {profile ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 grid-cols-2">
                      <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Gender</span><p className="font-medium capitalize text-sm">{profile.gender}</p></div>
                      <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">DOB</span><p className="font-medium text-sm">{formatDate(profile.dateOfBirth)}</p></div>
                      <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Ethnicity</span><p className="font-medium text-sm">{profile.ethnicity}</p></div>
                      <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Nationality</span><p className="font-medium text-sm">{profile.nationality}</p></div>
                      <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Religious Level</span><p className="font-medium text-sm">{profile.religiousLevel}</p></div>
                      <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Marriage Intention</span><p className="font-medium text-sm">{profile.marriageIntention}</p></div>
                    </div>
                    {profile.bio && (
                      <div className="border-t pt-3">
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Bio</span>
                        <p className="mt-1 text-sm">{profile.bio}</p>
                      </div>
                    )}
                    {profile.interests?.length > 0 && (
                      <div className="border-t pt-3">
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Interests</span>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {profile.interests.map((i: string) => <Badge key={i} variant="secondary" className="text-xs">{i}</Badge>)}
                        </div>
                      </div>
                    )}
                    {profile.languages?.length > 0 && (
                      <div className="border-t pt-3">
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Languages</span>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {profile.languages.map((l: string) => <Badge key={l} variant="outline" className="text-xs">{l}</Badge>)}
                        </div>
                      </div>
                    )}
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground">Profile Completion</span>
                        <span className="text-xs font-bold">{profile.profileCompletionPercentage}%</span>
                      </div>
                      <Progress value={profile.profileCompletionPercentage} className="h-2" />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('userDetail.noProfile')}</p>
                )}
              </CardContent>
            </Card>

            {/* Account & Security */}
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('userDetail.accountDetails')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1">Trust Score</span>
                    <div className="flex items-center gap-2">
                      <Progress value={user.trustScore} className="w-20 h-2" />
                      <span className={`text-sm font-bold ${user.trustScore < 30 ? 'text-red-600' : user.trustScore < 60 ? 'text-amber-600' : 'text-emerald-600'}`}>{user.trustScore}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1">Email</span>
                    <Badge variant={user.emailVerified ? 'success' : 'warning'} className="text-[10px]">{user.emailVerified ? 'Verified' : 'Unverified'}</Badge>
                  </div>
                  {user.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm flex-1">Phone</span>
                      <span className="text-sm text-muted-foreground">{user.phone}</span>
                    </div>
                  )}
                  {profile?.city && (
                    <div className="flex items-center gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm flex-1">Location</span>
                      <span className="text-sm text-muted-foreground">{profile.city}, {profile.country}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1">Last IP</span>
                    <code className="text-xs bg-muted px-2 py-0.5 rounded">{user.lastKnownIp || '—'}</code>
                  </div>
                  <div className="flex items-center gap-3">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1">Devices</span>
                    <span className="text-sm font-medium">{user.deviceCount}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1">Flag Count</span>
                    <span className={`text-sm font-medium ${user.flagCount > 0 ? 'text-red-600' : ''}`}>{user.flagCount}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Subscription & Premium */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-500" /> {t('userDetail.subscription')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getPlanBadgeClass(currentSubscriptionView?.planCode || (premium?.isPremium ? 'premium' : 'free'))}>
                      {premium?.isPremium
                        ? currentSubscriptionView?.planLabel?.toUpperCase() || 'PREMIUM'
                        : currentSubscriptionView
                          ? currentSubscriptionView.planLabel.toUpperCase()
                          : 'FREE'}
                    </Badge>
                    <Badge variant={premium?.isExpired ? 'destructive' : currentSubscriptionView?.status === 'active' ? 'success' : 'secondary'}>
                      {premium?.isExpired ? 'Expired' : currentSubscriptionView?.status || 'free'}
                    </Badge>
                  </div>

                  {currentSubscriptionView ? (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {currentSubscriptionView.startDate && <p>Started: {formatDate(currentSubscriptionView.startDate)}</p>}
                      {currentSubscriptionView.endDate && <p>Expires: {formatDate(currentSubscriptionView.endDate)}</p>}
                      <p>Billing cadence: {currentSubscriptionView.billingCycle}</p>
                      {subscriptionRemainingDays !== null && (
                        <p className="font-medium text-foreground">
                          {subscriptionRemainingDays > 0
                            ? `${subscriptionRemainingDays} days remaining`
                            : subscriptionRemainingDays === 0
                              ? 'Expires today'
                              : `${Math.abs(subscriptionRemainingDays)} days overdue`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('userDetail.freePlan')}</p>
                  )}

                  {sortedSubscriptionHistory.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <p>History entries: <span className="font-medium text-foreground">{sortedSubscriptionHistory.length}</span></p>
                      {lastSubscriptionEvent?.createdAt && (
                        <p className="mt-1">Last subscription event: {formatDate(lastSubscriptionEvent.createdAt)}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* EDIT TAB */}
        <TabsContent value="edit">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('userDetail.editUser')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                <div>
                  <label className="text-xs font-medium">First Name</label>
                  <Input value={editForm.firstName || ''} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium">Last Name</label>
                  <Input value={editForm.lastName || ''} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium">Email</label>
                  <Input type="email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium">Phone</label>
                  <Input value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium">Role</label>
                  <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Status</label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="banned">Banned</SelectItem>
                      <SelectItem value="deactivated">Deactivated</SelectItem>
                      <SelectItem value="pending_verification">Pending Verification</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Trust Score (0-100)</label>
                  <Input type="number" min={0} max={100} value={editForm.trustScore || 0} onChange={(e) => setEditForm({ ...editForm, trustScore: parseInt(e.target.value) || 0 })} className="mt-1" />
                </div>
              </div>
              <div className="mt-4 border-t pt-4 max-w-2xl">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Profile Details</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium">Bio</label>
                    <textarea
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                      value={editForm.bio || ''}
                      onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                      placeholder="User bio..."
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">City</label>
                    <Input value={editForm.city || ''} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} placeholder="City" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Country</label>
                    <Input value={editForm.country || ''} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} placeholder="Country" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Date of Birth</label>
                    <Input type="date" value={editForm.dateOfBirth || ''} onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })} className="mt-1" />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex gap-2">
                <Button onClick={handleSaveEdit} disabled={editLoading} className="gap-2">
                  {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('common.save')}
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('overview')}>{t('common.cancel')}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACTIVITY TAB */}
        <TabsContent value="activity">
          {activityLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : activity ? (
            <div className="space-y-6">
              {/* Swipe Stats */}
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                <Card><CardContent className="p-4 text-center">
                  <Heart className="h-5 w-5 text-pink-500 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Likes</p>
                  <p className="text-lg font-bold">{activity.likes?.given ?? 0} / {activity.likes?.received ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">given / received</p>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <Sparkles className="h-5 w-5 text-purple-500 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Super Likes</p>
                  <p className="text-lg font-bold">{activity.superLikes?.given ?? 0} / {activity.superLikes?.received ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">given / received</p>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <MessageCircleHeart className="h-5 w-5 text-amber-500 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Compliments</p>
                  <p className="text-lg font-bold">{activity.compliments?.given ?? 0} / {activity.compliments?.received ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">given / received</p>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <HeartOff className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Passes</p>
                  <p className="text-2xl font-bold">{activity.passes ?? 0}</p>
                </CardContent></Card>
              </div>

              {/* Engagement Stats */}
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
                <Card className="bg-blue-50 border-blue-100"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{activity.matches ?? 0}</p>
                  <p className="text-xs text-blue-600/70">Matches</p>
                </CardContent></Card>
                <Card className="bg-green-50 border-green-100"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{activity.messages ?? 0}</p>
                  <p className="text-xs text-green-600/70">Messages Sent</p>
                </CardContent></Card>
                <Card className="bg-orange-50 border-orange-100"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-orange-600">{activity.boosts ?? 0}</p>
                  <p className="text-xs text-orange-600/70">Boosts Used</p>
                </CardContent></Card>
                <Card className="bg-red-50 border-red-100"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{activity.blocked ?? 0} / {activity.blockedBy ?? 0}</p>
                  <p className="text-xs text-red-600/70">Blocked / By</p>
                </CardContent></Card>
                <Card className="bg-amber-50 border-amber-100"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-amber-600">{activity.reports ?? 0}</p>
                  <p className="text-xs text-amber-600/70">Reports Against</p>
                </CardContent></Card>
              </div>

              {/* Active Boost */}
              {activity.activeBoost && (
                <Card className="border-orange-200 bg-orange-50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Rocket className="h-5 w-5 text-orange-500" />
                      <div>
                        <p className="text-sm font-semibold text-orange-800">Active Boost</p>
                        <p className="text-xs text-orange-700">Type: {activity.activeBoost.type} | Views: {activity.activeBoost.profileViewsGained}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Could not load activity data.</p>
          )}
        </TabsContent>

        {/* SUBSCRIPTION HISTORY TAB */}
        <TabsContent value="subscriptions">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Plan</p>
                  <p className="mt-2 text-lg font-semibold">
                    {premium?.isPremium ? 'Premium' : currentSubscriptionView?.planLabel || 'Free'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Status</p>
                  <p className="mt-2 text-lg font-semibold capitalize">
                    {premium?.isExpired ? 'Expired' : currentSubscriptionView?.status || 'free'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">History Records</p>
                  <p className="mt-2 text-lg font-semibold">{sortedSubscriptionHistory.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</p>
                  <p className="mt-2 text-lg font-semibold">
                    {subscriptionRemainingDays === null ? 'N/A' : subscriptionRemainingDays > 0 ? `${subscriptionRemainingDays}d` : subscriptionRemainingDays === 0 ? 'Today' : 'Expired'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Current subscription summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-500" /> Current Subscription
                </CardTitle>
              </CardHeader>
              <CardContent>
                {currentSubscriptionView || premium ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={getPlanBadgeClass(currentSubscriptionView?.planCode || (premium?.isPremium ? 'premium' : 'free'))}>
                        {premium?.isPremium
                          ? currentSubscriptionView?.planLabel?.toUpperCase() || 'PREMIUM'
                          : currentSubscriptionView
                            ? currentSubscriptionView.planLabel.toUpperCase()
                            : 'FREE'}
                      </Badge>
                      <Badge variant={premium?.isExpired ? 'destructive' : currentSubscriptionView?.status === 'active' ? 'success' : 'secondary'}>
                        {premium?.isExpired ? 'Expired' : currentSubscriptionView?.status || 'free'}
                      </Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Started</p>
                        <p className="mt-1 text-sm font-medium">{currentSubscriptionView?.startDate ? formatDate(currentSubscriptionView.startDate) : 'Not set'}</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Expires</p>
                        <p className="mt-1 text-sm font-medium">{currentSubscriptionView?.endDate ? formatDate(currentSubscriptionView.endDate) : 'Not set'}</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Billing cadence</p>
                        <p className="mt-1 text-sm font-medium capitalize">{currentSubscriptionView?.billingCycle || 'Manual'}</p>
                      </div>
                    </div>
                    {subscriptionRemainingDays !== null && (
                      <p className="text-sm font-medium">
                        {subscriptionRemainingDays > 0
                          ? `${subscriptionRemainingDays} days remaining`
                          : subscriptionRemainingDays === 0
                            ? 'Expires today'
                            : `${Math.abs(subscriptionRemainingDays)} days overdue`}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('userDetail.freePlan')}</p>
                )}
              </CardContent>
            </Card>

            {/* Subscription history table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Subscription History</CardTitle>
              </CardHeader>
              <CardContent>
                {subHistoryLoading ? (
                  <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : sortedSubscriptionHistory.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No subscription history found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Plan</th>
                          <th className="pb-2 pr-4 font-medium">Billing</th>
                          <th className="pb-2 pr-4 font-medium">Status</th>
                          <th className="pb-2 pr-4 font-medium">Start</th>
                          <th className="pb-2 pr-4 font-medium">End</th>
                          <th className="pb-2 font-medium">Stripe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {sortedSubscriptionHistory.map((sub) => (
                          <tr key={sub.id} className="hover:bg-muted/50">
                            <td className="py-2 pr-4">
                              <Badge className={getPlanBadgeClass(sub.planCode)}>
                                {sub.planName || formatPlanLabel(sub.planCode)}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 capitalize text-muted-foreground">{sub.billingCycle}</td>
                            <td className="py-2 pr-4">
                              <Badge variant={sub.status === 'active' ? 'success' : sub.status === 'past_due' ? 'destructive' : 'secondary'}>
                                {sub.status}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground text-xs">{formatDate(sub.startDate)}</td>
                            <td className="py-2 pr-4 text-muted-foreground text-xs">{formatDate(sub.endDate)}</td>
                            <td className="py-2 text-xs">
                              {sub.stripePriceId ? (
                                <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{sub.stripePriceId.slice(0, 16)}...</code>
                              ) : <span className="text-muted-foreground">—</span>}
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
        </TabsContent>

        {/* PHOTOS TAB */}
        <TabsContent value="photos">
          {photos && photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {photos.map((photo) => (
                <div key={photo.id} className="relative group rounded-xl overflow-hidden border">
                  <img src={photo.url} alt="User photo" className="aspect-square w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Badge
                      variant={photo.moderationStatus === 'APPROVED' ? 'success' : photo.moderationStatus === 'REJECTED' ? 'destructive' : 'warning'}
                      className="text-[9px]"
                    >
                      {photo.moderationStatus}
                    </Badge>
                  </div>
                  <div className="absolute bottom-2 left-2 flex gap-1">
                    {photo.isMain && <Badge className="text-[9px] bg-primary">Main</Badge>}
                    {photo.isSelfieVerification && <Badge className="text-[9px] bg-blue-500">Selfie</Badge>}
                  </div>
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <Button
                      size="icon"
                      className="h-7 w-7 bg-emerald-500 hover:bg-emerald-600"
                      onClick={() => setPhotoModDialog({ open: true, photoId: photo.id, approved: true, isSelfie: photo.isSelfieVerification })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-7 w-7"
                      onClick={() => setPhotoModDialog({ open: true, photoId: photo.id, approved: false, isSelfie: photo.isSelfieVerification })}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Camera className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{t('userDetail.noPhotos')}</p>
            </div>
          )}
        </TabsContent>

        {/* VERIFICATION TAB */}
        <TabsContent value="verification">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('userDetail.verificationStatus')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Email Verification</span>
                  </div>
                  {user.emailVerified ? (
                    <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Verified</Badge>
                  ) : (
                    <Badge variant="warning" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>
                  )}
                </div>

                {/* Selfie Verification */}
                {(() => {
                  const selfieStatus = (user as any).verification?.selfie?.status || (user.selfieVerified ? 'approved' : 'not_submitted')
                  const selfieUrl = (user as any).verification?.selfie?.url || user.selfieUrl
                  const selfieRejection = (user as any).verification?.selfie?.rejectionReason
                  const selfieReviewedAt = (user as any).verification?.selfie?.reviewedAt
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Camera className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Selfie Verification</span>
                        </div>
                        {selfieStatus === 'approved' ? (
                          <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>
                        ) : selfieStatus === 'rejected' ? (
                          <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>
                        ) : selfieStatus === 'pending' ? (
                          <Badge variant="warning" className="gap-1"><Clock className="h-3 w-3" /> Pending Review</Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-muted-foreground">Not Submitted</Badge>
                        )}
                      </div>
                      {selfieUrl && (
                        <div className="border-t pt-3">
                          <p className="text-xs text-muted-foreground mb-2">Selfie Image</p>
                          <img src={selfieUrl} alt="Selfie" className="w-32 h-32 rounded-lg object-cover border" />
                          {selfieRejection && <p className="text-xs text-red-500 mt-1">Rejection: {selfieRejection}</p>}
                          {selfieReviewedAt && <p className="text-xs text-muted-foreground mt-1">Reviewed: {new Date(selfieReviewedAt).toLocaleDateString()}</p>}
                        </div>
                      )}
                      {selfieStatus === 'pending' && id && (
                        <div className="flex gap-2 border-t pt-3">
                          <Button
                            size="sm"
                            className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white"
                            disabled={!!actionLoading}
                            onClick={async () => {
                              setActionLoading('selfie-approve')
                              try {
                                await adminApi.verifySelfie(id, true)
                                await reload()
                                toast({ title: 'Selfie Approved', variant: 'success' })
                              } catch { toast({ title: 'Error', description: 'Failed to approve selfie', variant: 'error' }) }
                              finally { setActionLoading('') }
                            }}
                          >
                            {actionLoading === 'selfie-approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Approve Selfie
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1.5"
                            disabled={!!actionLoading}
                            onClick={async () => {
                              setActionLoading('selfie-reject')
                              try {
                                await adminApi.verifySelfie(id, false)
                                await reload()
                                toast({ title: 'Selfie Rejected', variant: 'warning' })
                              } catch { toast({ title: 'Error', description: 'Failed to reject selfie', variant: 'error' }) }
                              finally { setActionLoading('') }
                            }}
                          >
                            {actionLoading === 'selfie-reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                            Reject Selfie
                          </Button>
                        </div>
                      )}
                    </>
                  )
                })()}

                {/* Marital Status Verification */}
                {(() => {
                  const maritalStatus = (user as any).verification?.marital_status?.status || (user.documentVerified ? 'approved' : user.documentUrl ? 'pending' : 'not_submitted')
                  const maritalUrl = (user as any).verification?.marital_status?.url || user.documentUrl
                  const maritalRejection = (user as any).verification?.marital_status?.rejectionReason || user.documentRejectionReason
                  const maritalReviewedAt = (user as any).verification?.marital_status?.reviewedAt || user.documentVerifiedAt
                  return (
                    <>
                      <div className="flex items-center justify-between border-t pt-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Marital Status Verification</span>
                        </div>
                        {maritalStatus === 'approved' ? (
                          <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>
                        ) : maritalStatus === 'rejected' ? (
                          <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>
                        ) : maritalStatus === 'pending' ? (
                          <Badge variant="warning" className="gap-1"><Clock className="h-3 w-3" /> Pending Review</Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-muted-foreground">Not Submitted</Badge>
                        )}
                      </div>
                      {maritalUrl && (
                        <div className="border-t pt-3">
                          <p className="text-xs text-muted-foreground mb-1">{user.documentType ? user.documentType.replace('_', ' ') : 'Marital Document'}</p>
                          <img src={maritalUrl} alt="Document" className="w-40 h-28 rounded-lg object-cover border" />
                          {maritalRejection && <p className="text-xs text-red-500 mt-1">Rejection: {maritalRejection}</p>}
                          {maritalReviewedAt && <p className="text-xs text-muted-foreground mt-1">Reviewed: {new Date(maritalReviewedAt).toLocaleDateString()}</p>}
                        </div>
                      )}
                      {maritalStatus === 'pending' && id && (
                        <div className="flex gap-2 border-t pt-3">
                          <Button
                            size="sm"
                            className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white"
                            disabled={!!actionLoading}
                            onClick={async () => {
                              setActionLoading('marital-approve')
                              try {
                                await adminApi.verifyMaritalStatus(id, true)
                                await reload()
                                toast({ title: 'Marital Doc Approved', variant: 'success' })
                              } catch { toast({ title: 'Error', description: 'Failed to approve', variant: 'error' }) }
                              finally { setActionLoading('') }
                            }}
                          >
                            {actionLoading === 'marital-approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Approve Document
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1.5"
                            disabled={!!actionLoading}
                            onClick={async () => {
                              setActionLoading('marital-reject')
                              try {
                                await adminApi.verifyMaritalStatus(id, false, 'Rejected by admin review')
                                await reload()
                                toast({ title: 'Marital Doc Rejected', variant: 'warning' })
                              } catch { toast({ title: 'Error', description: 'Failed to reject', variant: 'error' }) }
                              finally { setActionLoading('') }
                            }}
                          >
                            {actionLoading === 'marital-reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                            Reject Document
                          </Button>
                        </div>
                      )}
                    </>
                  )
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('userDetail.trustSafetyScore')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className={`inline-flex items-center justify-center h-20 w-20 rounded-full border-4 ${user.trustScore >= 70 ? 'border-emerald-500' : user.trustScore >= 40 ? 'border-amber-500' : 'border-red-500'}`}>
                    <span className={`text-2xl font-bold ${user.trustScore >= 70 ? 'text-emerald-600' : user.trustScore >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                      {user.trustScore}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">out of 100</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Flags received</span>
                    <span className="font-medium">{user.flagCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Shadow banned</span>
                    <span className="font-medium">{user.isShadowBanned ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Device count</span>
                    <span className="font-medium">{user.deviceCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Send Notification Dialog */}
      <Dialog open={notifDialog} onOpenChange={setNotifDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('userDetail.sendNotifTo')} {user.firstName}</DialogTitle>
            <DialogDescription>{t('userDetail.sendNotifDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Title</label>
              <Input value={notifForm.title} onChange={(e) => setNotifForm({ ...notifForm, title: e.target.value })} placeholder="Notification title" />
            </div>
            <div>
              <label className="text-xs font-medium">Body</label>
              <Textarea value={notifForm.body} onChange={(e) => setNotifForm({ ...notifForm, body: e.target.value })} placeholder="Notification message..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSendNotification} disabled={notifLoading || !notifForm.title || !notifForm.body}>
              {notifLoading ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <Send className="h-4 w-4 me-1" />}
              {t('common.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo Moderation Dialog */}
      <Dialog open={photoModDialog.open} onOpenChange={(open) => { if (!open) { setPhotoModDialog({ open: false, photoId: '', approved: false, isSelfie: false }); setPhotoModReason('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{photoModDialog.approved ? 'Approve Photo' : 'Reject Photo'}</DialogTitle>
            <DialogDescription>
              {photoModDialog.approved
                ? 'Approve this photo. Optionally add a note.'
                : 'Reject this photo. Provide a reason for the rejection.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={photoModDialog.approved ? 'Optional note...' : 'Reason for rejection...'}
            value={photoModReason}
            onChange={(e) => setPhotoModReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPhotoModDialog({ open: false, photoId: '', approved: false, isSelfie: false }); setPhotoModReason('') }}>Cancel</Button>
            <Button
              variant={photoModDialog.approved ? 'default' : 'destructive'}
              onClick={() => handlePhotoModeration(photoModDialog.photoId, photoModDialog.approved, photoModDialog.isSelfie)}
              disabled={!photoModDialog.approved && !photoModReason.trim()}
            >
              {photoModDialog.approved ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Moderation Dialog */}
      <Dialog open={modDialog.open} onOpenChange={(open) => { if (!open) { setModDialog({ open: false, status: '' }); setModForm({ reason: '', moderationReasonCode: '', moderationReasonText: '', actionRequired: '', supportMessage: '', isUserVisible: true, expiresAt: '', internalAdminNote: '' }) } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set Status: {modDialog.status.replace(/_/g, ' ')}</DialogTitle>
            <DialogDescription>
              Configure the moderation action. Fields marked with * are recommended.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Reason Code * */}
            <div>
              <label className="text-xs font-medium">Reason Code *</label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={modForm.moderationReasonCode}
                onChange={(e) => {
                  const code = e.target.value
                  setModForm({
                    ...modForm,
                    moderationReasonCode: code,
                    actionRequired: autoSuggestAction(code),
                    supportMessage: autoSuggestMessage(code),
                  })
                }}
              >
                <option value="">-- Select reason --</option>
                {REASON_CODES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            {/* Custom Reason Text */}
            <div>
              <label className="text-xs font-medium">Custom Reason (overrides code label)</label>
              <Input
                value={modForm.moderationReasonText}
                onChange={(e) => setModForm({ ...modForm, moderationReasonText: e.target.value })}
                placeholder="Optional custom reason text..."
                className="mt-1"
              />
            </div>

            {/* Action Required * */}
            <div>
              <label className="text-xs font-medium">Action Required *</label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={modForm.actionRequired}
                onChange={(e) => setModForm({ ...modForm, actionRequired: e.target.value })}
              >
                <option value="">-- Select action --</option>
                {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            {/* User-Visible Support Message */}
            <div>
              <label className="text-xs font-medium">Support Message (shown to user)</label>
              <Textarea
                value={modForm.supportMessage}
                onChange={(e) => setModForm({ ...modForm, supportMessage: e.target.value })}
                placeholder="Clear explanation of what happened and what the user should do..."
                className="mt-1"
                rows={3}
              />
            </div>

            {/* Internal Admin Reason */}
            <div>
              <label className="text-xs font-medium">Internal Reason (admin only)</label>
              <Textarea
                value={modForm.reason}
                onChange={(e) => setModForm({ ...modForm, reason: e.target.value })}
                placeholder="Internal notes about why this action was taken..."
                className="mt-1"
                rows={2}
              />
            </div>

            {/* Is User Visible */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isUserVisible"
                checked={modForm.isUserVisible}
                onChange={(e) => setModForm({ ...modForm, isUserVisible: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="isUserVisible" className="text-xs font-medium">Show moderation notice to user</label>
            </div>

            {/* Expiration Date */}
            <div>
              <label className="text-xs font-medium">Expiration Date (optional — auto-reverts to ACTIVE)</label>
              <Input
                type="datetime-local"
                value={modForm.expiresAt}
                onChange={(e) => setModForm({ ...modForm, expiresAt: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Internal Admin Note */}
            <div>
              <label className="text-xs font-medium">Internal Admin Note (never shown to user)</label>
              <Textarea
                value={modForm.internalAdminNote}
                onChange={(e) => setModForm({ ...modForm, internalAdminNote: e.target.value })}
                placeholder="Context, ticket #, who requested this..."
                className="mt-1"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setModDialog({ open: false, status: '' }); setModForm({ reason: '', moderationReasonCode: '', moderationReasonText: '', actionRequired: '', supportMessage: '', isUserVisible: true, expiresAt: '', internalAdminNote: '' }) }}>{t('common.cancel')}</Button>
            <Button onClick={confirmStatusChange} disabled={modLoading}>
              {modLoading ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
