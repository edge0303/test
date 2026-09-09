import { NextResponse } from 'next/server';
import { isValidBizNo, normalizeBizNo, formatBizNo, bizNoKind } from '@/lib/bizno';
import { lookupBizStatus } from '@/lib/nts';
import { getCompanyByBizNo } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { biz_no } = (await req.json()) as { biz_no?: string };
  const digits = normalizeBizNo(biz_no ?? '');

  if (digits.length !== 10) {
    return NextResponse.json({ ok: false, message: '사업자등록번호 10자리를 입력해 주세요.' }, { status: 400 });
  }
  if (!isValidBizNo(digits)) {
    return NextResponse.json(
      { ok: false, message: '사업자등록번호 형식(체크섬)이 올바르지 않습니다. 번호를 다시 확인해 주세요.' },
      { status: 400 },
    );
  }

  const nts = await lookupBizStatus(digits);
  const existing = getCompanyByBizNo(digits);

  return NextResponse.json({
    ok: true,
    biz_no: digits,
    formatted: formatBizNo(digits),
    kind: bizNoKind(digits),
    nts,
    existing: existing ? { id: existing.id, name: existing.name } : null,
    // 하이브리드 온보딩의 핵심: 자동으로 알 수 있는 것과 물어봐야 하는 것을 분리해 알려준다.
    autoFilled: [
      { label: '번호 유효성', value: '검증 완료' },
      { label: '사업자 구분', value: bizNoKind(digits) ?? '미상' },
      ...(nts.found
        ? [
            { label: '사업자 상태', value: nts.b_stt ?? '미상' },
            { label: '과세 유형', value: nts.tax_type ?? '미상' },
          ]
        : []),
    ],
  });
}
