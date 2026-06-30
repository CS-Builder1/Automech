import { NavLink, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'
import { OfflineBadge } from './OfflineBadge'
import { BackgroundSync } from './BackgroundSync'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  schedule: 'M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM9 13h2v2H9z',
  customers: 'M16 19v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  jobs: 'M9 5h6M9 5a2 2 0 0 0-2 2v12h10V7a2 2 0 0 0-2-2M9 5V4M9 11h6M9 15h6',
  invoices: 'M6 3h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1ZM8 8h8M8 12h8M8 16h5',
  followups: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plans: 'M3 7h18M3 7l2 13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1l2-13M3 7l3-4h12l3 4M9 11v6M15 11v6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-1.7-1l-.4-2.5H9.2L8.8 6a7.3 7.3 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 1.7 1l.4 2.5h5.6l.4-2.5a7.3 7.3 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z',
}

// Bottom nav (mobile) — the 5 daily-use surfaces.
const bottomNav: NavItem[] = [
  { to: '/', label: 'Home', icon: <Icon d={ICONS.home} /> },
  { to: '/schedule', label: 'Schedule', icon: <Icon d={ICONS.schedule} /> },
  { to: '/jobs', label: 'Jobs', icon: <Icon d={ICONS.jobs} /> },
  { to: '/invoices', label: 'Invoices', icon: <Icon d={ICONS.invoices} /> },
  { to: '/customers', label: 'Customers', icon: <Icon d={ICONS.customers} /> },
]

// Desktop sidebar — everything, including lower-frequency surfaces.
const sidebarNav: NavItem[] = [
  { to: '/', label: 'Home', icon: <Icon d={ICONS.home} /> },
  { to: '/schedule', label: 'Schedule', icon: <Icon d={ICONS.schedule} /> },
  { to: '/customers', label: 'Customers', icon: <Icon d={ICONS.customers} /> },
  { to: '/jobs', label: 'Jobs', icon: <Icon d={ICONS.jobs} /> },
  { to: '/invoices', label: 'Invoices', icon: <Icon d={ICONS.invoices} /> },
  { to: '/follow-ups', label: 'Follow-ups', icon: <Icon d={ICONS.followups} /> },
  { to: '/plans', label: 'Plans', icon: <Icon d={ICONS.plans} /> },
  { to: '/settings', label: 'Settings', icon: <Icon d={ICONS.settings} /> },
]

export function Layout() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col md:flex-row">
      <BackgroundSync />
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-60 shrink-0 border-r border-slate-200 p-4 md:block dark:border-slate-800">
        <Brand />
        <nav className="mt-6 space-y-1">
          {sidebarNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-full flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="no-print flex items-center justify-between border-b border-slate-200 px-4 py-3 md:hidden dark:border-slate-800">
          <Brand />
          <div className="flex items-center gap-1">
            <OfflineBadge />
            <NavLink to="/follow-ups" className="rounded-lg p-2 text-slate-500 dark:text-slate-400" aria-label="Follow-ups">
              <Icon d={ICONS.followups} />
            </NavLink>
            <NavLink to="/settings" className="rounded-lg p-2 text-slate-500 dark:text-slate-400" aria-label="Settings">
              <Icon d={ICONS.settings} />
            </NavLink>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-8">
          <div className="hidden justify-end md:flex">
            <OfflineBadge />
          </div>
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/95"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {bottomNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="text-lg font-bold tracking-tight">Automech</span>
    </div>
  )
}
