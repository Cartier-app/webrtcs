/**
 * VoiceLink Integration Library
 * Peer-to-peer voice calling integration for chat applications
 * Version: 1.0.0
 */

(function(window) {
    'use strict';

    class VoiceLink {
        constructor() {
            this.config = null;
            this.supabase = null;
            this.peerConnection = null;
            this.localStream = null;
            this.remoteStream = null;
            this.currentCallId = null;
            this.currentRoomId = null;
            this.isInitiator = false;
            this.callStatus = 'idle';
            this.mediaRecorder = null;
            this.recordedChunks = [];
            this.callStartTime = null;
            this.realtimeChannel = null;
            this.heartbeatInterval = null;
            this.reconnectAttempts = 0;
            this.maxReconnectAttempts = 5;
            this.isMuted = false;
            this.isSpeakerOn = true;
            
            // UI Elements
            this.callButton = null;
            this.callOverlay = null;
            this.incomingCallOverlay = null;
            this.activeCallOverlay = null;
            
            // Audio elements
            this.ringAudio = null;
            this.ringtoneAudio = null;
        }

        /**
         * Initialize VoiceLink with configuration
         * @param {Object} config - Configuration object
         * @param {string} config.supabaseUrl - Supabase project URL
         * @param {string} config.supabaseKey - Supabase anon key
         * @param {string} config.currentUser - Current user's username
         * @param {string} config.friendUser - Friend's username
         * @param {string} config.buttonSelector - Optional button selector (default: #voice-call)
         */
        async init(config) {
            if (!config.supabaseUrl || !config.supabaseKey || !config.currentUser || !config.friendUser) {
                throw new Error('VoiceLink: Missing required configuration parameters');
            }

            this.config = config;
            
            // Initialize Supabase client
            this.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
            
            // Register user and update online status
            await this.registerUser();
            
            // Set up real-time subscriptions
            await this.setupRealtimeSubscriptions();
            
            // Set up UI
            this.setupUI();
            
            // Set up heartbeat to maintain online status
            this.startHeartbeat();
            
            // Request notification permission
            await this.requestNotificationPermission();
            
            // Clean up on page unload
            window.addEventListener('beforeunload', () => this.cleanup());
            
            console.log('VoiceLink initialized successfully');
        }

        /**
         * Register user in database and set online status
         */
        async registerUser() {
            try {
                const { data, error } = await this.supabase
                    .from('users')
                    .upsert({
                        username: this.config.currentUser,
                        is_online: true,
                        is_busy: false,
                        last_seen: new Date().toISOString()
                    }, { onConflict: 'username' });

                if (error) throw error;
            } catch (error) {
                console.error('Error registering user:', error);
            }
        }

        /**
         * Set up real-time subscriptions for calls and signaling
         */
        async setupRealtimeSubscriptions() {
            // Subscribe to calls table for incoming calls
            this.supabase
                .channel('calls-channel')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'calls',
                    filter: `receiver_username=eq.${this.config.currentUser}`
                }, payload => {
                    this.handleIncomingCall(payload.new);
                })
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'calls'
                }, payload => {
                    this.handleCallStatusUpdate(payload.new);
                })
                .subscribe();

            // Subscribe to signaling table for WebRTC signals
            this.supabase
                .channel('signaling-channel')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'signaling',
                    filter: `receiver_username=eq.${this.config.currentUser}`
                }, payload => {
                    this.handleSignal(payload.new);
                })
                .subscribe();

            // Subscribe to user status changes
            this.supabase
                .channel('users-channel')
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'users',
                    filter: `username=eq.${this.config.friendUser}`
                }, payload => {
                    this.handleUserStatusChange(payload.new);
                })
                .subscribe();
        }

        /**
         * Set up UI elements and event listeners
         */
        setupUI() {
            const buttonSelector = this.config.buttonSelector || '#voice-call';
            this.callButton = document.querySelector(buttonSelector);
            
            if (!this.callButton) {
                // Create default call button if not found
                this.callButton = this.createCallButton();
                document.body.appendChild(this.callButton);
            }

            // Add click event listener
            this.callButton.addEventListener('click', () => this.initiateCall());

            // Create audio elements
            this.createAudioElements();
            
            // Inject CSS styles
            this.injectStyles();
        }

        /**
         * Create default call button
         */
        createCallButton() {
            const button = document.createElement('button');
            button.id = 'voice-call';
            button.className = 'voicelink-call-button';
            button.innerHTML = '📞';
            button.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 55px;
                height: 55px;
                border-radius: 12px;
                background: #25D366;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3);
                transition: all 0.3s ease;
                z-index: 9999;
            `;
            
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'scale(1.1)';
                button.style.boxShadow = '0 6px 16px rgba(37, 211, 102, 0.4)';
            });
            
            button.addEventListener('mouseleave', () => {
                button.style.transform = 'scale(1)';
                button.style.boxShadow = '0 4px 12px rgba(37, 211, 102, 0.3)';
            });
            
            return button;
        }

        /**
         * Create audio elements for ringtones
         */
        createAudioElements() {
            // Ringtone for caller (waiting sound)
            this.ringtoneAudio = new Audio();
            this.ringtoneAudio.loop = true;
            this.ringtoneAudio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZijcIF2m98OScTgwOUKnk77hlHAU2jdXzzn0vBSR3yO/glEILEl+16OyrWBQLRp/h8sFuIwUsgs/y2os4CBhqvfDmnFAMDlCq5O+5Zx0GNYzV88+BMQUkd8jv4JZECxJftertrFoWC0af4PPCcSUGK4LO8tqKOQgZar3w5p1RDA5QquTwu2kfBjOL1PPRgzMGI3fI7+CXRwsSX7Xq7q1bFwtGn+DzzHUpBSuCzvLaizsIF2q98OefUw0NUKrk8LxrIQYxitPz0oU2BiJ3x+/gl0kMEV+16++vXhgLRqDh88x2KwYrgc3y24w8CBZpvO/moVUOC1Cp5PC9bSMGMYnS89KGORYJI3fH7+CZTA0RX7Xr8bBhGg1In+L0z3guByx/zfPajz8JFWi76+2jVxAMUKjj8L5wJAYwhM/z04k4BiFzyO7enU0OD16z6vCxYBoNSJ/i9M1zKwgugs/z2o4+CRVmvOzqnVcRDU+p5PC/ciYGLYLP8tOKOQcgccju3Z5ODg5ds+vwsmIbDkeg4fPOdiwHLoHP89uQQAkUZbzs6p5YEg5OqeTwwHQnByyBzvLTizsFH3HI7t2gTg4PWbPr8bRkHA5Gn+Hz0HktCCx/zvPbkUEKE2S87OqfWRIPTqrk8MF1KAcrfv/u0pFECRJjvOzsol0UDk2q5PDCdykHKn7+8dmSSQoRYrzs7KNfFA5Nq+Txy3otCCh8/O/SmkwLEGG77O+kaRUPTq7l8c2AMAggdsfv35tPDBBftervsW0aD06u5/DPgjIJH3fH79+eUwwPXrXq8LFyHw5OrubwzYM0Ch91xvDemlEPDF+16/CxdCIPTq7m8c+FNgoccsbt3pxUDwtdtevwsnYjDk2t5vHPhjgKG3HG7d6dVg0MXLXr8LN4IwxNrubxz4c5CRlvxu3eoFgOC1u16/C1eiYMTK3m8dCIOwoYbsbt36JZDglat+vwtnwoDUus5fHQiT0KEW3G7eCjWw4JWrfr8Ld+Kg1KrObx0Yk+ChFsx+3hpF0OCFm36/C5gCsNSazl8dKLPwoQa8ft4qVfDwdYt+vwuoItDEis5fHTjEELDmnE7eOnYREHV7fr8LuDLgtIrOXx1I5DCg5oxO3jqGIRBlW36vG7hi4KR6vl8dSPRQsNZ8Pt46pkEQZVt+ryu4guCUar5fHVkEYLDGbD7uSsZREGU7bq8b2KLwlGq+Xy1pFIC0tlw+7lrWgSBVK26vG+izEIRarl8taSShEKRKvm8dGSShAKY8Lu5K9pEwVRteryu4w';
            
            // Ring for receiver (incoming call sound)
            this.ringAudio = new Audio();
            this.ringAudio.loop = true;
            this.ringAudio.src = this.ringtoneAudio.src; // Use same sound
        }

        /**
         * Inject CSS styles for VoiceLink UI
         */
        injectStyles() {
            if (document.getElementById('voicelink-styles')) return;
            
            const style = document.createElement('style');
            style.id = 'voicelink-styles';
            style.textContent = `
                .voicelink-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(10, 14, 17, 0.95);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                    animation: fadeIn 0.3s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }

                .voicelink-avatar {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #128C7E, #25D366);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 48px;
                    color: white;
                    margin-bottom: 20px;
                    animation: pulse 2s infinite;
                    box-shadow: 0 8px 24px rgba(37, 211, 102, 0.3);
                }

                .voicelink-status-text {
                    color: #E9EDEF;
                    font-size: 24px;
                    font-weight: 500;
                    margin-bottom: 10px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }

                .voicelink-user-text {
                    color: #8696A0;
                    font-size: 16px;
                    margin-bottom: 40px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }

                .voicelink-call-buttons {
                    display: flex;
                    gap: 20px;
                }

                .voicelink-btn {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    border: none;
                    cursor: pointer;
                    font-size: 24px;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .voicelink-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
                }

                .voicelink-btn-accept {
                    background: #25D366;
                    color: white;
                }

                .voicelink-btn-decline, .voicelink-btn-end {
                    background: #F15C6D;
                    color: white;
                }

                .voicelink-btn-mute, .voicelink-btn-speaker {
                    background: #2A3942;
                    color: #E9EDEF;
                }

                .voicelink-btn-mute.active, .voicelink-btn-speaker.active {
                    background: #25D366;
                }

                .voicelink-controls {
                    display: flex;
                    gap: 15px;
                    margin-top: 40px;
                }

                .voicelink-duration {
                    color: #8696A0;
                    font-size: 18px;
                    margin-top: 20px;
                    font-family: 'Courier New', monospace;
                }

                .voicelink-call-button.pulsing {
                    animation: pulse 1.5s infinite;
                }

                @media (max-width: 768px) {
                    .voicelink-avatar {
                        width: 100px;
                        height: 100px;
                        font-size: 40px;
                    }

                    .voicelink-status-text {
                        font-size: 20px;
                    }

                    .voicelink-btn {
                        width: 55px;
                        height: 55px;
                        font-size: 20px;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * Check if friend is online and available
         */
        async checkFriendStatus() {
            try {
                const { data, error } = await this.supabase
                    .from('users')
                    .select('is_online, is_busy')
                    .eq('username', this.config.friendUser)
                    .single();

                if (error) throw error;
                
                return data;
            } catch (error) {
                console.error('Error checking friend status:', error);
                return { is_online: false, is_busy: false };
            }
        }

        /**
         * Initiate a call
         */
        async initiateCall() {
            if (this.callStatus !== 'idle') {
                console.log('Already in a call');
                return;
            }

            // Check if friend is online
            const friendStatus = await this.checkFriendStatus();
            
            if (!friendStatus.is_online) {
                this.showNotification('User is offline', 'error');
                return;
            }

            if (friendStatus.is_busy) {
                this.showNotification('User is busy', 'error');
                return;
            }

            try {
                // Set self as busy
                await this.updateUserStatus(true, true);
                
                // Get or create room
                const { data: roomData } = await this.supabase
                    .rpc('get_or_create_room', {
                        user_a: this.config.currentUser,
                        user_b: this.config.friendUser
                    });

                this.currentRoomId = roomData;

                // Create call record
                const { data: callData, error: callError } = await this.supabase
                    .from('calls')
                    .insert({
                        room_id: this.currentRoomId,
                        caller_username: this.config.currentUser,
                        receiver_username: this.config.friendUser,
                        call_status: 'calling'
                    })
                    .select()
                    .single();

                if (callError) throw callError;

                this.currentCallId = callData.id;
                this.isInitiator = true;
                this.callStatus = 'calling';

                // Show calling UI
                this.showCallingOverlay();

                // Set up WebRTC
                await this.setupWebRTC();

                // Play ringtone
                this.ringtoneAudio.play();

                // Vibrate if supported
                if ('vibrate' in navigator) {
                    navigator.vibrate([200, 100, 200]);
                }

            } catch (error) {
                console.error('Error initiating call:', error);
                this.showNotification('Failed to initiate call', 'error');
                await this.endCall();
            }
        }

        /**
         * Set up WebRTC peer connection
         */
        async setupWebRTC() {
            try {
                // Get user media with audio constraints for noise suppression and echo cancellation
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });

                // Create peer connection
                const configuration = {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                };

                this.peerConnection = new RTCPeerConnection(configuration);

                // Add local stream tracks
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });

                // Handle remote stream
                this.peerConnection.ontrack = (event) => {
                    this.remoteStream = event.streams[0];
                    this.playRemoteAudio();
                };

                // Handle ICE candidates
                this.peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        this.sendSignal('ice-candidate', event.candidate);
                    }
                };

                // Handle connection state changes
                this.peerConnection.onconnectionstatechange = () => {
                    console.log('Connection state:', this.peerConnection.connectionState);
                    
                    if (this.peerConnection.connectionState === 'connected') {
                        this.onCallConnected();
                    } else if (this.peerConnection.connectionState === 'failed') {
                        this.handleConnectionFailure();
                    } else if (this.peerConnection.connectionState === 'disconnected') {
                        this.handleDisconnection();
                    }
                };

                // If initiator, create offer
                if (this.isInitiator) {
                    const offer = await this.peerConnection.createOffer();
                    await this.peerConnection.setLocalDescription(offer);
                    await this.sendSignal('offer', offer);
                }

            } catch (error) {
                console.error('Error setting up WebRTC:', error);
                this.showNotification('Failed to access microphone', 'error');
                await this.endCall();
            }
        }

        /**
         * Send signaling data through Supabase
         */
        async sendSignal(type, data) {
            try {
                await this.supabase
                    .from('signaling')
                    .insert({
                        call_id: this.currentCallId,
                        sender_username: this.config.currentUser,
                        receiver_username: this.config.friendUser,
                        signal_type: type,
                        signal_data: data
                    });
            } catch (error) {
                console.error('Error sending signal:', error);
            }
        }

        /**
         * Handle incoming signals
         */
        async handleSignal(signal) {
            if (signal.call_id !== this.currentCallId) return;

            try {
                if (signal.signal_type === 'offer' && !this.isInitiator) {
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.signal_data));
                    const answer = await this.peerConnection.createAnswer();
                    await this.peerConnection.setLocalDescription(answer);
                    await this.sendSignal('answer', answer);
                } else if (signal.signal_type === 'answer' && this.isInitiator) {
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.signal_data));
                } else if (signal.signal_type === 'ice-candidate') {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.signal_data));
                }
            } catch (error) {
                console.error('Error handling signal:', error);
            }
        }

        /**
         * Handle incoming call
         */
        async handleIncomingCall(call) {
            if (call.caller_username === this.config.currentUser) return;
            if (call.receiver_username !== this.config.currentUser) return;

            this.currentCallId = call.id;
            this.currentRoomId = call.room_id;
            this.isInitiator = false;

            // Check if already busy
            if (this.callStatus !== 'idle') {
                await this.updateCallStatus('busy');
                return;
            }

            this.callStatus = 'ringing';

            // Update call status to ringing
            await this.updateCallStatus('ringing');

            // Show incoming call UI
            this.showIncomingCallOverlay(call.caller_username);

            // Play ring sound
            this.ringAudio.play();

            // Vibrate
            if ('vibrate' in navigator) {
                this.vibrateInterval = setInterval(() => {
                    navigator.vibrate([400, 200, 400]);
                }, 2000);
            }

            // Show notification
            this.showSystemNotification('Incoming Call', `${call.caller_username} is calling you`);
        }

        /**
         * Accept incoming call
         */
        async acceptCall() {
            try {
                // Stop ringing
                this.ringAudio.pause();
                if (this.vibrateInterval) {
                    clearInterval(this.vibrateInterval);
                }

                // Set as busy
                await this.updateUserStatus(true, true);

                // Update call status
                await this.updateCallStatus('accepted');
                this.callStatus = 'accepted';

                // Set up WebRTC
                await this.setupWebRTC();

                // Hide incoming call overlay
                if (this.incomingCallOverlay) {
                    this.incomingCallOverlay.remove();
                    this.incomingCallOverlay = null;
                }

            } catch (error) {
                console.error('Error accepting call:', error);
                await this.endCall();
            }
        }

        /**
         * Decline incoming call
         */
        async declineCall() {
            // Stop ringing
            this.ringAudio.pause();
            if (this.vibrateInterval) {
                clearInterval(this.vibrateInterval);
            }

            await this.updateCallStatus('declined');
            
            // Hide incoming call overlay
            if (this.incomingCallOverlay) {
                this.incomingCallOverlay.remove();
                this.incomingCallOverlay = null;
            }

            this.cleanup();
        }

        /**
         * Handle call status updates
         */
        async handleCallStatusUpdate(call) {
            if (call.id !== this.currentCallId) return;

            if (call.call_status === 'ringing' && this.isInitiator) {
                this.callStatus = 'ringing';
                this.updateCallingOverlayStatus('Ringing...');
            } else if (call.call_status === 'accepted') {
                this.callStatus = 'accepted';
            } else if (call.call_status === 'declined') {
                this.showNotification('Call declined', 'info');
                await this.endCall();
            } else if (call.call_status === 'busy') {
                this.showNotification('User is busy', 'error');
                await this.endCall();
            } else if (call.call_status === 'ended') {
                await this.endCall();
            }
        }

        /**
         * When call is connected
         */
        async onCallConnected() {
            // Stop ringtones
            this.ringtoneAudio.pause();
            this.ringAudio.pause();

            this.callStartTime = Date.now();
            
            // Hide calling overlay, show active call UI
            if (this.callOverlay) {
                this.callOverlay.remove();
                this.callOverlay = null;
            }

            this.showActiveCallOverlay();

            // Start call recording
            await this.startCallRecording();

            // Start duration timer
            this.startDurationTimer();
        }

        /**
         * Start call recording
         */
        async startCallRecording() {
            try {
                // Combine local and remote streams
                const combinedStream = new MediaStream();
                
                if (this.localStream) {
                    this.localStream.getAudioTracks().forEach(track => {
                        combinedStream.addTrack(track);
                    });
                }
                
                if (this.remoteStream) {
                    this.remoteStream.getAudioTracks().forEach(track => {
                        combinedStream.addTrack(track);
                    });
                }

                this.mediaRecorder = new MediaRecorder(combinedStream, {
                    mimeType: 'audio/webm'
                });

                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        this.recordedChunks.push(event.data);
                    }
                };

                this.mediaRecorder.onstop = async () => {
                    await this.uploadRecording();
                };

                this.mediaRecorder.start();

                // Create recording record in database
                await this.supabase
                    .from('call_recordings')
                    .insert({
                        call_id: this.currentCallId,
                        storage_path: `recordings/${this.currentCallId}.webm`,
                        recording_status: 'recording'
                    });

            } catch (error) {
                console.error('Error starting call recording:', error);
            }
        }

        /**
         * Upload recording to Supabase Storage
         */
        async uploadRecording() {
            if (this.recordedChunks.length === 0) return;

            try {
                const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                const fileName = `${this.currentCallId}.webm`;
                const filePath = `recordings/${fileName}`;

                // Upload to Supabase Storage
                const { data, error } = await this.supabase.storage
                    .from('call-recordings')
                    .upload(filePath, blob, {
                        contentType: 'audio/webm',
                        upsert: true
                    });

                if (error) throw error;

                // Update recording record
                const duration = Math.floor((Date.now() - this.callStartTime) / 1000);
                await this.supabase
                    .from('call_recordings')
                    .update({
                        file_size: blob.size,
                        duration: duration,
                        recording_status: 'completed'
                    })
                    .eq('call_id', this.currentCallId);

                console.log('Recording uploaded successfully');

            } catch (error) {
                console.error('Error uploading recording:', error);
                
                // Update recording status to failed
                await this.supabase
                    .from('call_recordings')
                    .update({ recording_status: 'failed' })
                    .eq('call_id', this.currentCallId);
            }
        }

        /**
         * Play remote audio
         */
        playRemoteAudio() {
            const audioElement = document.createElement('audio');
            audioElement.srcObject = this.remoteStream;
            audioElement.autoplay = true;
            audioElement.id = 'voicelink-remote-audio';
            document.body.appendChild(audioElement);
        }

        /**
         * Toggle mute
         */
        toggleMute() {
            if (!this.localStream) return;

            this.isMuted = !this.isMuted;
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });

            // Update button UI
            const muteBtn = document.querySelector('.voicelink-btn-mute');
            if (muteBtn) {
                muteBtn.classList.toggle('active', this.isMuted);
                muteBtn.innerHTML = this.isMuted ? '🔇' : '🎤';
            }
        }

        /**
         * Toggle speaker
         */
        toggleSpeaker() {
            const audioElement = document.getElementById('voicelink-remote-audio');
            if (!audioElement) return;

            this.isSpeakerOn = !this.isSpeakerOn;
            audioElement.volume = this.isSpeakerOn ? 1.0 : 0.0;

            // Update button UI
            const speakerBtn = document.querySelector('.voicelink-btn-speaker');
            if (speakerBtn) {
                speakerBtn.classList.toggle('active', !this.isSpeakerOn);
                speakerBtn.innerHTML = this.isSpeakerOn ? '🔊' : '🔈';
            }
        }

        /**
         * End call
         */
        async endCall() {
            try {
                // Stop recording
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                    this.mediaRecorder.stop();
                }

                // Stop ringtones
                this.ringtoneAudio.pause();
                this.ringAudio.pause();
                if (this.vibrateInterval) {
                    clearInterval(this.vibrateInterval);
                }

                // Update call status
                if (this.currentCallId) {
                    const duration = this.callStartTime ? Math.floor((Date.now() - this.callStartTime) / 1000) : 0;
                    
                    await this.supabase
                        .from('calls')
                        .update({
                            call_status: 'ended',
                            end_time: new Date().toISOString(),
                            duration: duration
                        })
                        .eq('id', this.currentCallId);

                    // Clean up signaling data
                    await this.supabase
                        .from('signaling')
                        .delete()
                        .eq('call_id', this.currentCallId);
                }

                // Clean up
                this.cleanup();

            } catch (error) {
                console.error('Error ending call:', error);
                this.cleanup();
            }
        }

        /**
         * Handle connection failure
         */
        async handleConnectionFailure() {
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                
                // Try to reconnect
                await this.setupWebRTC();
            } else {
                this.showNotification('Connection failed', 'error');
                await this.endCall();
            }
        }

        /**
         * Handle disconnection
         */
        async handleDisconnection() {
            if (this.callStatus === 'accepted') {
                // Try to reconnect
                await this.handleConnectionFailure();
            }
        }

        /**
         * Update call status in database
         */
        async updateCallStatus(status) {
            try {
                await this.supabase
                    .from('calls')
                    .update({ call_status: status })
                    .eq('id', this.currentCallId);
            } catch (error) {
                console.error('Error updating call status:', error);
            }
        }

        /**
         * Update user status
         */
        async updateUserStatus(isOnline, isBusy = false) {
            try {
                await this.supabase
                    .from('users')
                    .update({
                        is_online: isOnline,
                        is_busy: isBusy,
                        last_seen: new Date().toISOString()
                    })
                    .eq('username', this.config.currentUser);
            } catch (error) {
                console.error('Error updating user status:', error);
            }
        }

        /**
         * Handle user status changes
         */
        handleUserStatusChange(user) {
            console.log('Friend status changed:', user);
            // You can update UI based on friend's online/busy status
        }

        /**
         * Show calling overlay
         */
        showCallingOverlay() {
            this.callOverlay = document.createElement('div');
            this.callOverlay.className = 'voicelink-overlay';
            this.callOverlay.innerHTML = `
                <div class="voicelink-avatar">👤</div>
                <div class="voicelink-status-text">Calling...</div>
                <div class="voicelink-user-text">${this.config.friendUser}</div>
                <div class="voicelink-call-buttons">
                    <button class="voicelink-btn voicelink-btn-decline" onclick="window.VoiceLinkInstance.endCall()">📞</button>
                </div>
            `;
            document.body.appendChild(this.callOverlay);
        }

        /**
         * Update calling overlay status
         */
        updateCallingOverlayStatus(status) {
            if (this.callOverlay) {
                const statusText = this.callOverlay.querySelector('.voicelink-status-text');
                if (statusText) {
                    statusText.textContent = status;
                }
            }
        }

        /**
         * Show incoming call overlay
         */
        showIncomingCallOverlay(callerName) {
            this.incomingCallOverlay = document.createElement('div');
            this.incomingCallOverlay.className = 'voicelink-overlay';
            this.incomingCallOverlay.innerHTML = `
                <div class="voicelink-avatar">👤</div>
                <div class="voicelink-status-text">Incoming Call</div>
                <div class="voicelink-user-text">${callerName}</div>
                <div class="voicelink-call-buttons">
                    <button class="voicelink-btn voicelink-btn-accept" onclick="window.VoiceLinkInstance.acceptCall()">✓</button>
                    <button class="voicelink-btn voicelink-btn-decline" onclick="window.VoiceLinkInstance.declineCall()">✗</button>
                </div>
            `;
            document.body.appendChild(this.incomingCallOverlay);
        }

        /**
         * Show active call overlay
         */
        showActiveCallOverlay() {
            this.activeCallOverlay = document.createElement('div');
            this.activeCallOverlay.className = 'voicelink-overlay';
            this.activeCallOverlay.innerHTML = `
                <div class="voicelink-avatar">👤</div>
                <div class="voicelink-status-text">${this.isInitiator ? this.config.friendUser : this.config.friendUser}</div>
                <div class="voicelink-duration" id="call-duration">00:00</div>
                <div class="voicelink-controls">
                    <button class="voicelink-btn voicelink-btn-mute" onclick="window.VoiceLinkInstance.toggleMute()">🎤</button>
                    <button class="voicelink-btn voicelink-btn-end" onclick="window.VoiceLinkInstance.endCall()">📞</button>
                    <button class="voicelink-btn voicelink-btn-speaker" onclick="window.VoiceLinkInstance.toggleSpeaker()">🔊</button>
                </div>
            `;
            document.body.appendChild(this.activeCallOverlay);
        }

        /**
         * Start duration timer
         */
        startDurationTimer() {
            this.durationInterval = setInterval(() => {
                const duration = Math.floor((Date.now() - this.callStartTime) / 1000);
                const minutes = Math.floor(duration / 60).toString().padStart(2, '0');
                const seconds = (duration % 60).toString().padStart(2, '0');
                
                const durationEl = document.getElementById('call-duration');
                if (durationEl) {
                    durationEl.textContent = `${minutes}:${seconds}`;
                }
            }, 1000);
        }

        /**
         * Start heartbeat to maintain online status
         */
        startHeartbeat() {
            this.heartbeatInterval = setInterval(async () => {
                await this.updateUserStatus(true, this.callStatus !== 'idle');
            }, 30000); // Every 30 seconds
        }

        /**
         * Request notification permission
         */
        async requestNotificationPermission() {
            if ('Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission();
            }
        }

        /**
         * Show system notification
         */
        showSystemNotification(title, body) {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(title, {
                    body: body,
                    icon: '📞',
                    vibrate: [200, 100, 200]
                });
            }
        }

        /**
         * Show in-app notification
         */
        showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'error' ? '#F15C6D' : type === 'success' ? '#25D366' : '#2A3942'};
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                z-index: 10001;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: fadeIn 0.3s ease;
            `;
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }

        /**
         * Clean up resources
         */
        cleanup() {
            // Close peer connection
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }

            // Stop local stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }

            // Remove remote audio element
            const remoteAudio = document.getElementById('voicelink-remote-audio');
            if (remoteAudio) {
                remoteAudio.remove();
            }

            // Clear intervals
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
            }
            if (this.durationInterval) {
                clearInterval(this.durationInterval);
            }
            if (this.vibrateInterval) {
                clearInterval(this.vibrateInterval);
            }

            // Remove overlays
            if (this.callOverlay) {
                this.callOverlay.remove();
                this.callOverlay = null;
            }
            if (this.incomingCallOverlay) {
                this.incomingCallOverlay.remove();
                this.incomingCallOverlay = null;
            }
            if (this.activeCallOverlay) {
                this.activeCallOverlay.remove();
                this.activeCallOverlay = null;
            }

            // Reset state
            this.callStatus = 'idle';
            this.currentCallId = null;
            this.currentRoomId = null;
            this.isInitiator = false;
            this.callStartTime = null;
            this.recordedChunks = [];
            this.reconnectAttempts = 0;

            // Update user status to not busy
            this.updateUserStatus(true, false);

            // Restart heartbeat
            this.startHeartbeat();
        }
    }

    // Export VoiceLink to window
    window.VoiceLink = {
        instance: null,
        init: async function(config) {
            this.instance = new VoiceLink();
            window.VoiceLinkInstance = this.instance; // For button onclick handlers
            await this.instance.init(config);
            return this.instance;
        }
    };

})(window);
