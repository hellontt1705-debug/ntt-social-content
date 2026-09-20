/**
 * =========================================================================
 * GOOGLE APPS SCRIPT WEB APP - SOCIAL CONTENT OS (PHIÊN BẢN HOÀN CHỈNH)
 * =========================================================================
 * Đầy đủ tính năng:
 * 1. QUÉT THƯ MỤC & ĐỌC FILE (.txt, .csv, Google Docs) TRÍCH XUẤT LINK VIDEO
 * 2. TẢI VIDEO LÊN DRIVE & TỰ ĐỘNG LƯU METADATA JSON
 * 3. TỰ ĐỘNG ĐỒNG BỘ & CẬP NHẬT DATABASE SQLITE
 * 4. XÓA FILE TRIỆT ĐỂ (KHI XÓA TRONG THÙNG RÁC)
 * 5. KIỂM TRA KẾT NỐI (PING / TEST)
 * =========================================================================
 */

var DEFAULT_FOLDER_ID = "1rCzVtTIKWI_QeU8LWMefuZ0A9NYvpVeS";

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    status: "active",
    message: "Google Apps Script SocialContent OS đang hoạt động hoàn hảo!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJSON({
        success: false,
        error: "Thiếu dữ liệu postData"
      });
    }

    var data = JSON.parse(e.postData.contents);
    var action = data.action || "upload";
    var folderId = data.folder_id || DEFAULT_FOLDER_ID;

    // ===================================================
    // 1. QUÉT THƯ MỤC HOẶC FILE DRIVE ĐỂ LẤY LINK VIDEO
    // ===================================================
    if (action === "scan_drive") {
      return handleScanDrive(data);
    }

    // ===================================================
    // 2. ĐỌC NỘI DUNG TẬP TIN VĂN BẢN TRÊN DRIVE
    // ===================================================
    if (action === "read_file") {
      return handleReadFile(data);
    }

    // ===================================================
    // 3. KIỂM TRA KẾT NỐI (PING / TEST)
    // ===================================================
    if (action === "ping" || action === "test") {
      var testFolder = DriveApp.getFolderById(folderId);
      return responseJSON({
        success: true,
        folder_name: testFolder.getName(),
        message: "Kết nối Google Apps Script thành công!"
      });
    }

    // ===================================================
    // 4. XÓA FILE TRÊN GOOGLE DRIVE (KHI XÓA TRONG THÙNG RÁC)
    // ===================================================
    if (action === "delete_file") {
      return handleDeleteFile(data, folderId);
    }

    // ===================================================
    // 5. SAO LƯU DATABASE SQLITE (social_content.db)
    // ===================================================
    if (action === "backup_db") {
      return handleBackupDb(data, folderId);
    }

    // ===================================================
    // 6. MẶC ĐỊNH: TẢI LÊN VIDEO HOẶC FILE
    // ===================================================
    return handleUploadVideo(data, folderId);

  } catch (err) {
    return responseJSON({
      success: false,
      error: "Lỗi xử lý Apps Script: " + (err.message || err.toString())
    });
  }
}

// =========================================================================
// CÁC HÀM XỬ LÝ CHI TIẾT
// =========================================================================

/**
 * Quét thư mục hoặc file văn bản để trích xuất link video mạng xã hội
 */
