import { Sidebar } from '@/components/layout/Sidebar'
import { SettingsLoader } from '@/components/layout/SettingsLoader'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <SettingsLoader />
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  )
}
