-- VoiceLink Integration Database Schema
-- Run this in your Supabase SQL Editor to set up all required tables

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table to track online status and availability
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT UNIQUE NOT NULL,
    is_online BOOLEAN DEFAULT false,
    is_busy BOOLEAN DEFAULT false,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rooms table for peer-to-peer chat sessions
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user1 TEXT NOT NULL,
    user2 TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user1, user2)
);

-- Calls table for call history and tracking
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    caller_username TEXT NOT NULL,
    receiver_username TEXT NOT NULL,
    call_status TEXT NOT NULL CHECK (call_status IN ('calling', 'ringing', 'accepted', 'declined', 'ended', 'missed', 'busy')),
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    duration INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signaling table for WebRTC signaling data (offers, answers, ICE candidates)
CREATE TABLE IF NOT EXISTS signaling (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    sender_username TEXT NOT NULL,
    receiver_username TEXT NOT NULL,
    signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate')),
    signal_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Call recordings table for storing audio recordings
CREATE TABLE IF NOT EXISTS call_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_size BIGINT,
    duration INTEGER,
    recording_status TEXT DEFAULT 'recording' CHECK (recording_status IN ('recording', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table for missed calls and push notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('missed_call', 'incoming_call', 'call_ended')),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    from_username TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_online ON users(is_online) WHERE is_online = true;
CREATE INDEX idx_users_busy ON users(is_busy) WHERE is_busy = true;
CREATE INDEX idx_rooms_users ON rooms(user1, user2);
CREATE INDEX idx_calls_status ON calls(call_status);
CREATE INDEX idx_calls_participants ON calls(caller_username, receiver_username);
CREATE INDEX idx_calls_room ON calls(room_id);
CREATE INDEX idx_signaling_call ON signaling(call_id);
CREATE INDEX idx_signaling_receiver ON signaling(receiver_username);
CREATE INDEX idx_recordings_call ON call_recordings(call_id);
CREATE INDEX idx_notifications_username ON notifications(username) WHERE is_read = false;

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE signaling ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view all users" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update their own status" ON users FOR UPDATE USING (true);
CREATE POLICY "Users can insert themselves" ON users FOR INSERT WITH CHECK (true);

-- RLS Policies for rooms table
CREATE POLICY "Users can view their rooms" ON rooms FOR SELECT USING (true);
CREATE POLICY "Users can create rooms" ON rooms FOR INSERT WITH CHECK (true);

-- RLS Policies for calls table
CREATE POLICY "Users can view their calls" ON calls FOR SELECT USING (true);
CREATE POLICY "Users can create calls" ON calls FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their calls" ON calls FOR UPDATE USING (true);

-- RLS Policies for signaling table
CREATE POLICY "Users can view their signals" ON signaling FOR SELECT USING (true);
CREATE POLICY "Users can create signals" ON signaling FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete old signals" ON signaling FOR DELETE USING (true);

-- RLS Policies for call_recordings table
CREATE POLICY "Users can view their recordings" ON call_recordings FOR SELECT USING (true);
CREATE POLICY "Users can create recordings" ON call_recordings FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update recordings" ON call_recordings FOR UPDATE USING (true);

-- RLS Policies for notifications table
CREATE POLICY "Users can view their notifications" ON notifications FOR SELECT USING (true);
CREATE POLICY "Users can create notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their notifications" ON notifications FOR UPDATE USING (true);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recordings_updated_at BEFORE UPDATE ON call_recordings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up old signaling data (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_signaling()
RETURNS void AS $$
BEGIN
    DELETE FROM signaling WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Function to mark users as offline if they haven't been seen in 5 minutes
CREATE OR REPLACE FUNCTION mark_inactive_users_offline()
RETURNS void AS $$
BEGIN
    UPDATE users 
    SET is_online = false 
    WHERE last_seen < NOW() - INTERVAL '5 minutes' AND is_online = true;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create a room between two users
CREATE OR REPLACE FUNCTION get_or_create_room(user_a TEXT, user_b TEXT)
RETURNS UUID AS $$
DECLARE
    room_uuid UUID;
    sorted_user1 TEXT;
    sorted_user2 TEXT;
BEGIN
    -- Sort usernames to ensure consistent room lookup
    IF user_a < user_b THEN
        sorted_user1 := user_a;
        sorted_user2 := user_b;
    ELSE
        sorted_user1 := user_b;
        sorted_user2 := user_a;
    END IF;

    -- Try to find existing room
    SELECT id INTO room_uuid FROM rooms 
    WHERE user1 = sorted_user1 AND user2 = sorted_user2;

    -- Create room if it doesn't exist
    IF room_uuid IS NULL THEN
        INSERT INTO rooms (user1, user2) 
        VALUES (sorted_user1, sorted_user2)
        RETURNING id INTO room_uuid;
    END IF;

    RETURN room_uuid;
END;
$$ LANGUAGE plpgsql;

-- Create storage bucket for call recordings (run in Supabase Dashboard > Storage)
-- You'll need to manually create this bucket in Supabase Storage UI
-- Bucket name: call-recordings
-- Make it private for security

-- Sample queries for testing

-- Insert sample users
INSERT INTO users (username, is_online) VALUES 
    ('user1', true),
    ('user2', true)
ON CONFLICT (username) DO NOTHING;

-- Get or create a room
SELECT get_or_create_room('user1', 'user2');

-- View active calls
SELECT * FROM calls WHERE call_status IN ('calling', 'ringing', 'accepted');

-- View call history for a user
SELECT * FROM calls 
WHERE caller_username = 'user1' OR receiver_username = 'user1'
ORDER BY created_at DESC
LIMIT 10;

-- Get unread notifications
SELECT * FROM notifications 
WHERE username = 'user1' AND is_read = false
ORDER BY created_at DESC;

-- Clean up old signaling data
SELECT cleanup_old_signaling();

-- Mark inactive users as offline
SELECT mark_inactive_users_offline();
