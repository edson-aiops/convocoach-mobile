from PIL import Image, ImageDraw, ImageFont
import os

# Create a simple icon: "CC" on a dark background with a subtle gradient
sizes = {
    'icon-192.png': 192,
    'icon-512.png': 512,
    'maskable-icon-512.png': 512,
    'apple-touch-icon.png': 180,
}

bg = '#0A0E1A'
accent = '#00D4AA'

for name, size in sizes.items():
    img = Image.new('RGB', (size, size), bg)
    draw = ImageDraw.Draw(img)
    padding = int(size * 0.1) if 'maskable' in name else int(size * 0.05)
    # Draw rounded rect background for the icon area
    r = size // 8
    draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=r,
        fill='#121826',
        outline=accent,
        width=max(2, size // 64)
    )
    # Draw "CC" text
    font_size = int(size * 0.45)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        try:
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            font = ImageFont.load_default()
    text = "CC"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) // 2
    y = (size - th) // 2 - int(size * 0.05)
    draw.text((x, y), text, font=font, fill=accent)
    img.save(os.path.join('icons', name))
    print(f"Generated icons/{name}")
