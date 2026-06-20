"""
Convert HDR (Radiance .hdr) cubemap faces to gamma-2.2-encoded 8-bit PNG for the
decorative skybox background. LDR is fine for the background (precision only matters for
the irradiance/prefiltered spheres); gamma-space 8-bit avoids the dark-tone banding that
linear 8-bit (e.g. RenderDoc's default PNG export) would show.

Input : <DIR>/{Xp,Xm,Yp,Ym,Zp,Zm}_<MIP>.hdr   (float Radiance HDR, from RenderDoc)
Output: <DIR>/{Xp,Xm,Yp,Ym,Zp,Zm}.png          (gamma-2.2 8-bit RGB)

The widget loads these with colorSpace=Linear (raw sample) and the skybox shader outputs
the sampled value directly (NO runtime gamma) — the stored value already IS the display
value. Run with the repo venv:
  .venv/Scripts/python.exe Tools/encode_cubemap_png.py
"""
import os

import numpy as np
import cv2   # OpenCV reads Radiance .hdr natively as float (no OpenEXR flag needed)

DIR = r"C:\Users\mston\Desktop\Folder\blog-widgets\Graphics\DiffuseIBL\Cubemap"
MIP = 0
FACES = ['Xp', 'Xm', 'Yp', 'Ym', 'Zp', 'Zm']

total = 0
for face in FACES:
    src = os.path.join(DIR, "%s_%d.hdr" % (face, MIP))
    img = cv2.imread(src, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_COLOR)   # float32 BGR
    if img is None:
        raise SystemExit("failed to read %s (export mip%d .hdr there first)" % (src, MIP))
    enc = np.clip(img, 0.0, 1.0) ** (1.0 / 2.2)                     # gamma-2.2 encode
    out8 = np.clip(enc * 255.0 + 0.5, 0, 255).astype(np.uint8)      # BGR -> cv2 writes RGB
    dst = os.path.join(DIR, "%s.png" % face)
    cv2.imwrite(dst, out8)
    sz = os.path.getsize(dst)
    total += sz
    print("%-9s -> %-7s  %dx%d  %d bytes"
          % (os.path.basename(src), os.path.basename(dst), img.shape[1], img.shape[0], sz))

print("total %d bytes (%.2f MB)" % (total, total / 1e6))
