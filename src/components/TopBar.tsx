import Link from 'next/link';
import type { Company } from '@/lib/types';
import type { Session } from '@/lib/auth';
import { formatBizNo } from '@/lib/bizno';
import { foundedLabel, bandLabel, EMPLOYEE_BANDS, REVENUE_BANDS } from '@/lib/profile';
import LogoutButton from './LogoutButton';

export default function TopBar({
  company, session,
}: { company?: Company | null; session?: Session | null }) {
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand" style={{ color: 'inherit' }}>
          <span className="dot" />정부지원금 레이더
        </Link>
        {company && (
          <div className="company-chip">
            <b>{company.name}</b>
            <span>·</span><span>{formatBizNo(company.biz_no)}</span>
            <span>·</span><span>{[company.region_sido, company.region_sigungu].filter(Boolean).join(' ') || '지역 미입력'}</span>
            <span>·</span><span>{company.industry_name ?? '업종 미입력'}</span>
            <span>·</span><span>업력 {foundedLabel(company.founded_at)}</span>
            <span>·</span><span>{bandLabel(EMPLOYEE_BANDS, company.employee_band)}</span>
            <span>·</span><span>매출 {bandLabel(REVENUE_BANDS, company.revenue_band)}</span>
          </div>
        )}
        <div className="spacer" />
        {session && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {session.user.email}
              {session.user.role === 'admin' && <span className="badge accent" style={{ marginLeft: 6 }}>관리자</span>}
            </span>
            {/* 검수 큐 링크는 관리자에게만 보인다. 링크를 숨기는 것이 통제는 아니며,
                실제 접근 제어는 /admin/reviews 페이지에서 다시 한다. */}
            {session.user.role === 'admin' && <Link className="btn sm" href="/admin/reviews">검수 큐</Link>}
            <Link className="btn sm" href="/onboard">기업 정보</Link>
            <LogoutButton />
          </>
        )}
      </div>
    </div>
  );
}
