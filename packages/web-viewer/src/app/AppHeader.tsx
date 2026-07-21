import { LibraryBig, Moon, Sun } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { flushSync } from "react-dom";
import { LogoMark } from "../components/LogoMark";
import { useAppStore } from "./appStore";
import styles from "./AppHeader.module.css";

export function AppHeader() {
  const { pathname } = useLocation();
  const libraryScoreId = pathname.match(/^\/(?:viewer|studio)\/([^/]+)$/)?.[1];
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <header className={styles.header}>
      <NavLink className={styles.brand ?? ""} to="/" aria-label="逐拍首页">
        <LogoMark size={32} />
        <span className={styles.wordmark}>
          <strong>逐拍</strong>
          <span>ZUPULSE</span>
        </span>
      </NavLink>

      <nav className={styles.navigation} aria-label="主要页面">
        <NavLink className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)} to="/" end>
          <LibraryBig aria-hidden="true" size={16} />
          曲谱库
        </NavLink>
        {libraryScoreId ? (
          <>
            <NavLink
              className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)}
              to={`/viewer/${libraryScoreId}`}
            >
              查看器
            </NavLink>
            <NavLink
              className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)}
              to={`/studio/${libraryScoreId}`}
            >
              和弦工作室
            </NavLink>
          </>
        ) : null}
      </nav>

      <button
        className={styles.themeButton}
        type="button"
        aria-label={`切换至${nextTheme === "light" ? "浅色" : "深色"}主题`}
        onClick={() => flushSync(() => setTheme(nextTheme))}
      >
        {theme === "dark" ? <Sun aria-hidden="true" size={17} /> : <Moon aria-hidden="true" size={17} />}
        <span>{theme === "dark" ? "浅色" : "深色"}</span>
      </button>
    </header>
  );
}
