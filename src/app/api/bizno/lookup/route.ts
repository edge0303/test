import { NextResponse } from 'next/server';
import { isValidBizNo, normalizeBizNo, formatBizNo, bizNoKind } from '@/lib/bizno';
import { lookupBizStatus } from '@/lib/nts';
import { getCompanyByBizNo } from '@/lib/repo';
import { guardApi, isFail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // 외부 API를 호출하는 엔드포인트다. 인증 없이 열어두면 조회 쿼터가 소진된다.
  const guard = await guardApi();
  if (isFail(guard)) return guard.response;

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
  // 다른 계정이 이미 등록한 번호인지만 알려주고, 그 회사의 정보는 노출하지 않는다.
  const takenByOther = Boolean(existing && existing.user_id !== guard.user.id);

  return NextResponse.json({
    ok: true,
    biz_no: digits,
    formatted: formatBizNo(digits),
    kind: bizNoKind(digits),
    nts,
    takenByOther,
    existing: existing && existing.user_id === guard.user.id ? { id: existing.id, name: existing.name } : null,
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
