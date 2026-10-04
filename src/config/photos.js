// WHAT THIS FILE DOES
// The list of background photos, used behind the Home screen and the Field
// page. The app shows the next photo in the list every time the page is
// refreshed.
//
// WHO EDITS IT
// Anyone who wants to add, remove or reorder the background photos.
//
// HOW TO EDIT IT
// - To add a photo: put the file in the public/images folder, then add a line
//   here with its file name.
// - To remove a photo: delete its line.

export const photos = [
  "/images/cathedral.jpg",
  "/images/soldier.jpg",
  "/images/tank.jpg",
  "/images/wheat.jpg",
  "/images/apartments.jpg",
];

// Works out which photo to show. The browser remembers which photo was shown
// last time, so each refresh moves on to the next one. If the browser cannot
// remember (for example in a private window), a random photo is shown instead.
function pickNextPhoto() {
  let index = Math.floor(Math.random() * photos.length);
  try {
    const last = Number(localStorage.getItem("heroPhotoIndex"));
    if (Number.isInteger(last)) index = (last + 1) % photos.length;
    localStorage.setItem("heroPhotoIndex", String(index));
  } catch {
    // Keep the random choice.
  }
  return photos[index];
}

// Chosen once each time the page loads, and shared by every page.
export const currentPhoto = pickNextPhoto();
