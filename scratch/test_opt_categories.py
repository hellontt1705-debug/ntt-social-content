import time, sqlite3, json

conn = sqlite3.connect('backend/social_content.db')
conn.row_factory = sqlite3.Row

t0 = time.time()

# 1. Fetch categories
rows = conn.execute("SELECT id, name, icon, color, order_num, created_at, COALESCE(is_locked, 0) as is_locked, COALESCE(password_hint, '') as hint, COALESCE(is_favorite, 0) as is_favorite, COALESCE(favorited_at, '') as favorited_at, parent_id FROM categories ORDER BY CASE WHEN id = 'all' THEN 0 ELSE 1 END ASC, COALESCE(is_favorite, 0) DESC, order_num ASC, created_at ASC").fetchall()
categories = [dict(r) for r in rows]

# 2. Get counts in 1 single query
count_rows = conn.execute("SELECT category_id, COUNT(*) as cnt FROM videos WHERE (status IS NULL OR status != 'trashed') GROUP BY category_id").fetchall()
counts_by_cat = {r["category_id"]: r["cnt"] for r in count_rows}

# 3. Build parent-children map
children_map = {}
valid_cat_ids = set()
for c in categories:
    cid = c["id"]
    valid_cat_ids.add(cid)
    pid = c.get("parent_id")
    if pid:
        children_map.setdefault(pid, []).append(cid)

# Count uncategorized for 'all'
uncategorized = 0
for cid, cnt in counts_by_cat.items():
    if not cid or cid in ['all', 'default', ''] or cid not in valid_cat_ids:
        uncategorized += cnt

for c in categories:
    cid = c["id"]
    if cid == "all":
        c["count"] = uncategorized
        c["direct_count"] = uncategorized
    else:
        direct = counts_by_cat.get(cid, 0)
        c["direct_count"] = direct
        # Subcategories
        sub_cnt = sum(counts_by_cat.get(sub_id, 0) for sub_id in children_map.get(cid, []))
        c["count"] = direct + sub_cnt

t1 = time.time()
print(f"Optimized category count time: {(t1 - t0) * 1000:.2f} ms")
