import { loadSeed } from '../src/lib/ingest';
import { getDb } from '../src/lib/db';

const r = loadSeed();
const total = (getDb().prepare('SELECT COUNT(*) c FROM programs').get() as { c: number }).c;
console.log(`시드 적재 완료 — 신규 ${r.inserted} / 갱신 ${r.updated}, 전체 공고 ${total}건`);
console.log('주의: 시드는 샘플 데이터입니다. 실데이터는 BIZINFO_API_KEY 설정 후 `npm run ingest` 를 실행하십시오.');
