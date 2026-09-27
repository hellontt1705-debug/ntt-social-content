import React from "react";
import { Icon } from "./Icons";
import { useLanguage } from "../i18n";

export default function Navbar({
  currentView,
  setCurrentView,
  searchQuery,
  setSearchQuery,
  selectedVideosCount,
  onExportSelectedZip,
  onOpenDownloader,
  onOpenDriveModal,
  theme,
  toggleTheme,
  trashCount = 0,
  uiScale = "80",
  setUiScale
}) {
  const { lang, setLanguage, t } = useLanguage();

  const getTitle = () => {
    switch (currentView) {
      case "dashboard":
        return "Bảng Điều Khiển (Dashboard)";
      case "vault":
        return t("title_vault");
      case "calendar":
        return t("title_calendar");
      case "notes":
        return t("title_notes");
      case "audio":
        return t("title_audio") || "Studio Xử Lý Âm Thanh";
      case "trash":
        return t("trash_tab") || "Thùng Rác";
      case "settings":
        return "Cài Đặt Hệ Thống (Settings)";
      default:
        return "SocialContent OS";
    }
  };

  return (
    <header className="top-header">
      <div className="header-left">
        <h2 className="page-title">{getTitle()}</h2>
      </div>

      {currentView === "vault" && (
        <div className="header-search">
          <Icon name="search" size={14} />
          <input
            type="text"
            placeholder={t("search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      <div className="header-actions">
        {/* Language, Zoom & Theme Controls */}
        <div className="nav-control-group">
          {/* Zoom / Scale Selector */}
          <div className="lang-selector-wrap" title="Thu nhỏ / Phóng to giao diện (UI Scale)">
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-primary, #8b5cf6)", display: "flex", alignItems: "center" }}>
              🔍
            </span>
            <select
              className="lang-selector-select"
              value={uiScale || "80"}
              onChange={(e) => setUiScale && setUiScale(e.target.value)}
              style={{ fontWeight: 600, minWidth: "75px" }}
            >
              <option value="70">70% (-30%)</option>
              <option value="75">75% (-25%)</option>
              <option value="80">80% (-20%)</option>
              <option value="85">85% (-15%)</option>
              <option value="90">90% (-10%)</option>
              <option value="100">100% (Gốc)</option>
              <option value="110">110% (+10%)</option>
            </select>
          </div>

          <div style={{ width: "1px", height: "12px", background: "var(--border-color)" }} />

          {/* Language Selector */}
          <div className="lang-selector-wrap" title={t("language")}>
            <Icon name="globe" size={13} />
            <select
              className="lang-selector-select"
              value={lang}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="vi">🇻🇳 Tiếng Việt</option>
              <option value="en">🇺🇸 English</option>
              <option value="zh">🇨🇳 中文</option>
            </select>
          </div>

          <div style={{ width: "1px", height: "12px", background: "var(--border-color)" }} />

          {/* Theme Switcher */}
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === "light" ? t("theme_dark") : t("theme_light")}
          >
            {theme === "light" ? (
              <Icon name="moon" size={14} color="#8b5cf6" />
            ) : (
              <Icon name="sun" size={14} color="#f59e0b" />
            )}
          </button>
        </div>

        {currentView === "vault" && selectedVideosCount > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={onExportSelectedZip}>
            <Icon name="download" size={13} />
            <span>{t("export_zip")} ({selectedVideosCount})</span>
          </button>
        )}

        <button className="btn btn-secondary btn-sm" onClick={onOpenDriveModal} title="Google Drive">
          <Icon name="cloud" size={13} />
          <span>{t("drive_btn")}</span>
        </button>

        <button
          className={`btn btn-sm ${currentView === "trash" ? "btn-danger" : "btn-secondary"}`}
          onClick={() => setCurrentView && setCurrentView(currentView === "trash" ? "vault" : "trash")}
          title={t("trash_tab") || "Thùng Rác"}
          style={{
            position: "relative",
            borderColor: trashCount > 0 || currentView === "trash" ? "rgba(244, 63, 94, 0.45)" : undefined,
            color: currentView === "trash" ? "#fff" : trashCount > 0 ? "#f43f5e" : undefined,
            background: currentView === "trash" ? "rgba(244, 63, 94, 0.85)" : undefined,
            boxShadow: currentView === "trash" ? "0 0 12px rgba(244, 63, 94, 0.35)" : undefined,
          }}
        >
          <Icon
            name="trash"
            size={13}
            color={currentView === "trash" ? "#fff" : trashCount > 0 ? "#f43f5e" : "currentColor"}
          />
          <span>{t("trash_tab") || "Thùng Rác"}</span>
          {trashCount > 0 && (
            <span
              style={{
                marginLeft: "2px",
                background: currentView === "trash" ? "#fff" : "rgba(244, 63, 94, 0.2)",
                color: currentView === "trash" ? "#f43f5e" : "#f43f5e",
                fontSize: "9.5px",
                fontWeight: 700,
                padding: "0 5px",
                borderRadius: "10px",
                border: currentView === "trash" ? "none" : "1px solid rgba(244, 63, 94, 0.35)",
              }}
            >
              {trashCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
