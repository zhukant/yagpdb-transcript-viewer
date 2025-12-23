const USER_COLORS_DARK = [
    '#ed4245', '#3ba55c', '#fee75c', '#f26522', '#1abc9c',
    '#5865f2', '#e91e63', '#9c27b0', '#3f51b5', '#00bcd4',
    '#4caf50', '#ff9800', '#795548', '#607d8b'
];

const USER_COLORS_LIGHT = [
    '#d32f2f', '#2e7d32', '#f57c00', '#e64a19', '#00897b',
    '#3f51b5', '#c2185b', '#7b1fa2', '#303f9f', '#0277bd',
    '#388e3c', '#ef6c00', '#5d4037', '#455a64'
];

const userColorMap = new Map();
let colorIndex = 0;

function getUserColor(username) {
    if (!userColorMap.has(username)) {
        userColorMap.set(username, colorIndex);
        colorIndex++;
    }
    const index = userColorMap.get(username);
    const isLightTheme = document.body.getAttribute('data-theme') === 'light';
    const colors = isLightTheme ? USER_COLORS_LIGHT : USER_COLORS_DARK;
    return colors[index % colors.length];
}

function formatDiscordMarkdown(text, userIdMap = null) {
    text = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/__(.+?)__/g, '<u>$1</u>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');

    text = text.replace(/<@!?(\d+)>/g, (_, userId) => {
        const username = userIdMap && userIdMap.get(userId);
        const displayName = username ? `@${username}` : '@user';
        const discordUrl = `https://discord.com/users/${userId}`;
        return `<a href="${discordUrl}" class="embed-link" style="color: #5865f2; background-color: rgba(88, 101, 242, 0.15); padding: 0 2px; border-radius: 3px; text-decoration: none;">${displayName}</a>`;
    });

    text = text.replace(/<@&(\d+)>/g, '<span style="color: #5865f2; background-color: rgba(88, 101, 242, 0.15); padding: 0 2px; border-radius: 3px;">@role</span>');
    text = text.replace(/<#(\d+)>/g, '<span style="color: #5865f2;">#channel</span>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="embed-link">$1</a>');

    const lines = text.split('\n');
    let inQuote = false;
    let result = [];
    let quoteLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isQuoteLine = line.trimStart().startsWith('&gt;') || line.trimStart().startsWith('>');

        if (isQuoteLine) {
            if (!inQuote) {
                inQuote = true;
                quoteLines = [];
            }
            // Remove quote marker and optional space: "  > quoted text" → "quoted text"
            const quotedText = line.replace(/^\s*(&gt;|>)\s?/, '');
            quoteLines.push(quotedText);
        } else {
            if (inQuote) {
                const blockquote = '<div class="blockquote">' + quoteLines.join('<br>') + '</div>';
                if (line) {
                    result.push(blockquote + line);
                } else {
                    result.push(blockquote);
                }
                inQuote = false;
                quoteLines = [];
            } else {
                result.push(line);
            }
        }
    }

    if (inQuote) {
        result.push('<div class="blockquote">' + quoteLines.join('<br>') + '</div>');
    }

    return result.join('<br>');
}

