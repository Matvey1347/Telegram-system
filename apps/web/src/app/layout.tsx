import type { Metadata } from 'next';
import { AppProvider } from '@/providers/app-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Telegram System',
  description: 'Internal system for Telegram finance, ads and analytics',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
