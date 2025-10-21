-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    username text UNIQUE NOT NULL,
    avatar_url text,
    status text DEFAULT 'offline' -- online, offline, busy, calling
);

-- Rooms Table
CREATE TABLE IF NOT EXISTS rooms (
    id serial PRIMARY KEY,
    room_key text UNIQUE NOT NULL
);

-- Calls Table
CREATE TABLE IF NOT EXISTS calls (
    id serial PRIMARY KEY,
    room_key text NOT NULL,
    caller_username text NOT NULL,
    receiver_username text NOT NULL,
    call_status text NOT NULL, -- calling, ringing, accepted, declined, ended, missed, busy
    start_time timestamp,
    end_time timestamp,
    duration integer,
    created_at timestamp DEFAULT NOW()
);

-- Signaling Table
CREATE TABLE IF NOT EXISTS signaling (
    id serial PRIMARY KEY,
    room_id integer REFERENCES rooms(id),
    type text, -- offer, answer, ice
    sdp jsonb,
    ice text,
    created_at timestamp DEFAULT NOW()
);

-- Storage Bucket for Recordings
-- In Supabase dashboard: create bucket "call_recordings"