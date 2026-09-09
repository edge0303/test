import Link from 'next/link';
import type { Company } from '@/lib/types';
import { formatBizNo } from '@/lib/bizno';
import { foundedLabel, bandLabel, EMPLOYEE_BANDS, REVENUE_BANDS } from '@/lib/profile';

export default function TopBar({ company }: { company?: Company | null }) {
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
        <Link className="btn sm" href="/admin/reviews">검수 큐</Link>
        <Link className="btn sm" href="/onboard">기업 정보 수정</Link>
      </div>
    </div>
  );
}
