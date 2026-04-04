import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider } from '@/contexts/auth-context'
import { ThemeProvider } from '@/contexts/theme-context'
import { ToastProvider } from '@/components/ui/toast'
import { AdminLayout } from '@/components/layout/admin-layout'

const LoginPage = lazy(() => import('@/pages/login'))
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const UsersPage = lazy(() => import('@/pages/users/index'))
const UserDetailPage = lazy(() => import('@/pages/users/user-detail'))
const ReportsPage = lazy(() => import('@/pages/reports'))
const PhotosPage = lazy(() => import('@/pages/photos'))
const AnalyticsPage = lazy(() => import('@/pages/analytics'))
const TrustSafetyPage = lazy(() => import('@/pages/trust-safety'))
const SecurityPage = lazy(() => import('@/pages/security'))
const MonetizationPage = lazy(() => import('@/pages/monetization'))
const ChatPage = lazy(() => import('@/pages/chat'))
const NotificationsPage = lazy(() => import('@/pages/notifications'))
const SearchUsersPage = lazy(() => import('@/pages/search-users'))
const MatchesPage = lazy(() => import('@/pages/matches'))
const ActivityPage = lazy(() => import('@/pages/activity'))
const SupportPage = lazy(() => import('@/pages/support'))
const AdsPage = lazy(() => import('@/pages/ads'))
const SubscriptionsPage = lazy(() => import('@/pages/subscriptions'))
const SendNotificationsPage = lazy(() => import('@/pages/send-notifications'))
const VerificationPage = lazy(() => import('@/pages/verification'))
const AuditLogsPage = lazy(() => import('@/pages/audit-logs'))
const GuidePage = lazy(() => import('@/pages/guide'))
const CategoriesPage = lazy(() => import('@/pages/categories'))
const DailyInsightsPage = lazy(() => import('@/pages/daily-insights'))
const ContentManagementPage = lazy(() => import('@/pages/content'))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<AdminLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/users/:id" element={<UserDetailPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/photos" element={<PhotosPage />} />
                  <Route path="/verification" element={<VerificationPage />} />
                  <Route path="/matches" element={<MatchesPage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/search" element={<SearchUsersPage />} />
                  <Route path="/monetization" element={<MonetizationPage />} />
                  <Route path="/activity" element={<ActivityPage />} />
                  <Route path="/support" element={<SupportPage />} />
                  <Route path="/ads" element={<AdsPage />} />
                  <Route path="/subscriptions" element={<SubscriptionsPage />} />
                  <Route path="/send-notifications" element={<SendNotificationsPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/trust-safety" element={<TrustSafetyPage />} />
                  <Route path="/security" element={<SecurityPage />} />
                  <Route path="/audit-logs" element={<AuditLogsPage />} />
                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/daily-insights" element={<DailyInsightsPage />} />
                  <Route path="/guide" element={<GuidePage />} />
                  <Route path="/content" element={<ContentManagementPage />} />
                </Route>
              </Routes>
            </Suspense>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
