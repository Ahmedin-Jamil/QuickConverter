// Homepage Converter Functionality
import './styles/homepage.css';
// import imageCompression from 'browser-image-compression'; // Removed
import heic2any from 'heic2any';
import { trackToolUsage, trackConversion, trackDownload, trackError } from './utils/analytics.js';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { getShareLinks, shareSite } from './utils/share.js';

// State
let selectedFormat = 'pdf'; // Default matches PDF to Docs active tab
let currentTool = 'pdf-to-word';
let selectedTool = 'pdf-to-word';
let selectedMode = ''; // To handle PNG to CSV vs CSV to PNG
let uploadedFiles = [];

// DOM Elements
const mainUploadArea = document.getElementById('mainUploadArea');
const mainFileInput = document.getElementById('mainFileInput');
const selectFilesBtn = document.getElementById('selectFilesBtn');
const mainPreviewArea = document.getElementById('mainPreviewArea');
const mainImageList = document.getElementById('mainImageList');
const mainConvertBtn = document.getElementById('mainConvertBtn');
const mainResultsArea = document.getElementById('mainResultsArea');
const mainResultsList = document.getElementById('mainResultsList');
const mainConvertMoreBtn = document.getElementById('mainConvertMoreBtn');
const formatTabs = document.querySelectorAll('.format-tab');
const targetFormatText = document.getElementById('targetFormatText');
const gridMenuBtn = document.getElementById('gridMenuBtn');
const megaMenu = document.getElementById('megaMenu');
const layoutModeContainer = document.getElementById('layoutModeContainer');
const layoutModeSelect = document.getElementById('layoutModeSelect');
const customizationSettings = document.getElementById('customizationSettings');
const showLabelsToggle = document.getElementById('showLabelsToggle');
const showPaginationToggle = document.getElementById('showPaginationToggle');
const showDateToggle = document.getElementById('showDateToggle');
const showTimeToggle = document.getElementById('showTimeToggle');
const csvPreviewSection = document.getElementById('csvPreviewSection');
const csvSampleHeader = document.getElementById('csvSampleHeader');
const csvSampleBody = document.getElementById('csvSampleBody');


// Initialize the file input for the default tool (PDF to Docs)
(function initDefaultTool() {
    mainFileInput.setAttribute('accept', 'application/pdf');
    document.getElementById('uploadTypeHint').textContent = 'PDF Document • Pixel-Perfect Rendering';
    if (targetFormatText) targetFormatText.textContent = 'DOCS';
})();

// Format Tab Switching
formatTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const tool = tab.dataset.tool;
        const format = tab.dataset.format;
        const mode = tab.dataset.mode;

        // Update active tab UI immediately
        formatTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedTool = tool || 'image-converter';
        selectedFormat = format || (selectedTool.includes('pdf') ? 'pdf' : 'jpg');
        selectedMode = mode || '';

        // Clear previous conversion data to prevent stale previews
        uploadedFiles = [];
        window.currentConversionResults = null;
        if (mainFileInput) mainFileInput.value = '';
        const mainPreviewBtn = document.getElementById('mainPreviewDownloadBtn');
        if (mainPreviewBtn) mainPreviewBtn.style.display = 'none';

        // Reset UI Areas
        if (mainUploadArea) mainUploadArea.style.display = 'block';
        if (mainPreviewArea) mainPreviewArea.style.display = 'none';
        if (mainResultsArea) mainResultsArea.style.display = 'none';

        // Configure Input based on Tool
        console.log('Selected tool:', selectedTool);
        if (selectedTool === 'pdf-to-word' || selectedTool === 'pdf-to-excel' || selectedTool === 'pdf-to-image') {
            mainFileInput.setAttribute('accept', 'application/pdf');
            console.log('Set accept to: application/pdf');
            let hint = 'PDF Document • Pixel-Perfect Rendering';
            if (selectedTool === 'pdf-to-excel') hint = 'Bank Statement • 3 Free Conversions (.xlsx)';
            if (selectedTool === 'pdf-to-image') hint = 'PDF Document • High-Res Image Extraction';
            document.getElementById('uploadTypeHint').textContent = hint;
        }
        else if (selectedTool === 'csv-to-pdf' || selectedTool === 'csv-to-docs') {
            mainFileInput.setAttribute('accept', 'text/csv,.csv');
            console.log('Set accept to: text/csv,.csv');
            document.getElementById('uploadTypeHint').textContent = 'CSV File • Structured Data Layout';
        }
        else if (selectedTool === 'excel-to-pdf' || selectedTool === 'excel-to-docs') {
            mainFileInput.setAttribute('accept', '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel');
            console.log('Set accept to: .xlsx,.xls');
            document.getElementById('uploadTypeHint').textContent = 'Excel File (.xlsx, .xls) • Structured Data Layout';
        }
        else if (selectedTool === 'ocr-converter') {
            mainFileInput.setAttribute('accept', 'image/png,image/jpeg,.jpg,.png');
            document.getElementById('uploadTypeHint').textContent = 'Images (PNG/JPG) • Optical Character Recognition';
        }
        else if (selectedTool === 'image-converter') {
            const source = tab.dataset.source;
            if (format === 'png') {
                mainFileInput.setAttribute('accept', 'image/jpeg,.jpg,.jpeg');
                document.getElementById('uploadTypeHint').textContent = 'JPG, JPEG Images • Convert to PNG';
            } else if (format === 'jpg') {
                if (source === 'heic') {
                    mainFileInput.setAttribute('accept', 'image/heic,.heic,.HEIC');
                    document.getElementById('uploadTypeHint').textContent = 'HEIC Images (Apple) • Convert to JPG';
                } else if (source === 'png') {
                    mainFileInput.setAttribute('accept', 'image/png,.png');
                    document.getElementById('uploadTypeHint').textContent = 'PNG Images • Convert to JPG';
                } else if (source === 'avif') {
                    mainFileInput.setAttribute('accept', 'image/avif,.avif');
                    document.getElementById('uploadTypeHint').textContent = 'AVIF Images • Convert to JPG';
                } else if (source === 'jxl') {
                    mainFileInput.setAttribute('accept', '.jxl');
                    document.getElementById('uploadTypeHint').textContent = 'JPEG-XL (JXL) • Convert to JPG';
                }
            }
        }

        // If files exist, show preview
        if (uploadedFiles.length > 0) {
            mainPreviewArea.style.display = 'block';
        }

        // Update Button Text
        if (targetFormatText) {
            if (selectedTool === 'pdf-to-word') targetFormatText.textContent = 'DOCS';
            else if (selectedTool === 'pdf-to-excel') targetFormatText.textContent = 'EXCEL';
            else if (selectedTool === 'pdf-to-image') targetFormatText.textContent = 'IMAGES';
            else if (selectedTool === 'csv-to-pdf') targetFormatText.textContent = 'PDF';
            else if (selectedTool === 'ocr-converter') targetFormatText.textContent = 'EXCEL';
            else if (selectedTool === 'csv-to-docs') targetFormatText.textContent = 'DOCS';
            else if (selectedTool === 'excel-to-pdf') targetFormatText.textContent = 'PDF';
            else if (selectedTool === 'excel-to-docs') targetFormatText.textContent = 'DOCS';
            else if (selectedFormat) targetFormatText.textContent = selectedFormat.toUpperCase();
        }

        // Show/Hide Layout Mode Toggle
        // Excel to Docs: No format options (convert as-is)
        // Excel to PDF, CSV to PDF, CSV to Docs: Show format options
        const dataToolsWithOptions = ['csv-to-pdf', 'csv-to-docs', 'excel-to-pdf'];
        if (dataToolsWithOptions.includes(selectedTool)) {
            layoutModeContainer.style.display = 'flex';
            customizationSettings.style.display = 'flex';
        } else {
            layoutModeContainer.style.display = 'none';
            customizationSettings.style.display = 'none';
            if (selectedTool !== 'excel-to-docs') {
                csvPreviewSection.style.display = 'none';
            }
        }
    });
});

// Initialize file input accept attribute for default tool
if (mainFileInput) {
    mainFileInput.setAttribute('accept', 'application/pdf');
}

// Hide "Show Record Labels" when Landscape mode is selected
if (layoutModeSelect && showLabelsToggle) {
    const labelsToggleContainer = showLabelsToggle.closest('label.custom-toggle');

    layoutModeSelect.addEventListener('change', () => {
        if (layoutModeSelect.value === 'table') {
            // Hide Show Record Labels for Landscape/Table mode (doesn't use labels)
            if (labelsToggleContainer) {
                labelsToggleContainer.style.display = 'none';
            }
        } else {
            // Show Show Record Labels for Portrait/List mode (uses labels)
            if (labelsToggleContainer) {
                labelsToggleContainer.style.display = 'flex';
            }
        }
    });

    // Initialize on page load
    if (layoutModeSelect.value === 'table' && labelsToggleContainer) {
        labelsToggleContainer.style.display = 'none';
    }
}

// File Upload Handlers
selectFilesBtn.addEventListener('click', () => mainFileInput.click());

mainUploadArea.addEventListener('click', (e) => {
    if (e.target === mainUploadArea || e.target.closest('.upload-icon') || e.target.closest('.upload-hint')) {
        mainFileInput.click();
    }
});

mainUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    mainUploadArea.classList.add('drag-over');
});

mainUploadArea.addEventListener('dragleave', () => {
    mainUploadArea.classList.remove('drag-over');
});

mainUploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    mainUploadArea.classList.remove('drag-over');

    const items = e.dataTransfer.items;
    if (items) {
        const filePromises = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : items[i].getAsEntry ? items[i].getAsEntry() : null;
            if (item) {
                filePromises.push(traverseFileTree(item));
            } else if (items[i].kind === 'file') {
                filePromises.push(Promise.resolve([items[i].getAsFile()]));
            }
        }

        try {
            const fileArrays = await Promise.all(filePromises);
            const flatFiles = fileArrays.flat().filter(f => f); // Filter nulls
            if (flatFiles.length > 0) {
                handleFiles(flatFiles);
            }
        } catch (err) {
            console.error('Error scanning folders:', err);
            handleFiles(e.dataTransfer.files); // Fallback
        }
    } else {
        handleFiles(e.dataTransfer.files);
    }
});

// Recursive folder traversal
function traverseFileTree(item, path = '') {
    return new Promise((resolve) => {
        if (item.isFile) {
            item.file(file => resolve([file]));
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            const entries = [];

            // readEntries needs to be called until it returns empty
            const readEntries = () => {
                dirReader.readEntries(async (result) => {
                    if (result.length === 0) {
                        const subPromises = entries.map(entry => traverseFileTree(entry, path + item.name + '/'));
                        const subFiles = await Promise.all(subPromises);
                        resolve(subFiles.flat());
                    } else {
                        entries.push(...result);
                        readEntries();
                    }
                }, () => resolve([])); // Error
            };
            readEntries();
        } else {
            resolve([]);
        }
    });
}

mainFileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

// Handle uploaded files
async function handleFiles(files) {
    if (!files || files.length === 0) return; // FIX: Handle cancel/empty input

    // Clear previous conversion results to prevent stale previews
    window.currentConversionResults = null;
    const mainPreviewBtn = document.getElementById('mainPreviewDownloadBtn');
    if (mainPreviewBtn) mainPreviewBtn.style.display = 'none';

    // Precise input validation by tool type
    const pdfTools = ['pdf-to-word', 'pdf-to-excel', 'pdf-to-image'];
    const csvTools = ['csv-to-pdf', 'csv-to-docs'];
    const excelTools = ['excel-to-pdf', 'excel-to-docs'];
    const imageTools = ['image-converter', 'ocr-converter'];

    if (pdfTools.includes(selectedTool)) {
        uploadedFiles = Array.from(files).filter(file => file.type === 'application/pdf');
        if (uploadedFiles.length === 0) {
            alert('Please upload valid PDF files');
            return;
        }
    } else if (csvTools.includes(selectedTool)) {
        uploadedFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.csv'));
        if (uploadedFiles.length === 0) {
            alert('Please upload valid CSV files');
            return;
        }
    } else if (excelTools.includes(selectedTool)) {
        uploadedFiles = Array.from(files).filter(file =>
            file.name.toLowerCase().endsWith('.xlsx') ||
            file.name.toLowerCase().endsWith('.xls')
        );
        if (uploadedFiles.length === 0) {
            alert('Please upload valid Excel files (.xlsx or .xls)');
            return;
        }
    } else {
        // Image tools (OCR or Converter)
        uploadedFiles = Array.from(files).filter(file => file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.heic'));
        if (uploadedFiles.length === 0) {
            alert('Please upload valid image files');
            return;
        }
    }

    // Track tool usage
    const trackingLabel = (selectedTool === 'pdf-to-word' || selectedTool === 'pdf-to-excel') ? 'Homepage PDF Elite' : 'Homepage Image Converter';
    trackToolUsage(trackingLabel);

    // Update preview section title based on tool
    const previewTitle = document.getElementById('previewTitle');
    if (uploadedFiles.length === 0) {
        if (previewTitle) previewTitle.textContent = '';
        mainPreviewArea.style.display = 'none';
        mainImageList.innerHTML = '';
        if (csvPreviewSection) csvPreviewSection.style.display = 'none';
        return;
    }
    if (previewTitle) {
        if (selectedTool === 'pdf-to-word' || selectedTool === 'pdf-to-excel') {
            previewTitle.textContent = 'Your Documents';
        } else {
            previewTitle.textContent = 'Your Images';
        }
    }

    // Hide preview area - user doesn't want to see file previews
    if (mainPreviewArea) mainPreviewArea.style.display = 'none';
    if (mainImageList) mainImageList.innerHTML = '';

    // Show CSV/Excel Snapshot for relevant tools
    const dataTools = ['csv-to-pdf', 'csv-to-docs', 'excel-to-pdf', 'excel-to-docs'];
    if (dataTools.includes(selectedTool)) {
        // CSV/Excel preview is handled separately, no need to render here
        if (csvPreviewSection) csvPreviewSection.style.display = 'block';

        // Render Excel file preview if it's an Excel tool
        const excelTools = ['excel-to-pdf', 'excel-to-docs'];
        if (excelTools.includes(selectedTool) && uploadedFiles.length > 0) {
            const excelFile = uploadedFiles[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                    // Render Excel data into CSV preview table
                    if (csvSampleHeader && csvSampleBody && jsonData.length > 0) {
                        // Clear existing content
                        csvSampleHeader.innerHTML = '';
                        csvSampleBody.innerHTML = '';

                        // Render header row
                        const headerRow = jsonData[0];
                        headerRow.forEach(cell => {
                            const th = document.createElement('th');
                            th.textContent = cell || '';
                            th.style.padding = '8px';
                            th.style.borderBottom = '2px solid #e2e8f0';
                            th.style.fontWeight = '600';
                            th.style.textAlign = 'left';
                            th.style.background = '#f8fafc';
                            csvSampleHeader.appendChild(th);
                        });

                        // Render data rows (max 5 rows for preview)
                        const previewRows = jsonData.slice(1, 6);
                        previewRows.forEach(row => {
                            const tr = document.createElement('tr');
                            headerRow.forEach((_, colIndex) => {
                                const td = document.createElement('td');
                                td.textContent = row[colIndex] !== undefined ? row[colIndex] : '';
                                td.style.padding = '8px';
                                td.style.borderBottom = '1px solid #e2e8f0';
                                tr.appendChild(td);
                            });
                            csvSampleBody.appendChild(tr);
                        });
                    }
                } catch (error) {
                    console.error('Error reading Excel file for preview:', error);
                }
            };
            reader.readAsArrayBuffer(excelFile);
        }
    } else {
        const oldLabel = document.getElementById('csvPreviewLabel');
        if (oldLabel) oldLabel.remove();
        if (csvPreviewSection) csvPreviewSection.style.display = 'none';
    }

    // Show Convert button after files are loaded
    if (uploadedFiles.length > 0 && mainConvertBtn) {
        mainConvertBtn.style.display = 'inline-flex';

        // Auto-scroll to the Convert button
        setTimeout(() => {
            mainConvertBtn.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }, 100);
    }
}

// Create preview element
async function createPreview(file) {
    const div = document.createElement('div');
    div.className = 'file-preview-card';

    // Create thumbnail
    const img = document.createElement('img');
    img.className = 'file-preview-img';

    // Handle PDF files
    if (file.type === 'application/pdf') {
        img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="%232d5a27" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
    }
    // Handle CSV files
    else if (file.name.toLowerCase().endsWith('.csv')) {
        img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="%232d5a27" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="9" y2="15.01"></line><line x1="15" y1="15" x2="15" y2="15.01"></line><line x1="9" y1="12" x2="9" y2="12.01"></line><line x1="15" y1="12" x2="15" y2="12.01"></line><line x1="9" y1="18" x2="9" y2="18.01"></line><line x1="15" y1="18" x2="15" y2="18.01"></line></svg>';
    }
    // Handle HEIC files
    else if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
        try {
            const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg' });
            img.src = URL.createObjectURL(convertedBlob);
        } catch (error) {
            img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect fill="%23ddd" width="60" height="60"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999" font-size="10">HEIC</text></svg>';
        }
    } else {
        img.src = URL.createObjectURL(file);
    }

    // File info
    const info = document.createElement('div');
    info.className = 'file-preview-info';
    info.innerHTML = `
    <div class="file-preview-name">${file.name}</div>
    <div class="file-preview-meta">
      ${(file.size / 1024).toFixed(1)} KB • ${file.type === 'application/pdf' ? 'PDF Document' : (file.type || 'Image')}
    </div>
  `;

    div.appendChild(img);
    div.appendChild(info);

    return div;
}


// Convert Files
mainConvertBtn.style.display = 'none'; // Hide by default

mainFileInput.addEventListener('change', () => {
    if (mainFileInput.files && mainFileInput.files.length > 0) {
        mainConvertBtn.style.display = 'inline-flex';

        // Auto-scroll to the Convert button
        setTimeout(() => {
            mainConvertBtn.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }, 100);
    } else {
        mainConvertBtn.style.display = 'none';
    }
});

