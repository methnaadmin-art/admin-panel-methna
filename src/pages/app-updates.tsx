import { useEffect, useMemo, useState } from 'react'
import { adminApi, type AdminAppUpdatePolicy } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Loader2, RefreshCw, Save, Smartphone } from 'lucide-react'

const defaultPolicy: AdminAppUpdatePolicy = {
  isActive: false,
  minimumSupportedVersion: '',
  latestVersion: '',
  title: 'Update available',
  hardUpdateMessage: 'Please update Methna to continue.',
  softUpdateMessage: 'A newer version of Methna is available.',
  storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.methnapp.app',
  storeUrliOS: '',
}

const normalizePolicy = (value: AdminAppUpdatePolicy | null | undefined): AdminAppUpdatePolicy => ({
  ...defaultPolicy,
  ...(value || {}),
  minimumSupportedVersion: value?.minimumSupportedVersion || '',
  latestVersion: value?.latestVersion || '',
  title: value?.title || defaultPolicy.title,
  hardUpdateMessage: value?.hardUpdateMessage || defaultPolicy.hardUpdateMessage,
  softUpdateMessage: value?.softUpdateMessage || defaultPolicy.softUpdateMessage,
  storeUrlAndroid: value?.storeUrlAndroid || defaultPolicy.storeUrlAndroid,
  storeUrliOS: value?.storeUrliOS || '',
})

export default function AppUpdatesPage() {
  const { toast } = useToast()
  const [policy, setPolicy] = useState<AdminAppUpdatePolicy>(defaultPolicy)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadPolicy = async () => {
    setLoading(true)
    try {
      const response = await adminApi.getAppUpdatePolicy()
      setPolicy(normalizePolicy(response.data))
    } catch (error: any) {
      toast({
        title: 'Failed to load update policy',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPolicy()
  }, [])

  const updateField = <Key extends keyof AdminAppUpdatePolicy>(
    key: Key,
    value: AdminAppUpdatePolicy[Key],
  ) => {
    setPolicy((current) => ({ ...current, [key]: value }))
  }

  const payload = useMemo<Partial<AdminAppUpdatePolicy>>(() => ({
    isActive: policy.isActive,
    minimumSupportedVersion: policy.minimumSupportedVersion?.trim() || null,
    latestVersion: policy.latestVersion?.trim() || null,
    title: policy.title?.trim() || defaultPolicy.title,
    hardUpdateMessage: policy.hardUpdateMessage?.trim() || defaultPolicy.hardUpdateMessage,
    softUpdateMessage: policy.softUpdateMessage?.trim() || defaultPolicy.softUpdateMessage,
    storeUrlAndroid: policy.storeUrlAndroid?.trim() || defaultPolicy.storeUrlAndroid,
    storeUrliOS: policy.storeUrliOS?.trim() || null,
  }), [policy])

  const savePolicy = async () => {
    setSaving(true)
    try {
      const response = await adminApi.updateAppUpdatePolicy(payload)
      setPolicy(normalizePolicy(response.data))
      toast({ title: 'Update policy saved', variant: 'success' })
    } catch (error: any) {
      toast({
        title: 'Failed to save update policy',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">App Updates</h1>
          <p className="text-muted-foreground">Control soft and mandatory app update prompts for mobile clients.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => void loadPolicy()} disabled={saving}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button className="gap-2" onClick={savePolicy} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Policy
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Smartphone className="h-5 w-5" />
            Version Gate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-semibold">Enable update enforcement</p>
              <p className="text-sm text-muted-foreground">When disabled, mobile clients will not block or nudge users.</p>
            </div>
            <Switch checked={policy.isActive} onCheckedChange={(checked) => updateField('isActive', checked)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Minimum supported version</label>
              <Input
                className="mt-1"
                value={policy.minimumSupportedVersion || ''}
                onChange={(event) => updateField('minimumSupportedVersion', event.target.value)}
                placeholder="1.1.8"
              />
              <p className="mt-1 text-xs text-muted-foreground">Clients below this version get a hard block.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Latest version</label>
              <Input
                className="mt-1"
                value={policy.latestVersion || ''}
                onChange={(event) => updateField('latestVersion', event.target.value)}
                placeholder="1.1.9"
              />
              <p className="mt-1 text-xs text-muted-foreground">Supported older clients get a soft update prompt.</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Prompt title</label>
            <Input
              className="mt-1"
              value={policy.title || ''}
              onChange={(event) => updateField('title', event.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Hard update message</label>
              <Textarea
                className="mt-1"
                value={policy.hardUpdateMessage || ''}
                onChange={(event) => updateField('hardUpdateMessage', event.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Soft update message</label>
              <Textarea
                className="mt-1"
                value={policy.softUpdateMessage || ''}
                onChange={(event) => updateField('softUpdateMessage', event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Android store URL</label>
              <Input
                className="mt-1"
                value={policy.storeUrlAndroid || ''}
                onChange={(event) => updateField('storeUrlAndroid', event.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">iOS store URL</label>
              <Input
                className="mt-1"
                value={policy.storeUrliOS || ''}
                onChange={(event) => updateField('storeUrliOS', event.target.value)}
                placeholder="https://apps.apple.com/app/..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={policy.isActive ? 'success' : 'secondary'}>
              {policy.isActive ? 'Active' : 'Disabled'}
            </Badge>
            {payload.minimumSupportedVersion && (
              <Badge variant="warning">Hard below {payload.minimumSupportedVersion}</Badge>
            )}
            {payload.latestVersion && (
              <Badge variant="info">Soft below {payload.latestVersion}</Badge>
            )}
          </div>
          <div>
            <p className="font-semibold">{payload.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{payload.hardUpdateMessage}</p>
            <p className="mt-1 text-sm text-muted-foreground">{payload.softUpdateMessage}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
