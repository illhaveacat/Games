import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import "../i18n";
import "./AppHeader.css";

export function AppHeader() {
  const { t } = useTranslation();

  return (
    <header className="app-header">
      <LanguageSwitcher />
      <h1>{t("app.title")}</h1>
      <p className="app-header__subtitle">{t("app.subtitle")}</p>
    </header>
  );
}
