#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ensure the dist/public directory exists
console.log('Preparing deployment...');

const runCommand = (command) => {
  return new Promise((resolve, reject) => {
    console.log(`> ${command}`);
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      console.log(stdout);
      resolve();
    });
  });
};

async function deploy() {
  try {
    // Create necessary directories
    if (!fs.existsSync('dist')) {
      fs.mkdirSync('dist');
    }
    
    if (!fs.existsSync('dist/public')) {
      fs.mkdirSync('dist/public');
    }

    // Build the frontend
    await runCommand('npx vite build --outDir=dist/public');
    
    // Build the backend
    await runCommand('npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist');
    
    console.log('Build completed successfully! You can now deploy your application.');
  } catch (error) {
    console.error('Deployment preparation failed:', error);
    process.exit(1);
  }
}

deploy();