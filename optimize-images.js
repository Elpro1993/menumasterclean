const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputDir = './'; // Directory where your original images are
const outputDir = './'; // Output directory for optimized images (can be the same or different)

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.readdirSync(inputDir).forEach((file) => {
  const filePath = path.join(inputDir, file);
  const { name, ext } = path.parse(file);

  // Process only image files
  if (['.jpg', '.jpeg', '.png'].includes(ext.toLowerCase())) {
    const baseName = name.replace(/(\s-\s\d{1,2}_\d{1,2}PM)?$/, ''); // Remove timestamp for consistent naming

    // Optimize for WebP
    sharp(filePath)
      .webp({ quality: 80 })
      .toFile(path.join(outputDir, `${baseName}.webp`), (err, info) => {
        if (err) console.error(`Error optimizing ${file} to WebP:`, err);
        else console.log(`Optimized ${file} to WebP:`, info);
      });

    // Optimize for AVIF (if supported by sharp version)
    sharp(filePath)
      .avif({ quality: 70 }) // AVIF typically allows lower quality for similar visual results
      .toFile(path.join(outputDir, `${baseName}.avif`), (err, info) => {
        if (err) console.error(`Error optimizing ${file} to AVIF:`, err);
        else console.log(`Optimized ${file} to AVIF:`, info);
      });

    // Also create a resized/compressed version of the original format (e.g., JPEG)
    sharp(filePath)
      .resize(1200) // Resize to a max width of 1200px (adjust as needed)
      .jpeg({ quality: 85 }) // Compress JPEG
      .toFile(
        path.join(outputDir, `${baseName}_optimized.jpg`),
        (err, info) => {
          if (err) console.error(`Error optimizing ${file} to JPEG:`, err);
          else console.log(`Optimized ${file} to JPEG:`, info);
        },
      );
  }
});

console.log('Image optimization process started...');
