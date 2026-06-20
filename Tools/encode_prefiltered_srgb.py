"""
Encode float EXR cubemap faces -> gamma-2.2 8-bit PNG (better dark/mid precision, no banding).

Run with the project venv:
  .venv/Scripts/python.exe Tools/encode_prefiltered_srgb.py

Pipeline rationale: the widget is a custom Three.js ShaderMaterial, so Three's automatic
sRGB decode does NOT apply to raw textureCube() samples. We therefore match encode/decode
by gamma 2.2 ourselves: store PNG = clamp(linear,0,1) ** (1/2.2); the shader decodes with
** 2.2 before the lighting math, then gamma-encodes the final pixel. Storing in gamma space
distributes the 8-bit codes perceptually -> the banding from linear-8-bit storage is gone.

Reads SRC/*.exr (RenderDoc float export) and writes SRC-named PNGs into DST (overwrites the
clamped linear PNGs the widget loads). EXR values are linear; >1 highlights clamp to 1.
"""
import os
import glob

os.environ.setdefault('OPENCV_IO_ENABLE_OPENEXR', '1')   # opencv gate for EXR (4.10+)
import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'Graphics', 'SpecularIBL', 'Prefiltered_src')   # float EXR in
DST = os.path.join(ROOT, 'Graphics', 'SpecularIBL', 'Prefiltered')        # gamma 8-bit PNG out
GAMMA = 2.2


def main():
    files = sorted(glob.glob(os.path.join(SRC, '*.exr')))
    if not files:
        print('No .exr files in', SRC)
        print('Re-export the prefiltered cubemap as EXR first (FILE_TYPE="exr" in the RenderDoc script).')
        return
    os.makedirs(DST, exist_ok=True)
    n = 0
    for f in files:
        img = cv2.imread(f, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_ANYCOLOR)   # float, BGR
        if img is None:
            print('  skip (unreadable):', os.path.basename(f))
            continue
        if img.ndim == 2:
            img = np.stack([img, img, img], axis=-1)
        rgb = img[:, :, :3].astype(np.float32)[:, :, ::-1]               # BGR -> RGB, linear
        enc = np.clip(rgb, 0.0, 1.0) ** (1.0 / GAMMA)                    # gamma 2.2 encode
        out = np.clip(np.round(enc * 255.0), 0, 255).astype(np.uint8)
        name = os.path.splitext(os.path.basename(f))[0] + '.png'
        Image.fromarray(out, 'RGB').save(os.path.join(DST, name))
        n += 1
    print('encoded %d EXR -> gamma-2.2 PNG in %s' % (n, DST))


if __name__ == '__main__':
    main()
