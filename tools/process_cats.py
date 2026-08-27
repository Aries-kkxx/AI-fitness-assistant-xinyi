from PIL import Image
from collections import deque
import os

CAT_DIR = 'E:/Sport/assets/cat'
SIZE = 512
AVATAR = 'cat-avatar.png'

def remove_bg_by_flood(im, white_thresh=35):
    """Remove border-connected near-white background. Black outline protects cat interior."""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = [[False] * h for _ in range(w)]

    def near_white(c):
        return (255 - c[0]) + (255 - c[1]) + (255 - c[2]) <= white_thresh

    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            c = px[x, y]
            if c[3] > 10 and near_white(c):
                q.append((x, y)); visited[x][y] = True
    for y in range(h):
        for x in (0, w - 1):
            c = px[x, y]
            if c[3] > 10 and near_white(c):
                q.append((x, y)); visited[x][y] = True

    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                c = px[nx, ny]
                if c[3] > 10 and near_white(c):
                    visited[nx][ny] = True
                    q.append((nx, ny))

    for x in range(w):
        for y in range(h):
            if visited[x][y]:
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, 0)
    return im

def keep_largest_component(im):
    """Create a fresh transparent image and copy only the largest opaque component into it."""
    src = im.convert('RGBA')
    w, h = src.size
    px = src.load()
    visited = [[False] * h for _ in range(w)]
    best = []

    for sx in range(w):
        for sy in range(h):
            if visited[sx][sy] or px[sx, sy][3] < 128:
                continue
            comp = []
            q = deque([(sx, sy)])
            visited[sx][sy] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny] and px[nx, ny][3] >= 128:
                        visited[nx][ny] = True
                        q.append((nx, ny))
            if len(comp) > len(best):
                best = comp

    out = Image.new('RGBA', src.size, (0, 0, 0, 0))
    out_px = out.load()
    for x, y in best:
        out_px[x, y] = px[x, y]
    return out

def zoom_to_fill(im, margin_frac=0.04):
    """Crop to the subject bounding box + small margin and resize to SIZE -> ~2x bigger."""
    bbox = im.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    bw, bh = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    margin = margin_frac * max(bw, bh)
    half = (max(bw, bh) / 2) + margin
    left = max(0, cx - half)
    top = max(0, cy - half)
    right = min(im.size[0], cx + half)
    bottom = min(im.size[1], cy + half)
    crop = im.crop((int(left), int(top), int(right), int(bottom)))
    return crop.resize((SIZE, SIZE), Image.LANCZOS)

def process(f):
    p = os.path.join(CAT_DIR, f)
    im = Image.open(p)
    im = remove_bg_by_flood(im)
    im = keep_largest_component(im)
    if f != AVATAR:
        im = zoom_to_fill(im)
    else:
        im = im.resize((SIZE, SIZE), Image.LANCZOS)
    # 统计透明像素（量化前，必须仍是 RGBA）
    alpha = im.getchannel('A')
    vals = list(alpha.getdata())
    trans = sum(1 for v in vals if v < 128)
    # 调色板量化：卡通图颜色极少，量化到 256 色可把单张从 ~300KB 压到 ~30KB，
    # 保持 512x512 与透明通道，从而把主包控制在微信 2MB 限制内。
    if im.mode == 'RGBA':
        im = im.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE)
    im.save(p, optimize=True, compress_level=9)
    print(f"{f:18s} done  transparent={trans} ({trans/len(vals):.0%})")

# Process all PNGs in the directory
for f in sorted(os.listdir(CAT_DIR)):
    if f.endswith('.png'):
        process(f)
