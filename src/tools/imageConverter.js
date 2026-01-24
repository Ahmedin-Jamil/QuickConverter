// Image Converter Tool
import '../styles/main.css';
import '../styles/components.css';
import imageCompression from 'browser-image-compression';
import heic2any from 'heic2any';
import { trackToolUsage, trackConversion, trackDownload, trackError } from '../utils/analytics.js';

// Track tool usage
trackToolUsage('Image Converter');

// State
let selectedFormat = 'jpg';
let uploadedFiles = [];

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const previewArea = document.getElementById('previewArea');
const imageList = document.getElementById('imageList');
const convertBtn = document.getElementById('convertBtn');
const resultsArea = document.getElementById('resultsArea');
const resultsList = document.getElementById('resultsList');
const convertMoreBtn = document.getElementById('convertMoreBtn');
const formatBtns = document.querySelectorAll('.format-btn');

// Format Selection
formatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        formatBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedFormat = btn.dataset.format;
    });
});

// File Upload Handlers
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

// Handle uploaded files
async function handleFiles(files) {
    uploadedFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

    if (uploadedFiles.length === 0) {
        alert('Please upload valid image files');
        return;
    }

    // Show preview area
    previewArea.style.display = 'block';
    imageList.innerHTML = '';

    // Display file previews
    for (const file of uploadedFiles) {
        const preview = await createPreview(file);
        imageList.appendChild(preview);
    }
}

// Create preview element
async function createPreview(file) {
    const div = document.createElement('div');
    div.className = 'card';
    div.style.padding = '1rem';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '1rem';

    // Create thumbnail
    const img = document.createElement('img');
    img.style.width = '80px';
    img.style.height = '80px';
    img.style.objectFit = 'cover';
    img.style.borderRadius = 'var(--radius-md)';

    // Handle HEIC files
    if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
        try {
            const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg' });
            img.src = URL.createObjectURL(convertedBlob);
        } catch (error) {
            img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%23ddd" width="80" height="80"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999">HEIC</text></svg>';
        }
    } else {
        img.src = URL.createObjectURL(file);
    }

    // File info
    const info = document.createElement('div');
    info.style.flex = '1';
    info.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 0.25rem;">${file.name}</div>
    <div style="font-size: var(--text-sm); color: var(--color-text-secondary);">
      ${(file.size / 1024).toFixed(1)} KB • ${file.type || 'Unknown'}
    </div>
  `;

    div.appendChild(img);
    div.appendChild(info);

    return div;
}

// Convert Images
convertBtn.addEventListener('click', async () => {
    if (uploadedFiles.length === 0) return;

    convertBtn.disabled = true;
    convertBtn.innerHTML = '<span class="loading">Converting...</span>';

    try {
        const convertedImages = [];

        for (const file of uploadedFiles) {
            const converted = await convertImage(file, selectedFormat);
            convertedImages.push(converted);

            // Track conversion
            const originalFormat = file.type.split('/')[1] || 'unknown';
            trackConversion('Image Converter', originalFormat, selectedFormat, file.size);
        }

        // Show results
        displayResults(convertedImages);
    } catch (error) {
        console.error('Conversion error:', error);
        trackError(error.message, 'Image Converter');
        alert('An error occurred during conversion. Please try again.');
    } finally {
        convertBtn.disabled = false;
        convertBtn.innerHTML = `
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
      </svg>
      Convert Images
    `;
    }
});

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

// Display conversion results
function displayResults(images) {
    previewArea.style.display = 'none';
    resultsArea.style.display = 'block';
    resultsList.innerHTML = '';

    images.forEach(image => {
        const div = document.createElement('div');
        div.className = 'card';
        div.style.padding = '1rem';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';

        const info = document.createElement('div');
        info.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 0.25rem;">${image.filename}</div>
      <div style="font-size: var(--text-sm); color: var(--color-text-secondary);">
        ${(image.size / 1024).toFixed(1)} KB
      </div>
    `;

        const downloadBtn = document.createElement('a');
        downloadBtn.className = 'btn btn-primary';
        downloadBtn.href = URL.createObjectURL(image.blob);
        downloadBtn.download = image.filename;
        downloadBtn.innerHTML = `
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
      </svg>
      Download
    `;

        downloadBtn.addEventListener('click', () => {
            trackDownload(image.filename, selectedFormat);
        });

        div.appendChild(info);
        div.appendChild(downloadBtn);
        resultsList.appendChild(div);
    });
}

// Convert More Button
convertMoreBtn.addEventListener('click', () => {
    resultsArea.style.display = 'none';
    previewArea.style.display = 'none';
    uploadedFiles = [];
    fileInput.value = '';
    imageList.innerHTML = '';
    resultsList.innerHTML = '';
});
