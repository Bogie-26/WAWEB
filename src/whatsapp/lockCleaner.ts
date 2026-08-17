import fs from 'fs';
import path from 'path';

// Diadopsi dari reference (src/lib/whatsapp.ts): bersihkan file lock
// Chromium yang basi agar headless browser bisa start.
export function cleanChromiumLocks(dir: string): void {
  if (!fs.existsSync(dir)) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      let stat: fs.Stats | null = null;
      try {
        stat = fs.lstatSync(fullPath);
      } catch {
        stat = null;
      }

      if (file === 'SingletonLock' || file.includes('SingletonCookie') || file.includes('SingletonSocket')) {
        try {
          fs.unlinkSync(fullPath);
          console.log(`[WA-LOCKS] Deleted stale Chromium lock: ${fullPath}`);
        } catch (err: any) {
          console.warn(`[WA-LOCKS] Failed to delete lock ${fullPath}:`, err.message);
        }
      } else if (stat && stat.isDirectory()) {
        cleanChromiumLocks(fullPath);
      }
    }
  } catch (err: any) {
    console.warn(`[WA-LOCKS] Error reading directory ${dir}:`, err.message);
  }
}