const USER_COLORS = [
    '#ed4245', '#3ba55c', '#fee75c', '#f26522', '#1abc9c',
    '#5865f2', '#e91e63', '#9c27b0', '#3f51b5', '#00bcd4',
    '#4caf50', '#ff9800', '#795548', '#607d8b'
];

const userColorMap = new Map();
let colorIndex = 0;

function getUserColor(username) {
    if (!userColorMap.has(username)) {
        userColorMap.set(username, USER_COLORS[colorIndex % USER_COLORS.length]);
        colorIndex++;
    }
    return userColorMap.get(username);
}

function formatDiscordMarkdown(text) {
    text = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/__(.+?)__/g, '<u>$1</u>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');

    text = text.replace(/<@!?(\d+)>/g, '<span style="color: #5865f2; background-color: rgba(88, 101, 242, 0.15); padding: 0 2px; border-radius: 3px;">@user</span>');
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

    const headerMatch = lines[0].match(/Transcript of ticket #(\d+) - (.+?), opened by (.+?) at (.+?), closed at (.+?)\./);
    if (headerMatch) {
        ticketInfo = {
            ticketNumber: headerMatch[1],
            ticketType: headerMatch[2],
            openedBy: headerMatch[3],
            openedAt: headerMatch[4],
            closedAt: headerMatch[5]
        };
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const messageMatch = line.match(/^\[(.+?)\] (.+?)(#\d+)? \((\d+)\): (.*)$/);

        if (messageMatch) {
            if (currentMessage) {
                currentMessage.content = parseContent(currentMessage.content);
                messages.push(currentMessage);
            }

            const [, timestamp, username, , , content] = messageMatch;

            currentMessage = {
                timestamp: timestamp,
                username: username,
                content: content
            };
        } else if (currentMessage) {
            currentMessage.content += '\n' + line;
        }
    }

    if (currentMessage) {
        currentMessage.content = parseContent(currentMessage.content);
        messages.push(currentMessage);
    }

    return { ticketInfo, messages };
}

function parseContent(content) {
    // Decode unicode escapes
    content = content.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
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

    content = formatDiscordMarkdown(content);

    if (embedData) {
        let embedHTML = '<div class="embed">';

        if (embedData.color) {
            const colorHex = '#' + embedData.color.toString(16).padStart(6, '0');
            embedHTML = `<div class="embed" style="border-left-color: ${colorHex};">`;
        }

        // Generic embed content renderer
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
            const formattedContent = formatDiscordMarkdown(embedContent.trim());
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

function getTranscriptStyles() {
    return document.getElementById('transcript-styles').textContent;
}

function generateHTML(data) {
    const { ticketInfo, messages } = data;

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ticket #${ticketInfo ? ticketInfo.ticketNumber : 'Unknown'}</title>
    <style>
${getTranscriptStyles()}
    </style>
</head>
<body>
    <div class="container">
        <div class="archive-header">
            <h1>Ticket #${ticketInfo ? ticketInfo.ticketNumber : 'Unknown'} - ${ticketInfo ? ticketInfo.ticketType : 'Transcript'}</h1>
            <div class="metadata">
                ${ticketInfo ? `Opened by ${ticketInfo.openedBy} at ${ticketInfo.openedAt} • Closed at ${ticketInfo.closedAt}` : ''}
            </div>
        </div>

        <div class="channel-name">ticket-${ticketInfo ? ticketInfo.ticketNumber : 'unknown'}</div>

`;

    let prevMessage = null;

    for (const msg of messages) {
        const grouped = shouldGroupMessage(msg, prevMessage);
        const groupedClass = grouped ? ' grouped' : '';
        const color = getUserColor(msg.username);

        html += `        <div class="message${groupedClass}">
            <div class="message-header">
                <span class="author" style="color: ${color};">${msg.username}</span>
                <span class="timestamp">${msg.timestamp}</span>
            </div>
            <div class="message-content">${msg.content}</div>
        </div>
`;

        prevMessage = msg;
    }

    html += `    </div>
</body>
</html>`;

    return html;
}

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadContainer = document.getElementById('uploadContainer');
const previewContainer = document.getElementById('previewContainer');
const preview = document.getElementById('preview');
const downloadBtn = document.getElementById('downloadBtn');
const urlInput = document.getElementById('urlInput');
const urlLoadBtn = document.getElementById('urlLoadBtn');
const compactUrlInput = document.getElementById('compactUrlInput');
const compactUrlLoadBtn = document.getElementById('compactUrlLoadBtn');
const compactFileBtn = document.getElementById('compactFileBtn');
const compactFileInput = document.getElementById('compactFileInput');
const loadingModal = document.getElementById('loadingModal');
const errorModal = document.getElementById('errorModal');
const errorMessage = document.getElementById('errorMessage');
const errorCloseBtn = document.getElementById('errorCloseBtn');
const errorRetryBtn = document.getElementById('errorRetryBtn');

let currentHTML = '';
let lastFailedUrl = null;

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
    
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            const data = parseTranscript(text);
            currentHTML = generateHTML(data);
            
            uploadContainer.style.display = 'none';
            previewContainer.style.display = 'block';
            preview.innerHTML = currentHTML;
            
        } catch (error) {
            alert('Error parsing transcript: ' + error.message);
            console.error(error);
        }
    };
    
    reader.readAsText(file);
}

downloadBtn.addEventListener('click', () => {
    const blob = new Blob([currentHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcript-archive.html';
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

function showLoadingModal() {
    loadingModal.classList.add('show');
}

function hideLoadingModal() {
    loadingModal.classList.remove('show');
}

function showErrorModal(message) {
    errorMessage.textContent = message;
    errorModal.classList.add('show');
}

function hideErrorModal() {
    errorModal.classList.remove('show');
}

async function fetchWithTimeout(url, timeout = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. The server took too long to respond.');
        }
        throw error;
    }
}

async function fetchTranscriptText(url, retryCount = 0, maxRetries = 2) {
    const isDiscordCDN = url.includes('cdn.discordapp.com') || url.includes('cdn.discord.com');

    try {
        if (isDiscordCDN) {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const response = await fetchWithTimeout(proxyUrl, 30000);
            if (!response.ok) {
                throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
            }
            return await response.text();
        }

        try {
            const response = await fetchWithTimeout(url, 30000);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.text();
        } catch (directFetchError) {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const proxyResponse = await fetchWithTimeout(proxyUrl, 30000);
            if (!proxyResponse.ok) {
                throw new Error(`Proxy fetch failed: ${proxyResponse.status} ${proxyResponse.statusText}`);
            }
            return await proxyResponse.text();
        }
    } catch (error) {
        if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return fetchTranscriptText(url, retryCount + 1, maxRetries);
        }
        throw error;
    }
}

async function loadFromURL(url) {
    lastFailedUrl = url;

    try {
        urlLoadBtn.disabled = true;
        urlLoadBtn.textContent = 'Loading...';
        showLoadingModal();

        const text = await fetchTranscriptText(url);
        const data = parseTranscript(text);
        currentHTML = generateHTML(data);

        uploadContainer.style.display = 'none';
        previewContainer.style.display = 'block';
        preview.innerHTML = currentHTML;

        lastFailedUrl = null;

    } catch (error) {
        console.error(error);
        showErrorModal(error.message || 'Failed to load transcript. Please check the URL and try again.');
    } finally {
        hideLoadingModal();
        urlLoadBtn.disabled = false;
        urlLoadBtn.textContent = 'Load from URL';
    }
}

compactFileBtn.addEventListener('click', () => {
    compactFileInput.click();
});

compactFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
        compactFileInput.value = '';
        compactUrlInput.value = '';
    }
});

compactUrlLoadBtn.addEventListener('click', () => {
    const url = compactUrlInput.value.trim();
    if (url) loadFromCompactURL(url);
});

compactUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const url = compactUrlInput.value.trim();
        if (url) loadFromCompactURL(url);
    }
});

async function loadFromCompactURL(url) {
    lastFailedUrl = url;

    try {
        compactUrlLoadBtn.disabled = true;
        compactUrlLoadBtn.textContent = 'Loading...';
        showLoadingModal();

        const text = await fetchTranscriptText(url);
        const data = parseTranscript(text);
        currentHTML = generateHTML(data);

        preview.innerHTML = currentHTML;
        compactUrlInput.value = '';

        lastFailedUrl = null;

    } catch (error) {
        console.error(error);
        showErrorModal(error.message || 'Failed to load transcript. Please check the URL and try again.');
    } finally {
        hideLoadingModal();
        compactUrlLoadBtn.disabled = false;
        compactUrlLoadBtn.textContent = 'Load';
    }
}
