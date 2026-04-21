import { type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  className?: string
  iconColor?: string
}

export function StatsCard({ title, value, subtitle, icon: Icon, trend, className, iconColor = 'text-primary' }: StatsCardProps) {
  const iconBackgroundClass = cn(
    'bg-primary/10',
    iconColor.includes('red') && 'bg-red-50 dark:bg-red-950/40',
    iconColor.includes('amber') && 'bg-amber-50 dark:bg-amber-950/40',
    iconColor.includes('blue') && 'bg-blue-50 dark:bg-blue-950/40',
    (iconColor.includes('purple') || iconColor.includes('violet') || iconColor.includes('fuchsia')) && 'bg-violet-50 dark:bg-violet-950/40',
    iconColor.includes('pink') && 'bg-pink-50 dark:bg-pink-950/40'
  )

  return (
    <Card className={cn('', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <p className={cn('text-xs font-medium', trend.value >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
              </p>
            )}
          </div>
          <div className={cn('rounded-lg p-3', iconBackgroundClass)}>
            <Icon className={cn('h-6 w-6', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
