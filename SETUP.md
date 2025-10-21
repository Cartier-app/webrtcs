# VoiceLink Integration - Complete Setup Guide

This guide walks you through setting up VoiceLink Integration from scratch.

## Prerequisites

Before starting, ensure you have:
- ✅ A Supabase account (free tier works)
- ✅ Basic knowledge of HTML/JavaScript
- ✅ A modern web browser
- ✅ Internet connection for WebRTC STUN servers

## Step 1: Supabase Project Setup

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose organization and fill in project details
4. Wait for project to be provisioned (~2 minutes)

### 1.2 Get API Credentials

1. In your project dashboard, go to Settings → API
2. Copy your:
   - **Project URL** (e.g., https://xxxxx.supabase.co)
   - **Anon/Public Key** (starts with eyJ...)
   
**⚠️ Important**: Never share your service role key publicly!

## Step 2: Database Setup

### 2.1 Run SQL Schema

1. In Supabase Dashboard, go to SQL Editor
2. Click "New Query"
3. Copy the entire contents of `database-schema.sql`
4. Paste into the SQL editor
5. Click "Run" or press Ctrl+Enter

This will create:
- 6 tables (users, rooms, calls, signaling, call_recordings, notifications)
- Indexes for performance
- Row Level Security policies
- Helper functions
- Triggers

### 2.2 Verify Tables

1. Go to Table Editor
2. You should see these tables:
   - ✅ users
   - ✅ rooms
   - ✅ calls
   - ✅ signaling
   - ✅ call_recordings
   - ✅ notifications

## Step 3: Storage Setup

### 3.1 Create Storage Bucket

1. In Supabase Dashboard, go to Storage
2. Click "New Bucket"
3. Name: `call-recordings`
4. Set to **Private** (important for security)
5. Click "Create Bucket"

### 3.2 Configure Storage Policies (Optional)

For more control, you can add RLS policies to the storage bucket:

```sql
-- Allow users to read their own recordings
CREATE POLICY "Users can view their recordings"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'call-recordings' 
  AND auth.uid() IS NOT NULL
);

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'call-recordings' 
  AND auth.uid() IS NOT NULL
);
```

## Step 4: Frontend Integration

### 4.1 Download Files

Download these files to your project:
- `voicelink-integration.js` - Core library (or use CDN: https://cartier-app.github.io/webrtcs/voicelink-integration.js)
- `demo.html` - Example implementation (optional)
- `style.css` - UI styles (optional)

### 4.2 Basic HTML Setup

Create a new HTML file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>My Chat App with VoiceLink</title>
</head>
<body>
    <!-- Your chat UI here -->
    
    <!-- Include Supabase -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    
    <!-- Include VoiceLink -->
    <script src="https://cartier-app.github.io/webrtcs/voicelink-integration.js"></script>
    
    <script>
        // Initialize VoiceLink
        VoiceLink.init({
            supabaseUrl: "YOUR_SUPABASE_URL",
            supabaseKey: "YOUR_ANON_KEY",
            currentUser: "logged_in_username",
            friendUser: "chat_partner_username"
        });
    </script>
</body>
</html>
```

### 4.3 Replace Credentials

Replace placeholders with your actual values:
- `YOUR_SUPABASE_URL` → Your project URL from Step 1.2
- `YOUR_ANON_KEY` → Your anon key from Step 1.2
- `logged_in_username` → Current user's username
- `chat_partner_username` → Friend's username

## Step 5: Testing

### 5.1 Test with Demo

1. Open `demo.html` in a browser
2. Update the Supabase credentials at the top of the script section
3. Open the same page in another browser window
4. Login as "alice" in one window
5. Login as "bob" in another window
6. Click the 📞 button to test calling

### 5.2 Test Checklist

- [ ] Call button appears
- [ ] Clicking button shows calling overlay
- [ ] Other user receives incoming call notification
- [ ] Accepting call establishes audio connection
- [ ] Both users can hear each other
- [ ] Mute button works
- [ ] End call button works
- [ ] Call is logged in database
- [ ] Recording is saved to storage

## Step 6: Production Deployment

### 6.1 Security Checklist

Before deploying to production:

- [ ] RLS policies are enabled on all tables
- [ ] Storage bucket is private
- [ ] Anon key is used (not service role key)
- [ ] HTTPS is enabled on your site
- [ ] CORS is configured in Supabase if needed

### 6.2 Performance Optimization

For production use:

1. **Enable Database Indexes** (already done in schema)
2. **Set up Periodic Cleanup**:
   ```sql
   -- Schedule this to run periodically
   SELECT cleanup_old_signaling();
   SELECT mark_inactive_users_offline();
   ```

3. **Monitor Storage Usage**: Recordings can grow large over time

### 6.3 CORS Configuration

If hosting on a different domain:

1. Go to Supabase Settings → API
2. Add your domain to allowed origins
3. Enable CORS for your domain

## Step 7: Customization

### 7.1 Custom Call Button

Instead of the default button, use your own:

```html
<button id="my-custom-call-btn" class="my-style">
    Call Friend
</button>

<script>
    VoiceLink.init({
        // ... other config
        buttonSelector: '#my-custom-call-btn'
    });
</script>
```

### 7.2 Custom Styling

The VoiceLink UI injects styles automatically, but you can override them:

```css
/* Override call button */
.voicelink-call-button {
    background: your-color !important;
    /* your styles */
}

/* Override overlay */
.voicelink-overlay {
    background: your-background !important;
}
```

### 7.3 Event Listeners

Listen to call events (future feature):

```javascript
// Coming in future versions
voiceLinkInstance.on('callStarted', () => {
    console.log('Call started');
});

voiceLinkInstance.on('callEnded', () => {
    console.log('Call ended');
});
```

## Step 8: Edge Function (Optional)

For advanced signaling control, you can deploy a Supabase Edge Function.

### 8.1 Install Supabase CLI

```bash
npm install -g supabase
```

### 8.2 Login to Supabase

```bash
supabase login
```

### 8.3 Create Edge Function

```bash
supabase functions new voicelink-signaling
```

### 8.4 Deploy Function

```bash
supabase functions deploy voicelink-signaling --project-ref YOUR_PROJECT_REF
```

See `supabase/functions/voicelink-signaling/index.ts` for implementation.

## Troubleshooting

### Database Issues

**Error: relation "users" does not exist**
- Solution: Run database-schema.sql again

**Error: permission denied**
- Solution: Check RLS policies are set up correctly

### WebRTC Issues

**No audio during call**
- Check microphone permissions in browser
- Ensure HTTPS (required for getUserMedia)
- Check browser console for errors

**Call doesn't connect**
- Check both users are online
- Verify WebRTC is supported
- Check firewall/NAT settings

**Audio is choppy**
- Check internet connection
- Verify STUN servers are accessible
- Check browser console for ICE connection errors

### Storage Issues

**Recording not saved**
- Verify storage bucket exists
- Check bucket is named `call-recordings`
- Verify storage permissions

**Can't access recordings**
- Check storage RLS policies
- Verify file path is correct
- Check browser console for errors

## Advanced Configuration

### Custom STUN/TURN Servers

Modify `voicelink-integration.js`:

```javascript
const configuration = {
    iceServers: [
        { urls: 'stun:your-stun-server.com:19302' },
        {
            urls: 'turn:your-turn-server.com:3478',
            username: 'user',
            credential: 'pass'
        }
    ]
};
```

### Recording Format

Change recording format in `startCallRecording()`:

```javascript
this.mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType: 'audio/mp4' // or audio/ogg, audio/wav
});
```

### Call Duration Limits

Add maximum call duration:

```javascript
// In onCallConnected()
setTimeout(() => {
    this.endCall();
    this.showNotification('Call time limit reached', 'info');
}, 60 * 60 * 1000); // 1 hour limit
```

## Support & Resources

- **Documentation**: See README.md
- **Demo**: Open demo.html
- **Database Schema**: See database-schema.sql
- **Supabase Docs**: https://supabase.com/docs

## Next Steps

After setup:

1. Test thoroughly in development
2. Monitor call quality and connections
3. Set up error logging/monitoring
4. Configure storage retention policies
5. Plan for scaling (TURN servers for restricted networks)

## Version History

- **v1.0.0**: Initial release with all core features

---

Need help? Check the troubleshooting section or review the demo implementation.
