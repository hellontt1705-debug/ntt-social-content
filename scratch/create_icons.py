import os
from PIL import Image, ImageDraw

out_dir = r"e:\Agent-creator\social-content-os\extension\icons"
os.makedirs(out_dir, exist_ok=True)

sizes = [16, 32, 48, 128]

for size in sizes:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw circular gradient or glowing circle
    # Radius
    r = size // 2
    margin = max(1, size // 16)
    
    # Background circle with purple/violet tone
    for i in range(size):
        for j in range(size):
            dx = i - size / 2.0 + 0.5
            dy = j - size / 2.0 + 0.5
            dist = (dx*dx + dy*dy) ** 0.5
            max_r = size / 2.0 - margin
            if dist <= max_r:
                # Gradient from top-left (violet #8b5cf6) to bottom-right (fuchsia #ec4899)
                t = (i + j) / (2.0 * size)
                r_col = int(139 * (1 - t) + 236 * t)
                g_col = int(92 * (1 - t) + 72 * t)
                b_col = int(246 * (1 - t) + 153 * t)
                # Anti-aliasing at the border
                alpha = 255
                if dist > max_r - 1:
                    alpha = int(255 * (max_r - dist))
                img.putpixel((i, j), (r_col, g_col, b_col, alpha))
                
    # Center glyph: Download arrow / Play icon
    draw = ImageDraw.Draw(img)
    c = size // 2
    w = max(2, size // 4)
    # Down arrow
    # Vertical line / stem
    stem_w = max(2, size // 8)
    stem_top = c - size // 4
    stem_bot = c + size // 12
    draw.rectangle([c - stem_w // 2, stem_top, c + stem_w // 2, stem_bot], fill=(255, 255, 255, 255))
    
    # Arrow head
    head_size = max(3, size // 4)
    arrow_points = [
        (c - head_size, stem_bot),
        (c + head_size, stem_bot),
        (c, stem_bot + head_size)
    ]
    draw.polygon(arrow_points, fill=(255, 255, 255, 255))
    
    # Bottom tray/bar
    bar_w = max(4, int(size * 0.5))
    bar_h = max(2, size // 10)
    bar_y = stem_bot + head_size + max(1, size // 16)
    if bar_y + bar_h <= size - margin:
        draw.rectangle([c - bar_w // 2, bar_y, c + bar_w // 2, bar_y + bar_h], fill=(255, 255, 255, 230))
        
    img.save(os.path.join(out_dir, f"icon{size}.png"))
    print(f"Generated icon{size}.png")
