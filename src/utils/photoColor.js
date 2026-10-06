// WHAT THIS FILE DOES
// Looks at a photo and picks out its main colour, so parts of the page can be
// tinted to match the background picture. App.jsx uses it to set the colour
// that the chat panel and the "How it works" section follow.
//
// WHO EDITS IT
// Nobody, normally. To change how strong or bright the colour is, edit the
// two numbers in the last line of getPhotoAccent.

// Gives back a colour (as text the browser understands) that matches the
// photo. If the photo cannot be read, it gives back nothing and the page
// keeps its usual colour.
export function getPhotoAccent(photoPath) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onerror = () => resolve(null);
    image.onload = () => {
      try {
        // Shrink the photo to a tiny 32 x 32 copy so it is quick to examine.
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, size, size);
        const pixels = context.getImageData(0, 0, size, size).data;

        // Find the photo's main hue (its position on the colour wheel).
        // Colourful dots count for more than grey ones, so a grey sky does
        // not drown out a golden field.
        let x = 0;
        let y = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const red = pixels[i] / 255;
          const green = pixels[i + 1] / 255;
          const blue = pixels[i + 2] / 255;
          const max = Math.max(red, green, blue);
          const min = Math.min(red, green, blue);
          const colourfulness = max - min;
          if (colourfulness === 0) continue;

          let hue;
          if (max === red) hue = ((green - blue) / colourfulness) % 6;
          else if (max === green) hue = (blue - red) / colourfulness + 2;
          else hue = (red - green) / colourfulness + 4;
          const angle = (hue * Math.PI) / 3;

          x += Math.cos(angle) * colourfulness;
          y += Math.sin(angle) * colourfulness;
        }
        if (x === 0 && y === 0) return resolve(null);

        const mainHue = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);

        // Keep the photo's hue, but use a fixed strength and brightness so
        // the colour is always readable on the dark page.
        resolve(`hsl(${mainHue} 58% 66%)`);
      } catch {
        resolve(null);
      }
    };
    image.src = photoPath;
  });
}
