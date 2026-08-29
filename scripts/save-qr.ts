import { prisma } from '../src/lib/db.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const qrConfig = await prisma.serviceConfig.findUnique({
    where: { key: 'whatsapp_qr' },
  });

  if (!qrConfig || !qrConfig.value) {
    console.error('QR code not found in database');
    return;
  }

  const base64Data = qrConfig.value.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  
  const destDir = 'C:\\Users\\login_2xuoen1\\.gemini\\antigravity-ide\\brain\\4700b523-071b-4438-aef4-ae5f8dfcf73a';
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  const destPath = path.join(destDir, 'qrcode.png');
  fs.writeFileSync(destPath, buffer);
  console.log(`QR code saved successfully to: ${destPath}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
