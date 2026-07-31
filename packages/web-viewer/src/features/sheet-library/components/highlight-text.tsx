import type { ReactNode } from "react";
import styles from "../../SheetLibrary.module.css";

export function HighlightText({ text, query }: { text: string; query: string }): ReactNode {
  if (!query.trim()) return text;
  const lowerQuery = query.toLocaleLowerCase();
  const lowerText = text.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let index = lowerText.indexOf(lowerQuery);

  while (index !== -1) {
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push(
      <mark key={`${index}-${lastIndex}`} className={styles.highlightMark}>
        {text.slice(index, index + query.length)}
      </mark>,
    );
    lastIndex = index + query.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}
