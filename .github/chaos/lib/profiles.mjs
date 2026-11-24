// Devices the suite runs on. `touch` profiles also emulate a phone or tablet user agent.
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const t = (width, height, ua, dpr = 2) => ({ touch: true, opts: { viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: dpr, userAgent: ua } });
const d = (width, height) => ({ touch: false, opts: { viewport: { width, height } } });
export const PROFILES = {
  "iphone":          t(390, 844, IPHONE, 3),
  "iphone-se1":      t(320, 568, IPHONE),
  "iphone-land":     t(844, 390, IPHONE, 3),
  "pixel":           t(412, 915, ANDROID),
  "ipad":            t(820, 1180, IPAD),
  "ipad-land":       t(1180, 820, IPAD),
  "laptop":          d(1280, 800),
  "desktop":         d(1920, 1080),
  "narrow-window":   d(700, 800),
  "touch-laptop":    { touch: false, opts: { viewport: { width: 1366, height: 768 }, hasTouch: true } },
  "iphone-calm":     { touch: true, opts: { ...t(390, 844, IPHONE, 3).opts, reducedMotion: "reduce" } },
  "laptop-calm":     { touch: false, opts: { viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" } },
};
export const MOBILE = ["iphone", "iphone-se1", "iphone-land", "pixel", "ipad", "ipad-land", "iphone-calm"];
export const DESKTOP = ["laptop", "desktop", "narrow-window", "touch-laptop", "laptop-calm"];
export const ROUTES = ["/", "/about", "/meetings", "/notes", "/atlas", "/events", "/team", "/faq", "/join"];
