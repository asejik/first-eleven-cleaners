'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './ConciergeWidget.module.css';

/**
 * Eleven's reply, formatted. Its own chunk, loaded the first time the chat opens: the markdown
 * libraries are large, and loading them with every page slowed phones down (Lighthouse 2026-10-20).
 */
export default function ConciergeMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ className, children, ...props }) => {
          const tableProps = { ...props };
          delete (tableProps as { node?: unknown }).node;
          return (
            <div className={styles.tableWrapper}>
              <table className={`${styles.markdownTable} ${className || ''}`.trim()} {...tableProps}>
                {children}
              </table>
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
