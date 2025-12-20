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

function getAvatarColor(username) {
    return getUserColor(username);
}

function getInitial(username) {
    return username.charAt(0).toUpperCase();
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

            const [, timestamp, username, discriminator, userid, content] = messageMatch;

            currentMessage = {
                timestamp: timestamp,
                username: username,
                discriminator: discriminator,
                userid: userid,
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

        if (embedData.author && embedData.author.name) {
            embedHTML += `<div class="embed-author">`;
            if (embedData.author.icon_url || embedData.author.proxy_icon_url) {
                const iconUrl = embedData.author.proxy_icon_url || embedData.author.icon_url;
                embedHTML += `<img class="embed-author-icon" src="${iconUrl}" alt="">`;
            }
            embedHTML += `<span class="embed-author-name">${embedData.author.name}</span>`;
            embedHTML += `</div>`;
        }

        if (embedData.description) {
            const formattedDesc = formatDiscordMarkdown(embedData.description);
            embedHTML += `<div class="embed-description">${formattedDesc}</div>`;
        }

        embedHTML += '</div>';

        if (content) {
            return content + embedHTML;
        }
        return embedHTML;
    }

    return content;
}

function shouldGroupMessage(currentMsg, prevMsg) {
    if (!prevMsg) return false;
    if (currentMsg.username !== prevMsg.username) return false;
    
    const currentTime = new Date(currentMsg.timestamp);
    const prevTime = new Date(prevMsg.timestamp);
    const diffMinutes = (currentTime - prevTime) / 1000 / 60;
    
    return diffMinutes < 5;
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
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #36393f;
            color: #dcddde;
            padding: 20px;
            line-height: 1.5;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            background-color: #2f3136;
            border-radius: 8px;
            padding: 20px;
        }

        .archive-header {
            border-bottom: 1px solid #202225;
            padding-bottom: 20px;
            margin-bottom: 20px;
        }

        .archive-header h1 {
            color: #fff;
            font-size: 24px;
            margin-bottom: 8px;
        }

        .archive-header .metadata {
            color: #b9bbbe;
            font-size: 14px;
        }

        .channel-name {
            color: #8e9297;
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
        }

        .channel-name::before {
            content: "#";
            margin-right: 4px;
            font-weight: 300;
        }

        .message {
            padding: 2px 16px;
            margin-top: 17px;
            position: relative;
            display: flex;
            gap: 16px;
        }

        .message:hover {
            background-color: #32353b;
        }

        .message.grouped {
            margin-top: 0;
            padding-left: 72px;
        }

        .message.grouped .avatar {
            display: none;
        }

        .message.grouped .message-header {
            display: none;
        }

        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            flex-shrink: 0;
            font-size: 18px;
            margin-top: 2px;
        }

        .message-body {
            flex: 1;
            min-width: 0;
        }

        .message-header {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            column-gap: 8px;
            row-gap: 0;
            line-height: 1.375rem;
        }

        .author {
            font-weight: 500;
            flex-shrink: 0;
        }

        .timestamp {
            font-size: 12px;
            color: #72767d;
            font-weight: 400;
            margin-left: 0;
            flex-shrink: 1;
            white-space: nowrap;
        }

        .message-content {
            color: #dcddde;
            word-wrap: break-word;
            line-height: 1.375rem;
            min-height: 0;
        }

        .message-content:empty {
            display: none;
        }

        .message-content code {
            background-color: #2f3136;
            border-radius: 3px;
            padding: 2px 4px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 0.875rem;
        }

        .divider {
            display: flex;
            align-items: center;
            text-align: center;
            margin: 20px 0;
            color: #72767d;
            font-size: 12px;
            font-weight: 600;
        }

        .divider::before,
        .divider::after {
            content: '';
            flex: 1;
            border-bottom: 1px solid #40444b;
        }

        .divider span {
            padding: 0 16px;
        }

        .embed {
            background-color: #2f3136;
            border-left: 4px solid #202225;
            border-radius: 4px;
            padding: 8px 12px;
            margin-top: 4px;
            margin-bottom: 0;
            max-width: 520px;
        }

        .message.grouped .embed {
            margin-top: 0;
        }

        .embed-author {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
        }

        .embed-author-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            margin-right: 8px;
        }

        .embed-author-name {
            font-size: 14px;
            font-weight: 600;
            color: #ffffff;
        }

        .embed-description {
            font-size: 14px;
            color: #dcddde;
            line-height: 1.375rem;
            white-space: pre-wrap;
        }

        .embed-link {
            color: #00b0f4;
            text-decoration: none;
        }

        .embed-link:hover {
            text-decoration: underline;
        }

        .blockquote {
            border-left: 4px solid #4e5058;
            padding-left: 12px;
            margin: 4px 0;
            color: #b5bac1;
        }
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
        const avatarColor = getAvatarColor(msg.username);
        const initial = getInitial(msg.username);
        
        html += `        <div class="message${groupedClass}">
            <span class="avatar" style="background-color: ${avatarColor}; color: #ffffff;">${initial}</span>
            <div class="message-body">
                <div class="message-header">
                    <span class="author" style="color: ${color};">${msg.username}</span>
                    <span class="timestamp">${msg.timestamp}</span>
                </div>
                <div class="message-content">${msg.content}</div>
            </div>
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

let currentHTML = '';

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
    if (!url) {
        alert('Please enter a URL');
        return;
    }
    loadFromURL(url);
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const url = urlInput.value.trim();
        if (url) {
            loadFromURL(url);
        }
    }
});

async function loadFromURL(url) {
    try {
        urlLoadBtn.disabled = true;
        urlLoadBtn.textContent = 'Loading...';

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        const data = parseTranscript(text);
        currentHTML = generateHTML(data);

        uploadContainer.style.display = 'none';
        previewContainer.style.display = 'block';
        preview.innerHTML = currentHTML;

    } catch (error) {
        alert('Error loading transcript from URL: ' + error.message);
        console.error(error);
    } finally {
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
    if (!url) {
        alert('Please enter a URL');
        return;
    }
    loadFromCompactURL(url);
});

compactUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const url = compactUrlInput.value.trim();
        if (url) {
            loadFromCompactURL(url);
        }
    }
});

async function loadFromCompactURL(url) {
    try {
        compactUrlLoadBtn.disabled = true;
        compactUrlLoadBtn.textContent = 'Loading...';

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        const data = parseTranscript(text);
        currentHTML = generateHTML(data);

        preview.innerHTML = currentHTML;
        compactUrlInput.value = '';

    } catch (error) {
        alert('Error loading transcript from URL: ' + error.message);
        console.error(error);
    } finally {
        compactUrlLoadBtn.disabled = false;
        compactUrlLoadBtn.textContent = 'Load';
    }
}
