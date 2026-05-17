let opencvReady: Promise<void> | null = null;

function isOpenCVReady(): boolean {
  const cv = window.cv;
  return Boolean(cv && typeof cv.Mat === "function");
}

export function waitForOpenCV(): Promise<void> {
  if (opencvReady) return opencvReady;

  opencvReady = new Promise((resolve, reject) => {
    let settled = false;
    let pollId = 0;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      clearInterval(pollId);
      if (ok) resolve();
      else reject(new Error("OpenCV failed to load"));
    };

    const timeoutId = setTimeout(() => finish(false), 45_000);

    let hooked = false;

    const bindInit = () => {
      const cv = window.cv;
      if (!cv || hooked) return;

      if (isOpenCVReady()) {
        finish(true);
        return;
      }

      hooked = true;
      const prev = cv.onRuntimeInitialized;
      cv.onRuntimeInitialized = () => {
        if (typeof prev === "function") prev();
        finish(true);
      };
    };

    if (isOpenCVReady()) {
      finish(true);
      return;
    }

    bindInit();
    pollId = window.setInterval(() => {
      if (isOpenCVReady()) finish(true);
      else bindInit();
    }, 80);
  });

  return opencvReady;
}
