/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface OpenCV {
  Mat: new () => unknown;
  [key: string]: unknown;
}

interface Window {
  cv?: OpenCV & {
    onRuntimeInitialized?: () => void;
    imread: (canvas: HTMLCanvasElement) => unknown;
    imshow: (canvas: HTMLCanvasElement, mat: unknown) => void;
    cvtColor: (src: unknown, dst: unknown, code: number) => void;
    GaussianBlur: (
      src: unknown,
      dst: unknown,
      ksize: unknown,
      sigmaX: number,
    ) => void;
    Canny: (
      src: unknown,
      dst: unknown,
      threshold1: number,
      threshold2: number,
    ) => void;
    findContours: (
      image: unknown,
      contours: unknown,
      hierarchy: unknown,
      mode: number,
      method: number,
    ) => void;
    contourArea: (contour: unknown) => number;
    boundingRect: (contour: unknown) => {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    arcLength: (curve: unknown, closed: boolean) => number;
    approxPolyDP: (
      curve: unknown,
      approxCurve: unknown,
      epsilon: number,
      closed: boolean,
    ) => void;
    getPerspectiveTransform: (src: unknown, dst: unknown) => unknown;
    warpPerspective: (
      src: unknown,
      dst: unknown,
      M: unknown,
      dsize: unknown,
    ) => void;
    matFromArray: (
      rows: number,
      cols: number,
      type: number,
      array: number[],
    ) => unknown;
    Size: new (w: number, h: number) => unknown;
    MatVector: new () => { size: () => number; get: (i: number) => unknown };
    COLOR_RGBA2GRAY: number;
    RETR_EXTERNAL: number;
    CHAIN_APPROX_SIMPLE: number;
    CV_32FC2: number;
  };
}
