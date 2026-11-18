"""Draws simple, clean device pictures for the presentation data (no internet needed).
Writes backend/uploads/public/demo/<category-slug>-<1..3>.jpg. Run:  python backend/scripts/make_demo_photos.py
Then:  cd backend && npm run seed:photos
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'uploads', 'public', 'demo')
os.makedirs(OUT, exist_ok=True)
W, H = 800, 600

# (background top, background bottom, device colour) x 3 looks per category
LOOKS = [((226, 244, 232), (190, 226, 205), (55, 65, 81)), ((232, 238, 252), (200, 212, 240), (31, 41, 55)), ((252, 241, 224), (240, 221, 186), (75, 85, 99))]
SCREEN = (24, 36, 48)
GLOW = (110, 200, 150)


def gradient(top, bottom):
    img = Image.new('RGB', (W, H), top)
    px = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        px.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img


def shadow(img, box, blur=18):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, radius=24, fill=(0, 0, 0, 70))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    img.paste(layer, (0, 0), layer)


def rr(d, box, r, fill, outline=None, width=3):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def screen_content(d, box, accent):
    x0, y0, x1, y1 = box
    d.rectangle(box, fill=SCREEN)
    d.polygon([(x0, y1), (x0 + (x1 - x0) * 0.55, y0), (x0 + (x1 - x0) * 0.8, y0), (x0 + (x1 - x0) * 0.25, y1)], fill=tuple(int(c * 0.35 + 20) for c in accent))
    for i in range(3):
        d.rounded_rectangle((x0 + 24, y0 + 24 + i * 22, x0 + 24 + (110 - i * 22), y0 + 36 + i * 22), radius=5, fill=accent)


def laptop(d, c, a):
    rr(d, (170, 130, 630, 400), 22, c)
    screen_content(d, (190, 150, 610, 380), a)
    d.polygon([(110, 410), (690, 410), (730, 470), (70, 470)], fill=tuple(min(255, v + 30) for v in c))
    rr(d, (330, 478, 470, 490), 6, tuple(min(255, v + 60) for v in c))


def desktop(d, c, a):
    rr(d, (150, 90, 520, 360), 20, c)
    screen_content(d, (168, 108, 502, 342), a)
    rr(d, (300, 365, 370, 420), 6, c)
    rr(d, (240, 420, 430, 440), 10, c)
    rr(d, (570, 160, 700, 440), 14, tuple(min(255, v + 20) for v in c))
    d.ellipse((622, 190, 648, 216), fill=a)
    rr(d, (590, 300, 680, 316), 6, tuple(min(255, v + 70) for v in c))
    rr(d, (590, 330, 680, 346), 6, tuple(min(255, v + 70) for v in c))


def monitor(d, c, a):
    rr(d, (130, 100, 670, 390), 18, c)
    screen_content(d, (150, 120, 650, 370), a)
    d.polygon([(370, 392), (430, 392), (450, 460), (350, 460)], fill=c)
    rr(d, (270, 460, 530, 482), 11, c)


def television(d, c, a):
    rr(d, (90, 110, 710, 430), 16, c)
    screen_content(d, (110, 130, 690, 410), a)
    d.polygon([(250, 430), (290, 430), (270, 475), (240, 475)], fill=c)
    d.polygon([(510, 430), (550, 430), (560, 475), (530, 475)], fill=c)


def phone(d, c, a):
    rr(d, (290, 60, 510, 540), 40, c)
    screen_content(d, (306, 100, 494, 500), a)
    rr(d, (370, 76, 430, 88), 6, tuple(min(255, v + 60) for v in c))
    d.ellipse((388, 506, 412, 530), outline=tuple(min(255, v + 80) for v in c), width=3)


def tablet(d, c, a):
    rr(d, (150, 90, 650, 510), 34, c)
    screen_content(d, (180, 120, 620, 480), a)
    d.ellipse((392, 98, 408, 114), fill=tuple(min(255, v + 80) for v in c))


def keyboard(d, c, a):
    rr(d, (90, 210, 710, 400), 22, c)
    for row in range(4):
        for col in range(12 if row < 3 else 7):
            x = 112 + col * 49 + (0 if row < 3 else 120)
            y = 228 + row * 40
            w = 41 if row < 3 else (41 if col != 3 else 150)
            rr(d, (x, y, x + w, y + 32), 6, tuple(min(255, v + 75) for v in c))
    rr(d, (560, 440, 640, 520), 36, c)
    d.line([(600, 440), (600, 472)], fill=a, width=3)


def mouse(d, c, a):
    rr(d, (320, 150, 480, 460), 70, c)
    d.line([(400, 150), (400, 280)], fill=a, width=4)
    d.line([(320, 290), (480, 290)], fill=a, width=4)


def printer(d, c, a):
    rr(d, (130, 220, 670, 430), 24, c)
    rr(d, (210, 120, 590, 240), 12, tuple(min(255, v + 90) for v in c))
    rr(d, (230, 380, 570, 480), 8, (250, 250, 250), outline=(120, 120, 120))
    for i in range(3):
        d.line([(260, 410 + i * 22), (540, 410 + i * 22)], fill=(170, 170, 170), width=3)
    d.ellipse((600, 255, 624, 279), fill=a)


def charger(d, c, a):
    rr(d, (300, 170, 500, 330), 22, c)
    rr(d, (340, 100, 370, 175), 5, (190, 190, 190))
    rr(d, (430, 100, 460, 175), 5, (190, 190, 190))
    d.line([(400, 330), (400, 400), (560, 460), (640, 440)], fill=c, width=14)
    rr(d, (630, 420, 700, 462), 8, c)


def battery(d, c, a):
    rr(d, (200, 190, 600, 410), 26, c)
    rr(d, (600, 255, 640, 345), 8, c)
    for i in range(3):
        rr(d, (228 + i * 125, 218, 228 + i * 125 + 105, 382), 12, a)


def cables(d, c, a):
    for k, y in enumerate((170, 270, 370)):
        d.line([(120, y), (260, y - 40), (420, y + 40), (560, y - 20), (680, y)], fill=tuple(int(v + k * 30) for v in c), width=14, joint='curve')
        rr(d, (90, y - 22, 130, y + 22), 6, a)
        rr(d, (670, y - 22, 710, y + 22), 6, a)


def board(d, c, a):
    rr(d, (150, 110, 650, 490), 14, (30, 110, 70))
    for i in range(6):
        for j in range(4):
            rr(d, (190 + i * 74, 150 + j * 80, 190 + i * 74 + 56, 150 + j * 80 + 54), 5, (20, 60, 40), outline=(190, 170, 90), width=2)
    rr(d, (260, 210, 400, 290), 8, (25, 25, 30))
    d.line([(190, 440), (610, 440)], fill=(190, 170, 90), width=4)


def components(d, c, a):
    rr(d, (170, 150, 630, 450), 16, c)
    d.ellipse((230, 200, 420, 390), fill=(40, 48, 58), outline=a, width=5)
    for ang in range(0, 360, 60):
        d.pieslice((250, 220, 400, 370), ang, ang + 30, fill=a)
    rr(d, (460, 200, 600, 400), 10, (60, 70, 82))
    for i in range(6):
        d.line([(470, 215 + i * 28), (590, 215 + i * 28)], fill=a, width=3)


def other(d, c, a):
    rr(d, (210, 170, 590, 430), 30, c)
    d.ellipse((350, 260, 450, 340), outline=a, width=8)
    rr(d, (240, 195, 330, 215), 8, tuple(min(255, v + 70) for v in c))


DRAW = {
    'laptop': laptop, 'desktop-computer': desktop, 'smartphone': phone, 'tablet': tablet, 'monitor': monitor, 'television': television,
    'keyboard': keyboard, 'mouse': mouse, 'printer': printer, 'charger': charger, 'battery': battery, 'electronic-accessories': cables,
    'circuit-boards': board, 'computer-components': components, 'other-electronic-devices': other,
}

for slug, fn in DRAW.items():
    for n, (top, bottom, colour) in enumerate(LOOKS, start=1):
        img = gradient(top, bottom)
        shadow(img, (120, 430, 700, 520), 22)
        d = ImageDraw.Draw(img)
        fn(d, colour, GLOW if n != 2 else (120, 160, 235))
        img = img.filter(ImageFilter.GaussianBlur(0.4))
        img.save(os.path.join(OUT, f'{slug}-{n}.jpg'), quality=88)
print('wrote', len(DRAW) * len(LOOKS), 'pictures to', os.path.abspath(OUT))
