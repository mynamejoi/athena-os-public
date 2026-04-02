#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter passphrase to hash: ', async (passphrase) => {
  if (!passphrase) {
    console.error('Passphrase cannot be empty');
    process.exit(1);
  }
  const hash = await bcrypt.hash(passphrase, 12);
  const b64 = Buffer.from(hash).toString('base64');
  console.log('\nAdd this to your .env.local:\n');
  console.log(`AUTH_PASSPHRASE_HASH=${b64}`);
  rl.close();
});
