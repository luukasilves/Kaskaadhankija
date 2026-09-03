import type { Metadata } from 'next';
import { TestStrip } from '@/components/test-strip';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kaskaadhankija',
  description:
    'Kaskaad-minihangete läbiviimine raamlepingu „Eesti.ai koolitajate tellimine“ alusel.',
  robots: { index: false, follow: false },
  // Declared explicitly so browsers stop probing /favicon.ico, which the app
  // does not serve — a 404 on every first page load is noise in the logs.
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }], shortcut: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="et">
      <body>
        {/* The test harness sits above the application, never inside it. */}
        <TestStrip />
        {children}
      </body>
    </html>
  );
}
