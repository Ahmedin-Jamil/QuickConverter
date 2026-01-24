import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { convertPdfToWord } from './pdfToWordLogic.js';
import { trackToolUsage, trackConversion, trackDownload, trackError } from '../utils/analytics.js';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// DOM Elements
const pdfFileInput = document.getElementById('pdfFileInput');
const selectPdfBtn = document.getElementById('selectPdfBtn');
const uploadBox = document.getElementById('uploadBox');
const processingBox = document.getElementById('processingBox');
const resultBox = document.getElementById('resultBox');
const statusText = document.getElementById('statusText');
const progressPercent = document.getElementById('progressPercent');
const resultFileName = document.getElementById('resultFileName');
const downloadDocxBtn = document.getElementById('downloadDocxBtn');
const resetBtn = document.getElementById('resetBtn');

let selectedFile = null;

// Event Listeners
selectPdfBtn.addEventListener('click', () => pdfFileInput.click());

pdfFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

uploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = 'var(--color-primary)';
});

uploadBox.addEventListener('dragleave', () => {
    uploadBox.style.borderColor = 'var(--color-border)';
});

uploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = 'var(--color-border)';
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

async function handleFile(file) {
    if (file.type !== 'application/pdf') {
        alert('Please select a valid PDF file.');
        return;
    }

    selectedFile = file;
    uploadBox.style.display = 'none';
    processingBox.style.display = 'block';
    trackToolUsage('PDF to Word');

    try {
        const docxBlob = await convertPdfToWord(file, (percent) => {
            progressPercent.textContent = `${percent}%`;
            if (percent < 90) {
                statusText.textContent = `Analyzing Layout...`;
            } else {
                statusText.textContent = `Generating Final DOCX...`;
            }
        });

        resultFileName.textContent = file.name.replace('.pdf', '') + '.docx';
        const docxUrl = URL.createObjectURL(docxBlob);
        downloadDocxBtn.href = docxUrl;
        downloadDocxBtn.download = resultFileName.textContent;

        processingBox.style.display = 'none';
        resultBox.style.display = 'block';

        trackConversion('PDF to Word', 'pdf', 'docx', file.size);
    } catch (error) {
        console.error(error);
        trackError(error.message, 'PDF to Word');
        alert('Failed to convert PDF. Error: ' + error.message);
        resetTool();
    }
}

resetBtn.addEventListener('click', resetTool);

function resetTool() {
    selectedFile = null;
    pdfFileInput.value = '';
    uploadBox.style.display = 'block';
    processingBox.style.display = 'none';
    resultBox.style.display = 'none';
    progressPercent.textContent = '0%';
    statusText.textContent = 'Reading PDF...';
}