function parseTranscript(text) {
    const lines = text.split('\n');
    const messages = [];
    let currentMessage = null;
    let ticketInfo = null;
    const userIdMap = new Map();

    const headerMatch = lines[0].match(/Transcript of ticket #(\d+) - (.+?), opened by (.+?) at (.+?), closed at (.+?)\./);
    if (headerMatch) {
        const [, ticketNumber, ticketType, openedBy, openedAt, closedAt] = headerMatch;
        ticketInfo = { ticketNumber, ticketType, openedBy, openedAt, closedAt };
    }

    // Regex to match message header: [timestamp] username#0000 (userId): message content
    const MESSAGE_HEADER_REGEX = /^\[(.+?)\] (.+?)(#\d+)? \((\d+)\): (.*)$/;

    const HEADER_TIMESTAMP = 1;
    const HEADER_USERNAME = 2;
    // const HEADER_DISCRIMINATOR = 3;
    const HEADER_USERID = 4;
    const HEADER_CONTENT = 5;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(MESSAGE_HEADER_REGEX);

        if (match) {
            const username = match[HEADER_USERNAME];
            const userId = match[HEADER_USERID];

            if (userId && username) {
                userIdMap.set(userId, username);
            }
        }
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(MESSAGE_HEADER_REGEX);

        if (match) {
            if (currentMessage) {
                currentMessage.content = parseContent(currentMessage.content, userIdMap);
                messages.push(currentMessage);
            }

            currentMessage = {
                timestamp: match[HEADER_TIMESTAMP],
                username: match[HEADER_USERNAME],
                content: match[HEADER_CONTENT]
            };
        } else if (currentMessage) {
            currentMessage.content += '\n' + line;
        }
    }

    if (currentMessage) {
        currentMessage.content = parseContent(currentMessage.content, userIdMap);
        messages.push(currentMessage);
    }

    return { ticketInfo, messages };
}

function parseContent(content, userIdMap = null) {
    let embedData = null;
    const jsonMatch = content.match(/^(.*?)(?:,\s*)?(\{.*\})\s*$/);

    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[2]);
            if (parsed.type === 'rich') {
                embedData = parsed;
                content = jsonMatch[1].trim();
            }
        } catch (e) {}
    }

    content = content.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
    content = formatDiscordMarkdown(content, userIdMap);

    if (embedData) {
        let embedHTML = '<div class="embed">';

        if (embedData.color) {
            const colorHex = '#' + embedData.color.toString(16).padStart(6, '0');
            embedHTML = `<div class="embed" style="border-left-color: ${colorHex};">`;
        }

        let embedContent = '';

        if (embedData.author?.name) {
            embedContent += `**${embedData.author.name}**\n\n`;
        }

        if (embedData.title) {
            embedContent += `**${embedData.title}**\n\n`;
        }

        if (embedData.description) {
            embedContent += `${embedData.description}\n\n`;
        }

        if (embedData.fields && Array.isArray(embedData.fields)) {
            for (const field of embedData.fields) {
                if (field.name) {
                    embedContent += `**${field.name}**\n`;
                }
                if (field.value) {
                    embedContent += `${field.value}\n\n`;
                }
            }
        }

        if (embedData.footer?.text || embedData.timestamp) {
            const footerParts = [];
            if (embedData.footer?.text) {
                footerParts.push(embedData.footer.text);
            }
            if (embedData.timestamp) {
                const date = new Date(embedData.timestamp);
                footerParts.push(date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }));
            }
            embedContent += `*${footerParts.join(' ')}*`;
        }

        if (embedContent) {
            const formattedContent = formatDiscordMarkdown(embedContent.trim(), userIdMap);
            embedHTML += `<div class="embed-description">${formattedContent}</div>`;
        }

        embedHTML += '</div>';

        if (content) {
            return content + embedHTML;
        }
        return embedHTML;
    }

    return content;
}

function parseTimestamp(timestamp) {
    // Parse YAGPDB timestamp format: "2025 Dec 19 18:24:05"
    const parts = timestamp.match(/(\d{4})\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!parts) return null;

    const [, year, month, day, hour, minute, second] = parts;

    const monthMap = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };

    const monthNum = monthMap[month];
    if (!monthNum) return null;

    const isoString = `${year}-${monthNum}-${day.padStart(2, '0')}T${hour}:${minute}:${second}`;
    return new Date(isoString);
}

function shouldGroupMessage(currentMsg, prevMsg) {
    if (!prevMsg) return false;
    if (currentMsg.username !== prevMsg.username) return false;

    const currentTime = parseTimestamp(currentMsg.timestamp);
    const prevTime = parseTimestamp(prevMsg.timestamp);

    if (!currentTime || !prevTime) return false;

    const diffMinutes = (currentTime - prevTime) / 1000 / 60;

    return diffMinutes < 5;
}

let transcriptStylesCache = null;

