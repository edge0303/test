import { NextResponse } from 'next/server';
import { isValidBizNo, normalizeBizNo } from '@/lib/bizno';
import { upsertCompany } from '@/lib/repo';
import { computeCompleteness } from '@/lib/profile';
import { loadSeed } from '@/lib/ingest';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, string | null>;
  const digits = normalizeBizNo(body.biz_no ?? '');
  if (!isValidBizNo(digits)) {
    return NextResponse.json({ ok: false, message: '사업자등록번호가 올바르지 않습니다.' }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ ok: false, message: '기업명을 입력해 주세요.' }, { status: 400 });
  }

  // 공고가 하나도 없으면 최초 1회 시드를 적재해 빈 화면을 피한다.
  const count = (getDb().prepare('SELECT COUNT(*) c FROM programs').get() as { c: number }).c;
  if (count === 0) loadSeed();

  const flag = (v: string | null | undefined) => (v === undefined || v === null || v === '' ? null : v === '1' ? 1 : 0);

  const profile = {
    biz_no: digits,
    name: body.name.trim(),
    status: body.status || null,
    tax_type: body.tax_type || null,
    industry_code: body.industry_code || null,
    industry_name: body.industry_name || null,
    region_sido: body.region_sido || null,
    region_sigungu: body.region_sigungu || null,
    founded_at: body.founded_at || null,
    employee_band: body.employee_band || null,
    revenue_band: body.revenue_band || null,
    is_woman_owned: flag(body.is_woman_owned),
    is_disabled_owned: flag(body.is_disabled_owned),
    is_social_enterprise: flag(body.is_social_enterprise),
    is_venture_certified: flag(body.is_venture_certified),
    has_research_institute: flag(body.has_research_institute),
  };

  const id = upsertCompany({ ...profile, profile_completeness: computeCompleteness(profile) });
  return NextResponse.json({ ok: true, companyId: id });
}
