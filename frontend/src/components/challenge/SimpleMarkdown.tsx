import type { ReactNode } from 'react';

/**
 * Just enough Markdown for a challenge's rules and prizes, typed by an admin:
 * "## Heading", "- bullet", "**bold**", blank line = new paragraph. Built as
 * React elements, never raw HTML. Safe in server and client components.
 */
export function SimpleMarkdown({ text, className, itemClassName }: { text: string; className?: string; itemClassName?: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let para: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul${blocks.length}`} className="flex flex-col gap-2">
        {bullets.map((b, i) => (
          <li key={i} className={`flex gap-2.5 ${itemClassName ?? ''}`}>
            <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-60" />
            <span>{inline(b)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  const flushPara = () => {
    if (!para.length) return;
    blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(' '))}</p>);
    para = [];
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      flushPara();
    } else if (/^#{1,3}\s/.test(line)) {
      flushBullets();
      flushPara();
      blocks.push(
        <h3 key={`h${blocks.length}`} className="font-heading font-bold">
          {inline(line.replace(/^#{1,3}\s+/, ''))}
        </h3>,
      );
    } else if (/^[-*•]\s/.test(line)) {
      flushPara();
      bullets.push(line.replace(/^[-*•]\s+/, ''));
    } else {
      flushBullets();
      para.push(line);
    }
  }
  flushBullets();
  flushPara();
  return <div className={`flex flex-col gap-3 ${className ?? ''}`}>{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}
