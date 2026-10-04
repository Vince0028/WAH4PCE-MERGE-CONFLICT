'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { href: '/transactions', label: 'Transaction Logs', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { href: '/mapper', label: 'Data Mapper', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="12" y1="2" x2="12" y2="22"/></svg> },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-[240px] min-h-screen flex flex-col border-r" style={{ background: 'var(--color-bg-sidebar)', borderColor: 'var(--color-border-sidebar)' }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-border-sidebar)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 flex items-center justify-center bg-transparent overflow-hidden">
            <Image src="/WAH_logo.png" alt="WAH Logo" width={36} height={36} className="object-contain scale-[1.7]" priority />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight text-white">ADAPT iPaaS</h1>
            <p className="text-[11px] leading-tight text-slate-400">Integration Platform</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 flex flex-col gap-0.5">
        <p className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 text-slate-500">Menu</p>
        {navItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return <Link key={item.href} href={item.href} className={`ipaas-sidebar-link ${isActive ? 'active' : ''}`}>{item.icon}<span>{item.label}</span></Link>;
        })}
      </nav>
      <div className="px-5 py-3 border-t" style={{ borderColor: 'var(--color-border-sidebar)' }}>
        <p className="text-[10px] font-bold uppercase mb-2 text-slate-500">Systems</p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#10b981' }} />
            <span className="text-[11px] text-slate-400">iHOMIS — :3001</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#10b981' }} />
            <span className="text-[11px] text-slate-400">WAH Hospital — :3002</span>
          </div>
        </div>
      </div>
      <div className="mt-auto px-5 py-4 border-t" style={{ borderColor: 'var(--color-border-sidebar)' }}>
        <button
          onClick={async () => {
            const { useRouter } = await import('next/navigation');
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login';
          }}
          className="flex w-full items-center gap-2 px-3 py-2 rounded-none text-[13px] font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Log Out
        </button>
      </div>
    </aside>
  );
}
