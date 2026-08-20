# -*- coding: utf-8 -*-
"""生成 PWA 图标：192/512（any）+ 512 maskable（满铺安全区）。"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ICONS = os.path.join(ROOT, 'icons')


def make_icon(size, path, maskable=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        # 满铺背景，内容整体居中（安全区 80% 内）
        d.rectangle([0, 0, size, size], fill=(37, 99, 235, 255))
    else:
        d.rounded_rectangle([0, 0, size, size], radius=int(size * 0.18), fill=(37, 99, 235, 255))
    # 锁体
    bw, bh = int(size * 0.46), int(size * 0.34)
    bx, by = (size - bw) // 2, int(size * 0.48)
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=int(size * 0.07), fill=(255, 255, 255, 255))
    # 锁环
    aw = int(size * 0.30)
    ax = bx + (bw - aw) // 2
    d.arc([ax, int(size * 0.20), ax + aw, int(size * 0.62)], start=180, end=360,
          fill=(255, 255, 255, 255), width=max(3, int(size * 0.05)))
    # 锁孔
    kr = max(2, int(size * 0.028))
    cx, cy = size // 2, int(size * 0.62)
    d.ellipse([cx - kr, cy - kr, cx + kr, cy + kr], fill=(37, 99, 235, 255))
    d.rectangle([cx - int(size * 0.008), cy + kr, cx + int(size * 0.008), cy + int(size * 0.09)],
                fill=(37, 99, 235, 255))
    img.save(path)
    print('generated', path)


def main():
    os.makedirs(ICONS, exist_ok=True)
    make_icon(192, os.path.join(ICONS, 'icon-192.png'))
    make_icon(512, os.path.join(ICONS, 'icon-512.png'))
    make_icon(512, os.path.join(ICONS, 'icon-512-maskable.png'), maskable=True)


if __name__ == '__main__':
    main()
