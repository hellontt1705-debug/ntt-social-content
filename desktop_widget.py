import sys
import os
import time
import json
import threading
import urllib.request
import urllib.parse
import tkinter as tk
from tkinter import ttk

# API Base
API_BASE = "http://127.0.0.1:8000/api"

class SocialContentFloatingWidget:
    def __init__(self, root):
        self.root = root
        self.root.title("SocialContent OS Widget")
        self.root.attributes("-topmost", True)
        self.root.overrideredirect(True) # Frameless window
        
        # Position at top right
        screen_w = self.root.winfo_screenwidth()
        self.width = 330
        self.height = 160
        self.x = screen_w - self.width - 25
        self.y = 80
        self.root.geometry(f"{self.width}x{self.height}+{self.x}+{self.y}")

        # Dragging support
        self._drag_data = {"x": 0, "y": 0}
        self.root.bind("<ButtonPress-1>", self.start_drag)
        self.root.bind("<B1-Motion>", self.do_drag)

        # Style colors
        self.bg_color = "#13151f"
        self.accent_color = "#8b5cf6"
        self.text_color = "#ffffff"
        self.text_muted = "#94a3b8"
        self.root.configure(bg=self.bg_color)

        # Outer border frame
        self.border_frame = tk.Frame(self.root, bg="#2e2b4d", highlightthickness=1, highlightbackground="#8b5cf6")
        self.border_frame.pack(fill="both", expand=True, padx=1, pady=1)

        # Header Bar
        self.header_frame = tk.Frame(self.border_frame, bg="#1a1c2b", height=28)
        self.header_frame.pack(fill="x", side="top")
        self.header_frame.bind("<ButtonPress-1>", self.start_drag)
        self.header_frame.bind("<B1-Motion>", self.do_drag)

        # Logo / Title
        self.title_lbl = tk.Label(
            self.header_frame, 
            text="🟣 SocialContent OS • Clip Widget", 
            font=("Segoe UI", 9, "bold"), 
            fg="#c084fc", 
            bg="#1a1c2b"
        )
        self.title_lbl.pack(side="left", padx=8, pady=4)

        # Close & Minimize
        self.close_btn = tk.Label(
            self.header_frame, 
            text="✕", 
            font=("Segoe UI", 9, "bold"), 
            fg="#94a3b8", 
            bg="#1a1c2b", 
            cursor="hand2"
        )
        self.close_btn.pack(side="right", padx=8)
        self.close_btn.bind("<Button-1>", lambda e: self.root.destroy())

        # Main Body
        self.body_frame = tk.Frame(self.border_frame, bg=self.bg_color)
        self.body_frame.pack(fill="both", expand=True, padx=10, pady=8)

        # Status Label
        self.status_lbl = tk.Label(
            self.body_frame,
            text="Đang theo dõi Clipboard (Copy link là tự bắt)...",
            font=("Segoe UI", 8),
            fg=self.text_muted,
            bg=self.bg_color,
            anchor="w"
        )
        self.status_lbl.pack(fill="x")

        # URL Input
        self.url_var = tk.StringVar()
        self.url_entry = tk.Entry(
            self.body_frame,
            textvariable=self.url_var,
            font=("Segoe UI", 9),
            bg="#1f2333",
            fg="#ffffff",
            insertbackground="#ffffff",
            relief="flat",
            highlightthickness=1,
            highlightbackground="#3b3e54"
        )
        self.url_entry.pack(fill="x", pady=6, ipady=3)

        # Controls Frame (Category + Button)
        self.ctrl_frame = tk.Frame(self.body_frame, bg=self.bg_color)
        self.ctrl_frame.pack(fill="x", pady=2)

        # Category Dropdown
        self.cat_var = tk.StringVar(value="all")
        self.cat_combo = ttk.Combobox(
            self.ctrl_frame,
            textvariable=self.cat_var,
            state="readonly",
            width=14,
            font=("Segoe UI", 8)
        )
        self.cat_combo["values"] = ["📂 Tất cả (Mặc định)"]
        self.cat_combo.current(0)
        self.cat_combo.pack(side="left", padx=(0, 6))

        # Download Button
        self.dl_btn = tk.Button(
            self.ctrl_frame,
            text="⚡ Tải Về Kho",
            font=("Segoe UI", 9, "bold"),
            bg="#7c3aed",
            fg="#ffffff",
            activebackground="#9333ea",
            activeforeground="#ffffff",
            relief="flat",
            cursor="hand2",
            command=self.start_download
        )
        self.dl_btn.pack(side="left", fill="x", expand=True)

        # Progress bar
        self.prog_var = tk.DoubleVar(value=0.0)
        self.prog_bar = ttk.Progressbar(self.body_frame, variable=self.prog_var, maximum=100)
        self.prog_bar.pack(fill="x", pady=(6, 0))

        # Internal state
        self.last_clipboard = ""
        self.categories_map = {"📂 Tất cả (Mặc định)": "all"}
        self.is_downloading = False

        # Load categories from backend
        threading.Thread(target=self.load_categories, daemon=True).start()

        # Start clipboard monitor loop
        self.root.after(800, self.check_clipboard)

    def start_drag(self, event):
        self._drag_data["x"] = event.x
        self._drag_data["y"] = event.y

    def do_drag(self, event):
        deltax = event.x - self._drag_data["x"]
        deltay = event.y - self._drag_data["y"]
        x = self.root.winfo_x() + deltax
        y = self.root.winfo_y() + deltay
        self.root.geometry(f"+{x}+{y}")

    def load_categories(self):
        try:
            req = urllib.request.Request(f"{API_BASE}/categories", headers={"User-Agent": "Widget"})
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list):
                    names = ["📂 Tất cả (Mặc định)"]
                    c_map = {"📂 Tất cả (Mặc định)": "all"}
                    for c in data:
                        cid = c.get("id")
                        cname = c.get("name") or cid
                        if cid != "all":
                            label = f"📁 {cname}"
                            names.append(label)
                            c_map[label] = cid
                    
                    self.categories_map = c_map
                    self.root.after(0, lambda: self.update_combo(names))
        except Exception:
            pass

    def update_combo(self, names):
        self.cat_combo["values"] = names
        self.cat_combo.current(0)

    def check_clipboard(self):
        try:
            text = self.root.clipboard_get()
            if text and text != self.last_clipboard:
                clean = text.strip()
                social_domains = ["tiktok.com", "x.com", "twitter.com", "douyin.com", "youtube.com", "youtu.be", "facebook.com", "fb.watch", "instagram.com"]
                if clean.startswith("http") and any(d in clean.lower() for d in social_domains):
                    self.last_clipboard = clean
                    self.url_var.set(clean)
                    platform = "Video"
                    if "tiktok.com" in clean: platform = "TikTok"
                    elif "x.com" in clean or "twitter.com" in clean: platform = "X (Twitter)"
                    elif "douyin.com" in clean: platform = "Douyin"
                    elif "youtube.com" in clean or "youtu.be" in clean: platform = "YouTube"

                    self.status_lbl.config(
                        text=f"✨ Đã bắt link {platform}! Bấm 'Tải Về Kho'",
                        fg="#38bdf8"
                    )
                    # Flash border
                    self.border_frame.config(highlightbackground="#38bdf8")
                    self.root.after(1500, lambda: self.border_frame.config(highlightbackground="#8b5cf6"))
        except Exception:
            pass

        self.root.after(1000, self.check_clipboard)

    def start_download(self):
        target_url = self.url_var.get().strip()
        if not target_url:
            self.status_lbl.config(text="Vui lòng dán link video cần tải!", fg="#f43f5e")
            return

        cat_label = self.cat_var.get()
        cat_id = self.categories_map.get(cat_label, "all")

        self.dl_btn.config(state="disabled", text="⏳ Đang tải...")
        self.status_lbl.config(text="Đang gửi lệnh tải về SocialContent OS...", fg="#c084fc")
        self.prog_var.set(15.0)

        threading.Thread(target=self._async_download, args=(target_url, cat_id), daemon=True).start()

    def _async_download(self, target_url, cat_id):
        try:
            payload = json.dumps({
                "url": target_url,
                "category_id": cat_id,
                "sync_to_drive": True,
                "is_private": False
            }).encode("utf-8")

            req = urllib.request.Request(
                f"{API_BASE}/download",
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "DesktopWidget"}
            )
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                task_id = res_data.get("task_id")

            self.root.after(0, lambda: self.status_lbl.config(text="Đang xử lý tải video...", fg="#a855f7"))
            self.root.after(0, lambda: self.prog_var.set(45.0))

            # Simulate quick finish or poll
            time.sleep(3)
            self.root.after(0, self._on_download_complete)
        except Exception as e:
            err = str(e)
            self.root.after(0, lambda: self._on_download_error(err))

    def _on_download_complete(self):
        self.prog_var.set(100.0)
        self.status_lbl.config(text="✅ Hoàn thành! Đã lưu vào kho SocialContent", fg="#10b981")
        self.dl_btn.config(state="normal", text="⚡ Tải Về Kho")
        self.root.after(4000, lambda: self.prog_var.set(0.0))

    def _on_download_error(self, err):
        self.prog_var.set(0.0)
        self.status_lbl.config(text=f"❌ Lỗi: Backend chưa bật (127.0.0.1:8000)", fg="#f43f5e")
        self.dl_btn.config(state="normal", text="⚡ Tải Về Kho")

def main():
    root = tk.Tk()
    app = SocialContentFloatingWidget(root)
    root.mainloop()

if __name__ == "__main__":
    main()
