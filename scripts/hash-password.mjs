import bcrypt from 'bcryptjs';

const raw = process.argv[2];
if (!raw) {
  console.error('Usage: node scripts/hash-password.mjs "<password>"');
  process.exit(1);
}
const hash = bcrypt.hashSync(raw, 10);
console.log(hash);