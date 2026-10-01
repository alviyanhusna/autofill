/**
 * OCR tabel horizontal: deteksi kolom → skip target (langsung "1") → OCR pagu per sel.
 */
(function (global) {
    const OCR_WHITELIST = "0123456789.,";
    const MIN_CELL_PX   = 10;   // pixel minimum lebar sel setelah upscale

    // ── Preprocessing ──────────────────────────────────────────────────────────

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload  = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    async function preprocessImage(dataUrl) {
        const img   = await loadImage(dataUrl);
        const scale = Math.min(10, Math.max(5, Math.ceil(220 / Math.max(img.height, 1))));
        const w     = Math.round(img.width  * scale);
        const h     = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, w, h);

        // Binarize: threshold adaptif sedikit agar titik ribuan tidak hilang
        const id  = ctx.getImageData(0, 0, w, h);
        const d   = id.data;
        for (let i = 0; i < d.length; i += 4) {
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const v   = lum < 160 ? 0 : 255;
            d[i] = d[i + 1] = d[i + 2] = v;
            d[i + 3] = 255;
        }
        ctx.putImageData(id, 0, 0);
        return canvas;
    }

    // ── Deteksi garis kolom ────────────────────────────────────────────────────

    function getLum(data, w, x, y) {
        const i = (y * w + x) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    function maxVertRun(data, w, h, x) {
        let max = 0, cur = 0;
        for (let y = 0; y < h; y++) {
            if (getLum(data, w, x, y) < 128) { cur++; if (cur > max) max = cur; }
            else cur = 0;
        }
        return max;
    }

    function mergeNear(xs, gap) {
        if (!xs.length) return [];
        const out = [];
        let g = [xs[0]];
        for (let i = 1; i < xs.length; i++) {
            if (xs[i] - g[g.length - 1] <= gap) { g.push(xs[i]); }
            else { out.push(Math.round(g.reduce((s, v) => s + v, 0) / g.length)); g = [xs[i]]; }
        }
        out.push(Math.round(g.reduce((s, v) => s + v, 0) / g.length));
        return out;
    }

    function findDividers(data, w, h) {
        const minRun = Math.max(10, Math.floor(h * 0.70));   // harus nyaris setinggi sel
        const raw = [];
        let inLine = false, lineStart = 0;

        for (let x = 0; x < w; x++) {
            if (maxVertRun(data, w, h, x) >= minRun) {
                if (!inLine) { inLine = true; lineStart = x; }
            } else if (inLine) {
                raw.push(Math.floor((lineStart + x - 1) / 2));
                inLine = false;
            }
        }
        if (inLine) raw.push(Math.floor((lineStart + w - 1) / 2));
        return mergeNear(raw, 6);
    }

    // ── Pembagian sel ──────────────────────────────────────────────────────────

    function regionsFromDividers(divs, w) {
        const valid = divs.filter(x => x > 5 && x < w - 5);
        const bounds = [0, ...valid, w];
        const out = [];
        for (let i = 0; i < bounds.length - 1; i++) {
            const x0 = bounds[i] + 4;
            const x1 = bounds[i + 1] - 4;
            if (x1 - x0 >= MIN_CELL_PX) out.push({ x0, x1 });
        }
        return out;
    }

    function evenSplit(w, n) {
        const cw = w / n;
        return Array.from({ length: n }, (_, i) => ({
            x0: Math.floor(i * cw) + 4,
            x1: Math.floor((i + 1) * cw) - 4,
        }));
    }

    /**
     * Tandai setiap sel sebagai "target" (sempit) atau "pagu" (lebar).
     * Kolom sempit (< 60% median) → target, tidak perlu OCR.
     */
    function tagKinds(regions) {
        const widths = regions.map(r => r.x1 - r.x0).sort((a, b) => a - b);
        const med    = widths[Math.floor(widths.length / 2)] || 1;
        return regions.map((r, idx) => ({
            ...r,
            idx,
            kind: (r.x1 - r.x0) < med * 0.60 ? "target" : "pagu",
        }));
    }

    // ── OCR per sel ────────────────────────────────────────────────────────────

    function normToken(text) {
        const m = String(text ?? "").match(/\d[\d.,]*/);
        return m ? m[0] : "";
    }

    /**
     * Bangun canvas crop dari satu sel dengan padding putih dan margin vertikal.
     * Hapus sisa garis border dari tepi kiri/kanan.
     */
    function cropCell(canvas, region) {
        const { x0, x1 } = region;
        const srcW = x1 - x0;
        const srcH = canvas.height;

        // Potong sedikit atas/bawah untuk hilangkan border horizontal
        const y0 = Math.floor(srcH * 0.12);
        const y1 = Math.floor(srcH * 0.88);
        const cH = Math.max(8, y1 - y0);

        const pad = Math.max(20, Math.round(cH * 0.5));
        const c   = document.createElement("canvas");
        c.width   = srcW + pad * 2;
        c.height  = cH  + pad * 2;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(canvas, x0, y0, srcW, cH, pad, pad, srcW, cH);

        // Hapus sisa border vertikal tipis di kiri/kanan crop
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 10, c.height);
        ctx.fillRect(c.width - 10, 0, 10, c.height);
        return c;
    }

    async function ocrPaguCell(worker, canvas, region) {
        const crop = cropCell(canvas, region);
        // PSM 7 = satu baris teks; whitelist hanya angka + titik koma
        await worker.setParameters({
            tessedit_pageseg_mode: "7",
            tessedit_char_whitelist: OCR_WHITELIST,
        });
        const { data } = await worker.recognize(crop.toDataURL("image/png"));
        return normToken(data?.text || "");
    }

    // ── Fallback: baca seluruh gambar → pisah via posisi simbol ──────────────

    function median(arr) {
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)] || 0;
    }

    function tokensFromSymbols(data) {
        const syms = (data?.symbols || [])
            .filter(s => s?.text && /[\d.,]/.test(s.text))
            .map(s => ({ text: s.text.replace(/[^\d.,]/g, ""), x0: s.bbox.x0, x1: s.bbox.x1 }))
            .filter(s => s.text);
        if (!syms.length) return [];

        syms.sort((a, b) => a.x0 - b.x0);
        const widths = syms.map(s => Math.max(1, s.x1 - s.x0));
        const gap    = Math.max(12, median(widths) * 2.2);

        const clusters = [[syms[0]]];
        for (let i = 1; i < syms.length; i++) {
            const prev = clusters[clusters.length - 1];
            const last = prev[prev.length - 1];
            if (syms[i].x0 - last.x1 > gap) clusters.push([syms[i]]);
            else prev.push(syms[i]);
        }
        return clusters.map(c => normToken(c.map(s => s.text).join(""))).filter(Boolean);
    }

    async function ocrFullFallback(worker, canvas) {
        await worker.setParameters({
            tessedit_pageseg_mode: "6",
            tessedit_char_whitelist: OCR_WHITELIST,
        });
        const { data } = await worker.recognize(canvas.toDataURL("image/png"));
        return tokensFromSymbols(data);
    }

    // ── Pipeline utama ─────────────────────────────────────────────────────────

    /**
     * @param {object} worker   Tesseract worker
     * @param {string} dataUrl  gambar (data URL)
     * @param {number} [numCols] override jumlah kolom (0 = auto)
     */
    async function recognizeTableImage(worker, dataUrl, numCols) {
        const canvas = await preprocessImage(dataUrl);
        const { width, height } = canvas;

        // Tentukan regions
        let regions;
        if (numCols && numCols > 1) {
            regions = evenSplit(width, numCols);
        } else {
            const data    = canvas.getContext("2d").getImageData(0, 0, width, height).data;
            const divs    = findDividers(data, width, height);
            regions       = regionsFromDividers(divs, width);
            const ratio   = width / Math.max(height, 1);
            const autoN   = ratio > 7 ? 12 : ratio > 5.5 ? 10 : ratio > 4 ? 8 : Math.max(6, Math.round(ratio * 1.4));
            if (regions.length < autoN - 1) regions = evenSplit(width, autoN);
        }

        regions = tagKinds(regions);

        // OCR: target → "1", pagu → OCR per sel
        const tokens  = [];
        let paguCount = 0;
        let okCount   = 0;

        for (const r of regions) {
            if (r.kind === "target") {
                tokens.push("1");
            } else {
                const tok = await ocrPaguCell(worker, canvas, r);
                paguCount++;
                if (tok) { tokens.push(tok); okCount++; }
                else tokens.push("");   // placeholder agar indeks tidak bergeser
            }
        }

        // Jika terlalu banyak pagu kosong → fallback baca seluruh gambar
        if (paguCount > 0 && okCount / paguCount < 0.5) {
            const fb = await ocrFullFallback(worker, canvas);
            if (fb.length > okCount) {
                // Rekonstruksi: sisipkan "1" di posisi target, isi pagu dari fallback
                const rebuilt = [];
                let fi = 0;
                for (const r of regions) {
                    if (r.kind === "target") rebuilt.push("1");
                    else if (fi < fb.length) rebuilt.push(fb[fi++]);
                }
                return { tokens: rebuilt, method: "fallback" };
            }
        }

        return {
            tokens: tokens.filter(t => t !== ""),   // buang placeholder kosong
            method: `columns:${okCount}/${paguCount}`,
        };
    }

    async function configureWorker(worker) {
        await worker.setParameters({
            tessedit_pageseg_mode: "7",
            tessedit_char_whitelist: OCR_WHITELIST,
        });
    }

    global.ImageOcr = { recognizeTableImage, configureWorker };
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this);
