#!/usr/bin/env python3
"""Local Omarchy layer: Gallery's built-in themes, made from the Omarchy themes on this computer.

Each Omarchy theme (Omarchy's own in /usr/share/omarchy/themes, then the user's in ~/.config/omarchy/themes, which win
on the same name) becomes a gallery-theme file entry: its background, foreground and accent (and a light theme's
lighter background), its mode, and a 400 x 225 preview cut from its first wallpaper (or its preview.png). Written to
web/static/themes: index.json with every theme, and one .webp preview each. Run again after adding themes, then
rebuild the web (local-build.sh).

    tools/export-omarchy-themes.py
"""

import json
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageOps

ROOTS = [Path("/usr/share/omarchy/themes"), Path.home() / ".config/omarchy/themes"]
OUT = Path(__file__).resolve().parent.parent / "web/static/themes"
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
WORDS = {"dnd": "D&D", "rlyeh": "R'lyeh"}


def palette(folder: Path) -> dict:
    out = subprocess.run(
        ["omarchy-theme-color", "--file", str(folder / "colors.toml"), "--all"],
        capture_output=True, text=True, check=True,
    ).stdout
    return dict(line.split("\t", 1) for line in out.splitlines() if "\t" in line)


def title(name: str) -> str:
    return " ".join(WORDS.get(w, w.capitalize()) for w in name.split("-"))


def preview(folder: Path, target: Path) -> bool:
    images = sorted(p for p in (folder / "backgrounds").glob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"))
    source = images[0] if images else folder / "preview.png"
    if not source.is_file():
        return False
    with Image.open(source) as image:
        image.draft("RGB", (800, 450))
        ImageOps.fit(image.convert("RGB"), (400, 225), Image.Resampling.LANCZOS).save(target, "WEBP", quality=72)
    return True


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    folders = {}
    for root in ROOTS:
        for folder in sorted(root.glob("*")) if root.is_dir() else []:
            if (folder / "colors.toml").is_file():
                folders[folder.name] = folder
    themes = []
    for name, folder in sorted(folders.items()):
        try:
            p = palette(folder)
        except subprocess.CalledProcessError:
            print(f"skip {name}: no palette")
            continue
        accent = p.get("accent") or p.get("blue")
        if not all(HEX.match(p.get(k) or "") for k in ("background", "foreground")) or not HEX.match(accent or ""):
            print(f"skip {name}: incomplete palette")
            continue
        mode = "light" if (folder / "light.mode").exists() or p.get("mode", p.get("theme_type")) == "light" else "dark"
        theme = {
            "format": "gallery-theme",
            "version": 1,
            "id": re.sub(r"[^a-z0-9-]", "-", name.lower())[:64],
            "name": title(name),
            "author": "Omarchy" if folder.parent == ROOTS[0] else "",
            "mode": mode,
            "palette": {"background": p["background"].lower(), "foreground": p["foreground"].lower(), "accent": accent.lower()},
        }
        if mode == "light" and HEX.match(p.get("lighter_background") or ""):
            theme["palette"]["lighterBackground"] = p["lighter_background"].lower()
        if not theme["author"]:
            del theme["author"]
        if preview(folder, OUT / f"{theme['id']}.webp"):
            theme["preview"] = f"/themes/{theme['id']}.webp"
        themes.append(theme)
    (OUT / "index.json").write_text(json.dumps(themes, indent=1) + "\n")
    print(f"{len(themes)} themes written to {OUT}")


if __name__ == "__main__":
    main()
