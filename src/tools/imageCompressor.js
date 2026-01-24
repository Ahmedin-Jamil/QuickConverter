import imageCompression from 'browser-image-compression';
import { trackToolUsage, trackConversion, trackDownload, trackError } from '../utils/analytics.js';

// DOM Elements
const fileInput = document.getElementById('fileInput');
const selectFilesBtn = document.getElementById('select-files-btn');
const uploadBox = document.getElementById('uploadBox');
const controlsBox = document.getElementById('controlsBox');
const resultBox = document.getElementById('resultBox');
const qualityRange = document.getElementById('qualityRange');
const qualityVal = document.getElementById('qualityVal');
const fileNameSpan = document.getElementById('fileName');
const origSizeSpan = document.getElementById('origSize');
const compressBtn = document.getElementById('compressBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const origPreview = document.getElementById('origPreview');
const compPreview = document.getElementById('compPreview');

let selectedFile = null;

// Event Listeners
selectFilesBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
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

qualityRange.addEventListener('input', () => {
    qualityVal.textContent = qualityRange.value;
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
    }

    selectedFile = file;
    fileNameSpan.textContent = file.name;
    origSizeSpan.textContent = formatSize(file.size);

    origPreview.src = URL.createObjectURL(file);

    uploadBox.style.display = 'none';
    controlsBox.style.display = 'block';
    trackToolUsage('Image Compressor');
}

compressBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    compressBtn.disabled = true;
    compressBtn.textContent = 'Compressing...';

    const options = {
        maxSizeMB: 10,
        maxWidthOrHeight: 4096,
        useWebWorker: true,
        initialQuality: qualityRange.value / 100
    };

    try {
        const compressedFile = await imageCompression(selectedFile, options);

        compPreview.src = URL.createObjectURL(compressedFile);
        downloadBtn.href = compPreview.src;
        downloadBtn.download = `compressed-${selectedFile.name}`;

        controlsBox.style.display = 'none';
        resultBox.style.display = 'block';

        trackConversion('Image Compressor', selectedFile.type, selectedFile.type, selectedFile.size);
    } catch (error) {
        console.error(error);
        trackError(error.message, 'Image Compressor');
        alert('Compression failed. Please try again.');
    } finally {
        compressBtn.disabled = false;
        compressBtn.textContent = 'Compress Now';
    }
});

resetBtn.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    uploadBox.style.display = 'block';
    controlsBox.style.display = 'none';
    resultBox.style.display = 'none';
});

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
