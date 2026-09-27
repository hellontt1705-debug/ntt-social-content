import React from "react";

/**
 * Phân cấp danh mục thành cây danh mục cha - con
 */
export function buildCategoryTree(categories) {
  if (!Array.isArray(categories)) {
    return { rootCategories: [], childrenMap: {}, allCategoriesMap: {} };
  }

  const allCategoriesMap = {};
  for (const cat of categories) {
    if (cat && cat.id) {
      allCategoriesMap[cat.id] = cat;
    }
  }

  const childrenMap = {};
  const rootCategories = [];

  // Thu thập children
  for (const cat of categories) {
    if (cat.id === "all") continue;
    if (cat.parent_id && allCategoriesMap[cat.parent_id]) {
      if (!childrenMap[cat.parent_id]) {
        childrenMap[cat.parent_id] = [];
      }
      childrenMap[cat.parent_id].push(cat);
    }
  }

  // Thu thập root (bao gồm các mục không có parent_id hoặc parent_id không tồn tại)
  for (const cat of categories) {
    if (cat.id === "all") continue;
    if (!cat.parent_id || !allCategoriesMap[cat.parent_id]) {
      rootCategories.push(cat);
    }
  }

  // Sắp xếp root categories: favorites trước, sau đó theo order_num / thời gian
  rootCategories.sort((a, b) => {
    const favA = a.is_favorite ? 1 : 0;
    const favB = b.is_favorite ? 1 : 0;
    if (favA !== favB) return favB - favA;
    if (favA === 1 && favB === 1) {
      const timeA = a.favorited_at || a.created_at || "";
      const timeB = b.favorited_at || b.created_at || "";
      if (timeA && timeB && timeA !== timeB) return timeA.localeCompare(timeB);
    }
    return (a.order_num || 0) - (b.order_num || 0);
  });

  // Sắp xếp các danh mục con
  for (const pId in childrenMap) {
    childrenMap[pId].sort((a, b) => {
      return (a.order_num || 0) - (b.order_num || 0) || (a.name || "").localeCompare(b.name || "");
    });
  }

  return { rootCategories, childrenMap, allCategoriesMap };
}

/**
 * Render danh sách <option> có thụt đầu dòng (indent) theo cấp bậc cha - con
 */
export function renderCategorySelectOptions(categories, options = {}) {
  const {
    includeAll = false,
    allLabel = "Tất cả Video (Chưa phân loại)",
    disabledId = null,
  } = options;

  const { rootCategories, childrenMap } = buildCategoryTree(categories);
  const elements = [];

  if (includeAll) {
    elements.push(
      <option key="all" value="all">
        📁 {allLabel}
      </option>
    );
  }

  for (const parent of rootCategories) {
    const isParentDisabled = disabledId && parent.id === disabledId;
    const children = childrenMap[parent.id] || [];

    elements.push(
      <option
        key={parent.id}
        value={parent.id}
        disabled={isParentDisabled}
        style={{ fontWeight: children.length > 0 ? "600" : "normal" }}
      >
        📁 {parent.name} {parent.is_locked ? "🔒" : ""} {children.length > 0 ? `(${children.length} mục con)` : ""}
      </option>
    );

    for (const child of children) {
      const isChildDisabled = isParentDisabled || (disabledId && child.id === disabledId);
      elements.push(
        <option
          key={child.id}
          value={child.id}
          disabled={isChildDisabled}
        >
          &nbsp;&nbsp;&nbsp;&nbsp;↳ 📂 {child.name} {child.is_locked ? "🔒" : ""}
        </option>
      );
    }
  }

  return elements;
}
