import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Bell, Send, Users, User, CheckCircle2, Filter, Eye, MapPin, Calendar, Crown, AlertTriangle } from 'lucide-react'

export default function SendNotificationsPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'single' | 'broadcast'>('single')
  const [userId, setUserId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState('system')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  // Targeted filters
  const [filters, setFilters] = useState({
    ageMin: '',
    ageMax: '',
    gender: 'all',
    premiumOnly: false,
    country: '',
    city: '',
    recentOnly: false,
    recentDays: '30',
  })
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const handlePreview = async () => {
    setPreviewLoading(true)
    try {
      const filterParams: Record<string, any> = {}
      if (filters.ageMin) filterParams.ageMin = Number(filters.ageMin)
      if (filters.ageMax) filterParams.ageMax = Number(filters.ageMax)
      if (filters.gender !== 'all') filterParams.gender = filters.gender
      if (filters.premiumOnly) filterParams.premiumOnly = true
      if (filters.country) filterParams.country = filters.country
      if (filters.city) filterParams.city = filters.city
      if (filters.recentOnly) {
        filterParams.recentOnly = true
        filterParams.recentDays = Number(filters.recentDays) || 30
      }
      const { data } = await adminApi.previewNotificationRecipients(filterParams)
      setPreviewCount(data?.recipientCount || data?.count || 0)
    } catch (err) {
      console.error(err)
      setPreviewCount(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const hasActiveFilters = filters.ageMin || filters.ageMax || filters.gender !== 'all' || filters.premiumOnly || filters.country || filters.city || filters.recentOnly
  const ageMinNum = filters.ageMin ? Number(filters.ageMin) : NaN
  const ageMaxNum = filters.ageMax ? Number(filters.ageMax) : NaN
  const ageRangeInvalid = (filters.ageMin && isNaN(ageMinNum)) || (filters.ageMax && isNaN(ageMaxNum)) || (filters.ageMin && filters.ageMax && ageMinNum > ageMaxNum)
  const ageMinInvalid = filters.ageMin && (isNaN(ageMinNum) || ageMinNum < 13 || ageMinNum > 120)
  const ageMaxInvalid = filters.ageMax && (isNaN(ageMaxNum) || ageMaxNum < 13 || ageMaxNum > 120)

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return
    if (mode === 'single' && !userId.trim()) return
    if (mode === 'broadcast' && ageRangeInvalid) return

    setLoading(true)
    setResult(null)
    try {
      const payload: { userId?: string; title: string; body: string; type?: string; broadcast?: boolean; filters?: Record<string, any> } = {
        userId: mode === 'single' ? userId.trim() : undefined,
        title: title.trim(),
        body: body.trim(),
        type,
        broadcast: mode === 'broadcast',
      }

      if (mode === 'broadcast' && hasActiveFilters) {
        const filterParams: Record<string, any> = {}
        if (filters.ageMin) filterParams.ageMin = Number(filters.ageMin)
        if (filters.ageMax) filterParams.ageMax = Number(filters.ageMax)
        if (filters.gender !== 'all') filterParams.gender = filters.gender
        if (filters.premiumOnly) filterParams.premiumOnly = true
        if (filters.country) filterParams.country = filters.country
        if (filters.city) filterParams.city = filters.city
        if (filters.recentOnly) {
          filterParams.recentOnly = true
          filterParams.recentDays = Number(filters.recentDays) || 30
        }
        payload.filters = filterParams
      }

      const { data } = await adminApi.sendNotification(payload)
      setResult({
        success: true,
        message: `Notification sent to ${data.sent || 1} user(s)${data.broadcast ? ' (broadcast)' : ''}.`,
      })
      setTitle('')
      setBody('')
      setUserId('')
      setPreviewCount(null)
    } catch (err: any) {
      setResult({
        success: false,
        message: err.response?.data?.message || 'Failed to send notification',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('sendNotifications.title')}</h1>
        <p className="text-muted-foreground">{t('sendNotifications.subtitle')}</p>
      </div>

      {/* Mode Selection */}
      <div className="flex gap-3">
        <Card
          className={`flex-1 cursor-pointer transition-all ${mode === 'single' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'}`}
          onClick={() => setMode('single')}
        >
          <CardContent className="flex items-center gap-4 p-6">
            <div className={`rounded-lg p-3 ${mode === 'single' ? 'bg-primary/10' : 'bg-muted'}`}>
              <User className={`h-6 w-6 ${mode === 'single' ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="font-semibold">{t('sendNotifications.singleUser')}</p>
              <p className="text-xs text-muted-foreground">{t('sendNotifications.singleUserDesc')}</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`flex-1 cursor-pointer transition-all ${mode === 'broadcast' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'}`}
          onClick={() => setMode('broadcast')}
        >
          <CardContent className="flex items-center gap-4 p-6">
            <div className={`rounded-lg p-3 ${mode === 'broadcast' ? 'bg-primary/10' : 'bg-muted'}`}>
              <Users className={`h-6 w-6 ${mode === 'broadcast' ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="font-semibold">{t('sendNotifications.broadcast')}</p>
              <p className="text-xs text-muted-foreground">{t('sendNotifications.broadcastDesc')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Targeted Filters (broadcast only) */}
      {mode === 'broadcast' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" /> Target Audience
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="text-xs font-medium">Min Age</label>
                <Input
                  type="number"
                  min={18}
                  max={100}
                  value={filters.ageMin}
                  onChange={(e) => setFilters({ ...filters, ageMin: e.target.value })}
                  placeholder="18"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Max Age</label>
                <Input
                  type="number"
                  min={18}
                  max={100}
                  value={filters.ageMax}
                  onChange={(e) => setFilters({ ...filters, ageMax: e.target.value })}
                  placeholder="65"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Gender</label>
                <Select value={filters.gender} onValueChange={(v) => setFilters({ ...filters, gender: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genders</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Country
                </label>
                <Input
                  value={filters.country}
                  onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                  placeholder="e.g. Jordan"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> City
                </label>
                <Input
                  value={filters.city}
                  onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                  placeholder="e.g. Amman"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium flex items-center gap-1">
                  <Crown className="h-3 w-3" /> Premium Only
                </label>
                <div className="mt-1.5">
                  <button
                    onClick={() => setFilters({ ...filters, premiumOnly: !filters.premiumOnly })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${filters.premiumOnly ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${filters.premiumOnly ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </div>

            {ageRangeInvalid && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mr-2 inline h-4 w-4" />
                {ageMinInvalid || ageMaxInvalid
                  ? 'Age must be between 13 and 120.'
                  : 'Min age must not exceed max age.'}
              </div>
            )}

            <div className="flex items-center gap-4 border-t pt-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilters({ ...filters, recentOnly: !filters.recentOnly })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${filters.recentOnly ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${filters.recentOnly ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <label className="text-xs font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Active in last
                </label>
              </div>
              {filters.recentOnly && (
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={filters.recentDays}
                  onChange={(e) => setFilters({ ...filters, recentDays: e.target.value })}
                  className="w-24"
                  placeholder="30"
                />
              )}
              {filters.recentOnly && <span className="text-xs text-muted-foreground">days</span>}
            </div>

            {/* Active filter badges */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-1.5">
                {filters.ageMin && <Badge variant="outline" className="text-[10px]">Min Age: {filters.ageMin}</Badge>}
                {filters.ageMax && <Badge variant="outline" className="text-[10px]">Max Age: {filters.ageMax}</Badge>}
                {filters.gender !== 'all' && <Badge variant="outline" className="text-[10px] capitalize">{filters.gender}</Badge>}
                {filters.premiumOnly && <Badge variant="outline" className="text-[10px]">Premium Only</Badge>}
                {filters.country && <Badge variant="outline" className="text-[10px]">{filters.country}</Badge>}
                {filters.city && <Badge variant="outline" className="text-[10px]">{filters.city}</Badge>}
                {filters.recentOnly && <Badge variant="outline" className="text-[10px]">Active ≤{filters.recentDays}d</Badge>}
              </div>
            )}

            {/* Preview button */}
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewLoading} className="gap-1.5">
                {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Preview Recipients
              </Button>
              {previewCount !== null && (
                <p className="text-sm font-medium">
                  <span className="text-2xl font-bold text-primary">{previewCount.toLocaleString()}</span>
                  <span className="text-muted-foreground ml-1">users match your filters</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compose */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t('sendNotifications.compose')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'single' && (
            <div>
              <label className="text-sm font-medium">{t('sendNotifications.userId')} *</label>
              <Input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder={t('sendNotifications.userIdPlaceholder')}
                className="mt-1"
              />
            </div>
          )}

          {mode === 'broadcast' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800 font-medium">{t('sendNotifications.broadcast')}</p>
              <p className="text-xs text-amber-700">{t('sendNotifications.broadcastWarning')}</p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">{t('sendNotifications.type')}</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t('sendNotifications.system')}</SelectItem>
                <SelectItem value="match">{t('sendNotifications.match')}</SelectItem>
                <SelectItem value="message">{t('sendNotifications.message')}</SelectItem>
                <SelectItem value="like">{t('sendNotifications.like')}</SelectItem>
                <SelectItem value="subscription">{t('sendNotifications.subscription')}</SelectItem>
                <SelectItem value="ticket">Ticket</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">{t('sendNotifications.titleField')} *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('sendNotifications.titlePlaceholder')}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">{t('sendNotifications.body')} *</label>
            <textarea
              className="w-full mt-1 rounded-md border px-3 py-2 text-sm min-h-[120px] resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('sendNotifications.bodyPlaceholder')}
            />
          </div>

          {/* Preview */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('sendNotifications.preview')}</label>
            <div className="mt-1 rounded-lg border bg-white shadow-sm p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2 mt-0.5">
                  <Bell className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{title || 'Notification Title'}</p>
                    <Badge variant="secondary" className="text-[10px] capitalize">{type}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{body || 'Notification body text...'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-muted-foreground">Just now</p>
                    {mode === 'broadcast' && hasActiveFilters && (
                      <Badge variant="outline" className="text-[9px] gap-0.5">
                        <Filter className="h-2.5 w-2.5" /> Filtered
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {result && (
            <div className={`rounded-lg p-3 ${result.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center gap-2">
                {result.success && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                <p className={`text-sm font-medium ${result.success ? 'text-emerald-700' : 'text-red-700'}`}>
                  {result.message}
                </p>
              </div>
            </div>
          )}

          <Button
            onClick={handleSend}
            disabled={loading || !title.trim() || !body.trim() || (mode === 'single' && !userId.trim())}
            className="w-full gap-2"
            size="lg"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {mode === 'broadcast' ? t('sendNotifications.broadcastToAll') : t('sendNotifications.send')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
