/**
 * API Configuration
 * Centralized configuration for all API endpoints.
 *
 * All backend APIs (config, analysis, deep-vision, services) are served
 * by the edge-cloud Node.js service. In production/local
 * deploy, nginx/dev-server proxies /api/ to edge-cloud so remote browsers
 * only need one port (Tailscale / LAN).
 *
 * Priority:
 * 1) Explicit REACT_APP_* env vars (build-time override)
 * 2) Same origin when UI is on the configured UI port/80/443 (proxy)
 * 3) Direct edge-cloud on the configured API port (split dev without nginx)
 */
const isBrowser = typeof window !== 'undefined';
const apiPort = process.env.REACT_APP_API_PORT || '3001';
const uiPort = process.env.REACT_APP_UI_PORT || '3000';

function resolveApiBaseUrl(): string {
  const envBase = process.env.REACT_APP_API_BASE_URL?.replace(/\/$/, '');
  if (envBase) return envBase;

  if (!isBrowser) return `http://localhost:${apiPort}`;

  const { protocol, hostname, port, origin } = window.location;
  // UI served on standard web ports — API is proxied at /api on the same origin
  const sameOriginUiPorts = new Set([uiPort, '80', '443', '']);
  if (sameOriginUiPorts.has(port)) {
    return origin.replace(/\/$/, '');
  }

  return `${protocol}//${hostname}:${apiPort}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

/** @deprecated Use API_BASE_URL instead. Kept for backward compatibility. */
export const YOLO_API_URL = API_BASE_URL;
/** @deprecated Use API_BASE_URL instead. Kept for backward compatibility. */
export const GEMINI_API_URL = API_BASE_URL;

/**
 * API Endpoints
 */
export const API_ENDPOINTS = {
  /** @deprecated YOLO/Python backend has been removed. These stubs exist for compile compat only. */
  yolo: {
    detectImage: `${API_BASE_URL}/detect/image`,
    detectVideo: `${API_BASE_URL}/detect/video`,
    detectWebcam: `${API_BASE_URL}/detect/stream/webcam`,
    detectRTSP: `${API_BASE_URL}/detect/stream/rtsp`,
    videosList: `${API_BASE_URL}/videos/list`,
    health: `${API_BASE_URL}/health`,
  },

  // Analysis Endpoints
  gemini: {
    analyzeImage: `${API_BASE_URL}/api/analyze-image`,
    analyzeAlerts: `${API_BASE_URL}/api/analyze-alerts`,
    analyzeVideo: `${API_BASE_URL}/api/analyze-video`,
    analyzeVideoStream: `${API_BASE_URL}/api/analyze-video-stream`,
    analyzeFrame: `${API_BASE_URL}/api/analyze-frame`,
    health: `${API_BASE_URL}/api/health`,
  },

  // Config & Status Endpoints
  config: {
    get: `${API_BASE_URL}/api/config`,
    put: `${API_BASE_URL}/api/config`,
    servicesStatus: `${API_BASE_URL}/api/services/status`,
  },

  // Deep Vision Endpoints
  deepvision: {
    latest: `${API_BASE_URL}/api/deepvision/latest`,
  },
};

/**
 * API Configuration Constants
 */
export const API_CONFIG = {
  timeout: {
    default: 30000,      // 30 seconds
    video: 120000,       // 2 minutes for video processing
    stream: 300000,      // 5 minutes for streaming
  },
  
  retry: {
    maxAttempts: 3,
    delay: 1000,         // 1 second
  },
  
  upload: {
    maxFileSize: 100 * 1024 * 1024,  // 100 MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/jpg'],
    allowedVideoTypes: ['video/mp4', 'video/avi', 'video/mov'],
  },
};

/**
 * Check if API is available
 */
export const checkAPIHealth = async (apiUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    console.error(`API health check failed for ${apiUrl}:`, error);
    return false;
  }
};
