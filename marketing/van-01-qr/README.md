# VAN-01 QR code (van wrap)

**Do not print until First Eleven confirms the van page is live and tested.**

The code opens `https://www.firstelevencleaners.com/van?via=qr`. The `?via=qr` part is how the
website knows a visitor came from the van's QR code (tracking ID VAN-01).

## Files

| File | Use |
|---|---|
| `VAN-01-QR-crest.pdf` | **Print file.** Vector, 12 x 12 in, scales to any size. Crest in the middle. |
| `VAN-01-QR-crest.svg` | The same, as SVG. |
| `VAN-01-QR-crest.png` | 4000 x 4000 px, for proofs and mock-ups. |
| `VAN-01-QR-plain.*` | Backup without the crest, if the printer prefers it. |

## Print rules

- Navy `#0B1F3A` on white. Keep the white border (the "quiet zone") all the way round; don't place
  the code on the navy wrap without it.
- Size: at least 10 in (25 cm) wide on the rear doors and passenger side, so it scans from a few
  metres away. Bigger is better.
- Don't recolour, stretch, crop, or add a frame inside the white border.
- Error correction is the highest level (H), so it still scans with road dirt or a small scratch.

## Checked before handing over

Every file decodes to the URL above: the SVG rendered in a browser, the PDF's drawing rebuilt and
decoded, and the PNG decoded small (far away), blurred, tilted 30 degrees, in dim light, with dirt
spots and held sideways (`check_qr.py`). A phone test on iPhone and Android is still needed
before printing (see the testing steps from First Eleven).

`make_qr.py` regenerates the files: `python make_qr.py marketing/van-01-qr web/public/icon.png`.
