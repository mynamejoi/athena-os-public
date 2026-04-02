
import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display, Manrope } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import { Suspense } from 'react';

import AppLayout from '@/components/layout/AppLayout';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Project Athena',
  description: 'Powered by Antigravity',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Athena',
    statusBarStyle: 'black-translucent',
  },
};

import { AuthProvider } from '@/components/providers/AuthProvider';
import { ThemeColorProvider } from '@/components/providers/ThemeColorProvider';
import { WhoopModeProvider } from '@/components/providers/WhoopModeProvider';
import { OnboardingWalkthrough } from '@/components/onboarding/OnboardingWalkthrough';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#d4a843" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${inter.variable} ${playfair.variable} ${manrope.variable} font-sans`}>
        <AuthProvider>
          <ThemeColorProvider>
            <WhoopModeProvider>
            <Suspense>
              <AppLayout>
                {children}
              </AppLayout>
              <OnboardingWalkthrough />
            </Suspense>
            </WhoopModeProvider>
            <Toaster />
          </ThemeColorProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
