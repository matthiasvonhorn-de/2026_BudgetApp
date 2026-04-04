import { Sidebar } from '@/components/layout/Sidebar'
import { SettingsLoader } from '@/components/layout/SettingsLoader'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <SettingsLoader />
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
