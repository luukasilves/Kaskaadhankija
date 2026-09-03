import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kaskaadhankija',
  description:
    'Kaskaad-minihangete läbiviimine raamlepingu „Eesti.ai koolitajate tellimine“ alusel.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="et">
      <body>{children}</body>
    </html>
  );
}
