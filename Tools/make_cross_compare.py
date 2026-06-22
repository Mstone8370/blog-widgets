# -*- coding: utf-8 -*-
"""
1회성: irradiance map(.hdr)과 환경 cubemap(.png)을 '같은 해상도·같은 펼침'으로
십자(cross) PNG 2장으로 만들어 직접 비교한다.

- irradiance: Graphics/DiffuseIBL/Irradiance/{Xp,Xm,Yp,Ym,Zp,Zm}_0.hdr  (선형 HDR, 32²)
- cubemap   : Graphics/DiffuseIBL/Cubemap/{Xp,Xm,Yp,Ym,Zp,Zm}.png       (감마 PNG, 1024²)
              → 선형에서 32²로 다운샘플(= irradiance와 동일 해상도 밉)

면 배치(좌표계): cube-space 십자.  +Z 위 / -Z 아래 / 측면 띠 = Z축 둘레 [-Y, +X, +Y, -X].
  파일명(Xp..)은 widget 의 CubeTextureLoader 면 순서(+X,-X,+Y,-Y,+Z,-Z)와 동일한 cube 면.
면 회전: 큐브맵 픽셀로 이음새 연속성을 최소화해 자동 결정 → irradiance 에도 동일 적용.
표시: 선형값 → gamma 2.2 인코딩(위젯과 동일). 노출 매칭은 하지 않음.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'Graphics', 'DiffuseIBL')
IRR_DIR = os.path.join(ROOT, 'Irradiance')
CUBE_DIR = os.path.join(ROOT, 'Cubemap')
OUT_DIR = os.path.join(ROOT, 'Compare')
FACES = ['Xp', 'Xm', 'Yp', 'Ym', 'Zp', 'Zm']
GAMMA = 2.2


# ---------- Radiance .hdr (RGBE) 리더 ----------
def read_hdr(path):
    with open(path, 'rb') as fh:
        buf = fh.read()
    pos = 0

    def readline(p):
        e = buf.index(b'\n', p)
        return buf[p:e], e + 1

    line, pos = readline(pos)
    assert line[:2] == b'#?', 'not a radiance hdr: %r' % line[:8]
    while True:
        line, pos = readline(pos)
        if line.strip() == b'':
            break
    line, pos = readline(pos)               # resolution: "-Y H +X W"
    toks = line.split()
    assert toks[0] == b'-Y' and toks[2] == b'+X', 'unexpected res line %r' % line
    H, W = int(toks[1]), int(toks[3])

    raw = buf[pos:]
    rgbe = np.zeros((H, W, 4), np.uint8)
    p = 0
    for y in range(H):
        is_rle = (p + 4 <= len(raw) and raw[p] == 2 and raw[p + 1] == 2
                  and ((raw[p + 2] << 8) | raw[p + 3]) == W and 8 <= W <= 0x7fff)
        if is_rle:
            p += 4
            for c in range(4):
                x = 0
                while x < W:
                    cnt = raw[p]; p += 1
                    if cnt > 128:                       # run
                        val = raw[p]; p += 1
                        rgbe[y, x:x + (cnt - 128), c] = val
                        x += cnt - 128
                    else:                               # literal
                        rgbe[y, x:x + cnt, c] = np.frombuffer(raw[p:p + cnt], np.uint8)
                        p += cnt; x += cnt
        else:                                           # flat RGBE
            block = np.frombuffer(raw[p:p + W * 4], np.uint8).reshape(W, 4)
            rgbe[y] = block
            p += W * 4

    e = rgbe[:, :, 3].astype(np.int32)
    f = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0).astype(np.float32)   # 2^(e-128-8)
    img = np.zeros((H, W, 3), np.float32)
    for c in range(3):
        img[:, :, c] = rgbe[:, :, c].astype(np.float32) * f
    return img                                          # 선형 RGB, row0=top


# ---------- 로드 ----------
def load_irradiance():
    return {name: read_hdr(os.path.join(IRR_DIR, name + '_0.hdr')) for name in FACES}


def load_cubemap_downsampled(target):
    out = {}
    for name in FACES:
        arr = np.asarray(Image.open(os.path.join(CUBE_DIR, name + '.png')).convert('RGB'), np.float32) / 255.0
        lin = arr ** GAMMA                              # 감마 → 선형
        H = arr.shape[0]
        assert H == arr.shape[1] and H % target == 0, 'cube %dx%d not divisible by %d' % (H, arr.shape[1], target)
        b = H // target
        lin = lin.reshape(target, b, target, b, 3).mean(axis=(1, 3))   # 선형 box 다운샘플
        out[name] = lin.astype(np.float32)
    return out


# ---------- 이음새 연속성으로 면 회전 자동 결정 ----------
def orient(face, o):
    return np.rot90(face, o) if o < 4 else np.rot90(np.flipud(face), o - 4)


def borders(face):
    return dict(top=face[0, :, :], bottom=face[-1, :, :], left=face[:, 0, :], right=face[:, -1, :])


def edge_mismatch(a, b):                                # 방향 반전 허용
    return float(min(np.mean((a - b) ** 2), np.mean((a - b[::-1]) ** 2)))


# 십자 셀:        Zp(0,1)
#         Ym(1,0) Xp(1,1) Yp(1,2) Xm(1,3)
#                 Zm(2,1)
CELLS = {'Zp': (0, 1), 'Ym': (1, 0), 'Xp': (1, 1), 'Yp': (1, 2), 'Xm': (1, 3), 'Zm': (2, 1)}
# 인접 모서리: (faceA, borderA, faceB, borderB)
EDGES = [
    ('Ym', 'right', 'Xp', 'left'),
    ('Xp', 'right', 'Yp', 'left'),
    ('Yp', 'right', 'Xm', 'left'),
    ('Zp', 'bottom', 'Xp', 'top'),
    ('Xp', 'bottom', 'Zm', 'top'),
]


def solve_orientations(cube):
    # 회전만 허용(반전 금지 → 큐브 면 핸드니스 보존). 각 면×4회전의 border 미리 계산
    NO = 4
    bd = {nm: [borders(orient(cube[nm], o)) for o in range(NO)] for nm in FACES}
    # 모서리별 NOxNO 비용행렬
    cost = []
    for (fa, ba, fb, bb) in EDGES:
        M = np.zeros((NO, NO))
        for oa in range(NO):
            for ob in range(NO):
                M[oa, ob] = edge_mismatch(bd[fa][oa][ba], bd[fb][ob][bb])
        cost.append((fa, fb, M))
    # Xp 는 4개 모서리에 등장 → Xp 고정하고 나머지 분리 최소화
    best = None
    for oXp in range(NO):
        # edge0: Ym.right ~ Xp.left
        oYm = int(np.argmin(cost[0][2][:, oXp])); c0 = cost[0][2][oYm, oXp]
        # edge3: Zp.bottom ~ Xp.top
        oZp = int(np.argmin(cost[3][2][:, oXp])); c3 = cost[3][2][oZp, oXp]
        # edge4: Xp.bottom ~ Zm.top
        oZm = int(np.argmin(cost[4][2][oXp, :])); c4 = cost[4][2][oXp, oZm]
        # edge1+edge2 결합: Xp.right~Yp.left, Yp.right~Xm.left
        bestYp = None
        for oYp in range(NO):
            oXm = int(np.argmin(cost[2][2][oYp, :]))
            cc = cost[1][2][oXp, oYp] + cost[2][2][oYp, oXm]
            if bestYp is None or cc < bestYp[0]:
                bestYp = (cc, oYp, oXm)
        total = c0 + c3 + c4 + bestYp[0]
        if best is None or total < best[0]:
            best = (total, {'Xp': oXp, 'Ym': oYm, 'Zp': oZp, 'Zm': oZm,
                            'Yp': bestYp[1], 'Xm': bestYp[2]})
    return best[1], best[0]


# ---------- 십자 PNG 생성 ----------
def encode8(lin):
    return np.clip(np.clip(lin, 0.0, 1.0) ** (1.0 / GAMMA) * 255.0 + 0.5, 0, 255).astype(np.uint8)


def build_cross(faces_lin, orients, scale, bg=(0, 0, 0)):
    # 라벨/테두리/구분선 없이 면 이미지만 셀에 배치(빈 셀은 배경색).
    n = next(iter(faces_lin.values())).shape[0]
    fs = n * scale
    rows, cols = 3, 4
    canvas = Image.new('RGB', (cols * fs, rows * fs), bg)
    for nm, (r, c) in CELLS.items():
        face8 = encode8(orient(faces_lin[nm], orients[nm]))
        im = Image.fromarray(face8, 'RGB').resize((fs, fs), Image.NEAREST)
        canvas.paste(im, (c * fs, r * fs))
    return canvas


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    irr = load_irradiance()
    n = next(iter(irr.values())).shape[0]              # irradiance 면 해상도 (=32)
    IRR_SCALE = 8                                      # 32 → 256px
    CUBE_RES = n * IRR_SCALE                           # 256 : 셀 크기 일치용 큐브맵 해상도
    print('irradiance face res:', n, '-> cell', n * IRR_SCALE)

    cube = load_cubemap_downsampled(CUBE_RES)          # 1024 → 256 (네이티브 256²)
    print('cubemap downsampled to:', next(iter(cube.values())).shape)

    orients, err = solve_orientations(cube)            # 256² 큐브맵으로 이음새 해 결정
    print('solved orientations:', orients)
    print('total seam mismatch (mean sq, lower=better):', round(err, 6))

    build_cross(irr, orients, IRR_SCALE).save(os.path.join(OUT_DIR, 'irradiance_cross.png'))   # 32×8
    build_cross(cube, orients, 1).save(os.path.join(OUT_DIR, 'cubemap_cross.png'))             # 256×1
    print('written:', os.path.join(OUT_DIR, 'irradiance_cross.png'))
    print('written:', os.path.join(OUT_DIR, 'cubemap_cross.png'))


if __name__ == '__main__':
    main()
