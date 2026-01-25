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

        const viewport = page.getViewport({ scale: 1.0 }); // Use 1.0 for standard point calculations

        sortedY.forEach(y => {
            // Sort items in line from left to right
            const lineItems = lines[y].sort((a, b) => a.transform[4] - b.transform[4]);

            // Calculate indentation of the first item
            // 72 DPI points to Twips (1/20 pt) conversion: 1 pt = 20 twips
            const firstItemX = lineItems[0].transform[4];
            const indentationTwips = Math.round(firstItemX * 20);

            const paragraphChildren = [];
            let lastX = firstItemX;

            lineItems.forEach((item, index) => {
                const currentX = item.transform[4];

                // Check for gap (Tab simulation for columns)
                if (index > 0 && (currentX - lastX) > 20) { // >20pt gap, likely a new column
                    paragraphChildren.push(new TextRun({
                        text: "\t", // Insert tab character
                    }));
                }

                // Font size extraction (approximate from transform[0] which is scaleX)
                // Default size is usually 12 if unknown
                const fontSize = Math.round(item.transform[0]);
                const isBold = item.fontName && item.fontName.toLowerCase().includes('bold');

                paragraphChildren.push(new TextRun({
                    text: item.str,
                    size: fontSize * 2, // docx uses half-points (e.g. 24 = 12pt)
                    bold: isBold
                }));

                // Update lastX to end of this item (approximate width calculation is hard without font metrics, 
                // so we use start + length * avg_char_width or just currentX + width if available in item.width)
                lastX = currentX + (item.width || (item.str.length * (fontSize * 0.5)));
            });

            if (paragraphChildren.length > 0) {
                // Add tab stop if we used tabs
                const tabStops = [];
                // Simple heuristic: add a tab stop every 3 inches just in case
                // Or better: rely on default tabs. 
                // A more advanced math would calculate tab stops based on the "gap" positions.

                children.push(new Paragraph({
                    children: paragraphChildren,
                    indent: {
                        left: indentationTwips
                    },
                    spacing: { after: 120 } // Reduced spacing for tighter layout
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
