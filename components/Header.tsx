'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Header() {
  const pathname = usePathname();
  const [appName, setAppName] = useState('ChatHero');
  const [logo, setLogo] = useState('');

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setAppName(data.app.name);
        setLogo(data.theme.logo);
      })
      .catch(err => console.error('Failed to load config:', err));
  }, []);

  return (
    <header className="border-b" style={{ borderColor: 'var(--color-primary)' }}>
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logo && (
            <img src={logo} alt={appName} className="h-8 w-auto" />
          )}
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
            {appName}
          </h1>
        </div>

        <nav className="flex gap-4">
          <Link
            href="/"
            className={`px-4 py-2 rounded transition-colors ${
              pathname === '/'
                ? 'bg-primary text-white'
                : 'hover:bg-gray-100'
            }`}
            style={pathname === '/' ? { backgroundColor: 'var(--color-primary)' } : {}}
          >
            Chat
          </Link>
          <Link
            href="/data"
            className={`px-4 py-2 rounded transition-colors ${
              pathname === '/data'
                ? 'bg-primary text-white'
                : 'hover:bg-gray-100'
            }`}
            style={pathname === '/data' ? { backgroundColor: 'var(--color-primary)' } : {}}
          >
            Data
          </Link>
        </nav>
      </div>
    </header>
  );
}
