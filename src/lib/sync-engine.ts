// SyncEngine simuluje backendovou komunikaci mezi dvěma zařízeními (záložkami) přes LocalStorage.
// Zprávy se posílají tak, že se zapíší do localStorage, což vyvolá událost 'storage' v ostatních záložkách.

export type SyncEventType = 'SOS_ALERT' | 'CHILD_LOCATION' | 'ROUTE_ASSIGNED' | 'PAIRING_SUCCESS' | 'TOGGLE_SIMULATION' | 'DEVIATION_ALERT' | 'MOTION_ANOMALY';

export interface SyncMessage {
  type: SyncEventType;
  payload: any;
  timestamp: number;
}

export class SyncEngine {
  private static listeners: ((msg: SyncMessage) => void)[] = [];
  private static isInitialized = false;

  static init() {
    if (this.isInitialized) return;
    window.addEventListener('storage', this.handleStorageEvent);
    this.isInitialized = true;
  }

  static destroy() {
    window.removeEventListener('storage', this.handleStorageEvent);
    this.isInitialized = false;
  }

  private static handleStorageEvent = (e: StorageEvent) => {
    if (e.key === 'safepath_sync_msg' && e.newValue) {
      try {
        const msg: SyncMessage = JSON.parse(e.newValue);
        this.listeners.forEach(fn => fn(msg));
      } catch (err) {
        console.error('Failed to parse sync message', err);
      }
    }
  };

  static subscribe(callback: (msg: SyncMessage) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(fn => fn !== callback);
    };
  }

  static broadcast(type: SyncEventType, payload: any) {
    const msg: SyncMessage = {
      type,
      payload,
      timestamp: Date.now()
    };
    // Zapsáním do localStorage se vyvolá event v ostatních tabech
    localStorage.setItem('safepath_sync_msg', JSON.stringify(msg));
  }

  // Generování 6místného kódu
  static generatePin(): string {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem('safepath_active_pin', pin);
    return pin;
  }

  // Ověření PINu z dětské aplikace
  static verifyPin(pin: string): boolean {
    const activePin = localStorage.getItem('safepath_active_pin');
    if (activePin && activePin === pin) {
      this.broadcast('PAIRING_SUCCESS', { deviceId: 'child_device_1' });
      return true;
    }
    return false;
  }
}
