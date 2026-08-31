// src/features/field/utils/whatsappShare.ts
//
// Opening a report in WhatsApp from the technician's phone.
//
// Both share buttons used to point a browser tab at a whatsapp.com URL
// (wa.me or api.whatsapp.com). Those are ordinary web pages: the phone loads
// whatsapp.com first and only then gets redirected into the app, and inside an
// installed PWA or an in-app browser that redirect routinely never happens —
// the technician lands on WhatsApp Web and has to scan a QR code to send a
// report they are holding in their hand.
//
// whatsapp:// is the app's own URL scheme. The OS hands it straight to the
// installed app with no web hop, so that is what a phone gets here; desktop,
// which has no such handler, keeps the web link.

const WA_WEB = (encoded: string) => `https://wa.me/?text=${encoded}`;
const WA_APP = (encoded: string) => `whatsapp://send?text=${encoded}`;

/**
 * True for a handset or tablet, where WhatsApp is an installed app.
 *
 * iPadOS reports itself as "Macintosh", so the touch-point check catches the
 * iPads the user agent alone would send down the desktop path.
 */
const isMobileDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/android|iphone|ipad|ipod|windows phone/i.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
};

/**
 * Hand `text` to WhatsApp.
 *
 * `preOpenedWindow` is the blank tab a caller claimed synchronously before
 * awaiting anything — iOS Safari only allows window.open while the tap's user
 * activation is alive. Pass it through and this decides what to do with it;
 * pass nothing when the caller opens WhatsApp directly from the tap handler.
 */
export const shareToWhatsApp = (text: string, preOpenedWindow?: Window | null) => {
  const encoded = encodeURIComponent(text);
  const webUrl = WA_WEB(encoded);

  if (!isMobileDevice()) {
    if (preOpenedWindow && !preOpenedWindow.closed) {
      preOpenedWindow.location.href = webUrl;
    } else {
      window.open(webUrl, '_blank', 'noopener');
    }
    return;
  }

  // A blank tab is no use for a custom scheme — navigating it to whatsapp://
  // leaves an orphaned tab sitting behind the app switch. Close it and let the
  // current document make the jump instead; a scheme navigation is never
  // popup-blocked, so it does not need a pre-claimed window.
  if (preOpenedWindow && !preOpenedWindow.closed) {
    preOpenedWindow.close();
  }

  // If no app claims whatsapp:// the navigation silently does nothing and this
  // page is still visible a moment later — that is the signal to fall back to
  // the web link rather than losing the share entirely. When the app *does*
  // open, the page is backgrounded, so the fallback stands down.
  let switchedAway = false;
  const onVisibilityChange = () => {
    if (document.hidden) switchedAway = true;
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  window.location.href = WA_APP(encoded);

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (!switchedAway && !document.hidden) {
      window.location.href = webUrl;
    }
  }, 1500);
};
