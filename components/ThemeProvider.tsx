'use client';

import { useEffect, useState } from 'react';

interface AppConfig {
  app: {
    name: string;
  };
  theme: {
    logo: string;
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
  };
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig(data);

        // Apply theme colors to CSS variables
        if (data.theme) {
          document.documentElement.style.setProperty('--color-primary', data.theme.primaryColor);
          document.documentElement.style.setProperty('--color-secondary', data.theme.secondaryColor);
          document.documentElement.style.setProperty('--color-background', data.theme.backgroundColor);
          document.documentElement.style.setProperty('--color-text', data.theme.textColor);
        }
      })
      .catch(err => console.error('Failed to load config:', err));
  }, []);

  return <>{children}</>;
}
