/**
 * 로그인 코드 전달.
 *
 * 기본 동작은 서버 콘솔 출력이며, MAIL_WEBHOOK_URL 이 설정되면 그쪽으로 POST 합니다.
 * SMTP를 쓰려면 nodemailer 를 붙여 deliver() 안에 분기를 하나 더 추가하면 됩니다.
 *
 * 중요 — 코드는 절대 HTTP 응답으로 반환하지 않습니다.
 * 응답에 코드를 실으면 이메일 인증이 아무 의미가 없어집니다.
 */

export interface LoginMail {
  to: string;
  code: string;
  expiresInMinutes: number;
}

export async function deliverLoginCode(mail: LoginMail): Promise<void> {
  const hook = process.env.MAIL_WEBHOOK_URL;
  const subject = '[정부지원금 레이더] 로그인 인증번호';
  const text =
    `인증번호: ${mail.code}\n\n` +
    `${mail.expiresInMinutes}분 안에 입력해 주세요.\n` +
    `본인이 요청한 것이 아니라면 이 메일을 무시하십시오.`;

  if (hook) {
    try {
      const res = await fetch(hook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: mail.to, subject, text }),
      });
      if (!res.ok) console.error('[mail] 발송 실패 HTTP', res.status);
      return;
    } catch (err) {
      console.error('[mail] 발송 중 오류', err);
      // 아래 콘솔 출력으로 폴백한다 (로컬 개발 편의)
    }
  }

  console.log(
    `\n──────────────────────────────────────────\n` +
    ` 로그인 인증번호 (메일 발송 미설정 — 콘솔 출력)\n` +
    ` 받는 사람 : ${mail.to}\n` +
    ` 인증번호   : ${mail.code}\n` +
    ` 유효시간   : ${mail.expiresInMinutes}분\n` +
    `──────────────────────────────────────────\n`,
  );
}
