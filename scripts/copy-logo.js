const fs = require('fs');
const path = require('path');

const imgDir = path.join(__dirname, '..', 'assets', 'images');
const shopOwnerPath = path.join(imgDir, 'shop owner.png');
const shopOwnerCleanPath = path.join(imgDir, 'shop-owner.png');
const iconPath = path.join(imgDir, 'icon.png');

try {
  fs.copyFileSync(shopOwnerPath, shopOwnerCleanPath);
  fs.copyFileSync(shopOwnerPath, iconPath);
  console.log('Successfully updated shop-owner.png and icon.png');
} catch (err) {
  console.error('Error copying image:', err);
}
