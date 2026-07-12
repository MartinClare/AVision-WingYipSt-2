/**
 * Dev-server proxies so remote browsers only need the UI port (public IP / LAN).
 * /api → edge-cloud, /go2rtc → go2rtc
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

const apiPort = process.env.REACT_APP_API_PORT || '3001';
const go2rtcPort = process.env.REACT_APP_GO2RTC_PORT || '3184';

module.exports = function setupProxy(app) {
  app.use(
    '/go2rtc',
    createProxyMiddleware({
      target: `http://127.0.0.1:${go2rtcPort}`,
      pathRewrite: { '^/go2rtc': '' },
      changeOrigin: true,
    }),
  );
  app.use(
    '/api',
    createProxyMiddleware({
      target: `http://127.0.0.1:${apiPort}`,
      changeOrigin: false,
      on: {
        proxyReq: (proxyReq, req) => {
          const host = req.headers.host;
          if (host) {
            proxyReq.setHeader('X-Forwarded-Host', host);
            proxyReq.setHeader('X-Forwarded-Proto', 'http');
          }
        },
      },
    }),
  );
};
