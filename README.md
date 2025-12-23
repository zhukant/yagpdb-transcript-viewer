# Discord Ticket Transcript Converter

Browser tool for converting YAGPDB ticket transcripts into Discord-styled HTML.

## Usage

Upload a transcript file or paste a Discord CDN URL. After conversion, download the standalone HTML or load another transcript from the viewer toolbar.

## Input Format

Expected format: `[2025 Dec 14 19:08:15] username#1234 (123456789012345678): Message content`

## Technical Notes

- All processing happens client-side
- Discord CDN URLs require a CORS proxy ([AllOrigins](https://allorigins.win/)) due to browser restrictions
- Automatic retry with exponential backoff for network timeouts (up to 3 attempts)
- 15-second timeout per request
- Mobile-responsive with collapsible toolbar
- Light/dark theme support with localStorage persistence

## License

MIT
