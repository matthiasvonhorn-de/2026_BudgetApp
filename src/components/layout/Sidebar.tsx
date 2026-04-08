'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CreditCard,
  TrendingDown,
  TrendingUp,
  ArrowLeftRight,
  BarChart3,
  Upload,
  Settings,
  Wallet,
  Landmark,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Konten', icon: CreditCard },
  { href: '/loans', label: 'Bankkredite', icon: TrendingDown },
  { href: '/portfolios', label: 'Aktiendepots', icon: TrendingUp },
  { href: '/assets', label: 'Sachwerte', icon: Landmark },
  { href: '/transactions', label: 'Transaktionen', icon: ArrowLeftRight },
  { href: '/reports', label: 'Berichte', icon: BarChart3 },
  { href: '/import', label: 'Import', icon: Upload },
  { href: '/settings', label: 'Einstellungen', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 border-r bg-card flex flex-col">
      <div className="p-6 border-b">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">BudgetApp</span>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
