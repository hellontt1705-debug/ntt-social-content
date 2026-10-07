// Extension Popup Logic
document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const popUrl = document.getElementById("popUrl");
  const popCat = document.getElementById("popCat");
  const popDrive = document.getElementById("popDrive");
  const popPrivate = document.getElementById("popPrivate");
  const popBtn = document.getElementById("popBtn");

  // Check Backend Status & Load Categories
  chrome.runtime.sendMessage({ action: "CHECK_BACKEND" }, (res) => {
    if (res && res.connected) {
      statusDot.className = "dot";
      statusText.textContent = "Backend Online (8000)";
      if (Array.isArray(res.categories)) {
        popCat.innerHTML = `<option value="all">📂 Tất cả video (Mặc định)</option>`;
        res.categories.forEach(cat => {
          if (cat.id !== "all") {
            const opt = document.createElement("option");
            opt.value = cat.id;
            opt.textContent = `${cat.name || cat.id}`;
            popCat.appendChild(opt);
          }
        });
      }
    } else {
      statusDot.className = "dot offline";
      statusText.textContent = "Backend Chưa Bật";
    }
  });

  // Auto fill active tab URL if it is a video/social site
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url) {
      const u = tabs[0].url;
      if (!u.startsWith("chrome://") && !u.startsWith("edge://")) {
        popUrl.value = u;
      }
    }
  });

  // Start Download
  popBtn.addEventListener("click", () => {
    const url = popUrl.value.trim();
    if (!url) {
      alert("Vui lòng dán liên kết video cần tải!");
      return;
    }

    popBtn.disabled = true;
    popBtn.textContent = "⏳ Đang gửi yêu cầu...";

    chrome.runtime.sendMessage({
      action: "START_DOWNLOAD",
      url: url,
      category_id: popCat.value,
      sync_to_drive: popDrive.checked,
      is_private: popPrivate.checked
    }, (res) => {
      popBtn.disabled = false;
      popBtn.textContent = "⚡ Tải Về Kho Ngay";
      if (res && res.success) {
        alert("✅ Đã thêm video vào hàng đợi tải xuống của SocialContent OS!");
        window.close();
      } else {
        alert("❌ Lỗi: " + (res?.error || "Không thể kết nối Backend. Hãy chạy run_app.bat"));
      }
    });
  });
});
