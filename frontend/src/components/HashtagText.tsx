import { Fragment } from 'react';
import { Link } from 'react-router-dom';

interface HashtagTextProps {
  text: string;
  className?: string;
}

const TAG_RE = /#([A-Za-z0-9_一-龥]+)/g;

/** 渲染文本，把 #话题 转成可点击跳转 /tag/:name 的链接 */
export default function HashtagText({ text, className = '' }: HashtagTextProps) {
  if (!text) return null;
  const parts: Array<{ type: 'text' | 'tag'; value: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'tag', value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });

  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.type === 'tag' ? (
          <Link
            key={i}
            to={`/tag/${encodeURIComponent(p.value)}`}
            className="font-medium text-cyan-400 transition hover:text-cyan-300 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            #{p.value}
          </Link>
        ) : (
          <Fragment key={i}>{p.value}</Fragment>
        ),
      )}
    </span>
  );
}
