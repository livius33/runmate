// The public host for links handed to calendar apps and the iOS Shortcut: APP_HOST (e.g. 'www.example.com', no scheme)
// when set — use the canonical host, since calendar apps do not always follow redirects — else the request's own host.
export const appHost = (req: Request) => process.env.APP_HOST || new URL(req.url).host
