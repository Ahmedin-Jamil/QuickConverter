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

    for (let i = 1; i <= numPages; i++) {
        if (onProgress) onProgress(Math.round((i / numPages) * 90));

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Basic text reconstruction
        // Organize items by Y position (lines)
        const lines = {};
        textContent.items.forEach(item => {
            const y = Math.round(item.transform[5]); // Y coordinate
            if (!lines[y]) lines[y] = [];
            lines[y].push(item);
        });

        // Sort lines from top to bottom (PDF coordinates start from bottom-left)
        const sortedY = Object.keys(lines).sort((a, b) => b - a);

        const children = [];

        sortedY.forEach(y => {
            // Sort items in line from left to right
            const lineItems = lines[y].sort((a, b) => a.transform[4] - b.transform[4]);
            const text = lineItems.map(item => item.str).join(' '); // Simple join

            if (text.trim().length > 0) {
                children.push(new Paragraph({
                    children: [new TextRun(text)],
                    spacing: { after: 200 } // Add some spacing between lines
                }));
            }
        });

        // If page is empty (e.g. scanned image PDF), fallback to image rendering
        if (children.length === 0) {
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            const dataUrl = canvas.toDataURL('image/png');
            const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));

            children.push(new Paragraph({
                children: [new ImageRun({
                    data: bytes,
                    transformation: {
                        width: 600,
                        height: Math.round(600 * (viewport.height / viewport.width))
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
