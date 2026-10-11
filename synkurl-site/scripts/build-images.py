#!/usr/bin/env python3
"""Makes the web images for the six concept designs.

Reads the original PNGs from design-masters/models/<model>/ (kept out of git:
copy them there from the design pack ZIPs): studio-<finish>.png, lifestyle.png,
detail.png, and optionally lifestyle-<finish>.png / detail-<finish>.png for room
and close-up photos in more finishes. It writes smaller copies to
public/media/<model>/:

  <role>-<finish>-<width>.avif   smallest, used by most current browsers
  <role>-<finish>-<width>.webp   used by browsers without AVIF
  <role>-<finish>-960.jpg        one fallback for very old browsers
  <role>-<finish>-full.webp      every pixel of the original, unchanged (lossless):
                                 used when someone zooms in, so zooming never
                                 shows compression blur

Only pixels are copied. Hidden data in the originals (such as the image
generator's content credentials) is not, because no metadata is passed on. An
original with a colour profile is first converted to standard sRGB colours.
Bigger originals (for example 3072 x 2048) need no code change: the page sizes
stop at 1920 px wide, and the -full.webp copy (and so the zoom) grows with them.
Files from earlier runs that are no longer made are deleted.

It also writes data/images.json with each image's real finish, role, pixel
size and file names. scripts/build-pages.mjs reads that file.

The originals are never changed. Nothing here recolours an image: each file
keeps the finish it was photographed in (see "lifestyle"/"detail" finishes in
data/models.json).

Needs Python 3 with Pillow 11+ (for AVIF). Run from synkurl-site/:
    python3 scripts/build-images.py
"""
import io
import json
import os
import sys

from PIL import Image, ImageCms

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTERS = os.path.join(ROOT, "design-masters", "models")
OUT = os.path.join(ROOT, "public", "media")
DATA = os.path.join(ROOT, "data")

AVIF_QUALITY = 68
WEBP_QUALITY = 82
JPEG_QUALITY = 80
FALLBACK_WIDTH = 960


PAGE_MAX = 1920  # the widest copy pages ever use; zoom uses the -full.webp copy


def widths_for(width, height):
    steps = [320, 480, 768, 1024, 1536] if height > width else [320, 640, 960, 1280, 1920]
    return [s for s in steps if s < min(width, PAGE_MAX)] + [min(width, PAGE_MAX)]


def open_rgb(path):
    """The original's pixels in sRGB, with no metadata attached."""
    im = Image.open(path)
    icc = im.info.get("icc_profile")
    if icc:
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        im = ImageCms.profileToProfile(im.convert("RGB"), src, ImageCms.createProfile("sRGB"), outputMode="RGB")
    im = im.convert("RGB")
    im.info.clear()
    return im


def main():
    if not os.path.isdir(MASTERS):
        sys.exit(f"No originals in {MASTERS}: copy them there from the design pack first.")
    models = json.load(open(os.path.join(DATA, "models.json")))
    finishes = [f["id"] for f in models["finishes"]]
    images = {}
    missing = []

    for model in models["models"]:
        mid = model["id"]
        src_dir = os.path.join(MASTERS, mid)
        out_dir = os.path.join(OUT, mid)
        os.makedirs(out_dir, exist_ok=True)
        planned = [("studio", f, f"studio-{f}.png") for f in finishes]
        planned.append(("lifestyle", model["lifestyle"]["finish"], "lifestyle.png"))
        planned.append(("detail", model["detail"]["finish"], "detail.png"))
        # Extra room and close-up photos in other finishes, when supplied:
        # lifestyle-<finish>.png and detail-<finish>.png (each needs alt text in data/models.json).
        for role in ("lifestyle", "detail"):
            for f in finishes:
                if f != model[role]["finish"] and os.path.exists(os.path.join(src_dir, f"{role}-{f}.png")):
                    planned.append((role, f, f"{role}-{f}.png"))

        entries = []
        made = set()
        for role, finish, filename in planned:
            path = os.path.join(src_dir, filename)
            if not os.path.exists(path):
                missing.append(f"{mid}/{filename}")
                continue
            im = open_rgb(path)
            w, h = im.size
            base = f"{role}-{finish}"
            files = {"avif": [], "webp": []}
            for target in widths_for(w, h):
                size = (target, round(h * target / w))
                small = im if target == w else im.resize(size, Image.LANCZOS)
                for fmt, ext, opts in (
                    ("AVIF", "avif", {"quality": AVIF_QUALITY, "speed": 4}),
                    ("WEBP", "webp", {"quality": WEBP_QUALITY, "method": 6}),
                ):
                    name = f"{base}-{target}.{ext}"
                    small.save(os.path.join(out_dir, name), fmt, **opts)
                    made.add(name)
                    files[ext].append({"w": target, "file": f"/media/{mid}/{name}"})
            # Every pixel, unchanged, for zooming in. Checked after saving.
            full_name = f"{base}-full.webp"
            full_path = os.path.join(out_dir, full_name)
            im.save(full_path, "WEBP", lossless=True, quality=100, method=4)
            made.add(full_name)
            if Image.open(full_path).convert("RGB").tobytes() != im.tobytes():
                sys.exit(f"{full_name} is not identical to {mid}/{filename}")
            fb_w = min(FALLBACK_WIDTH, w) if w >= h else min(768, w)
            fb = im.resize((fb_w, round(h * fb_w / w)), Image.LANCZOS)
            fb_name = f"{base}-{fb_w}.jpg"
            fb.save(os.path.join(out_dir, fb_name), "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
            made.add(fb_name)
            entries.append({
                "role": role,
                "finish": finish,
                "width": w,
                "height": h,
                "avif": files["avif"],
                "webp": files["webp"],
                "fallback": f"/media/{mid}/{fb_name}",
                "full": f"/media/{mid}/{full_name}",
            })
            print(f"{mid}/{filename} -> {base} ({w}x{h})")
        images[mid] = entries
        # Delete files from earlier runs that this run no longer makes
        # (a replaced or removed photo must not stay published).
        for name in sorted(os.listdir(out_dir)):
            if name not in made and os.path.isfile(os.path.join(out_dir, name)):
                os.remove(os.path.join(out_dir, name))
                print(f"removed old {mid}/{name}")

    with open(os.path.join(DATA, "images.json"), "w") as f:
        json.dump({"_about": "Generated by scripts/build-images.py. Do not edit by hand.", "images": images, "missingMasters": missing}, f, indent=2)
        f.write("\n")
    if missing:
        print("Missing masters (no web images made):", ", ".join(missing), file=sys.stderr)


if __name__ == "__main__":
    main()
