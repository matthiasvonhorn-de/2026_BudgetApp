'use client'

import Link from 'next/link'
import { BookOpen, Landmark, SlidersHorizontal, Tag, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const settingsItems = [
  {
    href: '/settings/general',
    icon: SlidersHorizontal,
    title: 'Allgemein',
    description: 'Konten, Währung und Zahlenformat konfigurieren',
  },
  {
    href: '/settings/categories',
    icon: Tag,
    title: 'Kategorien & Gruppen',
    description: 'Kategoriegruppen und Kategorien verwalten, Reihenfolge per Drag & Drop',
  },
  {
    href: '/settings/rules',
    icon: BookOpen,
    title: 'Kategorisierungsregeln',
    description: 'Automatische Regeln für den CSV-Import verwalten',
  },
  {
    href: '/settings/loans',
    icon: TrendingDown,
    title: 'Bankkredite',
    description: 'Ratenkredite und Annuitätendarlehen anlegen und verwalten',
  },
  {
    href: '/settings/portfolios',
    icon: TrendingUp,
    title: 'Aktiendepots',
    description: 'Depots anlegen und verwalten',
  },
  {
    href: '/settings/asset-types',
    icon: Landmark,
    title: 'Sachwert-Typen',
    description: 'Typen für Sachwerte verwalten (Immobilien, Fahrzeuge, etc.)',
  },
]

export default function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Einstellungen</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        {settingsItems.map(item => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
