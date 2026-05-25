// ==UserScript==
// @name         Pixel Studio Pro
// @namespace    http://tampermonkey.net
// @version      1.0
// @description  Advanced Pixel Art Editor. ALT+1 to Toggle.
// @author       Itz_Krishna AKA Everlasting
// @match        https://minefun.io/*
// @match        https://*.minefun.io/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=minefun.io
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const SIZE = 352, PX = 11, MAX_HIST = 50, AUTO_DELAY = 1500;
    const THEME = '#00ffcc';

    // Colour names
    const colorNames = {
        '#000000':'Black','#FFFFFF':'White','#D1D1D1':'Light Gray','#7A7A7A':'Gray','#B02E26':'Dark Red',
        '#F9801D':'Orange','#FED83D':'Yellow','#80C71F':'Lime Green','#3C44AA':'Blue','#8932B8':'Purple',
        '#FF69B4':'Pink','#00FF00':'Green','#00FFCC':'Turquoise','#00CED1':'Teal','#20B2AA':'Light Sea Green',
        '#48D1CC':'Medium Turquoise','#40E0D0':'Turquoise','#00FFFF':'Cyan','#FF0000':'Red','#0000FF':'Blue',
        '#FFFF00':'Yellow','#FF00FF':'Magenta'
    };

    // State
    let tool = 'brush', color = THEME, bSize = 1;
    let grid = true, zoom = 1, active = false, drawing = false;
    let dirHandle = null;
    let fg, fctx, bg, bctx;
    let history = [], hidx = -1;
    let sel = { on:false, x:0, y:0, w:0, h:0, clip:null };
    let selStart = null, selMove = false, selOff = {x:0,y:0};
    let selCopyDrag = false;
    let eraseFill = false;
    let sym = 'none';
    let saved = JSON.parse(localStorage.getItem('ps_saved')||'[]');
    let trash = JSON.parse(localStorage.getItem('ps_trash')||'[]');
    let draft = localStorage.getItem('ps_draft');
    let notifyEl, viewportEl, panelEl;
    let autoSaveTimer = null, loadingDraft = false;

    // Photo Layer
    let photoImg = null, photoX = 0, photoY = 0, photoW = 0, photoH = 0;
    let photoDragMode = false;
    let photoBaseImage = null;
    let draggingPhoto = false, dragPhotoOffX = 0, dragPhotoOffY = 0;

    const $ = id => document.getElementById(id);
    const act = (id, t) => {
        const prevTool = tool;
        tool = t;
        eraseFill = false; // Fill Case

        $$('.btn').forEach(b => b.classList.remove('on'));
        const btn = $('t-'+id);
        if(btn) btn.classList.add('on');
        if(t !== 'select'){ sel.on = false; sel.w = 0; }

        // Eraser‑Fill
        if (t === 'fill' && prevTool === 'eraser') {
            eraseFill = true;
            const eraserBtn = $('t-eraser');
            if (eraserBtn) eraserBtn.classList.add('on');
        }
    };
    const $$ = sel => document.querySelectorAll('#ps '+sel);

    // Notify
    function notify(msg, isErr=false) {
        if(!notifyEl) return;
        notifyEl.textContent = msg;
        notifyEl.style.color = isErr ? '#f44' : THEME;
        notifyEl.style.opacity = '1';
        clearTimeout(notifyEl._t);
        notifyEl._t = setTimeout(() => { if(notifyEl) notifyEl.style.opacity = '0'; }, 1500);
    }

    // State
    function captureState() {
        return {
            imageData: fctx.getImageData(0,0,SIZE,SIZE),
            sel: {
                on: sel.on, x: sel.x, y: sel.y, w: sel.w, h: sel.h,
                clip: sel.clip ? new ImageData(sel.clip.data, sel.clip.width, sel.clip.height) : null
            },
            photoX, photoY, photoW, photoH
        };
    }

    function restoreState(state) {
        fctx.putImageData(state.imageData, 0, 0);
        sel.on = state.sel.on;
        sel.x = state.sel.x; sel.y = state.sel.y;
        sel.w = state.sel.w; sel.h = state.sel.h;
        sel.clip = state.sel.clip;
        photoX = state.photoX; photoY = state.photoY;
        photoW = state.photoW; photoH = state.photoH;
        if(photoImg) photoBaseImage = fctx.getImageData(0,0,SIZE,SIZE);
    }

    // Save State
    function saveState() {
        if(!active || loadingDraft || !fctx) return;
        history = history.slice(0, hidx+1);
        history.push(captureState());
        if(history.length > MAX_HIST) { history.shift(); } else { hidx++; }
        if(photoImg) photoBaseImage = fctx.getImageData(0,0,SIZE,SIZE);
    }

    function undo() {
        if(!active || loadingDraft || hidx<=0) { notify('Nothing to undo', true); return; }
        hidx--;
        restoreState(history[hidx]);
        drawGrid();
        notify('Undo');
    }

    function redo() {
        if(!active || loadingDraft || hidx >= history.length-1) { notify('Nothing to redo', true); return; }
        hidx++;
        restoreState(history[hidx]);
        drawGrid();
        notify('Redo');
    }

    // Grid
    function drawGrid() {
        const rows = SIZE / PX;
        for(let y=0; y<rows; y++) {
            for(let x=0; x<rows; x++) {
                bctx.fillStyle = (x+y)%2===0 ? '#1a1a1a' : '#0a0a0a';
                bctx.fillRect(x*PX, y*PX, PX, PX);
            }
        }
        if(grid) {
            bctx.strokeStyle = '#333';
            bctx.lineWidth = 1;
            for(let i=0; i<=rows; i++) {
                const x = i * PX;
                bctx.beginPath(); bctx.moveTo(x, 0); bctx.lineTo(x, SIZE); bctx.stroke();
            }
            for(let i=0; i<=rows; i++) {
                const y = i * PX;
                bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(SIZE, y); bctx.stroke();
            }
        }
        if(sel.on && sel.w>0) {
            bctx.save();
            bctx.strokeStyle = '#fff';
            bctx.lineWidth = 1.5;
            bctx.setLineDash([5,5]);
            bctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
            bctx.restore();
        }
    }

    // Coordinates
    function getPos(e) {
        if(!fg) return null;
        const r = fg.getBoundingClientRect();
        const cx = (e.clientX - r.left) / zoom, cy = (e.clientY - r.top) / zoom;
        if(cx<0||cy<0||cx>SIZE||cy>SIZE) return null;
        return { x: Math.floor(cx/PX)*PX, y: Math.floor(cy/PX)*PX };
    }

    // Helper
    function paintRect(px, py, s, c, forceErase = false) {
        const left = Math.max(0, px);
        const top = Math.max(0, py);
        const right = Math.min(SIZE, px + s);
        const bottom = Math.min(SIZE, py + s);
        const w = right - left;
        const h = bottom - top;
        if(w <= 0 || h <= 0) return;
        if(forceErase) {
            fctx.clearRect(left, top, w, h);
        } else {
            fctx.fillStyle = c;
            fctx.fillRect(left, top, w, h);
        }
    }

    // Symmetry
    function drawPixel(x, y, clr=null, skipSym=false) {
        const useColor = clr || color;
        const s = PX * bSize;
        const gx = Math.floor(x/PX)*PX, gy = Math.floor(y/PX)*PX;
        const doErase = (tool === 'eraser' && !clr);

        paintRect(gx, gy, s, useColor, doErase);

        if(!skipSym && sym!=='none') {
            const centerX = SIZE/2, centerY = SIZE/2;
            const pxCenter = gx + PX/2, pyCenter = gy + PX/2;
            const dx = pxCenter - centerX, dy = pyCenter - centerY;

            if(sym==='horizontal'||sym==='both') {
                const mirrorX = Math.floor((centerX - dx - PX/2)/PX)*PX;
                paintRect(mirrorX, gy, s, useColor, doErase);
            }
            if(sym==='vertical'||sym==='both') {
                const mirrorY = Math.floor((centerY - dy - PX/2)/PX)*PX;
                paintRect(gx, mirrorY, s, useColor, doErase);
            }
            if(sym==='both') {
                const mirrorX = Math.floor((centerX - dx - PX/2)/PX)*PX;
                const mirrorY = Math.floor((centerY - dy - PX/2)/PX)*PX;
                paintRect(mirrorX, mirrorY, s, useColor, doErase);
            }
        }
    }

    // Flood Fill
    function floodFill(sx, sy, targetColor, replaceColor) {
        if(targetColor === replaceColor) return;
        const w = SIZE/PX, stack = [{x:Math.floor(sx/PX), y:Math.floor(sy/PX)}], seen = new Set();
        while(stack.length) {
            const {x,y} = stack.pop(), key = `${x},${y}`;
            if(seen.has(key)) continue; seen.add(key);
            const d = fctx.getImageData(x*PX, y*PX, PX, PX);
            const cur = d.data[3]===0 ? null : '#'+[d.data[0],d.data[1],d.data[2]].map(v=>v.toString(16).padStart(2,'0')).join('');
            if(cur===targetColor || (targetColor===null && cur===null)) {
                if(replaceColor===null) fctx.clearRect(x*PX, y*PX, PX, PX);
                else { fctx.fillStyle = replaceColor; fctx.fillRect(x*PX, y*PX, PX, PX); }
                if(x>0) stack.push({x:x-1,y});
                if(x<w-1) stack.push({x:x+1,y});
                if(y>0) stack.push({x,y:y-1});
                if(y<w-1) stack.push({x,y:y+1});
            }
        }
    }

    // Pick Colour
    function pickColor(e) {
        const p = getPos(e); if(!p) return;
        const d = fctx.getImageData(p.x, p.y, PX, PX);
        if(d.data[3]===0) return;
        color = '#'+[d.data[0],d.data[1],d.data[2]].map(v=>v.toString(16).padStart(2,'0')).join('');
        notify('Picked: '+color);
    }

    // Photo Drag
    function photoMouseDown(e) {
        if(!photoDragMode || !photoImg || !active) return;
        const p = getPos(e); if(!p) return;
        if(p.x >= photoX && p.x < photoX+photoW && p.y >= photoY && p.y < photoY+photoH) {
            draggingPhoto = true;
            dragPhotoOffX = p.x - photoX;
            dragPhotoOffY = p.y - photoY;
            e.preventDefault();
        }
    }

    function photoMouseMove(e) {
        if(!draggingPhoto) return;
        const p = getPos(e); if(!p) return;
        const newX = Math.max(0, Math.min(SIZE-photoW, Math.floor((p.x - dragPhotoOffX)/PX)*PX));
        const newY = Math.max(0, Math.min(SIZE-photoH, Math.floor((p.y - dragPhotoOffY)/PX)*PX));
        if(newX !== photoX || newY !== photoY) {
            if(photoBaseImage) fctx.putImageData(photoBaseImage, 0, 0);
            photoX = newX; photoY = newY;
            fctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
            drawGrid();
        }
    }

    function photoMouseUp() {
        if(draggingPhoto) {
            draggingPhoto = false;
            saveState();
            if(photoImg) photoBaseImage = fctx.getImageData(0,0,SIZE,SIZE);
            drawGrid();
        }
    }

    // Import Photo
    function importPhoto() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = () => {
            const file = input.files[0]; if(!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const maxDim = SIZE * 0.8;
                    let w = img.width, h = img.height;
                    if(w > maxDim || h > maxDim) {
                        const scale = Math.min(maxDim/w, maxDim/h);
                        w *= scale; h *= scale;
                    }
                    photoImg = img;
                    photoW = Math.round(w/PX)*PX;
                    photoH = Math.round(h/PX)*PX;
                    photoX = Math.round((SIZE - photoW)/2/PX)*PX;
                    photoY = Math.round((SIZE - photoH)/2/PX)*PX;
                    photoBaseImage = fctx.getImageData(0,0,SIZE,SIZE);
                    fctx.drawImage(img, photoX, photoY, photoW, photoH);
                    saveState();
                    drawGrid();
                    notify('Photo imported');
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    function togglePhotoDrag() {
        photoDragMode = !photoDragMode;
        const btn = $('t-photodrag');
        if(btn) btn.classList.toggle('on', photoDragMode);
        notify(photoDragMode ? 'Photo drag ON' : 'Photo drag OFF');
    }

    // Global Ctrl
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Control') {
            if (selMove && sel.on) {
                // Switching Ctrl
                selCopyDrag = true;
                // Refresh canvas
                drawGrid();
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Control') {
            if (selMove && sel.on) {
                selCopyDrag = false;
                // When Ctrl Is Released, The Original Pixels Should Be Cut (If They Were Previously Copied, They'll Now Be Cleared)
                drawGrid();
            }
        }
    });

    // Event Handlers
    function onDown(e) {
        if(!active||loadingDraft) return;
        if(e.altKey) { pickColor(e); return; }
        if(photoDragMode && photoImg && !draggingPhoto) {
            photoMouseDown(e);
            if(draggingPhoto) return;
        }
        const p = getPos(e); if(!p) return;

        // Selection tool
        if(tool === 'select') {
            if(sel.on && p.x >= sel.x && p.x < sel.x+sel.w && p.y >= sel.y && p.y < sel.y+sel.h) {
                if(!sel.clip) {
                    sel.clip = fctx.getImageData(sel.x, sel.y, sel.w, sel.h);
                }
                selMove = true;
                selCopyDrag = e.ctrlKey;   // Initial state
                selOff = { x: p.x - sel.x, y: p.y - sel.y };
                saveState();
                return;
            }
            selStart = {x:p.x, y:p.y};
            drawing = false;
            return;
        }

        saveState();
        drawing = true;
        if(tool === 'fill') {
            const d = fctx.getImageData(p.x, p.y, PX, PX);
            const tc = d.data[3]===0 ? null : '#'+[d.data[0],d.data[1],d.data[2]].map(v=>v.toString(16).padStart(2,'0')).join('');
            // Use EraseFill Flag Instead Of Checking Tool (Which Is 'FILL')
            const replace = eraseFill ? null : color;
            floodFill(p.x, p.y, tc, replace);
            drawGrid();
            drawing = false;
            return;
        }
        if(tool === 'eyedropper') { pickColor(e); drawing = false; return; }
        drawPixel(p.x, p.y);
        drawGrid();
    }

    function onMove(e) {
        if(!active||loadingDraft) return;
        if(photoDragMode && draggingPhoto) { photoMouseMove(e); return; }
        const p = getPos(e); if(!p) return;

        // Move selection
        if(selMove && sel.on && sel.clip) {
            const nx = Math.floor((p.x - selOff.x)/PX)*PX;
            const ny = Math.floor((p.y - selOff.y)/PX)*PX;
            if(nx !== sel.x || ny !== sel.y) {
                // Clear Original Area Only If We Are NOT In Copy Mode
                if(!selCopyDrag) {
                    fctx.clearRect(sel.x, sel.y, sel.w, sel.h);
                }
                fctx.putImageData(sel.clip, nx, ny);
                sel.x = nx; sel.y = ny;
                drawGrid();
            }
            return;
        }

        if(selStart && tool==='select' && !drawing) {
            sel.x = Math.min(selStart.x, p.x);
            sel.y = Math.min(selStart.y, p.y);
            sel.w = Math.abs(p.x - selStart.x);
            sel.h = Math.abs(p.y - selStart.y);
            sel.on = true;
            drawGrid();
            return;
        }

        if(drawing && tool!=='fill' && tool!=='select' && tool!=='eyedropper') {
            drawPixel(p.x, p.y);
            drawGrid();
        }
    }

    function onUp() {
        if(draggingPhoto) { photoMouseUp(); return; }
        if(selStart) {
            selStart = null;
            if(sel.w === 0) sel.on = false;
            drawGrid();
        }
        selMove = false;
        selCopyDrag = false;
        drawing = false;
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => { if(active&&fg) localStorage.setItem('ps_draft', fg.toDataURL()); notify('Auto-saved'); }, AUTO_DELAY);
    }

    // Selection
    function selCut() { if(!sel.on) return; saveState(); sel.clip = fctx.getImageData(sel.x,sel.y,sel.w,sel.h); fctx.clearRect(sel.x,sel.y,sel.w,sel.h); drawGrid(); notify('Cut'); }
    function selCopy() { if(!sel.on) return; sel.clip = fctx.getImageData(sel.x,sel.y,sel.w,sel.h); notify('Copied'); }
    function selPaste() {
        if(!sel.clip) { notify('Nothing to paste', true); return; }
        saveState();
        fctx.putImageData(sel.clip, sel.x, sel.y);
        sel.w = sel.clip.width;
        sel.h = sel.clip.height;
        sel.on = true;
        drawGrid();
        notify('Pasted');
    }
    function selDelete() { if(!sel.on) return; saveState(); fctx.clearRect(sel.x,sel.y,sel.w,sel.h); drawGrid(); notify('Deleted'); }

    // Clear Canvas
    function clearCanvas() {
        const d = document.createElement('div');
        Object.assign(d.style, {position:'fixed',top:0,left:0,width:'100%',height:'100%',background:'rgba(0,0,0,0.85)',zIndex:100000,display:'flex',alignItems:'center',justifyContent:'center'});
        d.innerHTML = `<div style="background:#0a0a0a;border:2px solid ${THEME};border-radius:12px;padding:16px;text-align:center;color:#fff;font-family:monospace;font-size:12px;width:200px;">
            <div style="color:${THEME};margin-bottom:12px;font-weight:bold;">Clear canvas?</div>
            <div style="display:flex;gap:8px;"><button id="clr-yes" style="flex:1;background:${THEME};border:none;color:#000;padding:6px;border-radius:6px;cursor:pointer;">Yes</button>
            <button id="clr-no" style="flex:1;background:#1a1a1a;border:1px solid #444;color:#aaa;padding:6px;border-radius:6px;cursor:pointer;">No</button></div></div>`;
        document.body.appendChild(d);
        d.querySelector('#clr-yes').onclick = () => { d.remove(); saveState(); fctx.clearRect(0,0,SIZE,SIZE); photoImg=null; photoBaseImage=null; drawGrid(); notify('Cleared'); };
        d.querySelector('#clr-no').onclick = () => d.remove();
        d.onclick = (e) => { if(e.target===d) d.remove(); };
    }

    // Save
    function saveDialog() {
        const d = document.createElement('div');
        Object.assign(d.style, {position:'fixed',top:0,left:0,width:'100%',height:'100%',background:'rgba(0,0,0,0.85)',zIndex:100000,display:'flex',alignItems:'center',justifyContent:'center'});
        d.innerHTML = `<div style="background:#0a0a0a;border:2px solid ${THEME};border-radius:12px;padding:16px;text-align:center;color:#fff;font-family:monospace;font-size:12px;width:200px;">
            <div style="color:${THEME};margin-bottom:10px;font-weight:bold;">Save painting</div>
            <input id="sv-name" placeholder="Name" style="width:100%;background:#1a1a1a;border:1px solid ${THEME};color:${THEME};padding:6px;border-radius:6px;margin-bottom:10px;font-family:monospace;font-size:11px;">
            <div style="display:flex;gap:8px;"><button id="sv-ok" style="flex:1;background:${THEME};border:none;color:#000;padding:6px;border-radius:6px;cursor:pointer;">Save</button>
            <button id="sv-cancel" style="flex:1;background:#1a1a1a;border:1px solid #444;color:#aaa;padding:6px;border-radius:6px;cursor:pointer;">Cancel</button></div></div>`;
        document.body.appendChild(d);
        const inp = d.querySelector('#sv-name'); inp.focus();
        inp.onkeydown = (e) => { if(e.key==='Enter') d.querySelector('#sv-ok').click(); if(e.key==='Escape') d.remove(); };
        d.querySelector('#sv-ok').onclick = () => {
            const name = inp.value.trim() || 'untitled';
            saved.unshift({name, dataURL: fg.toDataURL(), date: new Date().toISOString()});
            localStorage.setItem('ps_saved', JSON.stringify(saved));
            renderLibrary(); d.remove(); notify('Saved: '+name);
        };
        d.querySelector('#sv-cancel').onclick = () => d.remove();
        d.onclick = (e) => { if(e.target===d) d.remove(); };
    }

    // Export
    function expPNG() { const a = document.createElement('a'); a.download = 'pixel.png'; a.href = fg.toDataURL(); a.click(); notify('Exported PNG'); }
    function expJPG() {
        const d = document.createElement('div');
        Object.assign(d.style, {position:'fixed',top:0,left:0,width:'100%',height:'100%',background:'rgba(0,0,0,0.85)',zIndex:100000,display:'flex',alignItems:'center',justifyContent:'center'});
        d.innerHTML = `<div style="background:#0a0a0a;border:2px solid ${THEME};border-radius:12px;padding:14px;text-align:center;color:#fff;font-family:monospace;font-size:12px;width:180px;">
            <div style="color:${THEME};margin-bottom:8px;">JPG Quality</div>
            <input id="jq-val" value="90" style="width:100%;background:#1a1a1a;border:1px solid ${THEME};color:${THEME};padding:6px;border-radius:6px;margin-bottom:8px;text-align:center;">
            <button id="jq-ok" style="width:100%;background:${THEME};border:none;color:#000;padding:6px;border-radius:6px;cursor:pointer;">Export</button></div>`;
        document.body.appendChild(d);
        d.querySelector('#jq-ok').onclick = () => {
            let q = parseInt(d.querySelector('#jq-val').value);
            if(isNaN(q) || q < 1) q = 90;
            q = Math.min(100, Math.max(1, q));
            const a = document.createElement('a'); a.download = 'pixel.jpg'; a.href = fg.toDataURL('image/jpeg', q/100); a.click(); d.remove(); notify('Exported JPG '+q+'%');
        };
        d.onclick = (e) => { if(e.target===d) d.remove(); };
    }

    // Library
    function renderLibrary() {
        const c = $('saved-list'); if(!c) return;
        c.innerHTML = saved.length===0 ? '<div style="color:#555;text-align:center;font-size:9px;padding:8px;">Empty</div>' :
            saved.map((p,i)=>`<div class="sv-item"><img src="${p.dataURL}" style="width:24px;height:24px;image-rendering:pixelated;border-radius:3px;"><span style="flex:1;margin-left:4px;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</span><button class="bs" data-load="${i}" title="Load">Load</button><button class="bs" data-trash="${i}" title="Trash">Trash</button></div>`).join('');
        c.querySelectorAll('[data-load]').forEach(b => b.onclick = (e) => { e.stopPropagation(); const i=+b.dataset.load; const img=new Image(); img.onload=()=>{ fctx.drawImage(img,0,0); saveState(); drawGrid(); notify('Loaded'); }; img.src=saved[i].dataURL; });
        c.querySelectorAll('[data-trash]').forEach(b => b.onclick = (e) => { e.stopPropagation(); moveToTrash(+b.dataset.trash); });
    }

    function moveToTrash(idx) {
        trash.unshift({...saved[idx], delAt: Date.now()});
        saved.splice(idx,1);
        localStorage.setItem('ps_saved', JSON.stringify(saved));
        localStorage.setItem('ps_trash', JSON.stringify(trash));
        renderLibrary(); renderTrash();
        notify('Moved to trash');
    }

    // Trash
    function renderTrash() {
        const c = $('trash-list'); if(!c) return;
        if(trash.length === 0) {
            c.innerHTML = '<div style="color:#555;text-align:center;font-size:9px;padding:12px;">Trash empty</div>';
            return;
        }
        c.innerHTML = trash.map((p, i) => `
            <div class="trash-item">
                <div style="font-size:9px;font-weight:bold;color:#e0e0ff;margin-bottom:3px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</div>
                <div style="text-align:center;margin-bottom:4px;">
                    <img src="${p.dataURL}" style="width:40px;height:40px;image-rendering:pixelated;border-radius:4px;border:1px solid #333;">
                </div>
                <div style="display:flex;gap:4px;justify-content:center;">
                    <button class="bs" data-restore="${i}" title="Restore">Restore</button>
                    <button class="bs" data-del="${i}" title="Delete forever" style="border-color:#f66;color:#f66;">Delete</button>
                </div>
            </div>
            ${i < trash.length - 1 ? '<div style="height:1px;background:#1a1a1a;margin:4px 0;"></div>' : ''}
        `).join('');
        c.querySelectorAll('[data-restore]').forEach(b => b.onclick = (e) => { e.stopPropagation(); restoreFromTrash(+b.dataset.restore); });
        c.querySelectorAll('[data-del]').forEach(b => b.onclick = (e) => { e.stopPropagation(); confirmDelete(+b.dataset.del); });
    }

    function restoreFromTrash(idx) {
        saved.unshift({name:trash[idx].name, dataURL:trash[idx].dataURL, date:trash[idx].date||new Date().toISOString()});
        trash.splice(idx,1);
        localStorage.setItem('ps_saved', JSON.stringify(saved));
        localStorage.setItem('ps_trash', JSON.stringify(trash));
        renderLibrary(); renderTrash();
        notify('Restored');
    }

    function confirmDelete(idx) {
        const d = document.createElement('div');
        Object.assign(d.style, {position:'fixed',top:0,left:0,width:'100%',height:'100%',background:'rgba(0,0,0,0.85)',zIndex:100000,display:'flex',alignItems:'center',justifyContent:'center'});
        d.innerHTML = `<div style="background:#0a0a0a;border:2px solid ${THEME};border-radius:12px;padding:16px;text-align:center;color:#fff;font-family:monospace;font-size:12px;width:200px;">
            <div style="color:#f66;margin-bottom:12px;font-weight:bold;">Delete forever?</div>
            <div style="display:flex;gap:8px;"><button id="del-yes" style="flex:1;background:#f66;border:none;color:#000;padding:6px;border-radius:6px;cursor:pointer;">Yes</button>
            <button id="del-no" style="flex:1;background:#1a1a1a;border:1px solid #444;color:#aaa;padding:6px;border-radius:6px;cursor:pointer;">No</button></div></div>`;
        document.body.appendChild(d);
        d.querySelector('#del-yes').onclick = () => { trash.splice(idx,1); localStorage.setItem('ps_trash', JSON.stringify(trash)); renderTrash(); d.remove(); notify('Deleted forever'); };
        d.querySelector('#del-no').onclick = () => d.remove();
        d.onclick = (e) => { if(e.target===d) d.remove(); };
    }

    // Info
    function showInfo() {
        const d = document.createElement('div');
        Object.assign(d.style, {position:'fixed',top:0,left:0,width:'100%',height:'100%',background:'rgba(0,0,0,0.85)',zIndex:100000,display:'flex',alignItems:'center',justifyContent:'center'});
        d.innerHTML = `<div style="background:#0a0a0a;border:2px solid ${THEME};border-radius:12px;padding:18px;text-align:left;color:#e0e0ff;font-family:monospace;font-size:11px;width:280px;line-height:1.6;">
            <div style="color:${THEME};font-weight:bold;margin-bottom:10px;text-align:center;">Pixel Studio Pro</div>
            <b>Brush</b> – Click & Drag<br>
            <b>Eraser</b> – Click & Drag<br>
            <b>Fill</b> – Click area (Eraser+Fill = erase fill)<br>
            <b>Select</b> – Area, Move (Cut), Ctrl+Move (Copy)<br>
            <b>Pick</b> – Alt+Click<br>
            <b>Symmetry</b> – Toggle Horizontal/Vertical/both<br>
            <b>Grid</b> – Toggle Lines<br>
            <b>Zoom</b> – +/-<br>
            <b>Undo/Redo</b> – Ctrl+Z/Y<br>
            <b>Export</b> – PNG/JPG<br>
            <b>1-5</b> – Brush Size<br>
            <b>Alt+1</b> – Open/Close<br>
            <b>Photo Drag</b> – Toggle To Move Photo<br>
            <div style="margin-top:10px;text-align:center;color:#555;">Itz_Krishna AKA Everlasting</div>
            <button id="info-close" style="margin-top:10px;width:100%;background:${THEME};border:none;color:#000;padding:6px;border-radius:6px;cursor:pointer;font-weight:bold;">Close</button></div>`;
        document.body.appendChild(d);
        d.querySelector('#info-close').onclick = () => d.remove();
        d.onclick = (e) => { if(e.target===d) d.remove(); };
    }

    // Drag
    function makeDraggable(panel, handle) {
        let ox, oy, mx, my, dragging = false;
        handle.addEventListener('mousedown', (e) => {
            if(e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'CANVAS') return;
            dragging = true;
            const rect = panel.getBoundingClientRect();
            ox = rect.left; oy = rect.top;
            mx = e.clientX; my = e.clientY;
            document.body.style.userSelect = 'none';
        });
        window.addEventListener('mousemove', (e) => {
            if(!dragging) return;
            const dx = e.clientX - mx, dy = e.clientY - my;
            let left = ox + dx, top = oy + dy;
            left = Math.max(0, Math.min(left, innerWidth - panel.offsetWidth));
            top = Math.max(0, Math.min(top, innerHeight - panel.offsetHeight));
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
        });
        window.addEventListener('mouseup', () => { dragging = false; document.body.style.userSelect = ''; });
    }

    // Styles
    const css = document.createElement('style');
    css.textContent = `
        #ps { position:fixed; top:50px; left:50px; display:none; z-index:9999999; font-family:'Segoe UI',monospace; }
        #ps .pnl { background:#0c0c0c; border:2px solid ${THEME}; border-radius:12px; width:540px; box-shadow:0 0 30px rgba(0,255,204,0.15); position:relative; }
        #ps .hdr { background:#0c0c0c; padding:8px 14px; border-bottom:1px solid ${THEME}; cursor:move; display:flex; justify-content:space-between; border-radius:10px 10px 0 0; color:${THEME}; font-size:12px; font-weight:bold; user-select:none; }
        #ps .tr { display:flex; gap:3px; padding:4px 8px; justify-content:center; flex-wrap:wrap; }
        #ps .btn { background:#151515; border:1px solid #333; color:#aaa; padding:4px 10px; border-radius:5px; cursor:pointer; font-size:10px; font-family:monospace; min-width:42px; transition:all .15s; }
        #ps .btn:hover { background:#222; border-color:${THEME}; color:${THEME}; }
        #ps .btn.on { background:${THEME}; color:#000; border-color:${THEME}; box-shadow:0 0 8px ${THEME}44; font-weight:bold; }
        #ps .bs { background:#151515; border:1px solid #333; color:#aaa; padding:3px 6px; border-radius:4px; cursor:pointer; font-size:8px; transition:all .15s; }
        #ps .bs:hover { background:${THEME}; color:#000; }
        #ps .cr { display:flex; flex-wrap:wrap; gap:3px; padding:6px 8px; border-top:1px solid #1a1a1a; border-bottom:1px solid #1a1a1a; align-items:center; justify-content:center; }
        #ps .sw { width:20px; height:20px; border-radius:4px; cursor:pointer; border:1px solid #444; transition:all .1s; }
        #ps .sw:hover { transform:scale(1.2); border-color:${THEME}; z-index:1; }
        #ps .sw.on { border:2px solid #fff; box-shadow:0 0 8px ${THEME}; transform:scale(1.1); }
        #ps .cc { width:24px; height:20px; background:linear-gradient(135deg,red,yellow,lime,cyan,blue,fuchsia); border-radius:4px; cursor:pointer; border:1px solid #444; }
        #ps .ca { display:flex; padding:6px; gap:6px; align-items:flex-start; }
        #ps .vp { background:#1a1a1a; width:264px; height:264px; position:relative; overflow:auto; border-radius:0; border:1px solid #222; flex-shrink:0; }
        #ps canvas { position:absolute; top:0; left:0; image-rendering:pixelated; border-radius:0; }
        #ps #fg-pro { cursor:crosshair; z-index:5; }
        #ps .sp { width:125px; background:#0c0c0c; border-radius:8px; padding:4px; border:1px solid #1a1a1a; flex-shrink:0; }
        #ps .st { color:${THEME}; font-size:8px; margin-bottom:4px; text-align:center; font-weight:bold; letter-spacing:1px; }
        #ps .sv-item { background:#111; margin:2px 0; padding:4px; border-radius:4px; font-size:7px; display:flex; align-items:center; gap:4px; }
        #ps .bb { display:flex; gap:4px; padding:6px 8px; border-top:1px solid #1a1a1a; }
        #ps .bb-btn { flex:1; background:#151515; border:1px solid #333; color:#aaa; padding:4px; border-radius:5px; cursor:pointer; font-size:9px; text-align:center; transition:all .15s; }
        #ps .bb-btn:hover { background:#222; border-color:${THEME}; color:${THEME}; }
        #ps .tp { width:0; overflow:hidden; transition:width .25s; background:#0c0c0c; border-radius:8px; margin-left:4px; flex-shrink:0; }
        #ps .tp.open { width:160px; padding:5px; border-left:1px solid #1a1a1a; }
        #ps .trash-item { background:#111; margin:2px 0; padding:6px 5px; border-radius:5px; font-size:8px; }
        #ps .nf { position:absolute; top:8px; right:12px; background:rgba(0,0,0,0.9); color:${THEME}; padding:3px 10px; border-radius:12px; font-size:8px; opacity:0; transition:opacity .2s; pointer-events:none; z-index:10; border:1px solid ${THEME}44; }
        #ps .ss { width:100%; accent-color:${THEME}; margin:2px 0; }
        #ps .sl { font-size:8px; color:${THEME}; margin-top:1px; text-align:center; }
        #ps .ticks { display:flex; justify-content:space-between; padding:0 6px; }
        #ps .tick { width:1px; height:5px; background:#444; }
    `;
    document.head.appendChild(css);

    // UI
    const root = document.createElement('div'); root.id = 'ps';
    root.innerHTML = `
        <div class="pnl">
            <div class="hdr" id="drag-h"><span>PIXEL STUDIO</span><span style="font-size:8px;color:#555;">v1.0</span></div>
            <div class="tr" id="tb1"></div>
            <div class="tr" id="tb2"></div>
            <div class="cr" id="cRow"></div>
            <div style="padding:0 8px 4px;">
                <input type="range" id="szR" min="1" max="5" value="1" class="ss">
                <div class="ticks"><span class="tick"></span><span class="tick"></span><span class="tick"></span><span class="tick"></span><span class="tick"></span></div>
                <div class="sl" id="szL">Size: 1</div>
            </div>
            <div class="ca">
                <div class="vp" id="vp"><canvas id="bg-pro" width="${SIZE}" height="${SIZE}"></canvas><canvas id="fg-pro" width="${SIZE}" height="${SIZE}" tabindex="0"></canvas></div>
                <div class="sp"><div class="st">SAVED</div><div id="saved-list" style="max-height:145px;overflow-y:auto;"></div><button class="btn" id="t-folder" style="width:100%;margin-top:4px;font-size:8px;" title="Link folder">Link Folder</button></div>
                <div class="tp" id="trashPnl"><div class="st">TRASH</div><div id="trash-list" style="max-height:145px;overflow-y:auto;"></div></div>
            </div>
            <div class="bb"><button class="bb-btn" id="t-info">Info</button><button class="bb-btn" id="t-trash">Trash</button><button class="bb-btn" id="t-disc">Discord</button><button class="bb-btn" id="t-photo">Photo</button><button class="bb-btn" id="t-photodrag">Photo Drag</button></div>
            <div class="nf" id="nfBox">Ready</div>
        </div>`;
    document.body.appendChild(root);

    // References
    notifyEl = $('nfBox');
    fg = $('fg-pro'); fctx = fg.getContext('2d');
    bg = $('bg-pro'); bctx = bg.getContext('2d');
    viewportEl = $('vp');
    panelEl = root.querySelector('.pnl');

    fg.width = bg.width = SIZE; fg.height = bg.height = SIZE;
    drawGrid(); saveState();

    if(draft) {
        loadingDraft = true;
        const img = new Image();
        img.onload = () => { fctx.drawImage(img,0,0); drawGrid(); loadingDraft = false; saveState(); notify('Draft restored'); };
        img.onerror = () => { loadingDraft = false; };
        img.src = draft;
    }

    // Toolbar
    const t1 = [['brush','Brush'],['eraser','Eraser'],['fill','Fill'],['select','Select'],['eyedropper','Pick'],['grid','Grid'],['symmetry','Symmetry'],['clear','Clear']];
    const t2 = [['undo','Undo'],['redo','Redo'],['zoomin','Zoom+'],['zoomout','Zoom-'],['save','Save'],['exp_png','PNG'],['exp_jpg','JPG'],['folder_save','Save on PC']];

    [t1, t2].forEach((arr, idx) => {
        const row = $('tb'+(idx+1));
        arr.forEach(([id, label]) => {
            const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.id = 't-'+id; b.title = label;
            row.appendChild(b);
        });
    });

    // Colour Swatches
    const cRow = $('cRow');
    Object.entries(colorNames).forEach(([hex, name]) => {
        const s = document.createElement('div'); s.className = 'sw'; s.style.background = hex; s.title = name;
        if(hex === THEME) s.classList.add('on');
        s.onclick = () => { $$('.sw').forEach(x => x.classList.remove('on')); s.classList.add('on'); color = hex; notify(name); };
        cRow.appendChild(s);
    });
    const cc = document.createElement('div'); cc.className = 'cc'; cc.title = 'Custom'; cc.onclick = () => { const i=document.createElement('input'); i.type='color'; i.value=color; i.onchange=(e)=>{color=e.target.value; notify(color);}; i.click(); };
    cRow.appendChild(cc);

    // Size Slider
    $('szR').oninput = (e) => { bSize = +e.target.value; $('szL').textContent = 'Size: '+bSize; };

    // Button Actions
    $('t-brush').onclick = () => act('brush','brush');
    $('t-eraser').onclick = () => act('eraser','eraser');
    $('t-fill').onclick = () => act('fill','fill');
    $('t-select').onclick = () => act('select','select');
    $('t-eyedropper').onclick = () => act('eyedropper','eyedropper');
    $('t-clear').onclick = clearCanvas;
    $('t-grid').onclick = () => { grid = !grid; drawGrid(); notify(grid?'Grid on':'Grid off'); };
    $('t-symmetry').onclick = () => { const modes = ['none','horizontal','vertical','both']; sym = modes[(modes.indexOf(sym)+1)%4]; notify('Symmetry: '+sym); };
    $('t-undo').onclick = undo;
    $('t-redo').onclick = redo;
    $('t-zoomin').onclick = () => { zoom = Math.min(3, zoom+0.1); viewportEl.style.transform = `scale(${zoom})`; };
    $('t-zoomout').onclick = () => { zoom = Math.max(0.5, zoom-0.1); viewportEl.style.transform = `scale(${zoom})`; };
    $('t-save').onclick = saveDialog;
    $('t-exp_png').onclick = expPNG;
    $('t-exp_jpg').onclick = expJPG;
    $('t-folder').onclick = async () => { try { dirHandle = await window.showDirectoryPicker(); notify('Folder linked'); } catch(e) { notify('Cancelled', true); } };
    $('t-folder_save').onclick = async () => {
        if(!dirHandle) { notify('Link folder first', true); return; }
        const name = prompt('Filename:') || 'art';
        try {
            const blob = await new Promise(r => fg.toBlob(r));
            const fh = await dirHandle.getFileHandle(name+'.png', {create:true});
            const w = await fh.createWritable();
            await w.write(blob);
            await w.close();
            notify('Saved to folder');
        } catch(e) { notify('Save failed', true); }
    };
    $('t-info').onclick = showInfo;
    $('t-trash').onclick = () => { const p = $('trashPnl'); p.classList.toggle('open'); renderTrash(); };
    $('t-disc').onclick = () => window.open('https://discord.gg/byXxUkZxag','_blank');
    $('t-photo').onclick = importPhoto;
    $('t-photodrag').onclick = togglePhotoDrag;

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        if(!active) return;
        if(e.ctrlKey && e.key==='x') { e.preventDefault(); selCut(); }
        if(e.ctrlKey && e.key==='c') { e.preventDefault(); selCopy(); }
        if(e.ctrlKey && e.key==='v') { e.preventDefault(); selPaste(); }
        if(e.key==='Delete') { e.preventDefault(); selDelete(); }
        if(e.key==='Escape') { sel.on=false; sel.w=0; drawGrid(); }
        if(e.ctrlKey && e.key==='z') { e.preventDefault(); undo(); }
        if(e.ctrlKey && e.key==='y') { e.preventDefault(); redo(); }
        const n = parseInt(e.key);
        if(n>=1 && n<=5) { bSize = n; $('szR').value = n; $('szL').textContent = 'Size: '+n; e.preventDefault(); }
    });

    // Canvas Events
    fg.onmousedown = onDown;
    window.addEventListener('mousemove', (e) => { if(active) onMove(e); });
    window.addEventListener('mouseup', onUp);

    // Hotkey Alt+1
    window.addEventListener('keydown', (e) => {
        if(e.altKey && e.key==='1') {
            e.preventDefault();
            const show = root.style.display !== 'flex';
            root.style.display = show ? 'flex' : 'none';
            active = show;
            if(show) { notify('Studio open'); setTimeout(() => fg.focus(), 100); }
        }
    });

    // Drag
    makeDraggable(panelEl, $('drag-h'));

    // Initialise
    renderLibrary(); renderTrash();
    viewportEl.style.transform = `scale(${zoom})`; viewportEl.style.transformOrigin = 'top left';
    root.style.display = 'none'; active = false;
    $('t-brush').classList.add('on');

    console.log('Pixel Studio v1.0 | Alt+1');
})();
