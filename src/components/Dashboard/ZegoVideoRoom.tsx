import React, { useEffect, useRef } from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import { Loader2 } from 'lucide-react';
import { handleApiError, isOffline } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { useFloatingVideoStore } from '../../stores/useFloatingVideoStore';

export interface FloatingRoomMeta {
  id: string;
  room_code: string;
  name: string;
  description?: string;
  max_participants: number;
}

interface ZegoVideoRoomProps {
  roomId: string;        // Unique identifier for video session (room code or ID)
  roomName: string;      // Display name shown to users
  userName: string;
  onDisconnect: () => void;
  /** When set, registers the active study room in the floating video store on join. */
  floatingRoomMeta?: FloatingRoomMeta;
}

function randomID(len: number): string {
  let result = '';
  const chars = '12345qwertyuiopasdfgh67890jklmnbvcxzMNBVCZXASDQWERTYHGFUIOLKJP';
  const maxPos = chars.length;
  for (let i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * maxPos));
  }
  return result;
}

export const ZegoVideoRoom: React.FC<ZegoVideoRoomProps> = ({
  roomId,
  roomName,
  userName,
  onDisconnect,
  floatingRoomMeta,
}) => {
  const floatingMetaRef = useRef<FloatingRoomMeta | undefined>(floatingRoomMeta);
  floatingMetaRef.current = floatingRoomMeta;

  const containerRef = useRef<HTMLDivElement>(null);
  const zegoInstanceRef = useRef<ReturnType<typeof ZegoUIKitPrebuilt.create> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>('');

  useEffect(() => {
    ErrorLogger.debug('Component mounted', { component: 'ZegoVideoRoom', action: 'mount', roomId, roomName, userName, containerReady: !!containerRef.current });

    const initializeZego = async () => {
      // Wait for container to be ready
      if (!containerRef.current) {
        await new Promise<void>((resolve) => {
          const checkContainer = setInterval(() => {
            if (containerRef.current) {
              clearInterval(checkContainer);
              resolve();
            }
          }, 100);
          // Safety timeout - resolve after 5 seconds even if container not ready
          setTimeout(() => {
            clearInterval(checkContainer);
            resolve();
          }, 5000);
        });
      }

      if (!containerRef.current) {
        const error = new Error('Video container element not found');
        ErrorLogger.error(error, { component: 'ZegoVideoRoom', action: 'initializeZego', roomId });
        setError('Failed to initialize video room. Container not available.');
        setLoading(false);
        return;
      }

      ErrorLogger.debug('Initializing Video Room', { component: 'ZegoVideoRoom', action: 'initializeZego', roomId, roomName, userName });

      if (isOffline()) {
        const errorMessage = 'No internet connection. Please check your network and try again.';
        ErrorLogger.warn('Offline detected', { component: 'ZegoVideoRoom', action: 'initializeZego', roomId });
        setError(errorMessage);
        setLoading(false);
        return;
      }

      try {
        const appID = Number(import.meta.env.VITE_ZEGO_APP_ID);
        const serverSecret = import.meta.env.VITE_ZEGO_SERVER_SECRET;

        ErrorLogger.debug('Checking credentials', { component: 'ZegoVideoRoom', action: 'initializeZego', step: 'checkCredentials', hasAppID: !!appID, hasServerSecret: !!serverSecret });

        if (!appID || !serverSecret) {
          const error = new Error('ZegoCloud credentials not configured. Please add VITE_ZEGO_APP_ID and VITE_ZEGO_SERVER_SECRET to your .env file.');
          ErrorLogger.error(error, { component: 'ZegoVideoRoom', action: 'initializeZego', roomId });
          throw error;
        }
        ErrorLogger.info('Credentials found', { component: 'ZegoVideoRoom', action: 'initializeZego', step: 'checkCredentials', appID });

        const userID = randomID(5);
        ErrorLogger.debug('Generated user ID', { component: 'ZegoVideoRoom', action: 'initializeZego', step: 'generateUserID', userID });
        ErrorLogger.debug('Generating token', { component: 'ZegoVideoRoom', action: 'initializeZego', step: 'generateToken' });

        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
          appID,
          serverSecret,
          roomId,
          userID,
          userName
        );
        ErrorLogger.info('Token generated successfully', { component: 'ZegoVideoRoom', action: 'initializeZego', step: 'generateToken' });

        ErrorLogger.debug('Creating Zego instance', { component: 'ZegoVideoRoom', action: 'initializeZego', step: 'createInstance' });
        const zp = ZegoUIKitPrebuilt.create(kitToken);
        zegoInstanceRef.current = zp;
        ErrorLogger.info('Instance created', { component: 'ZegoVideoRoom', action: 'initializeZego', step: 'createInstance' });

        ErrorLogger.debug('Joining room with VideoConference mode', { component: 'ZegoVideoRoom', action: 'initializeZego', step: 'joinRoom' });
        await zp.joinRoom({
          container: containerRef.current,
          sharedLinks: [
            {
              name: 'Share Room Link',
              url:
                window.location.protocol +
                '//' +
                window.location.host +
                window.location.pathname +
                '?roomID=' +
                roomId,
            },
          ],
          scenario: {
            mode: "VideoConference",
            config: {
              role: "Host",
            },
          },

          // Camera and microphone settings
          turnOnCameraWhenJoining: true,
          turnOnMicrophoneWhenJoining: true,
          showMyCameraToggleButton: true,
          showMyMicrophoneToggleButton: true,
          showAudioVideoSettingsButton: true,

          // Communication features
          showTextChat: true,
          showUserList: true,

          // Additional features
          showScreenSharingButton: true,
          showRoomTimer: true,
          showLeavingView: true,
          showLayoutButton: true,

          // Limits and quality
          maxUsers: 50,
          videoResolutionDefault: ZegoUIKitPrebuilt.VideoResolution_720P,

          // Layout
          layout: "Auto",

          // Callbacks
          onJoinRoom: () => {
            ErrorLogger.info('Successfully joined room', { component: 'ZegoVideoRoom', action: 'onJoinRoom', roomId });
            ErrorLogger.debug('Chat feature is enabled', { component: 'ZegoVideoRoom', action: 'onJoinRoom', roomId });
            const meta = floatingMetaRef.current;
            if (meta) {
              useFloatingVideoStore.getState().joinRoom({
                id: meta.id,
                room_code: meta.room_code,
                name: meta.name,
                description: meta.description,
                max_participants: meta.max_participants,
              });
            } else {
              useFloatingVideoStore.getState().joinRoom({
                id: roomId,
                room_code: roomId,
                name: roomName,
                max_participants: 50,
              });
            }
          },
          onLeaveRoom: () => {
            ErrorLogger.info('User left room', { component: 'ZegoVideoRoom', action: 'onLeaveRoom', roomId });
            useFloatingVideoStore.getState().leaveRoom();
            onDisconnect();
          },
          onUserJoin: (users: Array<{ userID: string; userName: string }>) => {
            ErrorLogger.debug('Users joined', { component: 'ZegoVideoRoom', action: 'onUserJoin', roomId, userCount: users.length });
          },
          onUserLeave: (users: Array<{ userID: string; userName: string }>) => {
            ErrorLogger.debug('Users left', { component: 'ZegoVideoRoom', action: 'onUserLeave', roomId, userCount: users.length });
          },
        });

        ErrorLogger.info('Successfully joined video room', { component: 'ZegoVideoRoom', action: 'initializeZego', step: 'joinRoom', roomId });
        ErrorLogger.info('Video Initialization Complete', { component: 'ZegoVideoRoom', action: 'initializeZego', roomId });
        setLoading(false);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const errorMessage = handleApiError(error, { component: 'ZegoVideoRoom', action: 'initializeZego', roomId });
        ErrorLogger.error(error, { component: 'ZegoVideoRoom', action: 'initializeZego', roomId });
        setError(
          errorMessage || 'Failed to initialize video room. Please check your configuration.'
        );
        setLoading(false);
      }
    };

    initializeZego();

    return () => {
      useFloatingVideoStore.getState().leaveRoom();
      if (zegoInstanceRef.current) {
        try {
          ErrorLogger.debug('Destroying video instance', { component: 'ZegoVideoRoom', action: 'cleanup', roomId });
          zegoInstanceRef.current.destroy();
          ErrorLogger.info('Instance destroyed', { component: 'ZegoVideoRoom', action: 'cleanup', roomId });
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          ErrorLogger.error(error, { component: 'ZegoVideoRoom', action: 'cleanup', roomId });
        }
      }
    };
  }, [roomId, roomName, userName]);

  return (
    <div className="relative w-full h-full">
      {/* Video container - always mounted */}
      <div
        ref={containerRef}
        className="w-full h-full rounded-lg overflow-hidden bg-gray-900"
        style={{ minHeight: '400px' }}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-50 rounded-lg">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-white text-lg">Connecting to video room...</p>
            <p className="text-gray-400 text-sm mt-2">Initializing camera and microphone</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-50 rounded-lg p-6">
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-6 max-w-md">
            <h3 className="text-lg font-semibold text-red-200 mb-2">
              Video Connection Error
            </h3>
            <p className="text-red-300 mb-4">{error}</p>
            <div className="space-y-2 text-sm text-red-400">
              <p>
                <strong>Setup Required:</strong>
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>
                  Sign up for a free ZegoCloud account at{' '}
                  <a
                    href="https://zegocloud.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-red-200"
                  >
                    zegocloud.com
                  </a>
                </li>
                <li>Get your App ID and Server Secret from the dashboard</li>
                <li>Add these credentials to your .env file</li>
              </ol>
            </div>
            <button
              onClick={onDisconnect}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
