# Pixel Studio Pro

A full-featured pixel art editor overlay for **minefun.io**.  
Built as a Tampermonkey userscript.

Press `Alt + 1` to toggle the editor.  
Works on `minefun.io` and all its subdomains.

---

## Features

- **Drawing Tools** – Brush, Eraser, Fill Bucket, Eyedropper (colour picker).
- **Selection Tools** – Rectangular select, move (cut), Ctrl+move (copy), cut/copy/paste/delete.
- **Symmetry Modes** – Horizontal, Vertical, Both, or None.
- **Brush Sizes** – 1 to 5 pixels (keys `1`–`5`).
- **Undo / Redo** – Up to 50 history states (`Ctrl+Z` / `Ctrl+Y`).
- **Grid Toggle** – Show/hide pixel grid.
- **Zoom** – Zoom in/out for precise editing.
- **Colour Palette** – 22 preset colours with names, plus a custom colour picker.
- **Photo Import** – Import an image and place it on the canvas.
- **Photo Drag** – Toggle to move the imported photo around before finalising.
- **Save & Export** – Save to in-game library, export as PNG/JPG, save to linked folder on PC.
- **Trash System** – Deleted saves go to trash; restore or permanently delete.
- **Auto-Save Draft** – Automatically saves your work to `localStorage` every few seconds.
- **Keyboard Shortcuts** – Full set of shortcuts for power users.
- **Draggable Panel** – Move the editor anywhere on screen.
- **Cyber-themed UI** – Neon cyan design with dark background.
- **No external dependencies** – Pure vanilla JavaScript and Canvas API.

---

## Installation

1. Install a userscript manager like **Tampermonkey**, **Greasemonkey**, or **Violentmonkey**.
2. Create a new script and paste the full source code.
3. Save – it will run automatically on `minefun.io` and its subdomains.

---

## Usage

Press `Alt + 1` to open Pixel Studio Pro.

### Drawing
- Select the **Brush** tool and click/drag on the canvas.
- Change brush size with the slider or keys `1`–`5`.
- Pick a colour from the swatches or use the rainbow square for a custom colour.

### Tools
- **Eraser** – Click/drag to erase pixels.
- **Fill** – Click an area to fill it with the selected colour.
- **Eraser + Fill** – Select Eraser first, then Fill – this erases an entire connected area.
- **Eyedropper** – Click to pick a colour from the canvas (or hold `Alt` and click).
- **Select** – Drag to create a selection box. Move it (cut) or Ctrl+move it (copy). Use `Ctrl+X/C/V` to cut/copy/paste.

### Symmetry
- Click the **Symmetry** button to cycle through None → Horizontal → Vertical → Both.

### Import Photo
- Click the **Photo** button to import an image from your device.
- Use **Photo Drag** (toggle button) to reposition the image before it becomes permanent.

### Save & Export
- **Save** – Saves to the in-game library (stored in `localStorage`).
- **PNG** – Exports the canvas as a PNG file.
- **JPG** – Exports as JPG with adjustable quality.
- **Save on PC** – Link a folder first, then save directly to your computer.

### Trash
- Click the **Trash** button to view deleted saves. Restore or permanently delete them.

---

## Keyboard Shortcuts

| Shortcut         | Action                        |
|------------------|-------------------------------|
| `Alt + 1`        | Toggle editor                 |
| `1` – `5`        | Brush size                    |
| `Ctrl + Z`       | Undo                          |
| `Ctrl + Y`       | Redo                          |
| `Ctrl + X`       | Cut selection                 |
| `Ctrl + C`       | Copy selection                |
| `Ctrl + V`       | Paste selection               |
| `Delete`         | Delete selection              |
| `Escape`         | Deselect                      |
| `Alt + Click`    | Pick colour (eyedropper)      |
| `Ctrl + Drag`    | Copy-drag selection           |

---

## Author

**Itz_Krishna AKA Everlasting**
