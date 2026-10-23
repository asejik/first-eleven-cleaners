"""VAN-01 QR code: vector SVG + PDF and a 4000 px PNG, with the crest in the middle and plain."""
import base64, io, os, sys, zlib
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw

URL = 'https://www.firstelevencleaners.com/van?via=qr'
NAVY = (0x0B, 0x1F, 0x3A)
QUIET = 4
CREST_BOX = 0.24      # white box behind the crest, as a share of the code's width (without quiet zone)
out_dir, crest_path = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)

qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, border=0)
qr.add_data(URL)
qr.make(fit=True)
m = qr.get_matrix()
n = len(m)
total = n + 2 * QUIET
print('version', qr.version, 'modules', n)

# Crest box in module units, centred, odd size so it sits on the grid
box = int(round(n * CREST_BOX))
box += (box + n) % 2
b0 = (n - box) // 2
def in_box(r, c):
    return b0 <= r < b0 + box and b0 <= c < b0 + box

crest = Image.open(crest_path).convert('RGBA')
# Crop to the drawn crest: opaque and not white
px = crest.load()
mask = Image.new('L', crest.size, 0)
mp = mask.load()
for y in range(crest.height):
    for x in range(crest.width):
        r, g, b, a = px[x, y]
        if a > 20 and min(r, g, b) < 235:
            mp[x, y] = 255
crest = crest.crop(mask.getbbox())

def crest_on_white(px):
    """The crest fitted inside a px square on white (flattened, for the PDF's JPEG)."""
    tile = Image.new('RGB', (px, px), 'white')
    pad = int(px * 0.08)
    room = px - 2 * pad
    k = min(room / crest.width, room / crest.height)
    c = crest.resize((round(crest.width * k), round(crest.height * k)), Image.LANCZOS)
    tile.paste(c, ((px - c.width) // 2, (px - c.height) // 2), c)
    return tile

def modules(with_crest):
    for r in range(n):
        for c in range(n):
            if m[r][c] and not (with_crest and in_box(r, c)):
                yield r, c

def write_svg(path, with_crest):
    navy = '#%02X%02X%02X' % NAVY
    d = ''.join(f'M{c + QUIET} {r + QUIET}h1v1h-1z' for r, c in modules(with_crest))
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {total} {total}" width="12in" height="12in" shape-rendering="crispEdges">',
        f'<title>First Eleven Cleaners VAN-01: {URL}</title>',
        f'<rect width="{total}" height="{total}" fill="#FFFFFF"/>',
        f'<path fill="{navy}" d="{d}"/>',
    ]
    if with_crest:
        buf = io.BytesIO()
        tile = crest_on_white(1200)
        tile.save(buf, 'PNG', optimize=True)
        href = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
        parts.append(f'<rect x="{b0 + QUIET}" y="{b0 + QUIET}" width="{box}" height="{box}" fill="#FFFFFF"/>')
        parts.append(f'<image x="{b0 + QUIET}" y="{b0 + QUIET}" width="{box}" height="{box}" xlink:href="{href}" href="{href}" preserveAspectRatio="xMidYMid meet"/>')
    parts.append('</svg>')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(parts))

def write_png(path, with_crest, px=4000):
    scale = px / total
    img = Image.new('RGB', (px, px), 'white')
    dr = ImageDraw.Draw(img)
    for r, c in modules(with_crest):
        x0, y0 = round((c + QUIET) * scale), round((r + QUIET) * scale)
        x1, y1 = round((c + QUIET + 1) * scale), round((r + QUIET + 1) * scale)
        dr.rectangle([x0, y0, x1 - 1, y1 - 1], fill=NAVY)
    if with_crest:
        x0, x1 = round((b0 + QUIET) * scale), round((b0 + QUIET + box) * scale)
        img.paste(crest_on_white(x1 - x0), (x0, x0))
    img.save(path, 'PNG', dpi=(300, 300), optimize=True)

def write_pdf(path, with_crest, size_in=12):
    """A one-page vector PDF (modules as filled rectangles), the crest as a JPEG."""
    pt = size_in * 72
    u = pt / total
    navy = ' '.join(f'{v / 255:.4f}' for v in NAVY)
    ops = [f'1 1 1 rg 0 0 {pt:.2f} {pt:.2f} re f', f'{navy} rg']
    for r, c in modules(with_crest):
        x = (c + QUIET) * u
        y = pt - (r + QUIET + 1) * u
        ops.append(f'{x:.3f} {y:.3f} {u:.3f} {u:.3f} re')
    ops.append('f')
    objs = []
    jpg = None
    if with_crest:
        x = (b0 + QUIET) * u
        y = pt - (b0 + QUIET + box) * u
        s = box * u
        ops.append(f'1 1 1 rg {x:.3f} {y:.3f} {s:.3f} {s:.3f} re f')
        ops.append(f'q {s:.3f} 0 0 {s:.3f} {x:.3f} {y:.3f} cm /Im1 Do Q')
        buf = io.BytesIO()
        crest_on_white(1200).save(buf, 'JPEG', quality=95, subsampling=0)
        jpg = buf.getvalue()
    content = zlib.compress('\n'.join(ops).encode())
    objs.append(b'<< /Type /Catalog /Pages 2 0 R >>')
    objs.append(b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
    res = b'<< /XObject << /Im1 5 0 R >> >>' if jpg else b'<< >>'
    objs.append(b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Resources %s /Contents 4 0 R >>' % (pt, pt, res))
    objs.append(b'<< /Length %d /Filter /FlateDecode >>\nstream\n' % len(content) + content + b'\nendstream')
    if jpg:
        objs.append(b'<< /Type /XObject /Subtype /Image /Width 1200 /Height 1200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n' % len(jpg) + jpg + b'\nendstream')
    out = io.BytesIO()
    out.write(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(out.tell())
        out.write(b'%d 0 obj\n' % i + o + b'\nendobj\n')
    xref = out.tell()
    out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1))
    for off in offsets:
        out.write(b'%010d 00000 n \n' % off)
    out.write(b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, xref))
    with open(path, 'wb') as f:
        f.write(out.getvalue())

for with_crest, name in [(True, 'VAN-01-QR-crest'), (False, 'VAN-01-QR-plain')]:
    write_svg(os.path.join(out_dir, name + '.svg'), with_crest)
    write_png(os.path.join(out_dir, name + '.png'), with_crest)
    write_pdf(os.path.join(out_dir, name + '.pdf'), with_crest)
print('crest box', box, 'of', n, 'modules =', round(100 * box * box / (n * n), 1), '% of the area')
