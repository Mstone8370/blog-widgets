"""
Convert EnvironmentBRDF.dds (D3DFMT_G16R16F, fourCC 112) to a half-float EXR LUT.

The split-sum environment BRDF LUT holds two values in [0,1]: R = scale (A), G = bias (B).
RGBE (.hdr) is unsuitable here (its shared RGB exponent wrecks [0,1] 2-channel precision);
a half-float EXR matches the R16G16F source exactly. The widget loads it with EXRLoader and
samples .rg = (scale, bias). Run with the repo venv:
  .venv/Scripts/python.exe Tools/convert_lut_dds_to_exr.py
"""
import os
import struct

os.environ['OPENCV_IO_ENABLE_OPENEXR'] = '1'   # must precede cv2 import
import numpy as np
import cv2

SRC = r"C:\Users\mston\Desktop\Folder\blog-widgets\Graphics\SpecularIBL\EnvironmentBRDF.dds"
DST = r"C:\Users\mston\Desktop\Folder\blog-widgets\Graphics\SpecularIBL\EnvironmentBRDF.exr"

raw = open(SRC, 'rb').read()
assert raw[:4] == b'DDS ', 'not a DDS file'
height = struct.unpack('<I', raw[12:16])[0]
width  = struct.unpack('<I', raw[16:20])[0]
fourcc = struct.unpack('<I', raw[84:88])[0]   # 112 = D3DFMT_G16R16F
print('dds %dx%d fourCC=%d' % (width, height, fourcc))

# 128-byte header, then R16G16F pixels: half0=R(scale, low word), half1=G(bias, high word).
pix = np.frombuffer(raw[128:128 + width * height * 4], dtype=np.float16).astype(np.float32)
pix = pix.reshape(height, width, 2)
scale = pix[..., 0]
bias  = pix[..., 1]

# OpenCV is BGR; lay out [B=0, G=bias, R=scale] so the EXR has R=scale, G=bias, B=0.
# Row order kept as-is (DDS row0 = roughness0), matching the previous flipY=false PNG.
bgr = np.zeros((height, width, 3), dtype=np.float32)
bgr[..., 1] = bias
bgr[..., 2] = scale

half = getattr(cv2, 'IMWRITE_EXR_TYPE_HALF', 1)
params = []
if hasattr(cv2, 'IMWRITE_EXR_TYPE'):
    params += [cv2.IMWRITE_EXR_TYPE, half]
# Force ZIP compression — Three's EXRLoader supports NONE/RLE/ZIP/ZIPS/PIZ but not all
# OpenCV defaults; ZIP is safe and well-supported.
if hasattr(cv2, 'IMWRITE_EXR_COMPRESSION') and hasattr(cv2, 'IMWRITE_EXR_COMPRESSION_ZIP'):
    params += [cv2.IMWRITE_EXR_COMPRESSION, cv2.IMWRITE_EXR_COMPRESSION_ZIP]
ok = cv2.imwrite(DST, bgr, params)
print('wrote %s ok=%s  scale[%.4f,%.4f] bias[%.4f,%.4f]'
      % (DST, ok, float(scale.min()), float(scale.max()),
         float(bias.min()), float(bias.max())))
