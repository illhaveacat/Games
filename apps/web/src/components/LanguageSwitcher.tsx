import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n/detectLanguage";
import "./LanguageSwitcher.css";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  zh: "中文",
};

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div className="language-switcher" role="group" aria-label={t("language.switch")}>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          aria-pressed={current === lang}
          className={current === lang ? "language-switcher__btn is-active" : "language-switcher__btn"}
          onClick={() => {
            void i18n.changeLanguage(lang);
          }}
        >
          {LANGUAGE_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
