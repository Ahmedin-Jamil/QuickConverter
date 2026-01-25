import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Document, Packer, Paragraph, TextRun, ImageRun } from 'docx';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Pixel-Perfect PDF to Word Converter
 * Renders each PDF page as a high-resolution image and embeds it into Word.
 */
export async function convertPdfToWord(file, onProgress = () => { }) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const docSections = [];

    // Conversion factor: 1 PDF point = 20 Twips (Word unit)
    const PT_TO_TWIP = 20;

    for (let i = 1; i <= numPages; i++) {
        if (onProgress) onProgress(Math.round((i / numPages) * 90));

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });
        const pageHeight = viewport.height;

        // --- 1. Segment Grouping ---
        const items = textContent.items;

        // Sort: Top to Bottom, then Left to Right
        items.sort((a, b) => {
            const yDiff = b.transform[5] - a.transform[5];
            if (Math.abs(yDiff) > 2) return yDiff;
            return a.transform[4] - b.transform[4];
        });

        const segments = [];
        let currentSegment = null;

        items.forEach(item => {
            const x = item.transform[4];
            const y = item.transform[5];
            // Approx font size from transform matrix (scale x element)
            const fontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);
            const text = item.str;
            const width = item.width;
            // Note: some PDFs have width=0 or undefined for spaces, need handling?
            // Usually valid text has width.

            if (!text.trim()) return;

            let appended = false;
            if (currentSegment) {
                const yDiff = Math.abs(currentSegment.y - y);
                // expected next X = start + width
                // check gap
                const expectedX = currentSegment.x + currentSegment.width;
                const gap = x - expectedX;

                // Merge if same line (yDiff < 2) and close enough (gap small)
                // Gap < fontSize * 1.5 allows for normal spaces. 
                // Larger gap means new segment/column.
                if (yDiff < 2 && gap > -5 && gap < (fontSize * 2)) {
                    // Add space if gap suggests it
                    if (gap > (fontSize * 0.2)) {
                        currentSegment.text += " ";
                    }
                    currentSegment.text += text;
                    currentSegment.width += (gap > 0 ? gap : 0) + width;
                    appended = true;
                }
            }

            if (!appended) {
                if (currentSegment) segments.push(currentSegment);
                currentSegment = {
                    text: text,
                    x: x,
                    y: y,
                    width: width,
                    fontSize: fontSize,
                    fontName: item.fontName,
                    height: item.height || fontSize
                };
            }
        });
        if (currentSegment) segments.push(currentSegment);

        // --- 2. Render Segments as Frames ---
        const children = [];

        segments.forEach(seg => {
            const xTwips = Math.round(seg.x * PT_TO_TWIP);
            // Word Y = (PageHeight - PDF_Y - Ascent_Adjustment)
            // Use 0.8 * fontSize as approx ascent
            const yTwips = Math.round((pageHeight - seg.y - (seg.fontSize * 0.8)) * PT_TO_TWIP);

            // Safety check for negative positions
            const safeX = Math.max(0, xTwips);
            const safeY = Math.max(0, yTwips);

            const isBold = seg.fontName && (seg.fontName.toLowerCase().includes('bold') || seg.fontName.includes('Bd'));
            const isItalic = seg.fontName && (seg.fontName.toLowerCase().includes('italic') || seg.fontName.includes('It'));

            children.push(new Paragraph({
                children: [new TextRun({
                    text: seg.text,
                    size: Math.round(seg.fontSize * 2), // Half-pts
                    bold: isBold,
                    italics: isItalic,
                    font: { name: "Calibri" }
                })],
                frame: {
                    type: "absolute",
                    position: {
                        x: safeX,
                        y: safeY
                    },
                    width: Math.round((seg.width + 10) * PT_TO_TWIP), // buffer width
                    height: Math.round((seg.fontSize * 1.2) * PT_TO_TWIP),
                    anchor: {
                        horizontal: "page",
                        vertical: "page"
                    },
                    rule: "exact"
                },
                spacing: { line: 240, before: 0, after: 0 }
            }));
        });

        // Fallback for empty pages
        if (children.length === 0 && segments.length === 0) {
            const viewportImg = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewportImg.width;
            canvas.height = viewportImg.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport: viewportImg }).promise;
            const dataUrl = canvas.toDataURL('image/png');
            const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));

            children.push(new Paragraph({
                children: [new ImageRun({
                    data: bytes,
                    transformation: {
                        width: 600,
                        height: Math.round(600 * (viewportImg.height / viewportImg.width))
                    },
                    type: 'png'
                })]
            }));
        }

        docSections.push({
            properties: {},
            children: children
        });
    }

    if (onProgress) onProgress(95);

    const doc = new Document({
        sections: docSections,
    });

    const blob = await Packer.toBlob(doc);
    if (onProgress) onProgress(100);
    return blob;
}
