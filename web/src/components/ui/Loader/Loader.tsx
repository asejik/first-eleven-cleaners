import styles from './Loader.module.css';

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
}

export function Loader({ size = 'md', text, fullScreen = false }: LoaderProps) {
  return (
    <div className={`${styles.wrapper} ${fullScreen ? styles.fullScreen : ''}`} role="status" aria-label="Loading">
      <div className={`${styles.ball} ${styles[size]}`}>
        {/* Soccer ball SVG */}
        <svg viewBox="0 0 100 100" className={styles.ballSvg}>
          <circle cx="50" cy="50" r="48" fill="var(--color-cream)" stroke="var(--color-navy)" strokeWidth="2" />
          {/* Pentagon pattern */}
          <polygon points="50,15 62,35 55,50 45,50 38,35" fill="var(--color-navy)" />
          <polygon points="75,40 85,55 78,68 65,65 62,50" fill="var(--color-navy)" />
          <polygon points="65,78 55,90 40,90 30,78 40,65" fill="var(--color-navy)" />
          <polygon points="22,65 15,50 22,35 35,38 38,52" fill="var(--color-navy)" />
          <polygon points="38,18 50,12 65,18 62,32 42,32" fill="var(--color-navy)" />
        </svg>
      </div>
      {text && <p className={styles.text}>{text}</p>}
      <span className="sr-only">Loading...</span>
    </div>
  );
}