async function getTranscriptStyles() {
    if (transcriptStylesCache) {
        return transcriptStylesCache;
    }

    const response = await fetch('transcript.css');
    transcriptStylesCache = await response.text();
    return transcriptStylesCache;
}

function generateHeaderHTML(ticketInfo) {
    const ticketNumber = ticketInfo ? ticketInfo.ticketNumber : 'Unknown';
    const ticketType = ticketInfo ? ticketInfo.ticketType : 'Transcript';
    const metadata = ticketInfo
        ? `Created for ${ticketInfo.openedBy} at ${ticketInfo.openedAt} • Closed at ${ticketInfo.closedAt}`
        : '';

    return `<div class="archive-header">
            <h1>Ticket #${ticketNumber} - ${ticketType}</h1>
            <div class="metadata">${metadata}</div>
        </div>`;
}

function generateMessageHTML(msg, prevMessage) {
    const grouped = shouldGroupMessage(msg, prevMessage);
    const groupedClass = grouped ? ' grouped' : '';
    const color = getUserColor(msg.username);

    return `        <div class="message${groupedClass}">
            <div class="message-header">
                <span class="author" style="color: ${color};">${msg.username}</span>
                <span class="timestamp">${msg.timestamp}</span>
            </div>
            <div class="message-content">${msg.content}</div>
        </div>`;
}

function generateMessagesHTML(messages) {
    const messageElements = [];
    let prevMessage = null;

    for (const msg of messages) {
        messageElements.push(generateMessageHTML(msg, prevMessage));
        prevMessage = msg;
    }

    return messageElements.join('\n');
}

function generateContentHTML(data) {
    const headerHTML = generateHeaderHTML(data.ticketInfo);
    const messagesHTML = generateMessagesHTML(data.messages);

    return `<div class="container">
        ${headerHTML}

${messagesHTML}
    </div>`;
}

