"""Decode the VAN-01 QR PNGs under conditions like a phone camera: small, blurred, tilted, dim, smudged."""
import sys
import cv2
import numpy as np

URL = 'https://www.firstelevencleaners.com/van?via=qr'
det = cv2.QRCodeDetector()
try:
    aruco = cv2.QRCodeDetectorAruco()
except AttributeError:
    aruco = None

def decode(img):
    results = []
    for d in [det] + ([aruco] if aruco else []):
        try:
            text, _, _ = d.detectAndDecode(img)
        except cv2.error:
            text = ''
        results.append(text)
    return results

def scenarios(img):
    h, w = img.shape[:2]
    pad = cv2.copyMakeBorder(img, 400, 400, 400, 400, cv2.BORDER_CONSTANT, value=(120, 110, 100))
    yield 'full size', img
    for px in (600, 300, 180):
        yield f'small {px}px (far away)', cv2.resize(img, (px, px), interpolation=cv2.INTER_AREA)
    yield 'blurred', cv2.GaussianBlur(cv2.resize(img, (600, 600)), (9, 9), 3)
    ph, pw = pad.shape[:2]
    src = np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]])
    dst = np.float32([[pw * 0.18, ph * 0.06], [pw * 0.92, 0], [pw, ph], [pw * 0.1, ph * 0.9]])
    tilt = cv2.warpPerspective(pad, cv2.getPerspectiveTransform(src, dst), (pw, ph), borderValue=(120, 110, 100))
    yield 'tilted 30 degrees, on a van', cv2.resize(tilt, (900, 900))
    yield 'dim (evening light)', cv2.convertScaleAbs(cv2.resize(img, (600, 600)), alpha=0.45, beta=10)
    dirty = cv2.resize(img, (800, 800)).copy()
    rng = np.random.default_rng(11)
    for _ in range(14):
        x, y = rng.integers(60, 740, 2)
        cv2.circle(dirty, (int(x), int(y)), int(rng.integers(6, 18)), (90, 80, 70), -1)
    yield 'road dirt (14 spots)', dirty
    rot = cv2.rotate(cv2.resize(img, (600, 600)), cv2.ROTATE_90_CLOCKWISE)
    yield 'phone held sideways', rot

ok = True
for path in sys.argv[1:]:
    img = cv2.imread(path)
    print(path.rsplit('/', 1)[-1])
    for name, frame in scenarios(img):
        texts = decode(frame)
        good = any(t == URL for t in texts)
        wrong = [t for t in texts if t and t != URL]
        ok &= good and not wrong
        print(f'  {"PASS" if good and not wrong else "FAIL"}  {name}: {texts}')
print('ALL PASS' if ok else 'SOME FAILED')
