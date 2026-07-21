import styles from "./LogoMark.module.css";

/**
 * Zupulse brand mark. The artwork is defined in
 * `packages/web-viewer/src/assets/images/logo-light.svg` and `logo-dark.svg`;
 * both variants are inlined here so the header can switch via
 * `:root[data-theme]` without an extra Rspack asset rule. The mark is rendered
 * without its own background fill — the host (e.g. AppHeader) provides the
 * border via `.logoMark`.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className={styles.logoMark}
      data-testid="zupulse-logo-mark"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        className={`${styles.variant} ${styles.light}`}
        viewBox="0 0 128 128"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <g stroke="#141414" strokeWidth="1.6" strokeLinecap="round" fill="none">
          <line x1="20" y1="40" x2="108" y2="40" />
          <line x1="20" y1="52" x2="108" y2="52" />
          <line x1="20" y1="64" x2="108" y2="64" />
          <line x1="20" y1="76" x2="108" y2="76" />
          <line x1="20" y1="88" x2="108" y2="88" />
        </g>
        <g fill="#f26b4f">
          <circle cx="50.1" cy="40" r="4.5" />
          <circle cx="88.1" cy="40" r="4.5" />
          <circle cx="64" cy="64" r="4.5" />
          <circle cx="39.5" cy="88" r="4.5" />
          <circle cx="78.1" cy="88" r="4.5" />
        </g>
      </svg>
      <svg
        className={`${styles.variant} ${styles.dark}`}
        viewBox="0 0 128 128"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <g stroke="#e0dbd5" strokeWidth="1.6" strokeLinecap="round" fill="none">
          <line x1="20" y1="40" x2="108" y2="40" />
          <line x1="20" y1="52" x2="108" y2="52" />
          <line x1="20" y1="64" x2="108" y2="64" />
          <line x1="20" y1="76" x2="108" y2="76" />
          <line x1="20" y1="88" x2="108" y2="88" />
        </g>
        <g fill="#f26b4f">
          <circle cx="50.1" cy="40" r="4.5" />
          <circle cx="88.1" cy="40" r="4.5" />
          <circle cx="64" cy="64" r="4.5" />
          <circle cx="39.5" cy="88" r="4.5" />
          <circle cx="78.1" cy="88" r="4.5" />
        </g>
      </svg>
    </span>
  );
}
