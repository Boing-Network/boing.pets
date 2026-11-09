declare module "troika-three-text" {
  export function configureTextBuilder(config: {
    defaultFontURL?: string | null;
    unicodeFontsURL?: string | null;
    sdfGlyphSize?: number;
    useWorker?: boolean;
  }): void;
  export function preloadFont(
    opts: { font?: string; characters?: string },
    callback: () => void,
  ): void;
  export class Text {
    font: string | null;
    unicodeFontsURL: string | null;
    text: string;
    sync(cb?: () => void): void;
    dispose(): void;
  }
}
