import { ArrowLeft, Clock, Settings } from "lucide-react";
import type { CSSProperties, ReactElement } from "react";
import type { ModeType } from "@/types/template";
import { homeModes, recentProjects } from "../data";

interface HomeScreenProps {
  onOpenMode: (mode: ModeType) => void;
}

export function HomeScreen({ onOpenMode }: HomeScreenProps): ReactElement {
  return (
    <main className="home-shell" data-testid="home-screen">
      <div className="home-wrap">
        <header className="topnav">
          <div className="logo">
            <span className="logo-dot" />
            SPP <span>v2</span>
          </div>
          <nav className="nav-links" aria-label="ניווט ראשי">
            <button className="nav-link" type="button">
              <Clock size={14} />
              פרויקטים אחרונים
            </button>
            <button className="nav-link" type="button">
              <Settings size={14} />
              הגדרות
            </button>
          </nav>
        </header>

        <section className="hero">
          <h1>מה תרצה ליצור היום?</h1>
          <p>בחר מצב עבודה כדי להתחיל. בשלב זה Free Mode מחובר לקנבס אמיתי, שמירה וייצוא.</p>
        </section>

        <section className="modes-grid" aria-label="מצבי עבודה">
          {homeModes.map((mode) => {
            const Icon = mode.icon;
            const isReady = mode.id === "free";
            return (
              <button
                className="mode-card"
                data-testid={`mode-${mode.id}`}
                key={mode.id}
                onClick={() => onOpenMode(mode.id)}
                style={{ "--mode-color": mode.color } as CSSProperties}
                type="button"
              >
                <span className="mode-icon">
                  <Icon size={24} strokeWidth={1.8} />
                </span>
                <span className="mode-title">{mode.title}</span>
                <span className="mode-desc">{mode.description}</span>
                <span className="mode-state">{isReady ? "Phase 1" : "בהמשך"}</span>
                <ArrowLeft className="mode-arrow" size={16} />
              </button>
            );
          })}
        </section>

        <section className="section-title">
          <h2>פרויקטים אחרונים</h2>
          <button type="button">
            כל הפרויקטים
            <ArrowLeft size={12} />
          </button>
        </section>

        <section className="recent-grid" aria-label="פרויקטים אחרונים לדוגמה">
          {recentProjects.map((name, index) => (
            <button className="recent-card" key={name} onClick={() => onOpenMode("free")} type="button">
              <span className={`recent-thumb recent-thumb-${index + 1}`} />
              <span className="recent-copy">
                <strong>{name}</strong>
                <span>נערך לאחרונה</span>
              </span>
              <ArrowLeft size={14} />
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}