function handleScanDrive(data) {
  var targetId = data.target_id || DEFAULT_FOLDER_ID;
  var isFolder = data.is_folder !== false;
  var filesFound = [];
  var allUrls = [];
  var folderName = "Google Drive";

  if (isFolder) {
    var folder = DriveApp.getFolderById(targetId);
    folderName = folder.getName();
    var files = folder.getFiles();

    while (files.hasNext()) {
      var file = files.next();
      var fileName = file.getName();
      var mimeType = file.getMimeType();
      var fileId = file.getId();
      var urlsInFile = [];

      // Đọc file văn bản (.txt, .csv, json, docx, Google Docs...)
      if (isTextFile(fileName, mimeType)) {
        var content = "";
        try {
          if (mimeType === "application/vnd.google-apps.document") {
            content = DocumentApp.openById(fileId).getBody().getText();
          } else {
            content = file.getBlob().getDataAsString("UTF-8");
          }
          urlsInFile = extractUrlsFromText(content);
        } catch (errReadFile) {}
      } else if (isVideoFile(fileName, mimeType)) {
        urlsInFile.push(file.getUrl() || ("https://drive.google.com/file/d/" + fileId + "/view"));
      }

      if (urlsInFile.length > 0 || isTextFile(fileName, mimeType)) {
        filesFound.push({
          id: fileId,
          name: fileName,
          mime_type: mimeType,
          urls_count: urlsInFile.length
        });
        allUrls = allUrls.concat(urlsInFile);
      }
    }
  } else {
    // Quét 1 file cụ thể
    var file = DriveApp.getFileById(targetId);
    var fileName = file.getName();
    var mimeType = file.getMimeType();
    folderName = fileName;
    var urlsInFile = [];

    if (isTextFile(fileName, mimeType)) {
      var content = "";
      if (mimeType === "application/vnd.google-apps.document") {
        content = DocumentApp.openById(targetId).getBody().getText();
      } else {
        content = file.getBlob().getDataAsString("UTF-8");
      }
      urlsInFile = extractUrlsFromText(content);
    } else if (isVideoFile(fileName, mimeType)) {
      urlsInFile.push(file.getUrl() || ("https://drive.google.com/file/d/" + targetId + "/view"));
    }

    filesFound.push({
      id: targetId,
      name: fileName,
      mime_type: mimeType,
      urls_count: urlsInFile.length
    });
    allUrls = allUrls.concat(urlsInFile);
  }

  // Lọc trùng link trong quá trình quét
  var uniqueUrls = [];
  var seen = {};
  for (var i = 0; i < allUrls.length; i++) {
    var u = allUrls[i].trim();
    if (u && !seen[u]) {
      seen[u] = true;
      uniqueUrls.push(u);
    }
  }

  return responseJSON({
    success: true,
    target_id: targetId,
    folder_name: folderName,
    files_scanned: filesFound,
    urls: uniqueUrls,
    total_urls: uniqueUrls.length
  });
}

/**
 * Đọc nội dung 1 file Drive
 */
function handleReadFile(data) {
  var fileId = data.file_id;
  var file = DriveApp.getFileById(fileId);
  var mimeType = file.getMimeType();
  var content = "";
  if (mimeType === "application/vnd.google-apps.document") {
    content = DocumentApp.openById(fileId).getBody().getText();
  } else {
    content = file.getBlob().getDataAsString("UTF-8");
  }
  var urls = extractUrlsFromText(content);
  return responseJSON({
    success: true,
    file_id: fileId,
    name: file.getName(),
    urls: urls
  });
}

/**
 * Xóa file và metadata tương ứng trên Drive
 */
function handleDeleteFile(data, folderId) {
  var deletedFiles = [];
  if (data.file_id) {
    try {
      var targetFile = DriveApp.getFileById(data.file_id);
      if (targetFile) {
        deletedFiles.push(targetFile.getName());
        targetFile.setTrashed(true);
      }
    } catch (errId) {}
  }

  var folder = DriveApp.getFolderById(folderId);
  var targetKeywords = [];
  if (data.video_title && data.video_title.trim().length > 3) targetKeywords.push(data.video_title.trim());
  if (data.raw_filename) targetKeywords.push(data.raw_filename.replace(/\.[^/.]+$/, ""));
  if (data.filename) targetKeywords.push(data.filename.replace(/\.[^/.]+$/, ""));

  if (targetKeywords.length > 0) {
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      var name = f.getName();
      for (var i = 0; i < targetKeywords.length; i++) {
        if (name.indexOf(targetKeywords[i]) !== -1) {
          if (deletedFiles.indexOf(name) === -1) {
            deletedFiles.push(name);
            f.setTrashed(true);
          }
          break;
        }
      }
    }
  }

  return responseJSON({
    success: true,
    action: "delete_file",
    deleted_count: deletedFiles.length,
    deleted_files: deletedFiles,
    message: "Đã xóa file trên Google Drive thành công!"
  });
}

