import React, { useState, useMemo, useEffect } from "react";
import { Icon } from "./Icons";
import { useLanguage } from "../i18n";
import { buildCategoryTree } from "../utils/categoryHelper";

export default function Sidebar({
  currentView,
  setCurrentView,
  categories,
  selectedCategory,
  setSelectedCategory,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onDropOnCategory,
  onOpenCategoryLockModal,
  unlockedCategoryIds = {},
  onLockCategory,
  onToggleFavoriteCategory,
  driveStatus,
  onOpenDriveModal,
  onOpenDownloader,
  trashCount = 0
}) {
  const { t } = useLanguage();
  const [dragOverCat, setDragOverCat] = useState(null);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("folder");
  const [newCatParentId, setNewCatParentId] = useState("");

  // State chỉnh sửa danh mục
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [editingCatIcon, setEditingCatIcon] = useState("folder");
  const [editingCatParentId, setEditingCatParentId] = useState("__none__");

  // State mở rộng / thu gọn danh mục cha
  const [expandedParents, setExpandedParents] = useState(() => {
    try {
      const saved = localStorage.getItem("sidebar_expanded_parents");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // State thu gọn / phóng ra sidebar
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  // Cấu trúc cây danh mục
  const { rootCategories, childrenMap } = useMemo(() => {
    return buildCategoryTree(categories);
  }, [categories]);

  const allCat = useMemo(() => {
    return Array.isArray(categories) ? categories.find((c) => c.id === "all") : null;
  }, [categories]);

  // Tự động mở rộng danh mục cha khi danh mục con được chọn
  useEffect(() => {
    if (selectedCategory && selectedCategory !== "all") {
      const curCat = Array.isArray(categories) ? categories.find((c) => c.id === selectedCategory) : null;
      if (curCat && curCat.parent_id) {
        setExpandedParents((prev) => {
          if (prev[curCat.parent_id] === false) {
            const next = { ...prev, [curCat.parent_id]: true };
            try {
              localStorage.setItem("sidebar_expanded_parents", JSON.stringify(next));
            } catch {}
            return next;
          }
          return prev;
        });
      }
    }
  }, [selectedCategory, categories]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  const toggleExpandParent = (parentId, e) => {
    if (e) e.stopPropagation();
    setExpandedParents((prev) => {
      const isExpanded = prev[parentId] !== false; // mặc định là mở
      const next = { ...prev, [parentId]: !isExpanded };
      try {
        localStorage.setItem("sidebar_expanded_parents", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleOpenAddSub = (parentId, e) => {
    if (e) e.stopPropagation();
    setNewCatParentId(parentId);
    setShowAddCat(true);
    setEditingCatId(null);
    setExpandedParents((prev) => ({ ...prev, [parentId]: true }));
  };

  const handleCreateCategory = (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const catId = newCatName.toLowerCase().trim().replace(/[^a-z0-9]/g, "_") + "_" + Date.now().toString(36);
    onAddCategory({
      id: catId,
      name: newCatName.trim(),
      icon: newCatIcon,
      color: "#8b5cf6",
      parent_id: newCatParentId && newCatParentId !== "__none__" ? newCatParentId : null
    });
    if (newCatParentId) {
      setExpandedParents((prev) => ({ ...prev, [newCatParentId]: true }));
    }
    setNewCatName("");
    setNewCatParentId("");
    setShowAddCat(false);
  };

  const handleStartEdit = (cat, e) => {
    e.stopPropagation();
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
    setEditingCatIcon(cat.icon || "folder");
    setEditingCatParentId(cat.parent_id || "__none__");
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editingCatName.trim()) return;
    if (onUpdateCategory && editingCatId) {
      onUpdateCategory(editingCatId, {
        name: editingCatName.trim(),
        icon: editingCatIcon,
        parent_id: editingCatParentId === "__none__" ? null : editingCatParentId
      });
      setEditingCatId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingCatId(null);
  };

  const handleDeleteCat = (cat, e) => {
    e.stopPropagation();
    const hasChildren = (childrenMap[cat.id] || []).length > 0;
    const warningMsg = hasChildren
      ? `Bạn có chắc muốn xóa danh mục "${cat.name}"?\nDanh mục này có ${childrenMap[cat.id].length} danh mục con. Các danh mục con sẽ được chuyển thành danh mục chính và video trong danh mục này sẽ chuyển về "Tất cả Video".`
      : `Bạn có chắc muốn xóa danh mục "${cat.name}"? Các video trong mục này sẽ được chuyển về "Tất cả Video".`;

    if (window.confirm(warningMsg)) {
      onDeleteCategory(cat.id);
    }
  };

  const getCategoryDisplayName = (cat) => {
    if (cat.id === "all") return t("all_videos");
    return cat.name;
  };

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
      {/* Brand & Collapse Toggle */}
      <div className={`brand-header ${isCollapsed ? "collapsed" : ""}`}>
        <div className="brand" style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <div className="brand-icon" title="SocialContent Studio OS">
            <Icon name="sparkles" size={20} color="#fff" />
          </div>
          {!isCollapsed && (
            <div className="brand-info">
              <h1>{t("brand_title")}</h1>
              <span>{t("brand_sub")}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={toggleCollapse}
          title={isCollapsed ? "Phóng to sidebar (Mở rộng)" : "Thu gọn sidebar"}
        >
          <Icon name={isCollapsed ? "chevronRight" : "chevronLeft"} size={13} />
        </button>
      </div>

      {/* Main Navigation */}
      <div className="nav-section">
        {!isCollapsed && <div className="nav-label">{t("workspace")}</div>}
        
        <button
          className={`nav-item ${currentView === "dashboard" ? "active" : ""}`}
          onClick={() => setCurrentView("dashboard")}
          title="Dashboard"
        >
          <Icon name="dashboard" size={16} />
          {!isCollapsed && <span>Dashboard</span>}
        </button>

        <button
          className={`nav-item ${currentView === "prompts" ? "active" : ""}`}
          onClick={() => setCurrentView("prompts")}
          title={t("prompt_vault") || "Kho Prompt (AI)"}
        >
          <Icon name="sparkles" size={16} />
          {!isCollapsed && <span>{t("prompt_vault") || "Kho Prompt (AI)"}</span>}
        </button>

        <button
          className={`nav-item ${currentView === "audio" ? "active" : ""}`}
          onClick={() => setCurrentView("audio")}
          title={t("audio_tab")}
        >
          <Icon name="music" size={16} />
          {!isCollapsed && <span>{t("audio_tab")}</span>}
        </button>

        <button
          className={`nav-item ${currentView === "calendar" ? "active" : ""}`}
          onClick={() => setCurrentView("calendar")}
          title={t("calendar_tab")}
        >
          <Icon name="calendar" size={16} />
          {!isCollapsed && <span>{t("calendar_tab")}</span>}
        </button>

        <button
          className={`nav-item ${currentView === "notes" ? "active" : ""}`}
          onClick={() => setCurrentView("notes")}
          title={t("notes_tab")}
        >
          <Icon name="fileText" size={16} />
          {!isCollapsed && <span>{t("notes_tab")}</span>}
        </button>

        <button
          className={`nav-item ${currentView === "resources" ? "active" : ""}`}
          onClick={() => setCurrentView("resources")}
          title={t("resources_tab") || "Kho Link & Tài Liệu"}
        >
          <Icon name="bookmark" size={16} />
          {!isCollapsed && <span>{t("resources_tab") || "Kho Link & Tài Liệu"}</span>}
        </button>

        <button
          className={`nav-item ${currentView === "channels" ? "active" : ""}`}
          onClick={() => setCurrentView("channels")}
          title={t("channels_tab")}
        >
          <Icon name="users" size={16} />
          {!isCollapsed && <span>{t("channels_tab")}</span>}
        </button>
      </div>

      {/* Quick Download Action */}
      <button
        className="btn btn-primary btn-quick-download"
        style={{
          width: "100%",
          padding: isCollapsed ? "8px 0" : "8px 10px",
          fontSize: "11.5px",
          gap: "6px",
          justifyContent: "center",
          display: "flex",
          alignItems: "center",
        }}
        onClick={onOpenDownloader}
        title={t("quick_download")}
      >
        <Icon name="download" size={15} color="#fff" />
        {!isCollapsed && <span>{t("quick_download")}</span>}
      </button>

      {/* Categories (Drag & Drop Target) */}
      <div className="nav-section" style={{ flex: 1, minHeight: 0 }}>
        {!isCollapsed && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px 6px 10px" }}>
            <div className="nav-label" style={{ padding: 0, margin: 0 }}>{t("categories")}</div>
            <button 
              className="icon-btn" 
              title={t("add_category")} 
              onClick={() => {
                setShowAddCat(!showAddCat);
                setNewCatParentId("");
                setEditingCatId(null);
              }}
              style={{ padding: "2px" }}
            >
              <Icon name="plus" size={14} />
            </button>
          </div>
        )}

        {/* Add category inline form */}
        {showAddCat && (
          <form onSubmit={handleCreateCategory} style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: "6px", background: "rgba(255,255,255,0.04)", borderRadius: "8px", marginBottom: "8px" }}>
            <input
              type="text"
              className="form-input"
              style={{ padding: "6px 10px", fontSize: "12px" }}
              placeholder={newCatParentId ? "Tên danh mục con mới..." : t("cat_name_placeholder")}
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              autoFocus
            />
            <div style={{ display: "flex", gap: "6px" }}>
              <select 
                className="form-select" 
                style={{ padding: "4px 6px", fontSize: "11px", flex: 1 }}
                value={newCatIcon}
                onChange={(e) => setNewCatIcon(e.target.value)}
              >
                <option value="folder">📁 Thư mục</option>
                <option value="gamepad">🎮 Game</option>
                <option value="heart">❤️ Tâm trạng</option>
                <option value="music">🎵 Nhạc</option>
                <option value="sparkles">✨ Động lực / Viral</option>
                <option value="book">📚 Kiến thức</option>
                <option value="tag">🏷️ Thẻ / Tag</option>
                <option value="grid">▦ Series</option>
              </select>

              <select
                className="form-select"
                style={{ padding: "4px 6px", fontSize: "10.5px", flex: 1.2 }}
                value={newCatParentId}
                onChange={(e) => setNewCatParentId(e.target.value)}
                title="Chọn danh mục cha nếu muốn tạo danh mục con"
              >
                <option value="">-- Mục chính --</option>
                {rootCategories.filter((r) => r.id !== "all").map((r) => (
                  <option key={r.id} value={r.id}>↳ Con của: {r.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", marginTop: "2px" }}>
              <button type="submit" className="btn btn-primary btn-sm" style={{ padding: "4px 8px" }}>{t("save")}</button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ padding: "4px 8px" }} onClick={() => { setShowAddCat(false); setNewCatParentId(""); }}>{t("cancel")}</button>
            </div>
          </form>
        )}

        <div className="categories-list">
          {/* 1. Tất cả Video (Mặc định trên cùng) */}
          {allCat && (
            <div
              key="all"
              className={`category-item ${selectedCategory === "all" ? "active" : ""} ${dragOverCat === "all" ? "drag-over" : ""}`}
              onClick={() => {
                setSelectedCategory("all");
                if (currentView !== "vault") setCurrentView("vault");
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCat("all");
              }}
              onDragLeave={() => setDragOverCat(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCat(null);
                const videoId = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("videoId");
                if (videoId) onDropOnCategory(videoId, "all");
              }}
              title="Tất cả Video trong kho"
            >
              <div style={{ display: "flex", alignItems: "center", gap: isCollapsed ? 0 : "8px", minWidth: 0, flex: 1, justifyContent: isCollapsed ? "center" : "flex-start", overflow: "hidden" }}>
                <Icon
                  name="grid"
                  size={15}
                  color={selectedCategory === "all" ? "#8b5cf6" : "var(--text-secondary)"}
                />
                {!isCollapsed && (
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: selectedCategory === "all" ? 600 : 500,
                      fontSize: "11px",
                      color: selectedCategory === "all" ? "#fff" : "inherit"
                    }}
                  >
                    {t("all_videos")}
                  </span>
                )}
              </div>
              {!isCollapsed && <span className="cat-badge">{allCat.count || 0}</span>}
            </div>
          )}

          {/* 2. Danh sách Danh Mục Cha & Danh Mục Con */}
          {rootCategories.map((cat) => {
            const isDragOver = dragOverCat === cat.id;
            const isSelected = selectedCategory === cat.id;
            const isEditing = editingCatId === cat.id;
            const isFavorite = Boolean(cat.is_favorite);
            const children = childrenMap[cat.id] || [];
            const hasChildren = children.length > 0;
            const isExpanded = expandedParents[cat.id] !== false; // Mặc định mở rộng

            if (isEditing) {
              return (
                <form
                  key={cat.id}
                  onSubmit={handleSaveEdit}
                  onClick={(e) => e.stopPropagation()}
                  className="cat-edit-inline"
                >
                  <input
                    type="text"
                    className="form-input"
                    value={editingCatName}
                    onChange={(e) => setEditingCatName(e.target.value)}
                    autoFocus
                    placeholder="Tên danh mục..."
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingCatId(null);
                    }}
                  />
                  <div className="cat-edit-row">
                    <select
                      className="form-select"
                      value={editingCatIcon}
                      onChange={(e) => setEditingCatIcon(e.target.value)}
                      style={{ flex: 1, padding: "3px 4px", fontSize: "11px" }}
                    >
                      <option value="folder">📁 Thư mục</option>
                      <option value="gamepad">🎮 Game</option>
                      <option value="heart">❤️ Tâm trạng</option>
                      <option value="music">🎵 Âm nhạc</option>
                      <option value="sparkles">✨ Viral / Động lực</option>
                      <option value="book">📚 Kiến thức</option>
                      <option value="tag">🏷️ Thẻ / Tag</option>
                      <option value="grid">▦ Series</option>
                    </select>

                    <select
                      className="form-select"
                      value={editingCatParentId}
                      onChange={(e) => setEditingCatParentId(e.target.value)}
                      style={{ flex: 1.2, padding: "3px 4px", fontSize: "10.5px" }}
                      title="Cấp bậc danh mục"
                    >
                      <option value="__none__">-- Mục chính --</option>
                      {rootCategories.filter((r) => r.id !== cat.id).map((r) => (
                        <option key={r.id} value={r.id}>↳ Con của: {r.name}</option>
                      ))}
                    </select>

                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      style={{ padding: "4px 8px" }}
                      title="Lưu đổi tên"
                    >
                      <Icon name="check" size={13} color="#fff" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: "4px 8px" }}
                      title="Hủy"
                      onClick={handleCancelEdit}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                </form>
              );
            }

            const isLockedConfig = Boolean(cat.is_locked);
            const isCatRemembered = localStorage.getItem(`remember_cat_${cat.id}`) === "true";
            const isCatUnlocked = Boolean(unlockedCategoryIds?.[cat.id]);
            const isUnlockedOrRemembered = isLockedConfig && (isCatRemembered || isCatUnlocked);

            return (
              <React.Fragment key={cat.id}>
                <div
                  className={`category-item ${isSelected ? "active" : ""} ${isDragOver ? "drag-over" : ""} ${isFavorite ? "is-favorite" : ""}`}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    if (currentView !== "vault") setCurrentView("vault");
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverCat(cat.id);
                  }}
                  onDragLeave={() => setDragOverCat(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverCat(null);
                    const videoId = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("videoId");
                    if (videoId) onDropOnCategory(videoId, cat.id);
                  }}
                  title={`${isFavorite ? "[⭐ Yêu thích] " : ""}${hasChildren ? `[Gồm ${children.length} mục con] ` : ""}Kéo thả video vào đây để chuyển sang: ${getCategoryDisplayName(cat)}`}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: isCollapsed ? 0 : "4px", minWidth: 0, flex: 1, justifyContent: isCollapsed ? "center" : "flex-start", overflow: "hidden" }}>
                    {/* Expand/Collapse Toggle Button for Parent */}
                    {hasChildren && !isCollapsed && (
                      <button
                        type="button"
                        className="cat-expand-btn"
                        onClick={(e) => toggleExpandParent(cat.id, e)}
                        title={isExpanded ? "Thu gọn danh mục con" : "Mở rộng danh mục con"}
                      >
                        <Icon name={isExpanded ? "chevronDown" : "chevronRight"} size={10} />
                      </button>
                    )}

                    <Icon
                      name={cat.icon || "folder"}
                      size={15}
                      color={isSelected ? "#8b5cf6" : (isFavorite ? "#f59e0b" : "var(--text-secondary)")}
                    />

                    {!isCollapsed && (
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontWeight: isSelected ? 600 : (isFavorite ? 600 : 500),
                          fontSize: "11px",
                          color: isSelected ? "#fff" : (isFavorite ? "var(--text-primary)" : "inherit"),
                          marginLeft: "4px"
                        }}
                        title={getCategoryDisplayName(cat)}
                      >
                        {getCategoryDisplayName(cat)}
                      </span>
                    )}

                    {!isCollapsed && isLockedConfig && (
                      isUnlockedOrRemembered ? (
                        <button
                          type="button"
                          className="cat-lock-toggle-btn unlocked"
                          title="Đang mở khóa / Bật ghi nhớ mật khẩu. Bấm để KHÓA LẠI NGAY & BỎ GHI NHỚ MẬT KHẨU"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onLockCategory) onLockCategory(cat.id);
                          }}
                        >
                          <Icon name="unlock" size={10} />
                        </button>
                      ) : (
                        <span
                          title="Danh mục này đã được khóa mật khẩu bảo mật"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            marginLeft: "2px",
                            flexShrink: 0
                          }}
                        >
                          <Icon name="lock" size={10} color="#a78bfa" />
                        </span>
                      )
                    )}
                  </div>

                  {isCollapsed && isFavorite && (
                    <span className="cat-collapsed-fav-dot" title="Danh mục yêu thích" />
                  )}

                  {!isCollapsed && (
                    <div className="cat-right-group">
                      {isSelected ? (
                        <div className="cat-actions" onClick={(e) => e.stopPropagation()}>
                          {/* Nút Thêm danh mục con trực tiếp */}
                          <button
                            type="button"
                            className="cat-action-btn add-sub-btn"
                            title={`Thêm danh mục con vào "${cat.name}"`}
                            onClick={(e) => handleOpenAddSub(cat.id, e)}
                            style={{ color: "var(--accent-secondary)" }}
                          >
                            <Icon name="plus" size={10} />
                          </button>

                          <button
                            type="button"
                            className={`cat-action-btn fav-btn ${isFavorite ? "active-fav" : ""}`}
                            title={isFavorite ? "Bỏ yêu thích" : "Đánh dấu yêu thích (đưa lên trên cùng)"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onToggleFavoriteCategory) onToggleFavoriteCategory(cat.id);
                            }}
                          >
                            <Icon
                              name="star"
                              size={10}
                              color={isFavorite ? "#f59e0b" : "currentColor"}
                              fill={isFavorite ? "#f59e0b" : "none"}
                            />
                          </button>

                          {isLockedConfig && isUnlockedOrRemembered && (
                            <button
                              type="button"
                              className="cat-action-btn quick-lock-btn"
                              title="Khóa danh mục & Bỏ ghi nhớ mật khẩu ngay"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onLockCategory) onLockCategory(cat.id);
                              }}
                            >
                              <Icon name="lock" size={10} color="#f43f5e" />
                            </button>
                          )}

                          <button
                            type="button"
                            className={`cat-action-btn lock-btn ${cat.is_locked ? "active-lock" : ""}`}
                            title={cat.is_locked ? "Cấu hình mật khẩu bảo mật" : "Đặt mật khẩu bảo mật danh mục này"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenCategoryLockModal) onOpenCategoryLockModal(cat);
                            }}
                          >
                            <Icon name={cat.is_locked ? "shield" : "lock"} size={10} color={cat.is_locked ? "#a78bfa" : undefined} />
                          </button>

                          <button
                            type="button"
                            className="cat-action-btn edit-btn"
                            title="Đổi tên / Chỉnh sửa"
                            onClick={(e) => handleStartEdit(cat, e)}
                          >
                            <Icon name="edit" size={10} />
                          </button>

                          <button
                            type="button"
                            className="cat-action-btn delete-btn"
                            title="Xóa danh mục này"
                            onClick={(e) => handleDeleteCat(cat, e)}
                          >
                            <Icon name="trash" size={10} />
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Nút thêm nhanh danh mục con khi hover */}
                          <button
                            type="button"
                            className="cat-star-hover-btn"
                            title={`Thêm danh mục con vào "${cat.name}"`}
                            onClick={(e) => handleOpenAddSub(cat.id, e)}
                            style={{ padding: "1px 2px", marginRight: "2px" }}
                          >
                            <Icon name="plus" size={10} color="var(--accent-secondary)" />
                          </button>

                          <button
                            type="button"
                            className={`cat-star-hover-btn ${isFavorite ? "is-fav" : ""}`}
                            title={isFavorite ? "Bỏ yêu thích" : "Đánh dấu yêu thích (đưa lên trên cùng)"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onToggleFavoriteCategory) onToggleFavoriteCategory(cat.id);
                            }}
                          >
                            <Icon
                              name="star"
                              size={11}
                              color={isFavorite ? "#f59e0b" : "var(--text-muted)"}
                              fill={isFavorite ? "#f59e0b" : "none"}
                            />
                          </button>
                          <span className="cat-badge" title={`Tổng: ${cat.count || 0} video (gồm cả các mục con)`}>
                            {cat.count || 0}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Render danh mục con nếu có và đang mở rộng */}
                {hasChildren && isExpanded && !isCollapsed && (
                  <div className="sub-categories-container">
                    {children.map((sub) => {
                      const isSubDragOver = dragOverCat === sub.id;
                      const isSubSelected = selectedCategory === sub.id;
                      const isSubEditing = editingCatId === sub.id;

                      if (isSubEditing) {
                        return (
                          <form
                            key={sub.id}
                            onSubmit={handleSaveEdit}
                            onClick={(e) => e.stopPropagation()}
                            className="cat-edit-inline"
                          >
                            <input
                              type="text"
                              className="form-input"
                              value={editingCatName}
                              onChange={(e) => setEditingCatName(e.target.value)}
                              autoFocus
                              placeholder="Tên danh mục con..."
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditingCatId(null);
                              }}
                            />
                            <div className="cat-edit-row">
                              <select
                                className="form-select"
                                value={editingCatIcon}
                                onChange={(e) => setEditingCatIcon(e.target.value)}
                                style={{ flex: 1, padding: "3px 4px", fontSize: "11px" }}
                              >
                                <option value="folder">📁 Thư mục</option>
                                <option value="gamepad">🎮 Game</option>
                                <option value="heart">❤️ Tâm trạng</option>
                                <option value="music">🎵 Nhạc</option>
                                <option value="sparkles">✨ Viral</option>
                                <option value="book">📚 Kiến thức</option>
                                <option value="tag">🏷️ Thẻ</option>
                              </select>

                              <select
                                className="form-select"
                                value={editingCatParentId}
                                onChange={(e) => setEditingCatParentId(e.target.value)}
                                style={{ flex: 1.2, padding: "3px 4px", fontSize: "10.5px" }}
                              >
                                <option value="__none__">-- Mục chính --</option>
                                {rootCategories.filter((r) => r.id !== sub.id).map((r) => (
                                  <option key={r.id} value={r.id}>↳ Con của: {r.name}</option>
                                ))}
                              </select>

                              <button type="submit" className="btn btn-primary btn-sm" style={{ padding: "4px 8px" }} title="Lưu">
                                <Icon name="check" size={13} color="#fff" />
                              </button>
                              <button type="button" className="btn btn-secondary btn-sm" style={{ padding: "4px 8px" }} title="Hủy" onClick={handleCancelEdit}>
                                <Icon name="x" size={13} />
                              </button>
                            </div>
                          </form>
                        );
                      }

                      return (
                        <div
                          key={sub.id}
                          className={`sub-category-item ${isSubSelected ? "active" : ""} ${isSubDragOver ? "drag-over" : ""}`}
                          onClick={() => {
                            setSelectedCategory(sub.id);
                            if (currentView !== "vault") setCurrentView("vault");
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverCat(sub.id);
                          }}
                          onDragLeave={() => setDragOverCat(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverCat(null);
                            const videoId = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("videoId");
                            if (videoId) onDropOnCategory(videoId, sub.id);
                          }}
                          title={`Kéo thả video vào đây để phân loại riêng vào: ${sub.name}`}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1, overflow: "hidden" }}>
                            <span className="sub-tree-branch">↳</span>
                            <Icon
                              name={sub.icon || "folder"}
                              size={13}
                              color={isSubSelected ? "#8b5cf6" : "var(--accent-cyan)"}
                            />
                            <span
                              className="sub-cat-name"
                              style={{
                                fontSize: "10.5px",
                                fontWeight: isSubSelected ? 600 : 500,
                                color: isSubSelected ? "#fff" : "inherit"
                              }}
                              title={sub.name}
                            >
                              {sub.name}
                            </span>
                          </div>

                          <div className="cat-right-group">
                            {isSubSelected ? (
                              <div className="cat-actions" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="cat-action-btn edit-btn"
                                  title="Chỉnh sửa danh mục con"
                                  onClick={(e) => handleStartEdit(sub, e)}
                                >
                                  <Icon name="edit" size={10} />
                                </button>
                                <button
                                  type="button"
                                  className="cat-action-btn delete-btn"
                                  title="Xóa danh mục con này"
                                  onClick={(e) => handleDeleteCat(sub, e)}
                                >
                                  <Icon name="trash" size={10} />
                                </button>
                              </div>
                            ) : (
                              <span className="cat-badge">{sub.count || 0}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Settings Footer */}
      <div className="sidebar-footer">
        <button
          type="button"
          className={`nav-item settings-footer-btn ${currentView === "settings" ? "active" : ""}`}
          onClick={() => setCurrentView("settings")}
          title="Cài Đặt Hệ Thống"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: isCollapsed ? 0 : "8px",
            justifyContent: isCollapsed ? "center" : "flex-start",
            padding: isCollapsed ? "8px 0" : "7px 10px",
            margin: 0,
            borderRadius: "var(--radius-sm)",
          }}
        >
          <Icon name="settings" size={16} color={currentView === "settings" ? "var(--accent-primary)" : "currentColor"} />
          {!isCollapsed && (
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, textAlign: "left" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: currentView === "settings" ? "#fff" : "var(--text-primary)" }}>
                Cài Đặt Hệ Thống
              </span>
              <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>
                Tùy chỉnh & Cấu hình
              </span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
