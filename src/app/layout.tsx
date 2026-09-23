export const metadata = {
  title: 'VALR On/Off-Ramp API (backend)',
  description: 'Backend-only demo: USDC -> ZAR on/off-ramp via VALR, with markup layer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
