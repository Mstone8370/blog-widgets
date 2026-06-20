"""
Batch cubemap exporter for the RenderDoc UI Python Shell.

On this machine venv/pip cannot drive RenderDoc (the bundled module is Python 3.6
ABI, not on PyPI). The only working path is RenderDoc's built-in Python Shell.

How to use:
  1) Open the capture in qrenderdoc.exe (leave it open).
  2) Window > Python Shell.
  3) Load this file in the shell (open button) and Run, or paste its contents and Enter.
     (the shell global `pyrenderdoc` is the active capture context)

Set RESOURCE_ID to the prefiltered cubemap's ResourceId (a number). If you don't
know it, run once with RESOURCE_ID = 0 (default) to print a list of cubemap
candidates (ResourceId / size / mip count / array size), then pick one and rerun.

Cube face slice order is the standard +X,-X,+Y,-Y,+Z,-Z. Filenames use the same
UE-axis naming as the existing diffuse/env cubemaps so the widget reuses the same
coord rule:
  slice 0=+X=Xp, 1=-X=Xm, 2=+Y=Yp, 3=-Y=Ym, 4=+Z=Zp, 5=-Z=Zm
  -> {face}_{mip}.png   (e.g. Xp_0.png ... Zm_9.png)

Notes: field/enum names can vary slightly between RenderDoc versions (use shell
autocomplete). Save settings are left at defaults on purpose (same as manual save:
float values clamp to [0,1], independent of the viewer's gamma/exposure), matching
the widget's gamma-2.2 display pipeline.
"""
import os
import renderdoc as rd

# ---- config ----
RESOURCE_ID = 0   # prefiltered cubemap ResourceId (number). 0 -> just print candidates and stop.
# 'exr' = float (HDR, un-clamped) for a high-quality re-encode; 'png' = clamped 8-bit.
FILE_TYPE = 'exr'
# For FILE_TYPE='exr' dump to Prefiltered_src, then run encode_prefiltered_srgb.py
# (venv) to make the sRGB 8-bit PNGs in Prefiltered. For 'png' point OUT_DIR at Prefiltered.
OUT_DIR = r"C:\Users\mston\Desktop\Folder\blog-widgets\Graphics\SpecularIBL\Prefiltered_src"
MIP_COUNT = None  # None -> use the texture's actual mip count. Force with an int (e.g. 10).
FACE_NAMES = ['Xp', 'Xm', 'Yp', 'Ym', 'Zp', 'Zm']   # slice 0..5 = +X,-X,+Y,-Y,+Z,-Z


def _list_cubemaps(controller):
    print("=== cube textures in capture ===")
    found = False
    for t in controller.GetTextures():
        if getattr(t, 'cubemap', False):
            found = True
            print("  ResourceId=%d  %dx%d  mips=%d  arraysize=%d"
                  % (int(t.resourceId), t.width, t.height, t.mips, t.arraysize))
    if not found:
        print("  (no cubemap found - check the capture/resource)")


def _dump(controller):
    if RESOURCE_ID == 0:
        _list_cubemaps(controller)
        print("Set RESOURCE_ID to one of the ids above, then run again.")
        return

    tex = next((t for t in controller.GetTextures()
                if int(t.resourceId) == int(RESOURCE_ID)), None)
    if tex is None:
        print("ResourceId %d not found. Run with RESOURCE_ID = 0 to list candidates."
              % RESOURCE_ID)
        return

    mips = MIP_COUNT if MIP_COUNT else tex.mips
    os.makedirs(OUT_DIR, exist_ok=True)

    n = 0
    for m in range(mips):
        for s in range(6):
            ts = rd.TextureSave()
            ts.resourceId = tex.resourceId   # use the real ResourceId object (int -> ResourceId is not allowed)
            ts.destType = rd.FileType.EXR if FILE_TYPE == 'exr' else rd.FileType.PNG
            ts.mip = m
            ts.slice.sliceIndex = s
            path = os.path.join(OUT_DIR, "%s_%d.%s" % (FACE_NAMES[s], m, FILE_TYPE))
            controller.SaveTexture(ts, path)
            n += 1
    print("saved %d files (%d mips x 6 faces) -> %s" % (n, mips, OUT_DIR))


# run on the RenderDoc replay thread
pyrenderdoc.Replay().BlockInvoke(_dump)
