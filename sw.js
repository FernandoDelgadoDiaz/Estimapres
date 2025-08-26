self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", () => {
  console.log("Service Worker activo para EstimaPres");
});
