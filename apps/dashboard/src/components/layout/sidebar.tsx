import Link from 'next/link';
import { Home, ClipboardList, ShieldCheck, Settings, Zap } from 'lucide-react';

const navItems = [
  { name: 'Overview', href: '/analytics', icon: Home },
  { name: 'Approvals', href: '/approvals', icon: ClipboardList },
  { name: 'Policies', href: '/policies', icon: ShieldCheck },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  return (
    <div className="flex h-full w-64 flex-col border-r bg-card text-card-foreground">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <Zap className="h-6 w-6 text-primary" />
          <span>CircuitBreaker.ai</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-4 py-4">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            <item.icon className="h-4 w-4" />
            {item.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
