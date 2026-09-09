import { NextResponse } from 'next/server';
import { isValidBizNo, normalizeBizNo } from '@/lib/bizno';
import { upsertCompany, OwnershipError } from '@/lib/repo';
import { computeCompleteness } from '@/lib/profile';
import { loadSeed } from '@/lib/ingest';
import { getDb } from '@/lib/db';
import { guardApi, isFail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const guard = await guardApi();
  if (isFail(guard)) return guard.response;

  const body = (await req.json()) as Record<string, string | null>;
  const digits = normalizeBizNo(body.biz_no ?? '');
  if (!isValidBizNo(digits)) {
    return NextResponse.json({ ok: false, message: '사업자등록번호가 올바르지 않습니다.' }, { status: 400 });
  }
  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ ok: false, message: '기업명을 입력해 주세요.' }, { status: 400 });
  }
  if (name.length > 100) {
    return NextResponse.json({ ok: false, message: '기업명이 너무 깁니다.' }, { status: 400 });
  }

  const count = (getDb().prepare('SELECT COUNT(*) c FROM programs').get() as { c: number }).c;
  if (count === 0) loadSeed();

  const flag = (v: string | null | undefined) => (v === undefined || v === null || v === '' ? null : v === '1' ? 1 : 0);
  const trim = (v: string | null | undefined, max: number) => (v ? String(v).slice(0, max) : null);

  const profile = {
    biz_no: digits,
    name,
    status: trim(body.status, 40),
    tax_type: trim(body.tax_type, 60),
    industry_code: trim(body.industry_code, 10),
    industry_name: trim(body.industry_name, 60),
    region_sido: trim(body.region_sido, 30),
    region_sigungu: trim(body.region_sigungu, 30),
    founded_at: trim(body.founded_at, 10),
    employee_band: trim(body.employee_band, 10),
    revenue_band: trim(body.revenue_band, 12),
    is_woman_owned: flag(body.is_woman_owned),
    is_disabled_owned: flag(body.is_disabled_owned),
    is_social_enterprise: flag(body.is_social_enterprise),
    is_venture_certified: flag(body.is_venture_certified),
    has_research_institute: flag(body.has_research_institute),
  };

  try {
    const id = upsertCompany(
      { ...profile, profile_completeness: computeCompleteness(profile) },
      guard.user.id,
    );
    return NextResponse.json({ ok: true, companyId: id });
  } catch (err) {
    if (err instanceof OwnershipError) {
      return NextResponse.json({ ok: false, message: err.message }, { status: 409 });
    }
    throw err;
  }
}
