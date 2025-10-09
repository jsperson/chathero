'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Header() {
  const pathname = usePathname();
  const [appName, setAppName] = useState('ChatHero');
  const [logo, setLogo] = useState('');
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setAppName(data.app.name);
        setLogo(data.theme.logo);
      })
      .catch(err => console.error('Failed to load config:', err));
  }, []);

  // Close admin menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setAdminMenuOpen(false);
    if (adminMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [adminMenuOpen]);

  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/data/config');

  return (
    <header className="border-b" style={{ borderColor: 'var(--color-primary)' }}>
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logo && (
            <img src={logo} alt={appName} className="h-16 w-auto" />
          )}
        </div>

        <nav className="flex gap-4 items-center">
          <Link
            href="/"
            className={`px-4 py-2 rounded transition-colors ${
              pathname === '/'
                ? 'bg-primary text-white'
                : 'hover:bg-gray-100'
            }`}
            style={pathname === '/' ? { backgroundColor: 'var(--color-primary)' } : {}}
          >
            💬 Chat
          </Link>
          <Link
            href="/data"
            className={`px-4 py-2 rounded transition-colors ${
              pathname === '/data' && !isAdminRoute
                ? 'bg-primary text-white'
                : 'hover:bg-gray-100'
            }`}
            style={pathname === '/data' && !isAdminRoute ? { backgroundColor: 'var(--color-primary)' } : {}}
          >
            📊 Data
          </Link>

          {/* Admin Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAdminMenuOpen(!adminMenuOpen);
              }}
              className={`px-4 py-2 rounded transition-colors flex items-center gap-2 ${
                isAdminRoute
                  ? 'bg-primary text-white'
                  : 'hover:bg-gray-100'
              }`}
              style={isAdminRoute ? { backgroundColor: 'var(--color-primary)' } : {}}
            >
              ⚙️ Admin
              <span className="text-sm">{adminMenuOpen ? '▴' : '▾'}</span>
            </button>

            {adminMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                {/* Data Section */}
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                  Data
                </div>
                <Link
                  href="/admin/database-settings"
                  className="block px-6 py-2 hover:bg-gray-100 transition-colors"
                  onClick={() => setAdminMenuOpen(false)}
                >
                  🗄️ Database Settings
                </Link>
                <Link
                  href="/admin/datasets"
                  className="block px-6 py-2 hover:bg-gray-100 transition-colors"
                  onClick={() => setAdminMenuOpen(false)}
                >
                  📦 Dataset Selection
                </Link>
                <Link
                  href="/admin/dataset-maintenance"
                  className="block px-6 py-2 hover:bg-gray-100 transition-colors text-gray-400"
                  onClick={() => setAdminMenuOpen(false)}
                >
                  🔧 Dataset Maintenance
                  <span className="text-xs ml-2">(Coming Soon)</span>
                </Link>

                {/* Divider */}
                <div className="my-2 border-t border-gray-200"></div>

                <Link
                  href="/admin/ai-settings"
                  className="block px-4 py-2 hover:bg-gray-100 transition-colors"
                  onClick={() => setAdminMenuOpen(false)}
                >
                  🤖 AI Settings
                </Link>
                <Link
                  href="/admin/test"
                  className="block px-4 py-2 hover:bg-gray-100 transition-colors"
                  onClick={() => setAdminMenuOpen(false)}
                >
                  🧪 Test
                </Link>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