mainConvertBtn.addEventListener('click', async () => {
    if (uploadedFiles.length === 0) return;

    // Unified unlimited client-side processing
    console.log('Unlimited conversion starting for tool:', selectedTool);

    mainConvertBtn.disabled = true;
    const originalHTML = mainConvertBtn.innerHTML;

    // Show appropriate loading text based on tool
    let loadingText = 'Converting...';
    if (selectedTool === 'pdf-to-word') loadingText = 'Rendering PDF...';
    if (selectedTool === 'pdf-to-excel') loadingText = 'Extracting Tables...';

    mainConvertBtn.innerHTML = `<span class="loading">${loadingText}</span>`;
    mainConvertBtn.classList.add('converting');

    // Clear old results to prevent showing stale data
    window.currentConversionResults = null;
    const mainPreviewBtn = document.getElementById('mainPreviewDownloadBtn');
    if (mainPreviewBtn) mainPreviewBtn.style.display = 'none';

    try {
        const results = [];

        for (const file of uploadedFiles) {
            let resultBlob, resultFilename;

            // --- CLIENT-SIDE ENGINE ---
            if (selectedTool === 'image-converter') {
                const converted = await convertImage(file, selectedFormat);
                results.push(converted);
                trackConversion('Homepage Image Converter', file.type.split('/')[1] || 'unknown', selectedFormat, file.size);
            }
            else if (selectedTool === 'pdf-to-word') {
                const { convertPdfToWord } = await import('./tools/pdfToWordLogic.js');
                resultBlob = await convertPdfToWord(file, (p) => {
                    mainConvertBtn.innerHTML = `<span class="loading">Rendering PDF (${p}%)...</span>`;
                });
                resultFilename = file.name.replace(/\.[^/.]+$/, "") + ".docx";
                results.push({ blob: resultBlob, filename: resultFilename, size: resultBlob.size });
                trackConversion('Homepage PDF to Word', 'pdf', 'docx', file.size);
            }
            else if (selectedTool === 'csv-to-docs') {
                // Quick CSV to Word conversion
                const csvData = await file.text();
                const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType } = await import('docx');
                const rows = csvData.split('\n').map(row => row.split(','));

                const tableRows = rows.map(row => new TableRow({
                    children: row.map(cell => new TableCell({
                        children: [new Paragraph(cell.trim())],
                        width: { size: 100 / row.length, type: WidthType.PERCENTAGE }
                    }))
                }));

                const doc = new Document({
                    sections: [{
                        children: [new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } })]
                    }]
                });

                resultBlob = await Packer.toBlob(doc);
                resultFilename = file.name.replace(/\.[^/.]+$/, "") + ".docx";
                results.push({ blob: resultBlob, filename: resultFilename, size: resultBlob.size });
                trackConversion('Homepage CSV to Word', 'csv', 'docx', file.size);
            }
            else if (selectedTool === 'excel-to-pdf' || selectedTool === 'excel-to-docs') {
                // Implement Excel client-side
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer);
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                if (selectedTool === 'excel-to-docs') {
                    const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType } = await import('docx');
                    const tableRows = jsonData.map(row => new TableRow({
                        children: row.map(cell => new TableCell({
                            children: [new Paragraph(String(cell || '').trim())],
                            width: { size: 100 / row.length, type: WidthType.PERCENTAGE }
                        }))
                    }));

                    const doc = new Document({
                        sections: [{
                            children: [new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } })]
                        }]
                    });

                    resultBlob = await Packer.toBlob(doc);
                    resultFilename = file.name.replace(/\.[^/.]+$/, "") + ".docx";
                } else {
                    // Excel to PDF
                    const { jsPDF } = await import('jspdf');
                    const { default: autoTable } = await import('jspdf-autotable');
                    const doc = new jsPDF();
                    autoTable(doc, { head: [jsonData[0]], body: jsonData.slice(1) });
                    resultBlob = doc.output('blob');
                    resultFilename = file.name.replace(/\.[^/.]+$/, "") + ".pdf";
                }

                results.push({ blob: resultBlob, filename: resultFilename, size: resultBlob.size });
                trackConversion(`Homepage Excel to ${selectedTool.includes('pdf') ? 'PDF' : 'Word'}`, 'xlsx', selectedTool.includes('pdf') ? 'pdf' : 'docx', file.size);
            }
            else if (selectedTool === 'ocr-converter') {
                mainConvertBtn.innerHTML = `<span class="loading">Reading Text...</span>`;
                const { createWorker } = await import('tesseract.js');
                const worker = await createWorker();
                // No need to loadLanguage/initialize in v4+ generally if using the simple API, 
                // but let's be safe for v5/v6
                const { data: { text } } = await worker.recognize(file);
                await worker.terminate();

                resultBlob = new Blob([text], { type: 'text/plain' });
                resultFilename = file.name.replace(/\.[^/.]+$/, "") + "_ocr.txt";
                results.push({ blob: resultBlob, filename: resultFilename, size: resultBlob.size });
                trackConversion('Homepage OCR', 'image', 'txt', file.size);
            }
            else if (selectedTool === 'pdf-to-image') {
                // Client-side PDF to Image using PDF.js
                resultBlob = await convertPdfToImageClientSide(file);
                resultFilename = file.name.replace(/\.[^/.]+$/, "") + ".png";
                results.push({ blob: resultBlob, filename: resultFilename, size: resultBlob.size });
                trackConversion('Homepage PDF to Image', 'pdf', 'png', file.size);
            }
            else if (selectedTool === 'csv-to-pdf') {
                resultBlob = await convertCsvToPdfClientSide(file);
                resultFilename = file.name.replace(/\.[^/.]+$/, "") + ".pdf";
                results.push({ blob: resultBlob, filename: resultFilename, size: resultBlob.size });
                trackConversion('Homepage CSV to PDF', 'csv', 'pdf', file.size);
            }
            else {
                console.warn('Unknown tool or not fully implemented client-side:', selectedTool);
                alert(`The ${selectedTool.replace(/-/g, ' ').toUpperCase()} tool is being optimized for your browser. Please try another tool in the meantime.`);
            }
        }

        displayResults(results);

    } catch (error) {
        console.error('Conversion error:', error);
        if (error.message !== 'LIMIT_EXCEEDED') {
            alert(`An error occurred: ${error.message}`);
        }
    } finally {
        mainConvertBtn.disabled = false;
        mainConvertBtn.innerHTML = originalHTML;
        mainConvertBtn.classList.remove('converting');
    }
});

// --- CLIENT-SIDE HELPER FUNCTIONS ---

async function convertPdfToImageClientSide(file) {
    const arrayBuffer = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function convertCsvToPdfClientSide(file) {
    const text = await file.text();
    const { default: Papa } = await import('papaparse');
    const { data } = Papa.parse(text);
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFontSize(10);
    let y = 20;
    data.forEach(row => {
        doc.text(row.join(" | ").substring(0, 100), 10, y);
        y += 7;
        if (y > 280) { doc.addPage(); y = 20; }
    });
    return doc.output('blob');
}


// Convert single image
async function convertImage(file, format) {
    let blob = file;

    // Handle HEIC files first
    if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
        blob = await heic2any({ blob: file, toType: 'image/jpeg' });
    }

    // Create image element
    const img = new Image();
    const imageUrl = URL.createObjectURL(blob);

    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
    });

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Convert to desired format
    const mimeType = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
    const quality = format === 'png' ? 1 : 0.92;

    const convertedBlob = await new Promise(resolve => {
        canvas.toBlob(resolve, mimeType, quality);
    });

    // Clean up
    URL.revokeObjectURL(imageUrl);

    // Generate filename
    const originalName = file.name.replace(/\.[^/.]+$/, '');
    const newFilename = `${originalName}.${format}`;

    return {
        blob: convertedBlob,
        filename: newFilename,
        size: convertedBlob.size
    };
}

