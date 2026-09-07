'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { href: '/transactions', label: 'Transaction Logs', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { href: '/mapper', label: 'Data Mapper', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="12" y1="2" x2="12" y2="22"/></svg> },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-[240px] min-h-screen flex flex-col" style={{ background: 'var(--color-bg-sidebar)' }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.25)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white leading-tight">ADAPT iPaaS</h1>
            <p className="text-[11px] leading-tight" style={{ color: 'var(--color-text-sidebar)' }}>Integration Platform</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider px-3 py-2" style={{ color: 'rgba(255,255,255,0.25)' }}>Menu</p>
        {navItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return <Link key={item.href} href={item.href} className={`ipaas-sidebar-link ${isActive ? 'active' : ''}`}>{item.icon}<span>{item.label}</span></Link>;
        })}
      </nav>
      <div className="px-5 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="text-[10px] font-semibold uppercase mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>Systems</p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#10b981' }} />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>iHOMIS — :3001</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#10b981' }} />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>WAH Hospital — :3002</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
