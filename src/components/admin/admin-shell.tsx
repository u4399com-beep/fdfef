'use client'

import { useState } from 'react'
import { Dashboard } from './dashboard'
import { RulesPage } from './rules-page'
import { TasksPage } from './tasks-page'
import { BooksPage } from './books-page'
import { SitesPage } from './sites-page'
import { TemplatesPage } from './templates-page'
import { SettingsPage } from './settings-page'
import {
  BookMarked, Gauge, LayoutDashboard, ListChecks, Palette, Settings, Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type AdminTab = 'dashboard' | 'rules' | 'tasks' | 'books' | 'sites' | 'templates' | 'settings'

const TABS: { id: AdminTab; label: string; icon: typeof Gauge }[] = [
  { id: 'dashboard', label: '仪表盘', icon: Gauge },
  { id: 'rules', label: '采集规则', icon: ListChecks },
  { id: 'tasks', label: '采集任务', icon: Timer },
  { id: 'books', label: '书籍管理', icon: BookMarked },
  { id: 'sites', label: '站群管理', icon: LayoutDashboard },
  { id: 'templates', label: '主题模板', icon: Palette },
  { id: 'settings', label: '系统设置', icon: Settings },
]

export function AdminShell({ onPreview }: { onPreview: (siteId: string) => void }) {
  const [tab, setTab] = useState<AdminTab>('dashboard')

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* 侧边导航（移动端顶部横滑） */}
      <nav aria-label="后台导航" className="lg:w-48 lg:shrink-0">
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible lg:pb-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cn(
                'flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm transition-colors',
                tab === t.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <section className="min-w-0 flex-1" aria-label="后台内容">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'rules' && <RulesPage />}
        {tab === 'tasks' && <TasksPage />}
        {tab === 'books' && <BooksPage />}
        {tab === 'sites' && <SitesPage onPreview={onPreview} />}
        {tab === 'templates' && <TemplatesPage onPreview={onPreview} />}
        {tab === 'settings' && <SettingsPage />}
      </section>
    </div>
  )
}