// Show success toast notification
function showSuccessToast() {
    // Create toast element
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: -400px;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(16, 185, 129, 0.3);
        font-size: 1rem;
        font-weight: 600;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        transition: left 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    `;
    toast.innerHTML = `
        <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
        <span>✓ Conversion Complete! Your files are ready.</span>
    `;

    document.body.appendChild(toast);

    // Slide in from left
    setTimeout(() => {
        toast.style.left = '20px';
    }, 100);

    // Slide out after 4 seconds
    setTimeout(() => {
        toast.style.left = '-400px';
        setTimeout(() => {
            toast.remove();
        }, 500);
    }, 4000);
}

// Display conversion results
function displayResults(results) {
    if (mainPreviewArea) mainPreviewArea.style.display = 'none';
    // Hide the results area since we're using the button beside Convert button
    if (mainResultsArea) mainResultsArea.style.display = 'none';

    // Check if result is a Word document - show success modal instead of toast
    if (results.length > 0 && results[0].filename.endsWith('.docx')) {
        console.log('📄 Word document ready - showing success modal');

        // Store results globally
        window.currentConversionResults = results;

        // Show success modal for Word documents
        const successModal = document.getElementById('successModal');
        if (successModal) {
            successModal.style.display = 'flex';

            // Update modal content for Word documents
            const modalContent = successModal.querySelector('.modal-container');
            if (modalContent) {
                modalContent.innerHTML = `
                    <div style="font-size: 4rem; margin-bottom: 20px;">✅</div>
                    <h2 style="font-size: 1.75rem; font-weight: 800; margin-bottom: 12px; color: #0f172a;">Conversion Successful!</h2>
                    <p style="color: #64748b; font-size: 1.1rem; line-height: 1.6; margin-bottom: 24px;">
                        Your document is ready! Click the button below to download it.
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <button class="btn btn-primary" id="successDownloadBtn">Download DOCX</button>
                        <button class="btn btn-secondary" id="successModalOkBtn">Done</button>
                    </div>
                `;

                // Set up Download button click handler
                const downloadBtn = document.getElementById('successDownloadBtn');
                if (downloadBtn) {
                    downloadBtn.onclick = () => {
                        if (window.currentConversionResults && window.currentConversionResults.length > 0) {
                            const res = window.currentConversionResults[0];
                            const url = URL.createObjectURL(res.blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = res.filename;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }
                    };
                }

                // Set up OK button click handler
                const okBtn = document.getElementById('successModalOkBtn');
                if (okBtn) {
                    okBtn.onclick = () => {
                        successModal.style.display = 'none';

                        // Show Download Word button next to Convert button
                        const mainPreviewBtn = document.getElementById('mainPreviewDownloadBtn');
                        if (mainPreviewBtn) {
                            mainPreviewBtn.style.display = 'inline-flex';
                            mainPreviewBtn.textContent = '📥 Download Word';
                            mainPreviewBtn.style.background = 'linear-gradient(135deg, #217346 0%, #185c37 100%)';

                            // Set up download handler
                            mainPreviewBtn.onclick = () => {
                                if (window.currentConversionResults && window.currentConversionResults.length > 0) {
                                    const res = window.currentConversionResults[0];
                                    const url = URL.createObjectURL(res.blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = res.filename;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);

                                    console.log('📥 Downloaded Word document:', res.filename);
                                }
                            };
                        }
                    };
                }
            }
        }

        return; // Skip showing preview button immediately for Word documents
    }

    // Show slide-in toast notification for non-Word files
    showSuccessToast();

    // Show the Preview & Download button beside Convert button for non-Word files
    const mainPreviewBtn = document.getElementById('mainPreviewDownloadBtn');
    if (mainPreviewBtn && results.length > 0) {
        mainPreviewBtn.style.display = 'inline-flex';

        // Store results globally so the button can access them
        window.currentConversionResults = results;

        console.log('🔍 RESULTS DEBUG: Stored results =', results.map(r => ({ filename: r.filename, size: r.size, blobType: r.blob.type })));

        // Set up click handler
        mainPreviewBtn.onclick = () => {
            if (window.currentConversionResults && window.currentConversionResults.length > 0) {
                // Trigger the preview for the first result
                const res = window.currentConversionResults[0];
                console.log('🔍 BUTTON CLICK: Opening preview for =', res.filename, 'blob type =', res.blob.type);
                openPreviewModal(res);
            }
        };
    }

    if (mainResultsList) mainResultsList.innerHTML = '';

    results.forEach(res => {
        const div = document.createElement('div');
        div.className = 'result-card' + (res.filename.endsWith('.csv') ? ' flex-column align-items-stretch' : '');

        const info = document.createElement('div');
        info.className = 'result-info';
        info.innerHTML = `
      <div class="result-name">${res.filename}</div>
      <div class="result-size">${(res.size / 1024).toFixed(1)} KB</div>
    `;

        // If CSV, add preview table
        if (res.filename.endsWith('.csv')) {
            const blobTextPromise = res.blob.text();
            blobTextPromise.then(csvString => {
                const { data } = Papa.parse(csvString);
                const tableContainer = document.createElement('div');
                tableContainer.className = 'csv-preview-container mt-4';
                const table = document.createElement('table');
                table.className = 'csv-preview-table';

                data.slice(0, 5).forEach(row => {
                    const tr = document.createElement('tr');
                    row.forEach(cell => {
                        const td = document.createElement('td');
                        td.textContent = cell;
                        tr.appendChild(td);
                    });
                    table.appendChild(tr);
                });
                tableContainer.appendChild(table);
                div.insertBefore(tableContainer, downloadBtnWrapper);
            });
        }

        const downloadBtnWrapper = document.createElement('div');
        downloadBtnWrapper.style.display = 'flex';
        downloadBtnWrapper.style.justifyContent = 'space-between';
        downloadBtnWrapper.style.alignItems = 'center';

        const downloadBtn = document.createElement('a');
        downloadBtn.className = 'btn btn-primary';
        downloadBtn.href = URL.createObjectURL(res.blob);
        downloadBtn.download = res.filename;
        downloadBtn.innerHTML = `
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
      </svg>
      Download
    `;

        downloadBtn.addEventListener('click', () => {
            trackDownload(res.filename, res.filename.split('.').pop());
        });

        downloadBtnWrapper.appendChild(downloadBtn);
        div.appendChild(info);
        div.appendChild(downloadBtnWrapper);
        if (mainResultsList) mainResultsList.appendChild(div);
    });
}

// Open preview modal for a converted file
async function openPreviewModal(res) {
    const modal = document.getElementById('previewModal');
    const closeBtn = document.getElementById('closePreviewModal');
    const content = document.getElementById('previewModalContent');
    const layoutContainer = document.getElementById('layoutModeContainer');
    const customSettings = document.getElementById('customizationSettings');
    const layoutSelect = document.getElementById('layoutModeSelect');
    const labelsToggle = document.getElementById('showLabelsToggle');
    const paginationToggle = document.getElementById('showPaginationToggle');
    const dateToggle = document.getElementById('showDateToggle');
    const timeToggle = document.getElementById('showTimeToggle');

    content.innerHTML = '';
    let type = res.filename.split('.').pop().toLowerCase();
    let url = URL.createObjectURL(res.blob);
    let previewHtml = '';

    console.log('🔍 PREVIEW DEBUG: filename =', res.filename);
    console.log('🔍 PREVIEW DEBUG: detected type =', type);
    console.log('🔍 PREVIEW DEBUG: blob type =', res.blob.type);
    console.log('🔍 PREVIEW DEBUG: blob size =', res.blob.size);

    if (type === 'pdf') {
        if (layoutContainer) layoutContainer.style.display = 'flex';
        if (customSettings) customSettings.style.display = 'flex';

        const orientationInfo = document.getElementById('orientationInfo');
        const orientationText = document.getElementById('orientationText');
        let isLandscape = false;
        let columnCount = 0;

        if (selectedTool === 'csv-to-pdf' && uploadedFiles.length > 0) {
            try {
                const csvFile = uploadedFiles[0];
                const csvText = await csvFile.text();
                const { data } = Papa.parse(csvText, { header: true });
                const columns = Object.keys(data[0] || {});
                columnCount = columns.length;
                const estimatedWidth = columnCount * 35;
                isLandscape = estimatedWidth > 210 && layoutSelect && layoutSelect.value === 'table';

                if (orientationInfo && orientationText) {
                    orientationInfo.style.display = 'block';
                    if (layoutSelect && layoutSelect.value === 'list') {
                        orientationText.innerHTML = `<strong>Portrait A4</strong><br/>${columnCount} columns<br/>List view format`;
                    } else if (isLandscape) {
                        orientationText.innerHTML = `<strong>Landscape</strong><br/>${columnCount} columns detected<br/>Wide table optimized`;
                    } else {
                        orientationText.innerHTML = `<strong>Portrait A4</strong><br/>${columnCount} columns<br/>Standard table format`;
                    }
                }
            } catch (e) {
                console.log('Could not analyze CSV for orientation info');
            }
        }

        const modalContainer = modal.querySelector('.modal-container');
        if (modalContainer) {
            if (isLandscape) {
                modalContainer.style.maxWidth = '1200px';
                modalContainer.style.width = '90vw';
            } else {
                modalContainer.style.maxWidth = '1200px';
                modalContainer.style.width = '85vw';
            }
        }

        const previewContainer = document.createElement('div');
        previewContainer.style.width = '100%';
        previewContainer.style.display = 'flex';
        previewContainer.style.justifyContent = 'center';
        previewContainer.style.alignItems = 'center';

        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        iframe.style.boxShadow = '0 2px 16px rgba(0,0,0,0.1)';

        if (isLandscape) {
            iframe.style.width = '100%';
            iframe.style.maxWidth = '1000px';
            iframe.style.height = '600px';
        } else {
            iframe.style.width = '100%';
            iframe.style.maxWidth = '700px';
            iframe.style.height = '750px';
        }

        previewContainer.appendChild(iframe);
        content.appendChild(previewContainer);

        const sidebarDownloadContainer = document.getElementById('sidebarDownloadContainer');
        if (sidebarDownloadContainer) {
            sidebarDownloadContainer.style.display = 'block';
            sidebarDownloadContainer.innerHTML = `<a class='btn btn-primary' href='${url}' download='${res.filename}' style='width: 100%; font-size: 1rem; padding: 0.875rem 1.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;'><svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>Download PDF</a>`;
        }

    } else if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "heic", "jxl"].includes(type)) {
        if (layoutContainer) layoutContainer.style.display = 'none';
        if (customSettings) customSettings.style.display = 'none';

        const modalContainer = modal.querySelector('.modal-container');
        if (modalContainer) {
            modalContainer.style.maxWidth = '900px';
            modalContainer.style.width = '70vw';
        }

        previewHtml = `<img src="${url}" style="max-width:100%;max-height:600px;border-radius:8px;box-shadow:0 2px 16px #0002;" />`;
        content.innerHTML = previewHtml;

        const sidebarDownloadContainer = document.getElementById('sidebarDownloadContainer');
        if (sidebarDownloadContainer) {
            sidebarDownloadContainer.style.display = 'block';
            sidebarDownloadContainer.innerHTML = `<a class='btn btn-primary' href='${url}' download='${res.filename}' style='width: 100%; font-size: 1rem; padding: 0.875rem 1.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;'><svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>Download Image</a>`;
        }
    } else if (type === 'csv') {
        if (layoutContainer) layoutContainer.style.display = 'none';
        if (customSettings) customSettings.style.display = 'none';

        const modalContainer = modal.querySelector('.modal-container');
        if (modalContainer) {
            modalContainer.style.maxWidth = '1200px';
            modalContainer.style.width = '90vw';
        }

        const text = await res.blob.text();
        const { data: csvData } = Papa.parse(text, { header: false, skipEmptyLines: true });

        if (!csvData || csvData.length === 0 || (csvData.length === 1 && csvData[0].every(c => !c))) {
            content.innerHTML = `
                <div style="padding: 60px 40px; text-align: center; background: white; border-radius: 8px;">
                    <div style="color: #ef4444; margin-bottom: 20px;">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <h3 style="font-size: 1.5rem; font-weight: 700; color: #1e293b; margin-bottom: 12px;">Unable to read file data</h3>
                    <p style="color: #64748b; font-size: 1.1rem; max-width: 500px; margin: 0 auto 24px;">
                        The uploaded file appears to be empty or contains unreadable data. Please ensure the file is a valid CSV or Excel file.
                    </p>
                    <div style="background: #f8fafc; padding: 16px; border-radius: 6px; text-align: left; max-width: 450px; margin: 0 auto; border: 1px solid #e2e8f0; font-size: 0.9rem; color: #475569;">
                        <strong>Common issues:</strong>
                        <ul style="margin: 8px 0 0 20px; padding: 0;">
                            <li>File is password protected</li>
                            <li>Corrupted file structure</li>
                            <li>Incompatible format version</li>
                        </ul>
                    </div>
                </div>`;
            return;
        }

        const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
        const maxCols = Math.max(csvData[0]?.length || 0, 20);

        let table = '<table id="previewTable" style="border-collapse:collapse; font-family:\'Calibri\', \'Segoe UI\', sans-serif; font-size: 11pt; border: 1px solid #d4d4d4; background: white; min-width: 100%; table-layout: fixed;">';

        table += '<tr style="background: #e6e6e6; height: 22px;">';
        table += '<td style="width: 40px; border: 1px solid #d4d4d4; background: #e6e6e6;"></td>';
        for (let j = 0; j < maxCols; j++) {
            table += `<td style="width: 120px; border: 1px solid #d4d4d4; color: #444; font-size: 10px; text-align: center; user-select: none; font-weight: normal;">${colLetters[j] || j}</td>`;
        }
        table += '</tr>';

        csvData.slice(0, 1000).forEach((row, i) => {
            const isHeader = i === 0;
            const rowBg = isHeader ? '#1b3b6f' : '#ffffff';
            const rowTextColor = isHeader ? '#ffffff' : '#000000';

            table += `<tr style="background-color: ${rowBg}; color: ${rowTextColor}; height: 24px;">`;
            table += `<td style="width: 40px; background: #e6e6e6; border: 1px solid #d4d4d4; color: #444; font-size: 10px; text-align: center; user-select: none;">${i + 1}</td>`;

            for (let j = 0; j < maxCols; j++) {
                const cell = row[j];
                let cellStyle = 'padding: 2px 6px; border: 1px solid #d4d4d4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
                let displayValue = cell === null || cell === undefined ? '' : cell;

                if (isHeader) {
                    cellStyle += 'font-weight: bold; text-align: left; border-bottom: 1px solid #000000; font-size: 10.5pt; cursor: pointer;';
                    displayValue = `<div style="display: flex; align-items: center; justify-content: space-between;"><span>${displayValue}</span><span style="font-size: 8px; color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.4); border-radius: 1px; padding: 0 2px; margin-left: 6px;">▼</span></div>`;
                } else {
                    if (j >= 4 && !isNaN(parseFloat(String(displayValue).replace(/[$,]/g, '')))) {
                        cellStyle += 'text-align: right;';
                        const num = parseFloat(String(displayValue).replace(/[$,]/g, ''));
                        displayValue = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    } else {
                        cellStyle += 'text-align: left;';
                    }
                }
                table += `<td style="${cellStyle}" contenteditable="${!isHeader}" data-row="${i}" data-col="${j}">${displayValue}</td>`;
            }
            table += '</tr>';
        });
        table += '</table>';

        content.innerHTML = `
            <div style="background: #f3f2f1; border: 1px solid #d4d4d4; border-radius: 6px 6px 0 0; font-family: 'Segoe UI', Tahoma, sans-serif; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                <div style="display: flex; align-items: center; padding: 6px 15px; background: #ffffff; border-bottom: 1px solid #d4d4d4; gap: 25px;">
                    <div style="color: #217346; font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                        <svg width="18" height="18" viewBox="0 0 16 16" fill="#217346"><path d="M1.5 13V3L14.5 1V15L1.5 13ZM2.5 12.18L13.5 13.88V2.12L2.5 3.82V12.18ZM4.5 5H6V11H4.5V5ZM10 5H11.5V11H10V5ZM7.25 5H8.75V11H7.25V5Z"/></svg>
                        <span style="letter-spacing: -0.2px;">Excel Online (CSV Mode)</span>
                    </div>
                    <div style="font-size: 12px; color: #333; display: flex; gap: 18px; font-weight: 400;" class="excel-menu">
                        <span style="border-bottom: 3px solid #217346; padding-bottom: 5px; color: #217346; font-weight: 600; margin-bottom: -7px; cursor: pointer;">File</span>
                        <span style="cursor: pointer; transition: color 0.2s;">Home</span>
                        <span style="cursor: pointer; transition: color 0.2s;">Insert</span>
                        <span style="cursor: pointer; transition: color 0.2s;">Data</span>
                        <span style="color: #217346; font-weight: 600; cursor: pointer;">Editing</span>
                    </div>
                </div>
                <div style="padding: 4px 12px; background: #ffffff; border-bottom: 1px solid #d4d4d4; display: flex; align-items: center; gap: 0;">
                    <div id="active-cell-address" style="background: #ffffff; padding: 2px 15px; font-size: 11px; min-width: 60px; text-align: center; border-right: 1px solid #d4d4d4; font-weight: 500;">A1</div>
                    <div style="display: flex; align-items: center; gap: 12px; flex-grow: 1; padding-left: 10px;">
                        <span style="color: #666; font-style: italic; font-weight: bold; font-family: 'Times New Roman', serif; font-size: 14px; user-select: none;">fx</span>
                        <input id="formula-bar" type="text" style="font-size: 11px; flex-grow: 1; color: #000; border: none; outline: none; background: transparent; font-family: Calibri, sans-serif;" value="${csvData[0]?.[0] || ''}" />
                    </div>
                </div>
            </div>
            
            <div id="previewTableContainer" style="overflow: auto; max-height: 520px; border: 1px solid #d4d4d4; border-top: none; background: #f3f2f1; position: relative;">
                <div id="csvView" style="display: inline-block; min-width: 100%; background: white;">
                    ${table}
                </div>
                <div id="rawTextView" style="display: none; padding: 20px; background: white; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; white-space: pre; overflow: auto;">${text}</div>
            </div>

            <div style="background: #f3f2f1; border: 1px solid #d4d4d4; border-top: none; padding: 0; height: 32px; display: flex; align-items: center; font-family: 'Segoe UI', sans-serif; font-size: 11.5px; border-radius: 0 0 6px 6px;">
                <div style="display: flex; align-items: center; gap: 12px; padding: 0 12px; border-right: 1px solid #e5e7eb; height: 100%; background: #efefef;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="3"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
                <div id="csvTab" style="padding: 0 25px; background: white; color: #217346; border-top: 3px solid #217346; border-right: 1px solid #d4d4d4; font-weight: 600; height: 100%; display: flex; align-items: center; margin-top: -1px; box-shadow: 0 -2px 5px rgba(0,0,0,0.03); cursor: pointer;">CSV_Data</div>
                <div id="rawTextTab" style="padding: 0 25px; color: #444; border-right: 1px solid #d4d4d4; cursor: pointer; height: 100%; display: flex; align-items: center; transition: background 0.2s;" onmouseover="this.style.background='#e6e6e6'" onmouseout="this.style.background='transparent'">Raw_Text</div>
                <div style="padding: 0 12px; cursor: pointer; color: #217346; font-size: 16px; font-weight: bold; transition: background 0.2s;" onmouseover="this.style.background='#e6e6e6'" onmouseout="this.style.background='transparent'">+</div>
                <div style="margin-left: auto; display: flex; gap: 20px; color: #555; padding-right: 20px; font-size: 10px;">
                    <span style="font-weight: 500;">Ready</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 70px; height: 5px; background: #d4d4d4; border-radius: 3px; overflow: hidden;"><div style="width: 100%; height: 100%; background: #217346;"></div></div>
                        <span style="font-weight: bold;">100%</span>
                    </div>
                </div>
            </div>`;

        const sidebarDownloadContainer = document.getElementById('sidebarDownloadContainer');
        if (sidebarDownloadContainer) {
            sidebarDownloadContainer.style.display = 'block';
            sidebarDownloadContainer.innerHTML = `<a class='btn btn-primary' href='${url}' download='${res.filename}' 
               style='width: 100%; font-size: 1rem; padding: 0.875rem 1.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: #217346; border: 1px solid #107c10; border-radius: 4px; box-shadow: 0 4px 12px rgba(33, 115, 70, 0.2); transition: all 0.2s ease;'
               onmouseover="this.style.background='#1a5c38'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 16px rgba(33, 115, 70, 0.3)';" 
               onmouseout="this.style.background='#217346'; this.style.transform='none'; this.style.boxShadow='0 4px 12px rgba(33, 115, 70, 0.2)';"
            >
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>Download CSV</a>`;
        }

        // Initialize Interactivity for CSV
        initTableInteractivity('csv', res.filename);
    } else if (type === 'xlsx') {
        if (layoutContainer) layoutContainer.style.display = 'none';
        if (customSettings) customSettings.style.display = 'none';

        const modalContainer = modal.querySelector('.modal-container');
        if (modalContainer) {
            modalContainer.style.maxWidth = '1200px';
            modalContainer.style.width = '90vw';
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {
                type: 'array',
                cellDates: true,
                cellNF: true,
                cellStyles: true
            });

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                raw: true,
                defval: ''
            });

            if (!jsonData || jsonData.length === 0 || (jsonData.length === 1 && jsonData[0].every(c => !c))) {
                content.innerHTML = `
                    <div style="padding: 60px 40px; text-align: center; background: white; border-radius: 8px;">
                        <div style="color: #ef4444; margin-bottom: 20px;">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        </div>
                        <h3 style="font-size: 1.5rem; font-weight: 700; color: #1e293b; margin-bottom: 12px;">No data found in Excel file</h3>
                        <p style="color: #64748b; font-size: 1.1rem; max-width: 500px; margin: 0 auto 24px;">
                            We couldn't detect any transaction data in the first sheet of your Excel file.
                        </p>
                        <div style="background: #f8fafc; padding: 16px; border-radius: 6px; text-align: left; max-width: 450px; margin: 0 auto; border: 1px solid #e2e8f0; font-size: 0.9rem; color: #475569;">
                            Please check if the transactions are on a different sheet or if the file is empty. We currently process the first active sheet.
                        </div>
                    </div>`;
                return;
            }

            const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
            const maxCols = Math.max(jsonData[0]?.length || 0, 20);

            let validationBadge = '';
            if (res.validation_report) {
                const vr = res.validation_report;
                const badgeColor = vr.status === 'verified' ? '#107c10' : vr.status === 'warning' ? '#d97706' : '#ef4444';
                const badgeIcon = vr.status === 'verified' ? '✓' : vr.status === 'warning' ? '⚠' : '✕';
                validationBadge = `
                    <div style="margin-left: auto; margin-right: 20px; display: flex; align-items: center; gap: 8px; padding: 4px 12px; background: ${badgeColor}10; border: 1px solid ${badgeColor}40; border-radius: 4px; color: ${badgeColor}; font-size: 11px; font-weight: 600;" title="${vr.message}">
                        <span>${badgeIcon}</span>
                        <span>${vr.status.toUpperCase()}: ${vr.message}</span>
                    </div>
                `;
            }

            let table = '<table id="previewTable" style="border-collapse:collapse; font-family:\'Calibri\', \'Segoe UI\', sans-serif; font-size: 11pt; border: 1px solid #d4d4d4; background: white; min-width: 100%; table-layout: fixed;">';

            table += '<tr style="background: #e6e6e6; height: 22px;">';
            table += '<td style="width: 40px; border: 1px solid #d4d4d4; background: #e6e6e6;"></td>';
            for (let j = 0; j < maxCols; j++) {
                table += `<td style="width: 120px; border: 1px solid #d4d4d4; color: #444; font-size: 10px; text-align: center; user-select: none; font-weight: normal;">${colLetters[j] || j}</td>`;
            }
            table += '</tr>';

            jsonData.slice(0, 1000).forEach((row, i) => {
                const isHeader = i === 0;
                const rowBg = isHeader ? '#1b3b6f' : '#ffffff';
                const rowTextColor = isHeader ? '#ffffff' : '#000000';

                table += `<tr style="background-color: ${rowBg}; color: ${rowTextColor}; height: 24px;">`;
                table += `<td style="width: 40px; background: #e6e6e6; border: 1px solid #d4d4d4; color: #444; font-size: 10px; text-align: center; user-select: none;">${i + 1}</td>`;

                for (let j = 0; j < maxCols; j++) {
                    const cell = row[j];
                    let cellStyle = 'padding: 2px 6px; border: 1px solid #d4d4d4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
                    let displayValue = cell === null || cell === undefined ? '' : cell;

                    if (isHeader) {
                        cellStyle += 'font-weight: bold; text-align: left; border-bottom: 1px solid #000000; font-size: 10.5pt; cursor: pointer;';
                        displayValue = `<div style="display: flex; align-items: center; justify-content: space-between;"><span>${displayValue}</span><span style="font-size: 8px; color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.4); border-radius: 1px; padding: 0 2px; margin-left: 6px;">▼</span></div>`;
                    } else {
                        if (j === 4 || j === 5 || j === 6) {
                            cellStyle += 'text-align: right;';
                            if (displayValue !== '') {
                                const cleanVal = String(displayValue).replace(/[$,]/g, '');
                                const num = parseFloat(cleanVal);
                                if (!isNaN(num)) {
                                    displayValue = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                }
                            }
                        } else if (j === 0 || j === 3) {
                            cellStyle += 'text-align: left; color: #111;';
                            if (displayValue instanceof Date) {
                                displayValue = displayValue.toISOString().split('T')[0];
                            } else if (!isNaN(displayValue) && displayValue > 40000) {
                                try {
                                    const dateObj = XLSX.SSF.parse_date_code(displayValue);
                                    displayValue = `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`;
                                } catch (e) { }
                            }
                        } else {
                            cellStyle += 'text-align: left;';
                        }
                    }
                    table += `<td style="${cellStyle}" contenteditable="${!isHeader}" data-row="${i}" data-col="${j}">${displayValue}</td>`;
                }
                table += '</tr>';
            });
            table += '</table>';

            // Improved Account Info extraction
            let accountInfoHtml = '<div style="padding: 30px; background: white; height: 100%;">';
            accountInfoHtml += '<h3 style="color: #217346; margin-bottom: 20px; border-bottom: 2px solid #217346; padding-bottom: 10px;">Account Summary</h3>';

            // Try to find summary fields in the first 20 rows
            const summaryLines = jsonData.slice(0, 20).filter(row => {
                const rowText = row.join(' ').toLowerCase();
                return rowText.includes('account') || rowText.includes('balance') || rowText.includes('name') || rowText.includes('date');
            });

            if (summaryLines.length > 0) {
                accountInfoHtml += '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">';
                summaryLines.forEach(line => {
                    const label = line[0] || '';
                    const value = line.slice(1).join(' ') || '';
                    if (label && value) {
                        accountInfoHtml += `<tr>
                                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: 600; width: 200px; color: #444;">${label}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${value}</td>
                            </tr>`;
                    }
                });
                accountInfoHtml += '</table>';
            } else {
                accountInfoHtml += '<div style="text-align: center; padding: 40px; color: #64748b;">No explicit account summary section detected in the first sheet.</div>';
            }
            accountInfoHtml += '</div>';

            content.innerHTML = `
                    <div style="background: #f3f2f1; border: 1px solid #d4d4d4; border-radius: 6px 6px 0 0; font-family: 'Segoe UI', Tahoma, sans-serif; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                        <div style="display: flex; align-items: center; padding: 6px 15px; background: #ffffff; border-bottom: 1px solid #d4d4d4; gap: 25px;">
                            <div style="color: #217346; font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                                <svg width="18" height="18" viewBox="0 0 16 16" fill="#217346"><path d="M1.5 13V3L14.5 1V15L1.5 13ZM2.5 12.18L13.5 13.88V2.12L2.5 3.82V12.18ZM4.5 5H6V11H4.5V5ZM10 5H11.5V11H10V5ZM7.25 5H8.75V11H7.25V5Z"/></svg>
                                <span style="letter-spacing: -0.2px;">Excel Online</span>
                            </div>
                            <div style="font-size: 12px; color: #333; display: flex; gap: 18px; font-weight: 400;" class="excel-menu">
                                <span style="border-bottom: 3px solid #217346; padding-bottom: 5px; color: #217346; font-weight: 600; margin-bottom: -7px; cursor: pointer;">File</span>
                                <span style="cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#217346'" onmouseout="this.style.color='#333'">Home</span>
                                <span style="cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#217346'" onmouseout="this.style.color='#333'">Insert</span>
                                <span style="cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#217346'" onmouseout="this.style.color='#333'">Layout</span>
                                <span style="cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#217346'" onmouseout="this.style.color='#333'">Data</span>
                                <span style="color: #217346; font-weight: 600; cursor: pointer;">Editing</span>
                            </div>
                            ${validationBadge}
                        </div>
                        <div style="padding: 4px 12px; background: #ffffff; border-bottom: 1px solid #d4d4d4; display: flex; align-items: center; gap: 0;">
                            <div id="active-cell-address" style="background: #ffffff; padding: 2px 15px; font-size: 11px; min-width: 60px; text-align: center; border-right: 1px solid #d4d4d4; font-weight: 500;">A1</div>
                            <div style="display: flex; align-items: center; gap: 12px; flex-grow: 1; padding-left: 10px;">
                                <span style="color: #666; font-style: italic; font-weight: bold; font-family: 'Times New Roman', serif; font-size: 14px; user-select: none;">fx</span>
                                <input id="formula-bar" type="text" style="font-size: 11px; flex-grow: 1; color: #000; border: none; outline: none; background: transparent; font-family: Calibri, sans-serif;" value="${jsonData[0][0] || ''}" />
                            </div>
                        </div>
                    </div>
                    
                    <div id="previewTableContainer" style="overflow: auto; max-height: 520px; border: 1px solid #d4d4d4; border-top: none; background: #f3f2f1; position: relative;">
                        <div id="transactionsView" style="display: inline-block; min-width: 100%; background: white;">
                            ${table}
                        </div>
                        <div id="accountInfoView" style="display: none; height: 520px; background: white; overflow: auto;">
                            ${accountInfoHtml}
                        </div>
                    </div>

                <div style="background: #f3f2f1; border: 1px solid #d4d4d4; border-top: none; padding: 0; height: 32px; display: flex; align-items: center; font-family: 'Segoe UI', sans-serif; font-size: 11.5px; border-radius: 0 0 6px 6px;">
                    <div style="display: flex; align-items: center; gap: 12px; padding: 0 12px; border-right: 1px solid #e5e7eb; height: 100%; background: #efefef;">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="3"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>
                    <div id="transactionsTab" style="padding: 0 25px; background: white; color: #217346; border-top: 3px solid #217346; border-right: 1px solid #d4d4d4; font-weight: 600; height: 100%; display: flex; align-items: center; margin-top: -1px; box-shadow: 0 -2px 5px rgba(0,0,0,0.03); cursor: pointer;">Transactions</div>
                    <div id="accountInfoTab" style="padding: 0 25px; color: #444; border-right: 1px solid #d4d4d4; cursor: pointer; height: 100%; display: flex; align-items: center; transition: background 0.2s;" onmouseover="this.style.background='#e6e6e6'" onmouseout="this.style.background='transparent'">Account_Info</div>
                    <div style="padding: 0 12px; cursor: pointer; color: #217346; font-size: 16px; font-weight: bold; transition: background 0.2s;" onmouseover="this.style.background='#e6e6e6'" onmouseout="this.style.background='transparent'">+</div>
                    <div style="margin-left: auto; display: flex; gap: 20px; color: #555; padding-right: 20px; font-size: 10px;">
                        <span style="font-weight: 500;">Ready</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 70px; height: 5px; background: #d4d4d4; border-radius: 3px; overflow: hidden;"><div style="width: 85%; height: 100%; background: #217346;"></div></div>
                            <span style="font-weight: bold;">100%</span>
                        </div>
                    </div>
                </div>`;

            const sidebarDownloadContainer = document.getElementById('sidebarDownloadContainer');
            if (sidebarDownloadContainer) {
                sidebarDownloadContainer.style.display = 'block';
                sidebarDownloadContainer.innerHTML = `<a class='btn btn-primary' href='${url}' download='${res.filename}' 
                   style='width: 100%; font-size: 1rem; padding: 0.875rem 1.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: #217346; border: 1px solid #107c10; border-radius: 4px; box-shadow: 0 4px 12px rgba(33, 115, 70, 0.2); transition: all 0.2s ease;'
                   onmouseover="this.style.background='#1a5c38'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 16px rgba(33, 115, 70, 0.3)';" 
                   onmouseout="this.style.background='#217346'; this.style.transform='none'; this.style.boxShadow='0 4px 12px rgba(33, 115, 70, 0.2)';"
                >
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>Download Excel</a>`;
            }

            // Initialize Interactivity for XLSX
            initTableInteractivity(type, res.filename);
        };
        reader.readAsArrayBuffer(res.blob);
        content.innerHTML = '<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:450px;">' +
            '<div class="spinner" style="width:50px; height:50px; border-top-color:#217346;"></div>' +
            '<div style="margin-top:1.5rem; font-weight:600; color:#217346; font-size:1.2rem;">Booting Excel Web Instance...</div>' +
            '<div style="margin-top:0.5rem; color:#64748b;">Applying financial logic and pivot rules</div>' +
            '</div>';
    } else if (type === 'zip') {
        if (layoutContainer) layoutContainer.style.display = 'none';
        if (customSettings) customSettings.style.display = 'none';

        const modalContainer = modal.querySelector('.modal-container');
        if (modalContainer) {
            modalContainer.style.maxWidth = '900px';
            modalContainer.style.width = '70vw';
        }

        previewHtml = `<div style="padding:60px 40px;text-align:center;background:white;border-radius:8px;">
            <div style="color:#10b981;margin-bottom:20px;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>
            </div>
            <h3 style="font-size:1.5rem;font-weight:700;color:#1e293b;margin-bottom:12px;">Images Extracted Successfully</h3>
            <p style="color:#64748b;font-size:1.1rem;max-width:500px;margin:0 auto 24px;">
                Your PDF has been converted to high-resolution images. Download the ZIP file to access all extracted pages.
            </p>
        </div>`;
        content.innerHTML = previewHtml;

        const sidebarDownloadContainer = document.getElementById('sidebarDownloadContainer');
        if (sidebarDownloadContainer) {
            sidebarDownloadContainer.style.display = 'block';
            sidebarDownloadContainer.innerHTML = `<a class='btn btn-primary' href='${url}' download='${res.filename}' style='width: 100%; font-size: 1rem; padding: 0.875rem 1.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;'><svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>Download Images (ZIP)</a>`;
        }
    } else if (type === 'docx') {
        // Show sidebar controls for Excel to Docs and CSV to Docs conversions
        const dataToDocsTools = ['excel-to-docs', 'csv-to-docs'];
        if (dataToDocsTools.includes(selectedTool)) {
            if (layoutContainer) layoutContainer.style.display = 'flex';
            if (customSettings) customSettings.style.display = 'flex';

            // Show orientation info for Excel/CSV to Docs
            const orientationInfo = document.getElementById('orientationInfo');
            const orientationText = document.getElementById('orientationText');
            if (orientationInfo && orientationText && uploadedFiles.length > 0) {
                orientationInfo.style.display = 'block';
                const layoutSelect = document.getElementById('layoutModeSelect');
                if (layoutSelect && layoutSelect.value === 'list') {
                    orientationText.innerHTML = `<strong>Portrait A4</strong><br/>List view format`;
                } else {
                    orientationText.innerHTML = `<strong>Landscape</strong><br/>Table format`;
                }
            }

            // Create enhanced Word document preview mockup
            const layoutMode = document.getElementById('layoutModeSelect')?.value || 'table';
            const showLabels = document.getElementById('showLabelsToggle')?.checked || true;
            const showPagination = document.getElementById('showPaginationToggle')?.checked || false;

            previewHtml = `
                <div style="padding: 30px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 700px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <div style="display: inline-block; padding: 12px 24px; background: #217346; color: white; border-radius: 6px; font-weight: 600; margin-bottom: 16px;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="white" style="vertical-align: middle; margin-right: 8px;">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            Word Document Preview
                        </div>
                        <p style="color: #64748b; font-size: 0.95rem; margin: 0;">Your document will be generated with the following settings:</p>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 6px; border-left: 4px solid #217346; margin-bottom: 20px;">
                        <h4 style="margin: 0 0 12px 0; color: #0f172a; font-size: 1rem;">📄 Document Structure</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.9rem;">
                            <div><strong>Layout:</strong> ${layoutMode === 'list' ? 'List View (Portrait)' : 'Table View (Landscape)'}</div>
                            <div><strong>Orientation:</strong> ${layoutMode === 'list' ? 'Portrait A4' : 'Landscape'}</div>
                            <div><strong>Record Labels:</strong> ${showLabels ? '✓ Enabled' : '✗ Disabled'}</div>
                            <div><strong>Page Numbers:</strong> ${showPagination ? '✓ Enabled' : '✗ Disabled'}</div>
                        </div>
                    </div>
                    
                    <div style="background: white; border: 2px dashed #e2e8f0; border-radius: 6px; padding: 24px; text-align: center;">
                        <div style="color: #94a3b8; font-size: 3rem; margin-bottom: 12px;">📊</div>
                        <h4 style="color: #475569; margin: 0 0 8px 0;">Document Content Ready</h4>
                        <p style="color: #64748b; font-size: 0.9rem; margin: 0 0 16px 0;">
                            ${layoutMode === 'list' ? 'Each record will be displayed in a vertical list format with labeled fields.' : 'Data will be organized in a professional table layout.'}
                        </p>
                        <p style="color: #64748b; font-size: 0.85rem; margin: 0;">
                            <strong>Note:</strong> Word documents cannot be previewed in-browser. Download to view the formatted document.
                        </p>
                    </div>
                    
                    <div style="margin-top: 20px; padding: 16px; background: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b;">
                        <div style="display: flex; align-items: start; gap: 12px;">
                            <div style="color: #f59e0b; font-size: 1.5rem;">💡</div>
                            <div style="flex: 1;">
                                <strong style="color: #92400e; display: block; margin-bottom: 4px;">Tip:</strong>
                                <p style="color: #78350f; font-size: 0.85rem; margin: 0;">
                                    You can change the layout mode and format options on the left sidebar. The document will automatically regenerate with your new settings.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            content.innerHTML = previewHtml;
        } else {
            if (layoutContainer) layoutContainer.style.display = 'none';
            if (customSettings) customSettings.style.display = 'none';

            previewHtml = '<div style="padding:40px 0;color:#64748b;font-size:1.1rem;text-align:center;">Preview for Word files is not supported in-browser. Please download to view.</div>';
            content.innerHTML = previewHtml;
        }

        const modalContainer = modal.querySelector('.modal-container');
        if (modalContainer) {
            modalContainer.style.maxWidth = '900px';
            modalContainer.style.width = '70vw';
        }

        const sidebarDownloadContainer = document.getElementById('sidebarDownloadContainer');
        if (sidebarDownloadContainer) {
            sidebarDownloadContainer.style.display = 'block';
            sidebarDownloadContainer.innerHTML = `<a class='btn btn-primary' href='${url}' download='${res.filename}' style='width: 100%; font-size: 1rem; padding: 0.875rem 1.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;'><svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>Download Word</a>`;
        }
    } else {
        if (layoutContainer) layoutContainer.style.display = 'none';
        if (customSettings) customSettings.style.display = 'none';

        const modalContainer = modal.querySelector('.modal-container');
        if (modalContainer) {
            modalContainer.style.maxWidth = '900px';
            modalContainer.style.width = '70vw';
        }

        previewHtml = '<div style="padding:40px 0;color:#64748b;font-size:1.1rem;text-align:center;">Preview not available for this file type.</div>';
        content.innerHTML = previewHtml;

        const sidebarDownloadContainer = document.getElementById('sidebarDownloadContainer');
        if (sidebarDownloadContainer) {
            sidebarDownloadContainer.style.display = 'block';
            sidebarDownloadContainer.innerHTML = `<a class='btn btn-primary' href='${url}' download='${res.filename}' style='width: 100%; font-size: 1rem; padding: 0.875rem 1.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;'><svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>Download File</a>`;
        }
    }

    modal.style.display = 'flex';

    // Interactive helper function
    function initTableInteractivity(fileType, originalFilename) {
        const previewTable = document.getElementById('previewTable');
        const formulaBar = document.getElementById('formula-bar');
        const activeCellAddress = document.getElementById('active-cell-address');

        if (previewTable) {
            previewTable.addEventListener('focusin', (e) => {
                if (e.target.hasAttribute('contenteditable')) {
                    const row = e.target.getAttribute('data-row');
                    const col = e.target.getAttribute('data-col');
                    const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
                    const cellAddress = (colLetters[col] || col) + (parseInt(row) + 1);

                    if (activeCellAddress) activeCellAddress.textContent = cellAddress;
                    if (formulaBar) formulaBar.value = e.target.textContent;
                }
            });

            previewTable.addEventListener('input', (e) => {
                if (e.target.hasAttribute('contenteditable')) {
                    if (formulaBar) formulaBar.value = e.target.textContent;
                    updateDownloadLink();
                }
            });
        }

        if (formulaBar) {
            formulaBar.addEventListener('input', () => {
                if (activeCellAddress) {
                    const address = activeCellAddress.textContent;
                    const colLetter = address.match(/[A-Z]+/)[0];
                    const rowNumber = parseInt(address.match(/\d+/)[0]) - 1;
                    const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
                    const colIndex = colLetters.indexOf(colLetter);

                    const targetCell = previewTable.querySelector(`td[data-row="${rowNumber}"][data-col="${colIndex}"]`);
                    if (targetCell) {
                        targetCell.textContent = formulaBar.value;
                        updateDownloadLink();
                    }
                }
            });
        }

        const updateDownloadLink = () => {
            // Get all rows from the table, skipping the first row (A, B, C... header)
            const tableRows = Array.from(previewTable.rows);
            const dataRows = tableRows.slice(1).map(row =>
                // For each data row, skip the first cell (row number)
                Array.from(row.cells).slice(1).map(cell => {
                    // Extract text content, handling headers with spans
                    if (cell.querySelector('span')) return cell.querySelector('span').textContent;
                    return cell.textContent.trim();
                })
            );

            let blob, newUrl;
            if (fileType === 'csv') {
                const csvContent = Papa.unparse(dataRows.filter(r => r.some(c => c !== '')));
                blob = new Blob([csvContent], { type: 'text/csv' });
            } else if (fileType === 'xlsx') {
                const ws = XLSX.utils.aoa_to_sheet(dataRows.filter(r => r.some(c => c !== '')));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            }

            if (blob) {
                newUrl = URL.createObjectURL(blob);
                const downloadBtn = document.querySelector('#sidebarDownloadContainer a');
                if (downloadBtn) {
                    downloadBtn.href = newUrl;
                    console.log('Download link updated with new blob');
                }
            }
        };

        // Tab Switching for CSV
        if (fileType === 'csv') {
            const csvTab = document.getElementById('csvTab');
            const rawTextTab = document.getElementById('rawTextTab');
            const csvView = document.getElementById('csvView');
            const rawTextView = document.getElementById('rawTextView');

            if (csvTab && rawTextTab) {
                csvTab.onclick = () => {
                    csvView.style.display = 'inline-block';
                    rawTextView.style.display = 'none';
                    csvTab.style.background = 'white';
                    csvTab.style.color = '#217346';
                    csvTab.style.borderTop = '3px solid #217346';
                    rawTextTab.style.background = 'transparent';
                    rawTextTab.style.color = '#444';
                    rawTextTab.style.borderTop = 'none';
                };
                rawTextTab.onclick = () => {
                    csvView.style.display = 'none';
                    rawTextView.style.display = 'block';
                    rawTextTab.style.background = 'white';
                    rawTextTab.style.color = '#217346';
                    rawTextTab.style.borderTop = '3px solid #217346';
                    csvTab.style.background = 'transparent';
                    csvTab.style.color = '#444';
                    csvTab.style.borderTop = 'none';
                };
            }
        }

        // Tab Switching for XLSX
        if (fileType === 'xlsx') {
            const transactionsTab = document.getElementById('transactionsTab');
            const accountInfoTab = document.getElementById('accountInfoTab');
            const transactionsView = document.getElementById('transactionsView');
            const accountInfoView = document.getElementById('accountInfoView');

            if (transactionsTab && accountInfoTab) {
                transactionsTab.onclick = () => {
                    transactionsView.style.display = 'inline-block';
                    accountInfoView.style.display = 'none';
                    transactionsTab.style.background = 'white';
                    transactionsTab.style.color = '#217346';
                    transactionsTab.style.borderTop = '3px solid #217346';
                    accountInfoTab.style.background = 'transparent';
                    accountInfoTab.style.color = '#444';
                    accountInfoTab.style.borderTop = 'none';
                };
                accountInfoTab.onclick = () => {
                    transactionsView.style.display = 'none';
                    accountInfoView.style.display = 'block';
                    accountInfoTab.style.background = 'white';
                    accountInfoTab.style.color = '#217346';
                    accountInfoTab.style.borderTop = '3px solid #217346';
                    transactionsTab.style.background = 'transparent';
                    transactionsTab.style.color = '#444';
                    transactionsTab.style.borderTop = 'none';
                };
            }
        }
    }

    // Add interactive feedback for header menu buttons
    const menuButtons = modal.querySelectorAll('.excel-menu span');
    menuButtons.forEach(btn => {
        btn.addEventListener('mouseover', () => {
            if (btn.style.color !== 'rgb(33, 115, 70)') { // Don't change color if it's the active one
                btn.style.color = '#217346';
                btn.style.background = '#f3f2f1';
            }
        });
        btn.addEventListener('mouseout', () => {
            if (btn.style.fontWeight !== '600') {
                btn.style.color = '#333';
                btn.style.background = 'transparent';
            }
        });
        btn.addEventListener('click', () => {
            // Visual feedback for clicking
            const originalColor = btn.style.color;
            btn.style.color = '#107c10';
            setTimeout(() => { btn.style.color = originalColor; }, 150);

            console.log(`Menu clicked: ${btn.textContent}`);
            // Future logic for File, Home, etc. can be added here
        });
    });

    // Note: Live re-conversion with settings is currently disabled in client-side mode
    if (layoutContainer) layoutContainer.style.display = 'none';
    if (customSettings) customSettings.style.display = 'none';

    closeBtn.onclick = () => {
        modal.style.display = 'none';
        content.innerHTML = '';
        if (layoutContainer) layoutContainer.style.display = 'none';
        if (customSettings) customSettings.style.display = 'none';
        const orientationInfo = document.getElementById('orientationInfo');
        if (orientationInfo) orientationInfo.style.display = 'none';
    };

    modal.style.display = 'flex';
}

// End of File

