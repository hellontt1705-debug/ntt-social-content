FROM python:3.11-slim

# Cài đặt ffmpeg (bắt buộc để yt-dlp ghép audio/video) và curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Tạo user không phải root (theo chuẩn Hugging Face Spaces)
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

# Copy và cài đặt thư viện
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ mã nguồn backend
COPY --chown=user:user . .

# Đảm bảo các thư mục downloads và db có quyền ghi
RUN mkdir -p /app/downloads/thumbnails /app/downloads/prompts

# Cổng mặc định của Hugging Face Spaces là 7860
EXPOSE 7860

# Khởi chạy FastAPI
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
