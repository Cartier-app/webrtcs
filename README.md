# VoiceLink Integration 📞

Seamless peer-to-peer voice calling integration for any chat application. Add WebRTC-powered voice calls to your existing chat app with just a few lines of code.

## Features

✅ **Peer-to-Peer Voice Calls** - Direct WebRTC audio connections  
✅ **Real-time Status Updates** - Instant call state synchronization  
✅ **Automatic Call Recording** - Stores all calls in Supabase Storage  
✅ **Crystal Clear Audio** - Noise suppression & echo cancellation  
✅ **Online/Offline Status** - Check user availability before calling  
✅ **Busy State Management** - Prevent interruptions during active calls  
✅ **Auto Reconnection** - Handles network drops gracefully  
✅ **Mobile Support** - Vibration & notifications on mobile browsers  
✅ **Call History** - Complete logging with duration & timestamps  
✅ **WhatsApp-Style UI** - Beautiful dark theme interface  

## Quick Start

### 1. Include Dependencies

```html
<!-- Supabase Client -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- VoiceLink Integration -->
<script src="https://cartier-app.github.io/webrtcs/voicelink-integration.js"></script>
```

### 2. Add Call Button (Optional)

```html
<button id="voice-call">📞</button>
```

### 3. Initialize VoiceLink

```javascript
VoiceLink.init({
  supabaseUrl: "YOUR_SUPABASE_URL",
  supabaseKey: "YOUR_SUPABASE_ANON_KEY",
  currentUser: "john_doe",
  friendUser: "jane_smith"
});
```

## Database Setup

Run the SQL schema in your Supabase SQL Editor:

```bash
# File: database-schema.sql
```

This creates all necessary tables:
- `users` - Track online/busy status
- `rooms` - Manage chat sessions
- `calls` - Store call history
- `signaling` - Handle WebRTC signals
- `call_recordings` - Store audio recordings
- `notifications` - Manage notifications

## Storage Setup

1. Go to Supabase Dashboard → Storage
2. Create a new bucket: `call-recordings`
3. Set to **private** for security
4. VoiceLink will automatically upload recordings here

## Configuration Options

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `supabaseUrl` | string | ✅ Yes | Your Supabase project URL |
| `supabaseKey` | string | ✅ Yes | Your Supabase anon key |
| `currentUser` | string | ✅ Yes | Username of logged-in user |
| `friendUser` | string | ✅ Yes | Username of chat partner |
| `buttonSelector` | string | ❌ No | Custom button selector (default: #voice-call) |

## Live Demo

Try the interactive demo:

```bash
# Open demo.html in two browser windows
# Login as different users (e.g., alice & bob)
# Test voice calling between windows
```

## Architecture

```
Frontend (VoiceLink.js) → WebRTC (P2P Audio) → Backend (Supabase)
                              ↓
                     Real-time Signaling
                     Database Storage
                     Call Recording
```

## Security Features

- 🔐 Row Level Security (RLS) on all tables
- 🔒 Peer-to-peer audio (no server routing)
- 🗝️ Private storage bucket for recordings
- 🌐 Secure signaling through Supabase
- 🛡️ STUN servers for NAT traversal

## Performance Optimizations

- ⚡ Low latency P2P connections
- 📊 Indexed database queries
- 🧹 Automatic cleanup of old signaling data
- 🔄 Connection pooling & caching
- 📡 Efficient real-time subscriptions

## Browser Support

- ✅ Chrome/Edge 80+
- ✅ Firefox 75+
- ✅ Safari 14+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Advanced Features

### Call Recording
All calls are automatically recorded and stored in Supabase Storage. Recordings are saved as WebM audio files.

### Noise Suppression
Built-in audio constraints enable:
- Echo cancellation
- Noise suppression
- Auto gain control

### Reconnection Handling
Automatically attempts to reconnect up to 5 times if the connection drops during a call.

### Push Notifications
Supports browser notifications for incoming calls (requires user permission).

### Vibration Feedback
Mobile devices vibrate on incoming calls for better UX.

## API Reference

### VoiceLink.init(config)
Initialize VoiceLink with configuration.

### Methods
- `initiateCall()` - Start a voice call
- `acceptCall()` - Accept incoming call
- `declineCall()` - Decline incoming call
- `endCall()` - End active call
- `toggleMute()` - Mute/unmute microphone
- `toggleSpeaker()` - Toggle speaker volume

## Troubleshooting

### Call button doesn't appear
- VoiceLink creates a default button if none exists
- Check browser console for initialization errors

### No audio during call
- Check microphone permissions
- Ensure both users accepted browser mic access
- Verify WebRTC is supported in your browser

### Calls don't connect
- Check Supabase credentials
- Verify database schema is set up correctly
- Check browser console for errors

## File Structure

```
├── voicelink-integration.js   # Core integration library
├── database-schema.sql         # Supabase database schema
├── index.html                  # Landing/documentation page
├── demo.html                   # Interactive demo
├── style.css                   # WhatsApp dark theme styles
├── README.md                   # This file
└── SETUP.md                    # Detailed setup guide
```

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **WebRTC**: Peer-to-peer audio connections
- **Backend**: Supabase (PostgreSQL, Real-time, Storage)
- **Audio**: MediaRecorder API, WebRTC Audio Constraints

## License

MIT License - Feel free to use in your projects!

## Support

For issues, questions, or contributions:
- Check SETUP.md for detailed instructions
- Review the demo.html for implementation examples
- Inspect database-schema.sql for database structure

## Version

**v1.0.0** - Initial Release

Built with ❤️ using WebRTC & Supabase
