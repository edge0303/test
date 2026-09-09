import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '정부지원금 레이더',
  description: '사업자번호 하나로 지원 가능한 정부지원금·정책자금 일정과 지원서 초안을 확인합니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
