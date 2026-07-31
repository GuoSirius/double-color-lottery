#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成「双色球」原创几何图标（favicon.ico / favicon.svg / icon-192.png / icon-512.png）。

设计说明
--------
红蓝双球相叠，直接呼应「双色球」字面含义（双色 + 球），
使用自绘的径向渐变与白色描边环，呈现质感球体。
不含任何官方彩票 logo、注册商标或受版权保护的图形元素，无侵权风险。

技术说明
--------
纯标准库实现，无需 Pillow：
  * 自写最小 PNG 编码器（RGBA 8bit + zlib）
  * 以 PNG 直接嵌入 ICO 容器（现代浏览器均支持）
"""
import os
import zlib
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = H = 256
buf = bytearray(W * H * 4)  # RGBA，初值全 0（透明背景）


def set_px(x, y, r, g, b, a):
    if x < 0 or y < 0 or x >= W or y >= H:
        return
    i = (y * W + x) * 4
    sa = a / 255.0
    da = buf[i + 3] / 255.0
    out_a = sa + da * (1.0 - sa)
    if out_a <= 0:
        buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0
        return
    dr, dg, db = buf[i], buf[i + 1], buf[i + 2]
    out_r = (r * sa + dr * da * (1.0 - sa)) / out_a
    out_g = (g * sa + dg * da * (1.0 - sa)) / out_a
    out_b = (b * sa + db * da * (1.0 - sa)) / out_a
    buf[i] = int(round(out_r))
    buf[i + 1] = int(round(out_g))
    buf[i + 2] = int(round(out_b))
    buf[i + 3] = int(round(out_a * 255))


def draw_ball(cx, cy, rad, inner, outer):
    for y in range(H):
        for x in range(W):
            dx = x - cx
            dy = y - cy
            d = (dx * dx + dy * dy) ** 0.5
            if d <= rad:
                t = (d / rad) ** 1.15  # 让高光更聚拢，球体更立体
                r = inner[0] + (outer[0] - inner[0]) * t
                g = inner[1] + (outer[1] - inner[1]) * t
                b = inner[2] + (outer[2] - inner[2]) * t
                a = 255 if d <= rad - 1.5 else int(255 * max(0.0, (rad - d) / 1.5))
                set_px(x, y, int(r), int(g), int(b), a)


def draw_ring(cx, cy, rad, a):
    for y in range(H):
        for x in range(W):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if abs(d - rad) < 1.1:
                set_px(x, y, 255, 255, 255, a)


def make_png():
    raw = bytearray()
    for y in range(H):
        raw.append(0)  # PNG 每行前缀 filter type 0
        raw.extend(buf[y * W * 4:(y + 1) * W * 4])
    comp = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", comp) + chunk(b"IEND", b"")


def make_ico(png):
    icon_dir = struct.pack("<HHH", 0, 1, 1)  # reserved, type=icon, count=1
    w = H
    entry = struct.pack(
        "<BBBBHHII",
        0 if w >= 256 else w,   # width（256 记为 0）
        0 if w >= 256 else w,   # height
        0,                      # color count
        0,                      # reserved
        1,                      # color planes
        32,                     # bits per pixel
        len(png),               # bytes in resource
        6 + 16,                 # offset = ICONDIR(6) + ICONDIRENTRY(16)
    )
    return icon_dir + entry + png


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <radialGradient id="red" cx="38%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#ff8a78"/>
      <stop offset="55%" stop-color="#f0422f"/>
      <stop offset="100%" stop-color="#c62a1c"/>
    </radialGradient>
    <radialGradient id="blue" cx="38%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#69a8ff"/>
      <stop offset="55%" stop-color="#2f6bff"/>
      <stop offset="100%" stop-color="#1b3fb0"/>
    </radialGradient>
  </defs>
  <circle cx="25" cy="32" r="20" fill="url(#red)"/>
  <circle cx="39" cy="32" r="20" fill="url(#blue)"/>
  <circle cx="25" cy="32" r="20" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.2"/>
  <circle cx="39" cy="32" r="20" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.4"/>
</svg>
"""


def render(size):
    """按给定尺寸重绘红蓝双球，返回该尺寸的 PNG 字节。"""
    global W, H, buf
    W = H = size
    buf = bytearray(W * H * 4)
    s = size / 256.0
    draw_ball(95 * s, 128 * s, 70 * s, (255, 138, 120), (198, 42, 28))
    draw_ball(161 * s, 128 * s, 70 * s, (105, 168, 255), (27, 63, 176))
    draw_ring(95 * s, 128 * s, 70 * s, 120)
    draw_ring(161 * s, 128 * s, 70 * s, 230)
    return make_png()


def main():
    png256 = render(256)
    ico_path = os.path.join(ROOT, "favicon.ico")
    svg_path = os.path.join(ROOT, "favicon.svg")
    p192 = os.path.join(ROOT, "icon-192.png")
    p512 = os.path.join(ROOT, "icon-512.png")
    with open(ico_path, "wb") as f:
        f.write(make_ico(png256))
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(SVG)
    with open(p192, "wb") as f:
        f.write(render(192))
    with open(p512, "wb") as f:
        f.write(render(512))
    for p in (ico_path, svg_path, p192, p512):
        print("written:", p, os.path.getsize(p), "bytes")


if __name__ == "__main__":
    main()
