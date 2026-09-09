import React from 'react';

/**
 * 최소 마크다운 렌더러.
 * 지원서 초안이 쓰는 문법(제목/표/목록/인용/굵게)만 처리한다.
 * [확인 필요: ...] 마커는 노란 하이라이트로 강조한다 — 제출 전 반드시 눈에 띄어야 한다.
 */

function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\[확인 필요:[^\]]+\])|(\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<mark className="need" key={`${keyBase}-m${i++}`}>{m[1]}</mark>);
    else if (m[2]) parts.push(<strong key={`${keyBase}-b${i++}`}>{m[2].slice(2, -2)}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 표
    if (line.trim().startsWith('|') && lines[i + 1]?.includes('---')) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(
        <table key={key++}>
          <thead><tr>{header.map((h, hi) => <th key={hi}>{inline(h, `h${key}-${hi}`)}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `c${key}-${ri}-${ci}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    // 목록
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, ''));
        i++;
      }
      out.push(<ul key={key++}>{items.map((it, ii) => <li key={ii}>{inline(it, `l${key}-${ii}`)}</li>)}</ul>);
      continue;
    }

    if (line.startsWith('###')) {
      out.push(<h3 key={key++}>{inline(line.replace(/^#+\s*/, ''), `t${key}`)}</h3>);
      i++; continue;
    }
    if (line.startsWith('>')) {
      out.push(<blockquote key={key++}>{inline(line.replace(/^>\s?/, ''), `q${key}`)}</blockquote>);
      i++; continue;
    }
    if (line.trim() === '') { i++; continue; }

    out.push(<p key={key++} style={{ margin: '6px 0' }}>{inline(line, `p${key}`)}</p>);
    i++;
  }

  return <div className="render">{out}</div>;
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
}
