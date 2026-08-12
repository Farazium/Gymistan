// Stands in for `virtual:pwa-register`, which only exists when the VitePWA
// plugin is in the pipeline — and the test config deliberately leaves it out,
// since generating a service worker for a unit test is a slow way to learn
// nothing. Anything that reaches this in a test is a module that happened to
// import the registration path, not a test about it.

export function registerSW() {
  return () => {}
}
