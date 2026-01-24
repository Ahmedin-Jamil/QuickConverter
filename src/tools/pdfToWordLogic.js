import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Document, Packer, Paragraph, ImageRun } from 'docx';

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

    // High-resolution scale factor
    const SCALE = 2.0;

    for (let i = 1; i <= numPages; i++) {
        if (onProgress) onProgress(Math.round((i / numPages) * 90));

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: SCALE });

        // Create canvas to render PDF page
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Render PDF page to canvas
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        // Convert canvas to PNG as Uint8Array
        const dataUrl = canvas.toDataURL('image/png');
        const base64Data = dataUrl.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.charCodeAt(j);
        }

        // Calculate dimensions for Word (in pixels at 96 DPI)
        const maxWidthPx = 600; // ~6.25 inches at 96 DPI
        const aspectRatio = viewport.height / viewport.width;
        const widthPx = maxWidthPx;
        const heightPx = Math.round(maxWidthPx * aspectRatio);

        docSections.push({
            properties: {
                page: {
                    margin: {
                        top: 360,
                        right: 360,
                        bottom: 360,
                        left: 360,
                    },
                },
            },
            children: [
                new Paragraph({
                    children: [
                        new ImageRun({
                            type: 'png',
                            data: bytes,
                            transformation: {
                                width: widthPx,
                                height: heightPx,
                            },
                        }),
                    ],
                }),
            ],
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
