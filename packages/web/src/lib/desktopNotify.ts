/** Desktop notifications through the browser (nothing leaves the machine). */

const OFF_KEY = 'cherry.notify.off';

export type NotifyState = 'unsupported' | 'blocked' | 'ask' | 'on' | 'off';

export function notifyState(): NotifyState {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'default') return 'ask';
  try {
    if (localStorage.getItem(OFF_KEY) === '1') return 'off';
  } catch {
    // Private window: treat as on.
  }
  return 'on';
}

/** Asks the browser once; returns the new state. */
export async function turnOnNotifications(): Promise<NotifyState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    localStorage.removeItem(OFF_KEY);
  } catch {
    // not remembered
  }
  if (Notification.permission === 'default') await Notification.requestPermission();
  return notifyState();
}

export function turnOffNotifications(): void {
  try {
    localStorage.setItem(OFF_KEY, '1');
  } catch {
    // not remembered
  }
}

/** Shows one desktop notification when allowed; a click focuses the tab and runs `onClick`. */
export function desktopNotify(title: string, body: string, tag: string, onClick: () => void): void {
  if (notifyState() !== 'on') return;
  try {
    const n = new Notification(title, { body, tag, icon: '/icon-192.png' });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the toast still shows.
  }
}
