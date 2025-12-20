# Discord Ticket Transcript Converter

Browser tool to convert YAGPDB ticket transcripts into standalone Discord-styled HTML.

## Usage

Upload a transcript file or paste a URL to a Discord CDN-hosted transcript:
- Drag and drop a `.txt` file
- Click to browse for a file
- Paste a Discord CDN URL

After conversion, download the HTML or load another transcript without returning to the home page.

## Input Format

Expected format: `[2025 Dec 14 19:08:15] username#1234 (123456789012345678): Message content`

## Technical Details

- All processing is client-side
- Discord CDN URLs require a CORS proxy ([AllOrigins](https://allorigins.win/)) due to browser restrictions
- Automatic retry with exponential backoff for failed requests (up to 3 attempts)
- 30-second timeout prevents indefinite hangs
- Mobile-optimized layout maximizes screen space

## License

MIT
