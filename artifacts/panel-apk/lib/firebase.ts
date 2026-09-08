// Firebase REST API — no SDK needed, works in React Native without native modules
export const firebaseConfig = {
  apiKey: "AIzaSyBPnv-sbBjTql8w0PcEOCGkBx41c5TC8bk",
  authDomain: "axexodiweb.firebaseapp.com",
  databaseURL: "https://axexodiweb-default-rtdb.firebaseio.com",
  projectId: "axexodiweb",
  storageBucket: "axexodiweb.firebasestorage.app",
  messagingSenderId: "389800586861",
  appId: "1:389800586861:android:bc07658134ed77dad59964",
};

const DB = firebaseConfig.databaseURL;

export async function fetchAllDevices(): Promise<Record<string, any>> {
  const res = await fetch(`${DB}/clients.json`);
  if (!res.ok) throw new Error('Firebase read failed');
  const data = await res.json();
  return data ?? {};
}

export async function fetchDevice(id: string): Promise<Record<string, any> | null> {
  const res = await fetch(`${DB}/clients/${id}.json`);
  if (!res.ok) throw new Error('Firebase read failed');
  const data = await res.json();
  return data;
}

export async function patchDevice(id: string, payload: Record<string, any>): Promise<void> {
  await fetch(`${DB}/clients/${id}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function setDeviceValue(path: string, value: any): Promise<void> {
  await fetch(`${DB}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

export async function deleteDeviceValue(path: string): Promise<void> {
  await fetch(`${DB}/${path}.json`, { method: 'DELETE' });
}

export async function fetchDeviceSms(id: string): Promise<Record<string, any>> {
  const res = await fetch(`${DB}/clients/${id}/sms.json`);
  if (!res.ok) return {};
  const data = await res.json();
  return data ?? {};
}
