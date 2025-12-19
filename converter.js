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
                messages.push(currentMessage);
            }

            const [, timestamp, username, discriminator, userid, content] = messageMatch;
            
            currentMessage = {
                timestamp: timestamp,
                username: username,
                discriminator: discriminator,
                userid: userid,
                content: parseContent(content)
            };
        } else if (currentMessage && line.trim() !== '') {
            currentMessage.content += '\n' + parseContent(line);
        }
    }

    if (currentMessage) {
        messages.push(currentMessage);
    }

    return { ticketInfo, messages };
}

function parseContent(content) {
    // Decode unicode escapes
    content = content.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
    
    // Remove JSON wrapper if present (for bot messages)
    if (content.startsWith(', {')) {
        try {
            const jsonMatch = content.match(/^\s*,\s*(\{.*\})\s*$/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[1]);
                if (parsed.description) {
                    content = parsed.description;
                }
            }
        } catch (e) {
            // ignore
        }
    }
    
    content = content
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/__(.+?)__/g, '<u>$1</u>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    
    content = content.replace(/<@!?(\d+)>/g, '<span style="color: #5865f2; background-color: rgba(88, 101, 242, 0.15); padding: 0 2px; border-radius: 3px;">@user</span>');
    content = content.replace(/<#(\d+)>/g, '<span style="color: #5865f2;">#channel</span>');
    
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
        }

        .message.grouped .avatar {
            visibility: hidden;
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
            align-items: baseline;
            gap: 8px;
            line-height: 1.375rem;
        }

        .author {
            font-weight: 500;
        }

        .timestamp {
            font-size: 12px;
            color: #72767d;
            font-weight: 400;
            margin-left: 4px;
        }

        .message-content {
            color: #dcddde;
            word-wrap: break-word;
            line-height: 1.375rem;
            white-space: pre-wrap;
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
const newFileBtn = document.getElementById('newFileBtn');

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

newFileBtn.addEventListener('click', () => {
    uploadContainer.style.display = 'block';
    previewContainer.style.display = 'none';
    preview.innerHTML = '';
    fileInput.value = '';
    currentHTML = '';
    userColorMap.clear();
    colorIndex = 0;
});