function wrapForDownload(contentHTML, styles, ticketInfo, themeAttr) {
    const ticketNumber = ticketInfo ? ticketInfo.ticketNumber : 'Unknown';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ticket #${ticketNumber}</title>
    <style>
${styles}
    </style>
</head>
<body${themeAttr}>
${contentHTML}
</body>
</html>`;
}

function wrapForViewer(contentHTML, styles, themeAttr) {
    return `<div class="viewer-wrapper"${themeAttr}>
<style>
${styles}
</style>
${contentHTML}
</div>`;
}

async function generateHTML(data, forDownload = false) {
    const styles = await getTranscriptStyles();
    const currentTheme = document.body.getAttribute('data-theme');
    const themeAttr = currentTheme === 'light' ? ' data-theme="light"' : '';

    const contentHTML = generateContentHTML(data);

    if (forDownload) {
        return wrapForDownload(contentHTML, styles, data.ticketInfo, themeAttr);
    } else {
        return wrapForViewer(contentHTML, styles, themeAttr);
    }
}

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadContainer = document.getElementById('uploadContainer');
const viewerContainer = document.getElementById('viewerContainer');
const viewerContent = document.getElementById('viewerContent');
const downloadBtn = document.getElementById('downloadBtn');
const urlInput = document.getElementById('urlInput');
const urlLoadBtn = document.getElementById('urlLoadBtn');
const toolbarUrlInput = document.getElementById('toolbarUrlInput');
const toolbarUrlLoadBtn = document.getElementById('toolbarUrlLoadBtn');
const toolbarFileBtn = document.getElementById('toolbarFileBtn');
const toolbarFileInput = document.getElementById('toolbarFileInput');
const viewerToolbarToggle = document.getElementById('viewerToolbarToggle');
const viewerToolbar = document.getElementById('viewerToolbar');
const loadingModal = document.getElementById('loadingModal');
const errorModal = document.getElementById('errorModal');
const errorMessage = document.getElementById('errorMessage');
const errorCloseBtn = document.getElementById('errorCloseBtn');
const errorRetryBtn = document.getElementById('errorRetryBtn');

let currentHTML = '';
let currentData = null;
let currentFilename = null;
let lastFailedUrl = null;

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');

    if (theme === 'light') {
        document.body.setAttribute('data-theme', 'light');
    }
}

function updateUsernameColors() {
    const authors = viewerContent.querySelectorAll('.author');
    authors.forEach(author => {
        const username = author.textContent;
        const color = getUserColor(username);
        author.style.color = color;
    });
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    if (newTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
    } else {
        document.body.removeAttribute('data-theme');
    }

    const viewerWrapper = viewerContent.querySelector('.viewer-wrapper');
    if (viewerWrapper) {
        if (newTheme === 'light') {
            viewerWrapper.setAttribute('data-theme', 'light');
        } else {
            viewerWrapper.removeAttribute('data-theme');
        }
    }

    localStorage.setItem('theme', newTheme);
    updateUsernameColors();
}

initTheme();

document.querySelectorAll('.theme-toggle').forEach(button => {
    button.addEventListener('click', toggleTheme);
});

viewerToolbarToggle.addEventListener('click', () => {
    viewerToolbar.classList.toggle('expanded');
});

uploadArea.addEventListener('click', () => {
    fileInput.click();
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (!file.name.endsWith('.txt')) {
        alert('Please upload a .txt file');
        return;
    }

    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const text = e.target.result;
            const data = parseTranscript(text);
            currentData = data;
            currentFilename = file.name.replace(/\.txt$/i, '');
            currentHTML = await generateHTML(data, false);

            uploadContainer.style.display = 'none';
            viewerContainer.style.display = 'block';
            viewerContent.innerHTML = currentHTML;

        } catch (error) {
            alert('Error parsing transcript: ' + error.message);
            console.error(error);
        }
    };

    reader.readAsText(file);
}

downloadBtn.addEventListener('click', async () => {
    if (!currentData) return;

    const downloadHTML = await generateHTML(currentData, true);
    const blob = new Blob([downloadHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    let filename = 'transcript-archive.html';
    if (currentFilename) {
        filename = `${currentFilename}.html`;
    } else if (currentData.ticketInfo) {
        const { ticketNumber, ticketType, openedBy } = currentData.ticketInfo;
        filename = `ticket-${ticketNumber}-${ticketType}-${openedBy}.html`.replace(/[^a-z0-9.-]/gi, '_');
    }
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

urlLoadBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (url) loadFromURL(url);
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const url = urlInput.value.trim();
        if (url) loadFromURL(url);
    }
});

errorCloseBtn.addEventListener('click', () => {
    hideErrorModal();
});

errorRetryBtn.addEventListener('click', () => {
    hideErrorModal();
    if (lastFailedUrl) {
        loadFromURL(lastFailedUrl);
    }
});

function showLoadingModal(subtext = 'This may take a few moments') {
    const loadingSubtext = document.querySelector('.loading-subtext');
    if (loadingSubtext) {
        loadingSubtext.textContent = subtext;
    }
    loadingModal.classList.add('show');
}

function hideLoadingModal() {
    loadingModal.classList.remove('show');
    const loadingSubtext = document.querySelector('.loading-subtext');
    if (loadingSubtext) {
        loadingSubtext.textContent = 'This may take a few moments';
    }
}

function showErrorModal(message) {
    errorMessage.textContent = message;
    errorModal.classList.add('show');
}

function hideErrorModal() {
    errorModal.classList.remove('show');
}

class TranscriptError extends Error {
    constructor(message, retryable = false) {
        super(message);
        this.name = 'TranscriptError';
        this.retryable = retryable;
    }
}

class InvalidURLError extends TranscriptError {
    constructor(message) {
        super(message, false);
        this.name = 'InvalidURLError';
    }
}

class TranscriptNotFoundError extends TranscriptError {
    constructor(message) {
        super(message, false);
        this.name = 'TranscriptNotFoundError';
    }
}

class InvalidTranscriptError extends TranscriptError {
    constructor(message) {
        super(message, false);
        this.name = 'InvalidTranscriptError';
    }
}

function isValidDiscordCDNUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname === 'cdn.discordapp.com' || urlObj.hostname === 'cdn.discord.com';
    } catch {
        return false;
    }
}

function isValidTranscriptContent(text) {
    if (!text || text.trim().length === 0) {
        return false;
    }

    const lines = text.split('\n');
    const firstLine = lines[0] || '';

    if (firstLine.includes('This content is no longer available')) {
        return false;
    }

    if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
        return false;
    }

    const transcriptHeaderPattern = /Transcript of ticket #\d+/;
    return transcriptHeaderPattern.test(firstLine);
}

async function fetchWithTimeout(url, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            // Mark timeout errors as retryable
            const timeoutError = new TranscriptError('Request timed out. The server took too long to respond.', true);
            timeoutError.isTimeout = true;
            throw timeoutError;
        }
        throw error;
    }
}

async function fetchTranscriptText(url, retryCount = 0, maxRetries = 2) {
    if (!isValidDiscordCDNUrl(url)) {
        throw new InvalidURLError('Invalid URL. Please provide a valid Discord CDN link (cdn.discordapp.com or cdn.discord.com).');
    }

    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const response = await fetchWithTimeout(proxyUrl, 15000);

        if (!response.ok) {
            throw new TranscriptError(`Failed to fetch transcript: ${response.status} ${response.statusText}`, true);
        }

        const text = await response.text();

        if (!isValidTranscriptContent(text)) {
            if (text.includes('This content is no longer available')) {
                throw new TranscriptNotFoundError('This transcript is no longer available on Discord CDN.');
            }
            throw new InvalidTranscriptError('The URL does not point to a valid transcript file. Please check the link and try again.');
        }

        return text;
    } catch (error) {
        const shouldRetry = retryCount < maxRetries && (error.retryable || !(error instanceof TranscriptError));

        if (shouldRetry) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return fetchTranscriptText(url, retryCount + 1, maxRetries);
        }

        if (error.isTimeout && retryCount >= maxRetries) {
            throw new TranscriptError(
                'Request timed out after multiple attempts. The proxy server or Discord CDN may be experiencing slowdowns. Please click Retry to try again.',
                false
            );
        }

        throw error;
    }
}

async function loadTranscriptFromURL(url, options = {}) {
    const {
        button = urlLoadBtn,
        buttonText = 'Load from URL',
        inputField = null,
        showUploadContainer = true
    } = options;

    lastFailedUrl = url;

    try {
        button.disabled = true;
        button.textContent = 'Loading...';
        showLoadingModal();

        const text = await fetchTranscriptText(url);
        const data = parseTranscript(text);
        currentData = data;
        currentFilename = null; // URL loads don't have a filename
        currentHTML = await generateHTML(data, false);

        if (showUploadContainer) {
            uploadContainer.style.display = 'none';
            viewerContainer.style.display = 'block';
        }
        viewerContent.innerHTML = currentHTML;

        if (inputField) {
            inputField.value = '';
        }

        lastFailedUrl = null;

    } catch (error) {
        console.error(error);
        showErrorModal(error.message || 'Failed to load transcript. Please check the URL and try again.');
    } finally {
        hideLoadingModal();
        button.disabled = false;
        button.textContent = buttonText;
    }
}

function loadFromURL(url) {
    return loadTranscriptFromURL(url, {
        button: urlLoadBtn,
        buttonText: 'Load from URL',
        showUploadContainer: true
    });
}

toolbarFileBtn.addEventListener('click', () => {
    toolbarFileInput.click();
});

toolbarFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
        toolbarFileInput.value = '';
        toolbarUrlInput.value = '';
    }
});

toolbarUrlLoadBtn.addEventListener('click', () => {
    const url = toolbarUrlInput.value.trim();
    if (url) loadFromToolbarURL(url);
});

toolbarUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const url = toolbarUrlInput.value.trim();
        if (url) loadFromToolbarURL(url);
    }
});

function loadFromToolbarURL(url) {
    return loadTranscriptFromURL(url, {
        button: toolbarUrlLoadBtn,
        buttonText: 'Load',
        inputField: toolbarUrlInput,
        showUploadContainer: false
    });
}
