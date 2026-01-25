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

        // --- 1. Fuzzy Line Grouping ---
        // PDFs often have tiny vertical differences (e.g. 100.1 vs 100.0) for text on the "same" line.
        const items = textContent.items;
        const lines = []; // Array of { y: number, items: [] }

        // Sort items by Y (descending) first to process top-down
        items.sort((a, b) => b.transform[5] - a.transform[5]);

        items.forEach(item => {
            const y = item.transform[5];
            // Try to find an existing line within tolerance (e.g., 2 points)
            const match = lines.find(line => Math.abs(line.y - y) < 4);

            if (match) {
                match.items.push(item);
            } else {
                lines.push({ y, items: [item] });
            }
        });

        // --- 2. Process Lines ---
        const children = [];

        lines.forEach(line => {
            // Sort items in line from left to right (X ascending)
            const lineItems = line.items.sort((a, b) => a.transform[4] - b.transform[4]);

            // Calculate paragraph indentation (First item's X)
            const firstItemX = lineItems[0].transform[4];
            const indentTwips = Math.round(firstItemX * PT_TO_TWIP);

            const paragraphChildren = [];
            const tabStops = [];

            let lastXEnd = firstItemX; // Track where the last text ended

            lineItems.forEach((item, index) => {
                const currentX = item.transform[4];
                const fontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);
                const charWidth = (item.width / item.str.length) || (fontSize * 0.5); // Approx char width if width is missing

                // --- 3. Gap Detection (Tabs vs Spaces) ---
                if (index > 0) {
                    const gap = currentX - lastXEnd;

                    // If gap is significant (e.g., > 2 spaces), treat as a Tab
                    if (gap > (charWidth * 3)) {
                        // Calculate exact tab position in Twips
                        // Word tab stops are relative to the margin, or absolute? 
                        // Usually relative to indent. Let's use absolute position from left margin.
                        // Position = currentX * 20
                        const tabPositionTwips = Math.round(currentX * PT_TO_TWIP);

                        // Add a TabStop definition for this paragraph
                        tabStops.push({
                            type: "left",
                            position: tabPositionTwips
                        });

                        paragraphChildren.push(new TextRun({
                            text: "\t", // The tab character
                            size: Math.round(fontSize * 2), // Maintain font size for the tab
                        }));
                    } else if (gap > (charWidth * 0.2)) {
                        // Small gap: just add a space
                        paragraphChildren.push(new TextRun({
                            text: " ",
                            size: Math.round(fontSize * 2)
                        }));
                    }
                }

                // Clean text
                const text = item.str;
                const isBold = item.fontName && (item.fontName.toLowerCase().includes('bold') || item.fontName.includes('Bd'));
                const isItalic = item.fontName && (item.fontName.toLowerCase().includes('italic') || item.fontName.includes('It'));

                paragraphChildren.push(new TextRun({
                    text: text,
                    size: Math.round(fontSize * 2), // Half-points
                    bold: isBold,
                    italics: isItalic,
                    font: {
                        name: "Calibri" // Normalize font to look clean
                    }
                }));

                // Update lastXEnd to the end of this item
                lastXEnd = currentX + item.width;
            });

            if (paragraphChildren.length > 0) {
                children.push(new Paragraph({
                    children: paragraphChildren,
                    indent: {
                        left: indentTwips
                    },
                    tabStops: tabStops, // Apply the calculated tab stops
                    spacing: {
                        after: 120, // Small gap after paragraph
                        line: 240   // Standard line height
                    }
                }));
            }
        });

        // Fallback for empty pages (images)
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
