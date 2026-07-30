import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ViewerProductCapabilities } from "../App";
import styles from "./HomePage.module.css";

const sectionOrder = [
  { key: "viewer", signal: "blue" },
  { key: "studio", signal: "purple" },
  { key: "library", signal: "pink" },
] as const;

type SectionKey = (typeof sectionOrder)[number]["key"];

export function HomePage({ capabilities }: { capabilities: ViewerProductCapabilities }) {
  const { t } = useTranslation("home");
  const sections = sectionOrder.filter(({ key }) => key !== "studio" || capabilities.harmonyAnalysis);

  return (
    <main className={`${styles.home} scrollable`}>
      <div className={styles.homeContent}>
        <section className={`${styles.section} ${styles.introSection}`}>
          <div className={styles.sectionBody}>
            <h1 className={styles.display}>{t("intro.title")}</h1>
            <p className={styles.lead}>{t("intro.lead")}</p>
            <Link className={styles.primaryAction} to="/library">
              {t("intro.primaryAction")}
            </Link>
          </div>
        </section>
        {sections.map(({ key, signal }, position) => (
          <HomeSection key={key} sectionKey={key} index={position + 1} signal={signal} />
        ))}
      </div>
    </main>
  );
}

function HomeSection({
  sectionKey,
  index,
  signal,
}: {
  sectionKey: SectionKey;
  index: number;
  signal: "blue" | "purple" | "pink";
}) {
  const { t } = useTranslation("home");
  const params = t(`sections.${sectionKey}.params`, { returnObjects: true }) as unknown as readonly string[];
  return (
    <section className={styles.section} data-signal={signal}>
      <p className={styles.index} aria-hidden="true">
        <span className={styles.signalDot} />
        {String(index).padStart(2, "0")}
      </p>
      <div className={styles.sectionBody}>
        <h2 className={styles.sectionTitle}>
          {t(`sections.${sectionKey}.title`)}
          <span className={styles.sectionTag}>{t(`sections.${sectionKey}.tag`)}</span>
        </h2>
        <p className={styles.description}>{t(`sections.${sectionKey}.description`)}</p>
        <p className={styles.params}>
          {params.map((param) => (
            <span key={param}>{param}</span>
          ))}
        </p>
        <Link className={styles.entry} to="/library">
          {t(`sections.${sectionKey}.entry`)}
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </section>
  );
}