/**
 * Sao lưu Database SQLite (social_content.db)
 */
function handleBackupDb(data, folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var filename = data.filename || "social_content.db";
  var dbBase64 = data.db_base64;

  // Xóa bản cũ để luôn giữ 1 bản mới nhất
  var oldDbs = folder.getFilesByName(filename);
  while (oldDbs.hasNext()) {
    oldDbs.next().setTrashed(true);
  }

  var decoded = Utilities.base64Decode(dbBase64);
  var blob = Utilities.newBlob(decoded, "application/x-sqlite3", filename);
  var backupFile = folder.createFile(blob);

  return responseJSON({
    success: true,
    file_id: backupFile.getId(),
    filename: filename,
    message: "Đã sao lưu Database lên Google Drive thành công!"
  });
}

/**
 * Tải file video lên Google Drive
 */
function handleUploadVideo(data, folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var filename = data.filename || "upload.dat";
  var mimeType = data.mime_type || "video/mp4";
  var fileBase64 = data.file_base64;

  if (!fileBase64) {
    return responseJSON({ success: false, error: "Thiếu dữ liệu file_base64 để upload" });
  }

  // Nếu là database
  if (filename === "social_content.db" || filename.endsWith(".db")) {
    var oldDbs = folder.getFilesByName(filename);
    while (oldDbs.hasNext()) {
      oldDbs.next().setTrashed(true);
    }
  } else {
    // Nếu là video: Bỏ qua nếu đã có file trùng tên
    var existingFiles = folder.getFilesByName(filename);
    if (existingFiles.hasNext()) {
      var existingFile = existingFiles.next();
      return responseJSON({
        success: true,
        drive_file_id: existingFile.getId(),
        drive_web_link: existingFile.getUrl(),
        already_exists: true,
        message: "File đã có trên Drive, bỏ qua không tải lặp lại!"
      });
    }
  }

  var decoded = Utilities.base64Decode(fileBase64);
  var blob = Utilities.newBlob(decoded, mimeType, filename);
  var createdFile = folder.createFile(blob);

  // Lưu file metadata JSON nếu có
  if (data.metadata) {
    var metaName = filename.replace(/\.[^/.]+$/, "") + "_metadata.json";
    var oldMetas = folder.getFilesByName(metaName);
    while (oldMetas.hasNext()) {
      oldMetas.next().setTrashed(true);
    }
    var metaBlob = Utilities.newBlob(
      JSON.stringify(data.metadata, null, 2),
      "application/json",
      metaName
    );
    folder.createFile(metaBlob);
  }

  return responseJSON({
    success: true,
    drive_file_id: createdFile.getId(),
    drive_web_link: createdFile.getUrl(),
    filename: filename,
    message: "Tải lên Google Drive thành công!"
  });
}

// =========================================================================
// TIỆN ÍCH HỖ TRỢ
// =========================================================================

function isTextFile(name, mime) {
  var n = (name || "").toLowerCase();
  var m = (mime || "").toLowerCase();
  return m.indexOf("text") !== -1 ||
         m === "application/vnd.google-apps.document" ||
         n.indexOf(".txt") !== -1 ||
         n.indexOf(".csv") !== -1 ||
         n.indexOf(".json") !== -1 ||
         n.indexOf(".md") !== -1;
}

function isVideoFile(name, mime) {
  var n = (name || "").toLowerCase();
  var m = (mime || "").toLowerCase();
  return m.indexOf("video") !== -1 ||
         n.endsWith(".mp4") || n.endsWith(".mov") || n.endsWith(".mkv") || n.endsWith(".webm");
}

function extractUrlsFromText(text) {
  if (!text) return [];
  var regex = /https?:\/\/[^\s<>"'\]\[\}]+/g;
  var matches = text.match(regex) || [];
  var cleanList = [];
  for (var i = 0; i < matches.length; i++) {
    var u = matches[i].replace(/[.,;!?'")]+$/, "");
    if (u.indexOf(".") !== -1) {
      cleanList.push(u);
    }
  }
  return cleanList;
}

function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
