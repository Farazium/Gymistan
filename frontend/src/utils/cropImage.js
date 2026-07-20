// Turn a source image + the pixel crop rect from react-easy-crop into a JPEG
// blob at a fixed background resolution, so every uploaded background lands at
// the same 16:9 size regardless of the original.

const OUT_W = 1920
const OUT_H = 1080

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export async function getCroppedBlob(src, area) {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = OUT_W
  canvas.height = OUT_H
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, OUT_W, OUT_H)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9))
}
