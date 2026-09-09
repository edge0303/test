import { ingestBizinfo } from '../src/lib/ingest';

async function main() {
  const report = await ingestBizinfo({ count: Number(process.env.INGEST_COUNT ?? 100) });
  console.log(report.ok ? '[성공]' : '[실패]', report.message);
  console.log(`수집 ${report.fetched} / 신규 ${report.inserted} / 갱신 ${report.updated}`);
  if (report.sample) {
    console.log('\n--- 응답 샘플 (매핑 수정용) ---');
    console.log(JSON.stringify(report.sample, null, 2).slice(0, 2000));
  }
  if (!report.ok) process.exitCode = 1;
}
main();
